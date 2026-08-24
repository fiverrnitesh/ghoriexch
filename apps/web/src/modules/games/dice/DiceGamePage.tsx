import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../../lib/api-client';
import { LoadingState, ErrorState, GoldButton, useToast } from '../../../design-system';
import { useDiceGame } from './hooks/useDiceGame';
import { useDiceViewport } from './hooks/useDiceViewport';
import { useDiceOrientationLock } from './hooks/useDiceOrientationLock';
import { DiceDevControls } from './components/DiceDevControls';
import { DiceTable, type SeatScreenPos } from './components/DiceTable';
import { SideBetModal } from './components/SideBetModals';
import { DiceMatchPanel } from './components/DiceMatchPanel';
import { DiceMobileHud } from './components/DiceMobileHud';
import { DiceMobileShell } from './components/DiceMobileShell';
import { DiceSettlementOverlay } from './components/DiceSettlementOverlay';
import { ChipTransferAnimation } from './components/ChipTransferAnimation';
import type { DiceThrowGesture } from './components/DiceThrowTray';
import type { DiceThrowRequest } from './scene/TableDice3D';
import { soundService } from './services/sound.service';
import { openSixPlayerDemoRoom } from './utils/openSixPlayerDemoRoom';
import type { DiceSeatView } from './components/DiceSeat';
import { formatCurrency, getSeatWorldPosition, resolveVisualSlots, VISUAL_SLOT_COUNT } from './utils/seatPositions';
import { getOccupantDisplayName } from './utils/phaseLabels';
import {
  canRequestSideBet,
  isBettingPhase,
  isRollReadyPhase,
  isSideBettingPhase,
  isTigerOccupant,
  isUserActiveInMatch,
  resolveOccupantKey,
} from './utils/diceUiHelpers';
import type { DiceGameState } from '@games/game-engine/browser';
import './dice-game.css';

