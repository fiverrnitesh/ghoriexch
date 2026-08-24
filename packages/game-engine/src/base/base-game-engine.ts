import type {
  GameDefinition,
  GameDefinitionMeta,
  GameSessionCreateInput,
  GameSessionJoinInput,
  GameSessionLeaveInput,
  GameActionInput,
  GameRoundSettlement,
  GameEngineEvent,
} from '../types/game-definition.js';

export abstract class BaseGameEngine implements GameDefinition {
  abstract meta: GameDefinitionMeta;

  abstract createSession(
    input: GameSessionCreateInput,
  ): Promise<{ sessionId: string; initialState: Record<string, unknown> }>;

  abstract joinSession(input: GameSessionJoinInput): Promise<{ playerState: Record<string, unknown> }>;

  abstract leaveSession(input: GameSessionLeaveInput): Promise<void>;

  abstract processAction(
    input: GameActionInput,
  ): Promise<{ state: Record<string, unknown>; events: GameEngineEvent[] }>;

  abstract getState(sessionId: string): Promise<Record<string, unknown>>;

  abstract settleRound(sessionId: string): Promise<GameRoundSettlement>;

  protected createEvent(type: string, payload: Record<string, unknown>): GameEngineEvent {
    return {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
  }
}
