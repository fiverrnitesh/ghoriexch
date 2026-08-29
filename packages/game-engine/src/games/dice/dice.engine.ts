import { BaseGameEngine } from '../../base/base-game-engine.js';
import type {
  GameDefinitionMeta,
  GameSessionCreateInput,
  GameSessionJoinInput,
  GameSessionLeaveInput,
  GameActionInput,
  GameRoundSettlement,
} from '../../types/game-definition.js';
import { DEFAULT_DICE_CONFIG, DICE_ACTIONS } from './dice.constants.js';
import {
  assignSeat,
  buildInitialMatch,
  countOccupants,
  countRealUsers,
  createInitialState,
  assignPendingSideBetsToTiger,
  evaluateMainBet,
  generateRoundId,
  getActiveHolderActorId,
  getActiveOpponentActorId,
  getActiveRollerActorId,
  getMatchOpponentSeatIndex,
  isEligibleSideBettor,
  isAcceptedParticipant,
  isActiveMatchTarget,
  isTigerTargetId,
  removeUserFromSeats,
  resolveMainBetChoice,
  rollDicePair,
  rotateAfterLoss,
  rotateAfterWin,
  roundMoney,
  seatTigerBot,
} from './dice.logic.js';
import {
  clearPhaseTimer,
  isPhaseExpired,
  startFinalLockWindow,
  startSideBetWindow,
} from './dice.phase-timer.js';
import {
  assertTurnNotExpired,
  clearTurnTimer,
  isTurnExpired,
  startTurnTimer,
} from './dice.turn-timer.js';
import type { DiceGameState, DieFace, SideBetState } from './dice.types.js';
import type { GameEngineEvent } from '../../types/game-definition.js';

export class DiceGameEngine extends BaseGameEngine {
  meta: GameDefinitionMeta = {
    id: 'dice',
    slug: 'dice',
    name: 'Dice',
    version: '1.0.0',
    status: 'ACTIVE',
    minPlayers: 2,
    maxPlayers: 8,
    category: 'popular',
    description: 'Custom dual-dice ODD/EVEN table game',
  };

  private states = new Map<string, DiceGameState>();

  async createSession(input: GameSessionCreateInput): Promise<{ sessionId: string; initialState: Record<string, unknown> }> {
    const sessionId = `dice_${Date.now()}`;
    const config = { ...DEFAULT_DICE_CONFIG, ...(input.config as Partial<typeof DEFAULT_DICE_CONFIG> & {
      roomHostUserId?: string;
      gameMode?: DiceGameState['gameMode'];
      acceptedParticipantIds?: string[];
    }) };
    const state = createInitialState(config);
    const cfg = input.config as {
      roomHostUserId?: string;
      gameMode?: DiceGameState['gameMode'];
      acceptedParticipantIds?: string[];
    } | undefined;
    if (cfg?.roomHostUserId) state.roomHostUserId = cfg.roomHostUserId;
    if (cfg?.gameMode) state.gameMode = cfg.gameMode;
    if (cfg?.acceptedParticipantIds?.length) {
      state.acceptedParticipantIds = [...cfg.acceptedParticipantIds];
    }
    seatTigerBot(state);
    this.states.set(sessionId, state);
    return { sessionId, initialState: state as unknown as Record<string, unknown> };
  }

  loadState(sessionId: string, state: DiceGameState) {
    state.config = { ...DEFAULT_DICE_CONFIG, ...state.config };
    this.states.set(sessionId, state);
  }

  getInternalState(sessionId: string): DiceGameState | undefined {
    return this.states.get(sessionId);
  }

  configureSessionContext(
    sessionId: string,
    ctx: {
      roomHostUserId?: string | null;
      gameMode?: DiceGameState['gameMode'];
      acceptedParticipantIds?: string[];
    },
  ) {
    const state = this.states.get(sessionId);
    if (!state) return;
    if (ctx.roomHostUserId) state.roomHostUserId = ctx.roomHostUserId;
    if (ctx.gameMode) state.gameMode = ctx.gameMode;
    if (ctx.acceptedParticipantIds) state.acceptedParticipantIds = [...ctx.acceptedParticipantIds];
  }

