import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_EVENTS } from '@games/shared';
import { DICE_ACTIONS, type DieFace, type DiceRoundResult, type PlayerChoice } from '@games/game-engine/browser';
import { getOccupantDisplayName } from '../utils/phaseLabels';
import { api } from '../../../../lib/api-client';
import {
  getRemainingSecondsFromDeadline,
  getPhaseRemainingSeconds,
  shouldShowTurnCountdown,
} from '../utils/turnCountdown';
import { getPhaseTimerKindFromState, type PhaseTimerKind } from '../utils/diceUiHelpers';
import {
  MIN_ROLL_UI_MS,
  NO_RESULT_REVEAL_MS,
  RESULT_REVEAL_MS,
} from '../utils/diceAnimTiming';

export interface DiceRollUiSnapshot {
  holderSeatIndex: number;
  opponentSeatIndex: number;
  rollerSeatIndex: number;
  capturedAt: number;
}

function captureRollSnapshot(st: Record<string, unknown> | null | undefined): DiceRollUiSnapshot | null {
  const activeMatch = st?.activeMatch as { holderSeatIndex: number; opponentSeatIndex: number } | undefined;
  if (!activeMatch) return null;
  return {
    holderSeatIndex: activeMatch.holderSeatIndex,
    opponentSeatIndex: activeMatch.opponentSeatIndex,
    rollerSeatIndex: (st?.rollerSeatIndex as number | null | undefined) ?? activeMatch.holderSeatIndex,
    capturedAt: Date.now(),
  };
}

const WS_URL = import.meta.env.DEV
  ? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
  : (import.meta.env.VITE_WS_URL ?? 'http://localhost:3001');
const FALLBACK_POLL_MS = 3_000;

export interface DiceDisplayResult {
  dice: [DieFace, DieFace];
  parity: PlayerChoice | null;
  outcome: 'WIN' | 'LOSS' | 'NO_RESULT';
  hasBlank: boolean;
  winnerSeatIndex: number | null;
  loserSeatIndex: number | null;
  passToSeatIndex: number | null;
  personalOutcome: 'WON' | 'LOST' | null;
}

export interface DiceSettlementDisplay {
  result: DiceRoundResult;
  roundId: string;
  winnerSeatIndex: number | null;
  loserSeatIndex: number | null;
  personalOutcome: 'WON' | 'LOST' | null;
}

export type DiceStatusBanner =
  | { type: 'TURN_TIMEOUT'; message: string }
  | { type: 'AUTO_ROLL'; message: string }
  | { type: 'ROTATION'; message: string };

type GameEvent = { type: string; payload?: Record<string, unknown> };

type SideBetSnap = {
  id?: string;
  backerUserId: string;
  counterpartyUserId?: string;
  targetUserId?: string;
  prediction: 'WIN' | 'LOSS';
  status: string;
  amount?: number;
};

function evaluatePeerBetResult(
  prediction: 'WIN' | 'LOSS',
  mainOutcome: 'WIN' | 'LOSS',
): 'WON' | 'LOST' {
  const holderWon = mainOutcome === 'WIN';
  const predictedWin = prediction === 'WIN';
  return holderWon === predictedWin ? 'WON' : 'LOST';
}

function resolvePeerBetPersonalOutcome(
  userId: string,
  resultOutcome: 'WIN' | 'LOSS',
  sideBets: SideBetSnap[],
): 'WON' | 'LOST' | null {
  const accepted = sideBets.filter((sb) => sb.status === 'ACCEPTED');
  if (accepted.length === 0) return null;

  const outcomes: Array<'WON' | 'LOST'> = [];
  for (const sb of accepted) {
    const counterpartyId = sb.counterpartyUserId ?? sb.targetUserId;
    const backerResult = evaluatePeerBetResult(sb.prediction, resultOutcome);
    if (sb.backerUserId === userId) {
      outcomes.push(backerResult);
    } else if (counterpartyId === userId) {
      outcomes.push(backerResult === 'WON' ? 'LOST' : 'WON');
    }
  }
  if (outcomes.length === 0) return null;
  return outcomes.some((o) => o === 'WON') ? 'WON' : 'LOST';
}

function resolvePersonalOutcome(
  userId: string | undefined,
  resultOutcome: 'WIN' | 'LOSS' | 'NO_RESULT' | undefined,
  mainBetUserId: string | undefined,
  sideBets: SideBetSnap[],
): 'WON' | 'LOST' | null {
  if (!userId || !resultOutcome || resultOutcome === 'NO_RESULT') return null;
  if (mainBetUserId === userId) return resultOutcome === 'WIN' ? 'WON' : 'LOST';
  return resolvePeerBetPersonalOutcome(userId, resultOutcome, sideBets);
}