export function DiceGamePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    state: rawState,
    loading,
    error,
    playerMeta,
    refresh,
    rolling,
    displayResult,
    settlementDisplay,
    placeMainBet,
    rollDice,
    requestSideBet,
    acceptSideBet,
    rejectSideBet,
    turnTimerSeconds,
    phaseTimerSeconds,
  } = useDiceGame(sessionId, user?.id);

  const state = rawState as DiceGameState | null;
  const [betAmount, setBetAmount] = useState(10);
  const [sideBetTarget, setSideBetTarget] = useState<{ userId: string; name: string } | null>(null);
  const { isMobileLandscape, isMobileGameLayout, isMobileRotate, mode, size } = useDiceViewport();
  useDiceOrientationLock(isMobileGameLayout);

  const canvasSize = isMobileGameLayout
    ? { width: size.tableW, height: size.gameH }
    : undefined;

  const [seatPositions, setSeatPositions] = useState<SeatScreenPos[]>([]);
  const handleSeatPositions = useCallback((pos: SeatScreenPos[]) => {
    setSeatPositions((prev) => {
      const sig = (items: SeatScreenPos[]) =>
        items.map((p) => `${p.seatIndex}:${Math.round(p.xPct * 10)}:${Math.round(p.yPct * 10)}`).join('|');
      return sig(prev) === sig(pos) ? prev : pos;
    });
  }, []);

  const [chipTransfer, setChipTransfer] = useState<{
    fromPct: { x: number; y: number };
    toPct: { x: number; y: number };
    amount: number;
    roundId: string;
  } | null>(null);
  const chipRoundRef = useRef<string | null>(null);

  const [throwRequest, setThrowRequest] = useState<DiceThrowRequest | null>(null);
  const [localThrowId, setLocalThrowId] = useState<string | null>(null);

  useEffect(() => {
    soundService.unlock();
  }, []);

  useEffect(() => {
    if (!settlementDisplay) return;
    if (settlementDisplay.result.outcome === 'NO_RESULT') return;
    if (settlementDisplay.winnerSeatIndex == null || settlementDisplay.loserSeatIndex == null) return;
    if (chipRoundRef.current === settlementDisplay.roundId) return;

    const from = seatPositions.find((p) => p.seatIndex === settlementDisplay.loserSeatIndex);
    const to = seatPositions.find((p) => p.seatIndex === settlementDisplay.winnerSeatIndex);
    if (!from || !to) return;

    chipRoundRef.current = settlementDisplay.roundId;
    const amount = settlementDisplay.result.winnerPayout ?? 0;

    const delay = window.setTimeout(() => {
      setChipTransfer({
        fromPct: { x: from.xPct, y: from.yPct },
        toPct: { x: to.xPct, y: to.yPct },
        amount,
        roundId: settlementDisplay.roundId,
      });
      soundService.play('chips_transfer');
    }, 300);
    return () => window.clearTimeout(delay);
  }, [settlementDisplay, seatPositions]);

  const currency = user?.id && playerMeta[user.id]?.currency
    ? playerMeta[user.id].currency
    : 'USD';
  const formatAmount = (n: number) => formatCurrency(n, currency);

  const selfSeatIndex = useMemo(() => {
    if (!state || !user?.id) return null;
    return state.seats.find((s) => s.occupant?.type === 'USER' && s.occupant.userId === user.id)?.seatIndex ?? null;
  }, [state, user?.id]);

  const availableBalance = useMemo(() => {
    if (!user?.id) return 0;
    const raw = playerMeta[user.id]?.balance;
    if (raw == null) return 0;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [user?.id, playerMeta]);

  useEffect(() => {
    const min = state?.config.minBet;
    const max = state?.config.maxBet;
    if (typeof min !== 'number' || typeof max !== 'number') return;
    setBetAmount((n) => Math.min(max, Math.max(min, n)));
  }, [state?.config.minBet, state?.config.maxBet]);

  useEffect(() => {
    setSideBetTarget(null);
    setChipTransfer(null);
    setThrowRequest(null);
    setLocalThrowId(null);
  }, [state?.roundId]);

  useEffect(() => {
    if (!rolling && !isRollReadyPhase(rawState as DiceGameState | null)) {
      setLocalThrowId(null);
      setThrowRequest(null);
    }
  }, [rolling, rawState]);

  useEffect(() => {
    document.documentElement.classList.add('dice-game-active');
    return () => document.documentElement.classList.remove('dice-game-active');
  }, []);

  useEffect(() => {
    if (!state) return;
    const sideBetOpen = (state.phase === 'BETTING' || state.phase === 'SIDE_BETTING') && !!state.mainBet;
    if (!sideBetOpen) setSideBetTarget(null);
  }, [state?.phase, state?.mainBet]);

  if (loading) return <LoadingState message="Joining dice table..." />;
  if (error || !state) return <ErrorState message={error ?? 'Failed to load game'} onRetry={() => navigate('/games/dice')} />;

  const occupiedSeats = state.seats.filter((s) => s.occupant);
  const slotViews: Array<DiceSeatView | null> = Array.from({ length: VISUAL_SLOT_COUNT }, () => null);

  const visualSlotBySeat = resolveVisualSlots(
    occupiedSeats.map((s) => s.seatIndex),
    state.maxSeats,
    selfSeatIndex,
    (seatIndex) => isTigerOccupant(occupiedSeats.find((s) => s.seatIndex === seatIndex)!.occupant!),
    (seatIndex) => {
      const occ = occupiedSeats.find((s) => s.seatIndex === seatIndex)?.occupant;
      return occ?.type === 'USER' && occ.userId === user?.id;
    },
  );

  const holderSeatIndex = state.activeMatch?.holderSeatIndex ?? null;
  const opponentSeatIndex = state.activeMatch?.opponentSeatIndex ?? null;
  const rollerSeatIndex = state.rollerSeatIndex ?? holderSeatIndex;
  const isHolder = selfSeatIndex != null && selfSeatIndex === holderSeatIndex;
  const isRoller = selfSeatIndex != null && selfSeatIndex === rollerSeatIndex;
  const isActivePlayer = user?.id ? isUserActiveInMatch(state, user.id) : false;
  const canSideBet = user?.id ? canRequestSideBet(state, user.id) : false;
  const minBet = state.config.minBet;
  const maxBet = state.config.maxBet;
  const canBet = isBettingPhase(state) && isHolder && !state.mainBet && !rolling;
  const canRoll = isRollReadyPhase(state) && isRoller && !rolling && !localThrowId;
  const canPlayerThrow = canRoll;
  const throwMode: 'auto' | 'player_throw' =
    isRoller && (canPlayerThrow || localThrowId != null) ? 'player_throw' : 'auto';

  const rollerVisualSlot = rollerSeatIndex != null
    ? visualSlotBySeat.get(rollerSeatIndex)
    : undefined;

  let trayWorldPos: [number, number, number] | null = null;
  if (rollerVisualSlot != null) {
    const isSelfRoller = selfSeatIndex != null && selfSeatIndex === rollerSeatIndex;
    const pos = getSeatWorldPosition(rollerVisualSlot, isSelfRoller, { outwardBoost: 0.02 });
    const len = Math.hypot(pos.x, pos.z) || 1;
    // Park dice on the felt just in front of the roller (toward table centre).
    trayWorldPos = [
      pos.x - (pos.x / len) * 0.95,
      0.42,
      pos.z - (pos.z / len) * 0.95,
    ];
  }

  let trayScreenPct: { x: number; y: number } | null = null;
  if (rollerSeatIndex != null) {
    const seat = seatPositions.find((p) => p.seatIndex === rollerSeatIndex);
    if (seat) {
      const dx = 50 - seat.xPct;
      const dy = 50 - seat.yPct;
      const len = Math.hypot(dx, dy) || 1;
      // Overlay sits between the seat and the table centre — “in front of” the player.
      trayScreenPct = {
        x: seat.xPct + (dx / len) * 12,
        y: seat.yPct + (dy / len) * 12,
      };
    } else if (isRoller) {
      trayScreenPct = { x: 50, y: 72 };
    }
  }

  const handlePlayerThrow = async (gesture: DiceThrowGesture) => {
    if (!canPlayerThrow || localThrowId) return;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `throw_${Date.now()}`;
    setLocalThrowId(id);
    setThrowRequest({ ...gesture, id });
    try {
      await rollDice({ throw: { dirX: gesture.dirX, dirZ: gesture.dirZ, speed: gesture.speed } });
    } catch (err) {
      setLocalThrowId(null);
      setThrowRequest(null);
      toast(err instanceof Error ? err.message : 'Roll failed — try again', 'error');
    }
  };

  const openSideBetForSeat = (seatIndex: number, occupantUserId: string, name: string) => {
    if (seatIndex !== holderSeatIndex && seatIndex !== opponentSeatIndex) {
      toast('Side bets are only on the holder or opponent', 'warning');
      return;
    }
    if (!user?.id) {
      toast('Sign in to place a side bet', 'warning');
      return;
    }
    const seated = state.seats.some(
      (s) => s.occupant?.type === 'USER' && s.occupant.userId === user.id,
    );
    if (!seated) {
      toast('You are not seated at this table', 'warning');
      return;
    }
    if (isUserActiveInMatch(state, user.id)) {
      toast('You are active in this match', 'warning');
      return;
    }
    if (!state.mainBet) {
      toast('Main bet not placed yet', 'warning');
      return;
    }
    if (state.phase !== 'BETTING' && state.phase !== 'SIDE_BETTING') {
      toast('Side betting is not open', 'warning');
      return;
    }
    setSideBetTarget({ userId: occupantUserId, name });
  };

  for (const seat of occupiedSeats) {
    const occupant = seat.occupant!;
    const metaKey = resolveOccupantKey(occupant);
    const meta = metaKey ? playerMeta[metaKey] : undefined;
    const isSelf = occupant.type === 'USER' && occupant.userId === user?.id;
    const visualSlot = visualSlotBySeat.get(seat.seatIndex);
    if (visualSlot === undefined) continue;

    const occupantUserId = resolveOccupantKey(occupant);
    const isSeatHolder = seat.seatIndex === holderSeatIndex;
    const isSeatOpponent = seat.seatIndex === opponentSeatIndex;
    const isActive = isSeatHolder || isSeatOpponent;
    const seatClickable = canSideBet && isActive && !!occupantUserId;
    const seatInteractive = isActive && !!occupantUserId;

    slotViews[visualSlot] = {
      seatIndex: seat.seatIndex,
      visualSlot,
      name: meta?.displayName ?? occupant.name,
      avatarUrl: meta?.avatarUrl ?? occupant.avatarUrl,
      occupantUserId,
      isSelf,
      isActive,
      isDiceHolder: isSeatHolder,
      isYourTurn: isSeatHolder && canBet,
      isSpectator: !isActive,
      clickable: seatClickable,
      onClick: seatInteractive
        ? () => openSideBetForSeat(seat.seatIndex, occupantUserId!, meta?.displayName ?? occupant.name)
        : undefined,
    };
  }

  const tableDice = rolling
    ? displayResult?.dice ?? null
    : displayResult?.dice ?? state.dice ?? null;

  const visibleSeatIndexes = new Set(visualSlotBySeat.keys());

  const showBetTimer = isBettingPhase(state);
  const showSideBetTimer = isSideBettingPhase(state);
  const showRollTimer = isRollReadyPhase(state);

  const seatViews: DiceSeatView[] = slotViews.map((view, visualSlot) =>
    view ?? {
      seatIndex: visualSlot,
      visualSlot,
      name: '',
      isEmpty: true,
      isSpectator: true,
    },
  );

  const balanceDisplay = user?.id && playerMeta[user.id]?.balance
    ? formatAmount(parseFloat(playerMeta[user.id].balance!) || 0)
    : undefined;

  const matchPanel = (
    <DiceMatchPanel
      state={state}
      playerMeta={playerMeta}
      userId={user?.id}
      formatAmount={formatAmount}
      availableBalance={availableBalance}
      timerSeconds={
        showBetTimer
          ? turnTimerSeconds ?? 0
          : showSideBetTimer || showRollTimer
            ? phaseTimerSeconds ?? 0
            : undefined
      }
      timerMaxSeconds={
        showBetTimer
          ? state.config.turnTimeoutSeconds
          : showSideBetTimer
            ? state.config.sideBetWindowSeconds
            : showRollTimer
              ? state.config.finalLockSeconds
              : undefined
      }
      canBet={canBet}
      canRoll={canRoll}
      canSideBet={canSideBet}
      rolling={rolling}
      betAmount={betAmount}
      onAmountChange={setBetAmount}
      minBet={minBet}
      maxBet={maxBet}
      onPlaceMainBet={async (amount, choice) => { await placeMainBet(amount, choice); }}
      onRoll={async () => {
        // Panel button: soft throw from roller toward table centre.
        if (trayWorldPos) {
          await handlePlayerThrow({
            dirX: -trayWorldPos[0],
            dirZ: -trayWorldPos[2],
            speed: 0.72,
          });
        } else {
          await handlePlayerThrow({ dirX: 0, dirZ: -1, speed: 0.72 });
        }
      }}
      onSideBet={(targetUserId, name) => {
        const seat = state.seats.find((s) => resolveOccupantKey(s.occupant) === targetUserId);
        if (seat) openSideBetForSeat(seat.seatIndex, targetUserId, name);
      }}
      visibleSeatIndexes={visibleSeatIndexes}
      onAccept={async (sideBetId, amount) => { await acceptSideBet(sideBetId, amount); }}
      onReject={async (sideBetId) => { await rejectSideBet(sideBetId); }}
    />
  );

  const playArea = (
    <>
      {isMobileGameLayout ? (
        <DiceMobileHud
          balanceDisplay={balanceDisplay}
          userName={user?.displayName ?? user?.username}
          onLogout={() => void logout()}
        />
      ) : null}
      <div className={`dice-game-viewport__stage${isMobileGameLayout ? ' dice-game-viewport__stage--split' : ''}`}>
        <div className="dice-game-viewport__table-wrap">
          {/* Both phone orientations share one canvas size, so rotating the
              device must not remount the scene and rebuild the GL context. */}
          <DiceTable
            key={mode === 'desktop' ? 'desktop' : 'mobile'}
            seats={seatViews}
            maxSeats={state.maxSeats}
            selfSeatIndex={selfSeatIndex}
            rolling={rolling}
            dice={tableDice}
            onSeatPositions={handleSeatPositions}
            mobilePortrait={isMobileRotate}
            mobileLandscape={isMobileLandscape}
            domSeatOverlay={isMobileGameLayout}
            seatOutwardBoost={isMobileGameLayout ? 0.06 : 0}
            canvasSize={canvasSize}
            throwMode={throwMode}
            throwRequest={throwRequest}
            trayVisible={canPlayerThrow}
            trayScreenPct={trayScreenPct}
            trayWorldPos={trayWorldPos}
            portraitRotated={isMobileRotate}
            onPlayerThrow={(g) => { void handlePlayerThrow(g); }}
          />
          {chipTransfer ? (
            <ChipTransferAnimation
              fromPct={chipTransfer.fromPct}
              toPct={chipTransfer.toPct}
              amount={chipTransfer.amount}
              currency={currency}
              roundId={chipTransfer.roundId}
            />
          ) : null}
        </div>

        {settlementDisplay && settlementDisplay.result.outcome !== 'NO_RESULT' ? (
          <DiceSettlementOverlay
            result={settlementDisplay.result}
            winnerName={
              settlementDisplay.winnerSeatIndex != null
                ? getOccupantDisplayName(
                    state.seats.find((s) => s.seatIndex === settlementDisplay.winnerSeatIndex) ?? null,
                    playerMeta,
                  )
                : 'Winner'
            }
            currency={currency}
            personalOutcome={settlementDisplay.personalOutcome}
            roundId={settlementDisplay.roundId}
          />
        ) : null}

        <div className="dice-game-viewport__side">
          {matchPanel}
        </div>
      </div>

      {import.meta.env.DEV && sessionId ? (
        <div className="dice-game-viewport__dev">
          <DiceDevControls
            sessionId={sessionId}
            variant="play"
            onRefresh={() => void refresh()}
            debug={{
              phase: state.phase,
              mainBet: !!state.mainBet,
              canSideBet,
              role: selfSeatIndex == null
                ? 'unseated'
                : isHolder
                  ? 'holder'
                  : isActivePlayer
                    ? 'opponent'
                    : 'spectator',
              seated: selfSeatIndex != null,
              clickableSeats: seatViews.filter((s) => s.clickable).map((s) => s.name),
            }}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {isMobileGameLayout ? (
        <DiceMobileShell
          isMobileRotate={isMobileRotate}
          isMobileLandscape={isMobileLandscape}
          size={size}
        >
          {playArea}
        </DiceMobileShell>
      ) : (
        <div className="dice-game-viewport">
          <div className="dice-game-viewport__play">{playArea}</div>
        </div>
      )}

      <SideBetModal
        open={!!sideBetTarget}
        onClose={() => setSideBetTarget(null)}
        targetName={sideBetTarget?.name ?? ''}
        currency={currency}
        minBet={minBet}
        maxBet={maxBet}
        formatAmount={formatAmount}
        onSubmit={async (prediction, amount) => {
          if (!sideBetTarget) return;
          await requestSideBet(sideBetTarget.userId, prediction, amount);
          setSideBetTarget(null);
        }}
      />

    </>
  );
}

export function DiceLobbyPage() {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [openingSixPlayer, setOpeningSixPlayer] = useState(false);

  const playDice = async () => {
    setPlaying(true);
    try {
      const result = await api.post<{ session: { id: string } }>('/api/dice/play', {});
      navigate(`/games/dice/play/${result.session.id}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setPlaying(false);
    }
  };

  const openSixPlayerRoom = async () => {
    setOpeningSixPlayer(true);
    try {
      const id = await openSixPlayerDemoRoom();
      navigate(`/games/dice/play/${id}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setOpeningSixPlayer(false);
    }
  };

  return (
    <div className="dice-lobby ds-panel ds-panel--chrome">
      <h1>Dice</h1>
      <p>Join a live table. You will be seated automatically.</p>
      <div className="dice-lobby__actions">
        <GoldButton loading={playing} onClick={() => void playDice()}>Play Dice</GoldButton>
        {import.meta.env.DEV ? (
          <GoldButton loading={openingSixPlayer} onClick={() => void openSixPlayerRoom()}>
            Open 6-Player Test Room
          </GoldButton>
        ) : null}
      </div>
    </div>
  );
}