  async joinSession(input: GameSessionJoinInput): Promise<{ playerState: Record<string, unknown> }> {
    const state = this.states.get(input.sessionId);
    if (!state) throw new Error('Session not found');

    if (state.gameMode === 'FRIENDS' && !isAcceptedParticipant(state, input.userId)) {
      throw new Error('Player not accepted into this friends room');
    }

    const alreadySeated = state.seats.some(
      (s) => s.occupant?.type === 'USER' && s.occupant.userId === input.userId,
    );

    if (!alreadySeated) {
      if (countRealUsers(state.seats) >= state.config.maxPlayers) throw new Error('Table full');
      if (countOccupants(state.seats) >= state.maxSeats) throw new Error('Table full');
      state.seats = assignSeat(state.seats, {
        type: 'USER',
        userId: input.userId,
        name: input.userId,
      });
      if (state.gameMode !== 'FRIENDS' && !state.acceptedParticipantIds.includes(input.userId)) {
        state.acceptedParticipantIds.push(input.userId);
      }
    }

    seatTigerBot(state);

    if (countOccupants(state.seats) >= state.config.minEffectivePopulation && !state.activeMatch) {
      this.beginNewRound(state, Date.now());
    }

    return { playerState: { seatIndex: input.seatIndex ?? 0 } };
  }

  async leaveSession(input: GameSessionLeaveInput): Promise<void> {
    const state = this.states.get(input.sessionId);
    if (!state) return;
    state.seats = removeUserFromSeats(state.seats, input.userId);
    state.acceptedParticipantIds = state.acceptedParticipantIds.filter((id) => id !== input.userId);
    if (countOccupants(state.seats) < state.config.minEffectivePopulation) {
      state.phase = 'WAITING_FOR_PLAYERS';
      state.activeMatch = null;
      clearTurnTimer(state);
      clearPhaseTimer(state);
      state.mainBet = null;
    }
  }