function resolveAcceptorDisplayName(
  acceptorId: string,
  st: {
    seats?: Array<{
      seatIndex: number;
      occupant?: { type: string; userId?: string; botId?: string; name?: string } | null;
    }>;
  } | null,
  playerMeta: Record<string, { displayName: string }>,
): string {
  const seat = st?.seats?.find((s) => {
    const occ = s.occupant;
    if (!occ) return false;
    if (occ.type === 'USER' && occ.userId === acceptorId) return true;
    if (occ.type === 'BOT' && (occ.botId === acceptorId || `player_${occ.botId}` === acceptorId)) return true;
    return false;
  });
  if (seat) {
    return getOccupantDisplayName(
      seat as Parameters<typeof getOccupantDisplayName>[0],
      playerMeta,
    );
  }
  if (playerMeta[acceptorId]?.displayName) return playerMeta[acceptorId].displayName;
  return acceptorId;
}

function resolveResultSeats(
  payload: Record<string, unknown>,
  st: {
    seats?: Array<{ seatIndex: number; occupant?: { type: string; userId?: string; botId?: string } | null }>;
    lastWinnerSeatIndex?: number | null;
    activeMatch?: { holderSeatIndex: number; opponentSeatIndex: number };
    completedMatch?: { holderSeatIndex: number; opponentSeatIndex: number };
  } | undefined,
): Pick<DiceDisplayResult, 'winnerSeatIndex' | 'loserSeatIndex'> {
  const result = payload.result as { outcome: 'WIN' | 'LOSS' | 'NO_RESULT' } | undefined;
  const settlement = payload as { mainBet?: { userId: string }; completedMatch?: { holderSeatIndex: number; opponentSeatIndex: number } };
  const match = settlement.completedMatch ?? st?.activeMatch;
  let loserSeatIndex: number | null = null;
  let winnerSeatIndex = st?.lastWinnerSeatIndex ?? null;

  if (result?.outcome === 'NO_RESULT') {
    return { winnerSeatIndex: null, loserSeatIndex: null };
  }
  if (result?.outcome === 'LOSS' && match) {
    loserSeatIndex = match.holderSeatIndex;
    winnerSeatIndex = match.opponentSeatIndex;
  } else if (result?.outcome === 'WIN' && match) {
    winnerSeatIndex = match.holderSeatIndex;
    loserSeatIndex = match.opponentSeatIndex;
  }

  return { winnerSeatIndex, loserSeatIndex };
}

export function useDiceGame(sessionId: string | undefined, userId?: string) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [playerMeta, setPlayerMeta] = useState<Record<string, { displayName: string; balance: string; currency: string; avatarUrl: string | null }>>({});
  const [isTestMode, setIsTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollUiSnapshot, setRollUiSnapshot] = useState<DiceRollUiSnapshot | null>(null);
  const [phaseTimerWsSeconds, setPhaseTimerWsSeconds] = useState<number | undefined>();
  const [phaseTimerKind, setPhaseTimerKind] = useState<PhaseTimerKind | null>(null);
  const [turnTimerWsSeconds, setTurnTimerWsSeconds] = useState<number | undefined>();
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [displayResult, setDisplayResult] = useState<DiceDisplayResult | null>(null);
  const [settlementDisplay, setSettlementDisplay] = useState<DiceSettlementDisplay | null>(null);
  const [statusBanner, setStatusBanner] = useState<DiceStatusBanner | null>(null);
  const [roomInfo, setRoomInfo] = useState<{ code: string; name: string; gameMode?: string } | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const stateRef = useRef<Record<string, unknown> | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const playerMetaRef = useRef(playerMeta);
  playerMetaRef.current = playerMeta;
  stateRef.current = state;

  const clearResultTimer = () => {
    if (resultTimerRef.current != null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }
  };

  const showBanner = useCallback((banner: DiceStatusBanner, clearMs = 4000) => {
    if (bannerTimerRef.current != null) window.clearTimeout(bannerTimerRef.current);
    setStatusBanner(banner);
    bannerTimerRef.current = window.setTimeout(() => {
      setStatusBanner(null);
      bannerTimerRef.current = null;
    }, clearMs);
  }, []);

  const applyEvents = useCallback((events: GameEvent[], nextState?: Record<string, unknown>) => {
    const prev = stateRef.current as {
      mainBet?: { userId?: string } | null;
      sideBets?: SideBetSnap[];
      activeMatch?: { holderSeatIndex: number; opponentSeatIndex: number };
    } | null;

    if (nextState) {
      stateRef.current = nextState;
      setState(nextState);
    }

    if (events.some((e) => e.type === 'dice:side_bet_accepted')) {
      const accepted = events.find((e) => e.type === 'dice:side_bet_accepted');
      const payload = accepted?.payload as {
        displayAcceptedByUserId?: string;
        counterpartyUserId?: string;
      } | undefined;
      const acceptorId = payload?.displayAcceptedByUserId ?? payload?.counterpartyUserId;
      if (acceptorId) {
        const st = (nextState ?? prev) as Parameters<typeof resolveAcceptorDisplayName>[1];
        const name = resolveAcceptorDisplayName(acceptorId, st, playerMetaRef.current);
        showBanner({ type: 'ROTATION', message: `Accepted by ${name}` }, 3000);
      }
    }

    if (events.some((e) => e.type === 'dice:turn_timeout')) {
      const reason = (events.find((e) => e.type === 'dice:turn_timeout')?.payload as { reason?: string } | undefined)?.reason;
      showBanner({
        type: 'TURN_TIMEOUT',
        message: reason === 'AUTO_MAIN_BET'
          ? 'Betting closed — auto bet placed, rolling…'
          : 'Betting window closed…',
      });
      setSettlementDisplay(null);
    }

    if (events.some((e) => e.type === 'dice:pass_to_roller')) {
      const pass = events.find((e) => e.type === 'dice:pass_to_roller');
      const seatIndex = (pass?.payload as { rollerSeatIndex?: number } | undefined)?.rollerSeatIndex;
      const st = (nextState ?? prev) as { seats?: Array<{ seatIndex: number; occupant?: { type: string; userId?: string; botId?: string; name?: string } | null }> } | null;
      const seat = seatIndex != null ? st?.seats?.find((s) => s.seatIndex === seatIndex) ?? null : null;
      const name = getOccupantDisplayName(
        seat as Parameters<typeof getOccupantDisplayName>[0],
        playerMetaRef.current,
      );
      showBanner({ type: 'ROTATION', message: `Dice moving to ${name}…` }, 2500);
    }

    if (events.some((e) => e.type === 'dice:rotation')) {
      if (resultTimerRef.current == null) {
        setRolling(false);
        setRollUiSnapshot(null);
      }
      showBanner({ type: 'ROTATION', message: 'Next match…' }, 2500);
    }

    if (events.some((e) => e.type === 'dice:rolling')) {
      showBanner({ type: 'AUTO_ROLL', message: 'Rolling dice…' }, 6000);
      const snapSource = (prev ?? nextState) as Record<string, unknown> | null;
      setRollUiSnapshot(captureRollSnapshot(snapSource));
      setRolling(true);
      setDisplayResult(null);
    }

    const resultEvent = events.find((e) => e.type === 'dice:result');
    const settlementEvent = events.find((e) => e.type === 'dice:settlement');

    if (resultEvent?.payload) {
      const p = resultEvent.payload as {
        dice?: [DieFace, DieFace];
        result?: { outcome: 'WIN' | 'LOSS' | 'NO_RESULT'; parity: PlayerChoice | null; hasBlank: boolean };
        noResult?: boolean;
      };
      if (p.dice && p.result) {
        const st = (nextState ?? prev ?? undefined) as Parameters<typeof resolveResultSeats>[1];
        const outcome = p.result.outcome;
        const personalOutcome = resolvePersonalOutcome(
          userIdRef.current,
          outcome,
          (settlementEvent?.payload as { mainBet?: { userId?: string } } | undefined)?.mainBet?.userId
            ?? prev?.mainBet?.userId,
          prev?.sideBets ?? [],
        );
        const seats = outcome === 'NO_RESULT'
          ? { winnerSeatIndex: null, loserSeatIndex: null }
          : resolveResultSeats(resultEvent.payload, st);
        const passToSeatIndex = outcome === 'NO_RESULT'
          ? ((nextState as { rollerSeatIndex?: number | null } | undefined)?.rollerSeatIndex ?? null)
          : null;

        const revealMs = Math.max(
          outcome === 'NO_RESULT' ? NO_RESULT_REVEAL_MS : RESULT_REVEAL_MS,
          MIN_ROLL_UI_MS,
        );
        clearResultTimer();
        setRollUiSnapshot((snap) => snap ?? captureRollSnapshot(prev as Record<string, unknown>));
        setDisplayResult({
          dice: p.dice,
          parity: p.result.parity,
          outcome,
          hasBlank: p.result.hasBlank,
          passToSeatIndex,
          personalOutcome,
          ...seats,
        });
        setRolling(true);
        resultTimerRef.current = window.setTimeout(() => {
          setRolling(false);
          setRollUiSnapshot(null);
          if (settlementEvent?.payload && outcome !== 'NO_RESULT') {
            const result = settlementEvent.payload.result as DiceRoundResult;
            const roundId = String(settlementEvent.payload.roundId ?? '');
            const completedMatch = settlementEvent.payload.completedMatch as { holderSeatIndex: number; opponentSeatIndex: number } | undefined;
            const settledSeats = resolveResultSeats(settlementEvent.payload, { ...st, completedMatch });
            setSettlementDisplay({
              result,
              roundId,
              winnerSeatIndex: settledSeats.winnerSeatIndex,
              loserSeatIndex: settledSeats.loserSeatIndex,
              personalOutcome,
            });
          }
          resultTimerRef.current = null;
        }, revealMs);
        return;
      }
    }

    if (settlementEvent?.payload) {
      const result = settlementEvent.payload.result as DiceRoundResult;
      if (result?.outcome === 'NO_RESULT') return;
      const roundId = String(settlementEvent.payload.roundId ?? '');
      const completedMatch = settlementEvent.payload.completedMatch as { holderSeatIndex: number; opponentSeatIndex: number } | undefined;
      const st = (nextState ?? undefined) as Parameters<typeof resolveResultSeats>[1];
      const seats = resolveResultSeats(settlementEvent.payload, { ...st, completedMatch });
      const personalOutcome = resolvePersonalOutcome(
        userIdRef.current,
        result.outcome,
        (settlementEvent.payload as { mainBet?: { userId?: string } }).mainBet?.userId ?? prev?.mainBet?.userId,
        prev?.sideBets ?? [],
      );
      setSettlementDisplay({ result, roundId, winnerSeatIndex: seats.winnerSeatIndex, loserSeatIndex: seats.loserSeatIndex, personalOutcome });
    } else if (events.some((e) => e.type === 'dice:result')) {
      setRolling(false);
      setRollUiSnapshot(null);
    }
  }, [showBanner]);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const data = await api.get<{
      state: Record<string, unknown>;
      isTestMode?: boolean;
      room?: { code: string; name: string; metadata?: { gameMode?: string } };
      playerMeta?: Record<string, { displayName: string; balance: string; currency: string; avatarUrl: string | null }>;
    }>(`/api/dice/sessions/${sessionId}`);
    setState(data.state);
    stateRef.current = data.state;
    setIsTestMode(Boolean(data.isTestMode));
    setPlayerMeta(data.playerMeta ?? {});
    if (data.room) {
      setRoomInfo({
        code: data.room.code,
        name: data.room.name,
        gameMode: (data.room as { metadata?: { gameMode?: string } }).metadata?.gameMode
          ?? (data.state as { gameMode?: string })?.gameMode,
      });
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void refresh()
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const token = api.getToken();
    if (!token) return () => { cancelled = true; };

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!cancelled) {
        setWsConnected(true);
        void refresh().catch(() => {});
      }
    });
    socket.on('disconnect', () => { if (!cancelled) setWsConnected(false); });

    socket.emit(REALTIME_EVENTS.SESSION_JOIN, { sessionId }, () => {});

    socket.on(REALTIME_EVENTS.SESSION_STATE, (s: { state?: Record<string, unknown> }) => {
      if (!cancelled && s.state) {
        stateRef.current = s.state;
        setState(s.state);
      }
    });

    socket.on(REALTIME_EVENTS.GAME_EVENT, (payload: { data?: { state?: Record<string, unknown>; events?: GameEvent[] } }) => {
      if (cancelled) return;
      applyEvents(payload.data?.events ?? [], payload.data?.state);
    });

    socket.on(REALTIME_EVENTS.GAME_TIMER, (t: { phase?: string; remainingMs?: number }) => {
      if (cancelled || t.remainingMs == null) return;
      const secs = Math.max(0, Math.ceil(t.remainingMs / 1000));
      const phase = t.phase ?? '';
      if (phase === 'PLAYER_TURN' || phase === 'BETTING_TIMER') {
        setTurnTimerWsSeconds(secs);
        setPhaseTimerKind(phase === 'BETTING_TIMER' ? 'BETTING_TIMER' : null);
      } else if (
        phase === 'OPPONENT_MATCH'
        || phase === 'SIDE_BET'
        || phase === 'DICE_HANDOFF'
        || phase === 'FINAL_LOCK'
        || phase === 'INTER_ROUND_PAUSE'
      ) {
        setPhaseTimerWsSeconds(secs);
        setPhaseTimerKind(phase);
      }
    });

    socket.on(REALTIME_EVENTS.GAME_RESULT, () => {
      if (!cancelled) void refresh().catch(() => {});
    });

    const poll = window.setInterval(() => {
      if (cancelled) return;
      void refresh().catch(() => {});
    }, FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      clearResultTimer();
      if (bannerTimerRef.current != null) window.clearTimeout(bannerTimerRef.current);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setWsConnected(false);
    };
  }, [sessionId, refresh, applyEvents]);

  useEffect(() => {
    const tick = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const diceState = state as {
    phase?: string;
    turnDeadlineAt?: string | null;
    sideBetWindowEndsAt?: string | null;
    opponentMatchWindowEndsAt?: string | null;
    interRoundPauseEndsAt?: string | null;
    finalLockEndsAt?: string | null;
    mainBet?: { locked?: boolean; amount?: number; choice?: string } | null;
    activeMatch?: unknown;
  } | null;

  const turnTimerSeconds = useMemo(() => {
    if (!diceState || !shouldShowTurnCountdown(diceState as Parameters<typeof shouldShowTurnCountdown>[0])) {
      return undefined;
    }
    const fromDeadline = getRemainingSecondsFromDeadline(diceState.turnDeadlineAt, clockMs);
    if (fromDeadline !== undefined) return fromDeadline;
    return turnTimerWsSeconds;
  }, [diceState, clockMs, turnTimerWsSeconds]);

  const phaseTimerSeconds = useMemo(() => {
    const fromDeadline = getPhaseRemainingSeconds(diceState as Parameters<typeof getPhaseRemainingSeconds>[0], clockMs);
    if (fromDeadline !== undefined) return fromDeadline;
    return phaseTimerWsSeconds;
  }, [phaseTimerWsSeconds, diceState, clockMs]);

  const activePhaseTimerKind = useMemo(() => {
    if (phaseTimerKind) return phaseTimerKind;
    return getPhaseTimerKindFromState(diceState as Parameters<typeof getPhaseTimerKindFromState>[0]);
  }, [phaseTimerKind, diceState]);

  const sendAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!sessionId) return;
    setLastAction(action);
    const key = api.createIdempotencyKey(`dice-${action}`);
    const result = await api.post<{ state: Record<string, unknown>; events?: GameEvent[] }>(
      `/api/dice/sessions/${sessionId}/action`,
      { action, payload },
      { idempotencyKey: key },
    );
    applyEvents(result.events ?? [], result.state);
    void refresh().catch(() => {});
    return result;
  };

  const placeMainBet = (amount: number, choice: 'ODD' | 'EVEN') =>
    sendAction(DICE_ACTIONS.PLACE_MAIN_BET, { amount, choice });

  const rollDice = async (meta?: { throw?: { dirX: number; dirZ: number; speed: number } }) => {
    setRollUiSnapshot(captureRollSnapshot(stateRef.current));
    setRolling(true);
    setDisplayResult(null);
    return sendAction(DICE_ACTIONS.ROLL_DICE, meta?.throw ? { throw: meta.throw } : {});
  };

  const requestSideBet = (counterpartyUserId: string, prediction: 'WIN' | 'LOSS', amount: number) => {
    const sideBetId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return sendAction(DICE_ACTIONS.REQUEST_SIDE_BET, {
      counterpartyUserId,
      targetUserId: counterpartyUserId,
      prediction,
      amount,
      sideBetId,
    });
  };

  const acceptSideBet = (sideBetId: string, amount?: number) =>
    sendAction(DICE_ACTIONS.ACCEPT_SIDE_BET, {
      sideBetId,
      ...(typeof amount === 'number' ? { amount } : {}),
    });

  const rejectSideBet = (sideBetId: string) =>
    sendAction(DICE_ACTIONS.REJECT_SIDE_BET, { sideBetId });

  return {
    state,
    loading,
    error,
    rolling,
    rollUiSnapshot,
    phaseTimerSeconds,
    phaseTimerKind: activePhaseTimerKind,
    turnTimerSeconds,
    isTestMode,
    displayResult,
    settlementDisplay,
    statusBanner,
    roomInfo,
    playerMeta,
    wsConnected,
    lastAction,
    refresh,
    placeMainBet,
    rollDice,
    requestSideBet,
    acceptSideBet,
    rejectSideBet,
    sendAction,
  };
}