  async processAction(input: GameActionInput) {
    const state = this.states.get(input.sessionId);
    if (!state) throw new Error('Session not found');

    const events: GameEngineEvent[] = [];
    const nowMs = typeof input.payload.nowMs === 'number' ? input.payload.nowMs : Date.now();
    const isSystem = input.payload.systemTimeout === true || input.userId === 'system';

    switch (input.action) {
      case DICE_ACTIONS.PLACE_MAIN_BET: {
        const payload = input.payload as { amount: number; choice?: unknown; pao?: unknown };
        const choice = resolveMainBetChoice(payload);
        const amount = payload.amount;
        const holderId = getActiveHolderActorId(state);
        if (input.userId !== holderId) throw new Error('Only active dice player can place main bet');
        if (!state.activeMatch) throw new Error('No active match');
        if (state.phase !== 'BETTING') throw new Error('Betting not open');
        if (state.mainBet) throw new Error('Main bet already placed');
        if (!isSystem) assertTurnNotExpired(state, nowMs);
        if (typeof amount !== 'number' || amount < state.config.minBet || amount > state.config.maxBet) {
          throw new Error(`Bet must be between ${state.config.minBet} and ${state.config.maxBet}`);
        }

        state.mainBet = {
          userId: input.userId,
          activePlayerUserId: input.userId,
          amount,
          choice,
          locked: false,
          holderLocked: false,
          roundId: state.roundId,
          status: 'PENDING',
          placedAt: new Date(nowMs).toISOString(),
        };
        events.push(this.createEvent('dice:main_bet_placed', { mainBet: state.mainBet }));
        this.confirmTigerMainMatch(state, events, nowMs, { stayInBetting: true });
        break;
      }

      case DICE_ACTIONS.ACCEPT_OPPONENT_MATCH: {
        const { amount } = input.payload as { amount: number };
        const opponentId = getActiveOpponentActorId(state);
        if (input.userId !== opponentId && input.payload.botAction !== true) {
          throw new Error('Only the designated opponent can accept the match');
        }
        if (state.phase !== 'OPPONENT_MATCHING' && state.phase !== 'MAIN_BET_PLACED') {
          throw new Error('Opponent matching not active');
        }
        if (!state.mainBet) throw new Error('Main bet required');
        if (state.mainBet.locked) throw new Error('Main match already confirmed');
        if (typeof amount !== 'number' || amount !== state.mainBet.amount) {
          throw new Error('Opponent must match the exact holder stake');
        }

        const opponentSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);
        if (opponentSeat?.occupant?.type === 'USER' && !isAcceptedParticipant(state, opponentSeat.occupant.userId!)) {
          throw new Error('Opponent is not an accepted participant');
        }

        state.mainBet.opponentStake = amount;
        state.mainBet.matchedPool = roundMoney(state.mainBet.amount + amount);
        state.mainBet.opponentUserId = opponentSeat?.occupant?.type === 'USER' ? opponentSeat.occupant.userId : undefined;
        state.mainBet.opponentBotId = opponentSeat?.occupant?.type === 'BOT' ? opponentSeat.occupant.botId : undefined;
        state.mainBet.locked = true;
        state.phase = 'MAIN_MATCH_CONFIRMED';
        events.push(this.createEvent('dice:main_match_confirmed', { mainBet: state.mainBet }));
        startSideBetWindow(state, state.config.sideBetWindowSeconds, nowMs);
        events.push(this.createEvent('dice:betting_open', { phase: 'SIDE_BETTING' }));
        break;
      }

      case DICE_ACTIONS.ROLL_DICE: {
        const rollerId = getActiveRollerActorId(state);
        if (input.userId !== rollerId && input.payload.botAction !== true && !isSystem) {
          throw new Error('Only active dice player can roll');
        }
        if (state.phase !== 'FINAL_LOCK' && state.phase !== 'BETTING_LOCKED') {
          throw new Error('Dice roll not available in current phase');
        }
        if (!state.mainBet?.locked) throw new Error('Main bet not locked for roll');
        if (!state.activeMatch) throw new Error('No active match');

        this.performRoll(state, events, nowMs);
        break;
      }

      case DICE_ACTIONS.PHASE_TIMEOUT: {
        const expectedTimerId = String(input.payload.phaseTimerId ?? '');
        if (!expectedTimerId || state.phaseTimerId !== expectedTimerId) {
          return { state: state as unknown as Record<string, unknown>, events: [] };
        }
        if (!isPhaseExpired(state, nowMs)) {
          return { state: state as unknown as Record<string, unknown>, events: [] };
        }
        this.handlePhaseTimeout(state, events, nowMs, input.sessionId);
        break;
      }

      case DICE_ACTIONS.TURN_TIMEOUT: {
        const expectedTimerId = String(input.payload.turnTimerId ?? '');
        if (!expectedTimerId || state.turnTimerId !== expectedTimerId) {
          return { state: state as unknown as Record<string, unknown>, events: [] };
        }
        if (!isTurnExpired(state, nowMs)) {
          return { state: state as unknown as Record<string, unknown>, events: [] };
        }
        if (state.phase !== 'BETTING') {
          return { state: state as unknown as Record<string, unknown>, events: [] };
        }

        if (state.mainBet) {
          this.openAcceptanceWindow(state, events, nowMs);
          break;
        }

        const timedOutPlayerId = getActiveHolderActorId(state);
        const timedOutSeatIndex = state.activeMatch!.holderSeatIndex;
        state.activeMatch = rotateAfterLoss(state);
        if (!state.activeMatch) throw new Error('Unable to rotate after turn timeout');
        this.beginHolderTurn(state, nowMs);
        events.push(this.createEvent('dice:turn_timeout', {
          sessionId: input.sessionId,
          roundId: state.roundId,
          timedOutPlayerId,
          timedOutSeatIndex,
          nextHolderSeatIndex: state.activeMatch.holderSeatIndex,
          reason: 'FORFEIT',
          phase: state.phase,
        }));
        events.push(this.createEvent('dice:rotation', { activeMatch: state.activeMatch, reason: 'turn_timeout' }));
        break;
      }

      case DICE_ACTIONS.REQUEST_SIDE_BET: {
        const { targetUserId, prediction, amount, sideBetId } = input.payload as {
          targetUserId: string;
          prediction: 'WIN' | 'LOSS';
          amount: number;
          sideBetId: string;
        };
        if (!state.activeMatch) throw new Error('No active match');
        if (state.phase !== 'BETTING' && state.phase !== 'SIDE_BETTING') {
          throw new Error('Side betting not open');
        }
        if (!state.mainBet) throw new Error('Main bet required');
        if (!isEligibleSideBettor(state, input.userId)) throw new Error('Only accepted spectators can side bet');
        if (!isActiveMatchTarget(state, targetUserId)) throw new Error('Side bet target must be an active player');
        if (state.sideBets.some((s) => s.id === sideBetId)) throw new Error('Duplicate side bet id');
        if (typeof amount !== 'number' || amount < state.config.minBet || amount > state.config.maxBet) {
          throw new Error(`Side bet must be between ${state.config.minBet} and ${state.config.maxBet}`);
        }
        if (prediction !== 'WIN' && prediction !== 'LOSS') throw new Error('Invalid side bet prediction');
        const windowEnd = state.phase === 'SIDE_BETTING' ? state.sideBetWindowEndsAt : state.turnDeadlineAt;
        if (windowEnd && nowMs > new Date(windowEnd).getTime()) {
          throw new Error('Side bet window closed');
        }
        const sb: SideBetState = {
          id: sideBetId,
          backerUserId: input.userId,
          targetUserId,
          prediction,
          amount,
          status: 'PENDING',
          expiresAt: windowEnd
            ?? state.sideBetWindowEndsAt
            ?? new Date(nowMs + state.config.sideBetWindowSeconds * 1000).toISOString(),
        };
        if (isTigerTargetId(state, targetUserId)) {
          sb.status = 'ACCEPTED';
          sb.tigerLiability = amount;
          sb.playerAcceptedAmount = 0;
        }
        state.sideBets.push(sb);
        events.push(this.createEvent('dice:side_bet_request', { sideBetId, targetUserId }));
        if (sb.status === 'ACCEPTED') {
          events.push(this.createEvent('dice:side_bet_accepted', { sideBetId, acceptedAmount: 0, tigerLiability: amount }));
        }
        break;
      }

      case DICE_ACTIONS.ACCEPT_SIDE_BET: {
        if (state.phase !== 'SIDE_BETTING' && state.phase !== 'BETTING') {
          throw new Error('Side bet acceptance closed');
        }
        const { sideBetId, amount, availableBalance } = input.payload as {
          sideBetId: string;
          amount?: number;
          availableBalance?: number;
        };
        const sb = state.sideBets.find((s) => s.id === sideBetId);
        if (!sb) throw new Error('Side bet not found');
        if (sb.status !== 'PENDING') throw new Error('Side bet already resolved');
        if (sb.targetUserId !== input.userId) throw new Error('Only target player can accept');

        const requested = typeof amount === 'number' ? amount : sb.amount;
        if (typeof requested !== 'number' || requested < 0) throw new Error('Invalid accept amount');
        if (requested > sb.amount) throw new Error('Cannot accept more than bet amount');

        const cap = typeof availableBalance === 'number' ? Math.max(0, availableBalance) : requested;
        const playerPart = roundMoney(Math.min(requested, cap, sb.amount));
        const tigerPart = roundMoney(sb.amount - playerPart);

        sb.playerAcceptedAmount = playerPart;
        sb.playerLiabilityUserId = playerPart > 0 ? input.userId : undefined;
        sb.tigerLiability = tigerPart;
        sb.status = 'ACCEPTED';
        events.push(this.createEvent('dice:side_bet_accepted', {
          sideBetId,
          acceptedAmount: playerPart,
          tigerLiability: tigerPart,
        }));
        break;
      }

      case DICE_ACTIONS.REJECT_SIDE_BET: {
        if (state.phase !== 'SIDE_BETTING' && state.phase !== 'BETTING') {
          throw new Error('Side bet rejection closed');
        }
        const { sideBetId } = input.payload as { sideBetId: string };
        const sb = state.sideBets.find((s) => s.id === sideBetId);
        if (!sb) throw new Error('Side bet not found');
        if (sb.status !== 'PENDING') throw new Error('Side bet already resolved');
        if (sb.targetUserId !== input.userId) throw new Error('Only target player can reject');
        sb.playerAcceptedAmount = 0;
        sb.tigerLiability = sb.amount;
        sb.status = 'ACCEPTED';
        events.push(this.createEvent('dice:side_bet_accepted', {
          sideBetId,
          acceptedAmount: 0,
          tigerLiability: sb.amount,
        }));
        break;
      }

      case DICE_ACTIONS.FORCE_DICE: {
        state.forcedDice = input.payload.dice as [DieFace, DieFace];
        break;
      }

      default:
        throw new Error(`Unknown action: ${input.action}`);
    }

    return { state: state as unknown as Record<string, unknown>, events };
  }

  expirePendingSideBets(sessionId: string) {
    const state = this.states.get(sessionId);
    if (!state) return [];
    const assigned = assignPendingSideBetsToTiger(state);
    return assigned.map((sideBetId) => {
      const sb = state.sideBets.find((s) => s.id === sideBetId);
      return this.createEvent('dice:side_bet_accepted', {
        sideBetId,
        acceptedAmount: sb?.playerAcceptedAmount ?? 0,
        tigerLiability: sb?.tigerLiability ?? sb?.amount ?? 0,
      });
    });
  }

  async getState(sessionId: string): Promise<Record<string, unknown>> {
    const state = this.states.get(sessionId);
    if (!state) throw new Error('Session not found');
    return state as unknown as Record<string, unknown>;
  }

  async settleRound(sessionId: string): Promise<GameRoundSettlement> {
    const state = this.states.get(sessionId);
    if (!state || !state.dice || !state.mainBet) {
      return { roundNumber: state?.roundNumber ?? 0, winners: [], losers: [], result: {} };
    }
    const opponentStake = state.mainBet.opponentStake ?? state.mainBet.amount;
    const result = evaluateMainBet(
      state.dice[0],
      state.dice[1],
      state.mainBet.choice,
      state.mainBet.amount,
      opponentStake,
      state.config.platformFeeRate,
    );
    if (result.outcome === 'NO_RESULT') {
      return { roundNumber: state.roundNumber, winners: [], losers: [], result: result as unknown as Record<string, unknown> };
    }
    const opponentSeat = state.seats.find((s) => s.seatIndex === state.activeMatch?.opponentSeatIndex);
    const opponentUserId = opponentSeat?.occupant?.type === 'USER' ? opponentSeat.occupant.userId : null;
    const winners = result.outcome === 'WIN'
      ? [{ userId: state.mainBet.userId, payout: result.winnerPayout }]
      : opponentUserId
        ? [{ userId: opponentUserId, payout: result.winnerPayout }]
        : [];
    const losers = result.outcome === 'LOSS' && opponentUserId
      ? [{ userId: state.mainBet.userId, loss: state.mainBet.amount }]
      : result.outcome === 'WIN' && opponentUserId
        ? [{ userId: opponentUserId, loss: opponentStake }]
        : result.outcome === 'LOSS'
          ? [{ userId: state.mainBet.userId, loss: state.mainBet.amount }]
          : [];
    return {
      roundNumber: state.roundNumber,
      winners,
      losers,
      result: result as unknown as Record<string, unknown>,
    };
  }

  private beginNewRound(state: DiceGameState, nowMs: number) {
    const isFirstRound = state.roundNumber === 0;
    state.activeMatch = buildInitialMatch(state.seats, isFirstRound ? state.roomHostUserId : null);
    state.roundNumber += 1;
    state.roundId = generateRoundId();
    state.mainBet = null;
    state.dice = null;
    state.sideBets = [];
    clearPhaseTimer(state);
    this.beginHolderTurn(state, nowMs);
  }

  private beginHolderTurn(state: DiceGameState, nowMs: number) {
    state.phase = 'BETTING';
    state.sideBetWindowEndsAt = null;
    state.opponentMatchWindowEndsAt = null;
    state.finalLockEndsAt = null;
    state.rollerSeatIndex = state.activeMatch?.holderSeatIndex ?? null;
    startTurnTimer(state, nowMs);
  }

  private openAcceptanceWindow(state: DiceGameState, events: GameEngineEvent[], nowMs: number) {
    clearTurnTimer(state);
    if (state.mainBet && !state.mainBet.opponentStake) {
      this.confirmTigerMainMatch(state, events, nowMs, { stayInBetting: true });
    }
    const holderSeat = state.seats.find((s) => s.seatIndex === state.activeMatch?.holderSeatIndex);
    if (holderSeat?.occupant?.type === 'BOT') {
      this.assignUnmatchedToTigerAndLock(state, events, nowMs);
      return;
    }
    startSideBetWindow(state, state.config.sideBetWindowSeconds, nowMs);
    events.push(this.createEvent('dice:betting_open', { phase: 'SIDE_BETTING' }));
  }

  private assignUnmatchedToTigerAndLock(state: DiceGameState, events: GameEngineEvent[], nowMs: number) {
    for (const ev of this.expirePendingSideBetsInternal(state)) events.push(ev);
    if (state.mainBet) state.mainBet.locked = true;
    startFinalLockWindow(state, state.config.finalLockSeconds, nowMs);
    events.push(this.createEvent('dice:betting_open', { phase: 'FINAL_LOCK' }));
  }

  private expirePendingSideBetsInternal(state: DiceGameState) {
    const assigned = assignPendingSideBetsToTiger(state);
    return assigned.map((sideBetId) => {
      const sb = state.sideBets.find((s) => s.id === sideBetId);
      return this.createEvent('dice:side_bet_accepted', {
        sideBetId,
        acceptedAmount: sb?.playerAcceptedAmount ?? 0,
        tigerLiability: sb?.tigerLiability ?? sb?.amount ?? 0,
      });
    });
  }

  private handlePhaseTimeout(
    state: DiceGameState,
    events: GameEngineEvent[],
    nowMs: number,
    sessionId: string,
  ) {
    if (state.phase === 'OPPONENT_MATCHING') {
      const opponentSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);
      const isBotOpponent = opponentSeat?.occupant?.type === 'BOT';
      if (isBotOpponent && state.mainBet) {
        this.confirmTigerMainMatch(state, events, nowMs, { stayInBetting: false });
        this.openAcceptanceWindow(state, events, nowMs);
        return;
      }
      this.cancelUnmatchedMainBet(state, events, sessionId, nowMs);
      return;
    }

    if (state.phase === 'SIDE_BETTING') {
      this.assignUnmatchedToTigerAndLock(state, events, nowMs);
      return;
    }

    if (state.phase === 'FINAL_LOCK') {
      this.performRoll(state, events, nowMs);
    }
  }

  private confirmTigerMainMatch(
    state: DiceGameState,
    events: GameEngineEvent[],
    _nowMs: number,
    opts: { stayInBetting: boolean },
  ) {
    if (!state.mainBet) return;
    const amount = state.mainBet.amount;
    state.mainBet.opponentStake = amount;
    state.mainBet.matchedPool = roundMoney(amount * 2);
    state.mainBet.opponentBotId = 'tiger';
    state.mainBet.status = 'MATCHED';
    state.mainBet.locked = true;
    if (!opts.stayInBetting) {
      state.phase = 'MAIN_MATCH_CONFIRMED';
    }
    events.push(this.createEvent('dice:main_match_confirmed', { mainBet: state.mainBet }));
  }

  private cancelUnmatchedMainBet(
    state: DiceGameState,
    events: GameEngineEvent[],
    sessionId: string,
    nowMs: number,
  ) {
    const mainBet = state.mainBet;
    events.push(this.createEvent('dice:opponent_match_expired', {
      sessionId,
      roundId: state.roundId,
      mainBet,
    }));
    state.mainBet = null;
    clearPhaseTimer(state);
    state.activeMatch = rotateAfterLoss(state);
    if (!state.activeMatch) throw new Error('Unable to rotate after failed opponent match');
    this.beginHolderTurn(state, nowMs);
    events.push(this.createEvent('dice:rotation', { activeMatch: state.activeMatch, reason: 'opponent_match_expired' }));
  }

  private performRoll(state: DiceGameState, events: GameEngineEvent[], nowMs = Date.now()) {
    const completedMatch = { ...state.activeMatch! };
    const completedRoundId = state.roundId;
    const completedRoundNumber = state.roundNumber;

    clearPhaseTimer(state);
    clearTurnTimer(state);

    state.phase = 'DICE_ROLLING';
    events.push(this.createEvent('dice:rolling', {}));

    const dice = state.forcedDice ?? rollDicePair();
    state.forcedDice = null;
    state.dice = dice;
    state.phase = 'RESULT';

    const opponentStake = state.mainBet!.opponentStake ?? state.mainBet!.amount;
    const result = evaluateMainBet(
      dice[0],
      dice[1],
      state.mainBet!.choice,
      state.mainBet!.amount,
      opponentStake,
      state.config.platformFeeRate,
    );
    events.push(this.createEvent('dice:result', {
      dice,
      result,
      noResult: result.outcome === 'NO_RESULT',
    }));

    if (result.outcome === 'NO_RESULT') {
      const currentRoller = state.rollerSeatIndex ?? state.activeMatch!.holderSeatIndex;
      const nextRoller = getMatchOpponentSeatIndex(state, currentRoller);
      state.rollerSeatIndex = nextRoller ?? state.activeMatch!.opponentSeatIndex;
      startFinalLockWindow(state, state.config.finalLockSeconds, nowMs);
      events.push(this.createEvent('dice:betting_open', { phase: 'FINAL_LOCK', reason: 'no_result_pass' }));
      return;
    }

    state.phase = 'SETTLEMENT';
    if (state.mainBet) {
      state.mainBet.status = 'SETTLED';
      state.mainBet.settledAt = new Date(nowMs).toISOString();
    }
    const settledMainBet = { ...state.mainBet! };
    events.push(this.createEvent('dice:settlement', {
      result,
      mainBet: settledMainBet,
      roundId: completedRoundId,
      roundNumber: completedRoundNumber,
      completedMatch,
    }));

    if (result.outcome === 'WIN') {
      state.lastWinnerSeatIndex = state.activeMatch!.holderSeatIndex;
      state.activeMatch = rotateAfterWin(state);
      events.push(this.createEvent('dice:winner', { seatIndex: state.lastWinnerSeatIndex, keptDice: true }));
    } else {
      state.lastWinnerSeatIndex = state.activeMatch!.opponentSeatIndex;
      state.activeMatch = rotateAfterLoss(state);
      events.push(this.createEvent('dice:winner', { seatIndex: state.lastWinnerSeatIndex, keptDice: false }));
    }

    state.phase = 'NEXT_MATCH';
    state.mainBet = null;
    state.dice = null;
    state.sideBets = [];
    state.forcedDice = null;
    state.rollerSeatIndex = null;
    state.roundNumber += 1;
    state.roundId = generateRoundId();
    this.beginHolderTurn(state, nowMs);
    events.push(this.createEvent('dice:rotation', { activeMatch: state.activeMatch }));
  }
}

export const diceGameEngine = new DiceGameEngine();
