import type { GameStatus } from '@games/shared';

export interface GameDefinitionMeta {
  id: string;
  slug: string;
  name: string;
  version: string;
  status: GameStatus;
  minPlayers: number;
  maxPlayers: number;
  category?: string;
  description?: string;
}

export interface GameSessionCreateInput {
  roomId?: string;
  hostUserId: string;
  config?: Record<string, unknown>;
}

export interface GameSessionJoinInput {
  sessionId: string;
  userId: string;
  seatIndex?: number;
}

export interface GameSessionLeaveInput {
  sessionId: string;
  userId: string;
}

export interface GameActionInput {
  sessionId: string;
  userId: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface GameRoundSettlement {
  roundNumber: number;
  winners: Array<{ userId: string; payout: number }>;
  losers: Array<{ userId: string; loss: number }>;
  result: Record<string, unknown>;
  serverSeed?: string;
  serverSeedHash?: string;
  nonce?: number;
}

export interface GameDefinition {
  meta: GameDefinitionMeta;

  createSession(input: GameSessionCreateInput): Promise<{ sessionId: string; initialState: Record<string, unknown> }>;
  joinSession(input: GameSessionJoinInput): Promise<{ playerState: Record<string, unknown> }>;
  leaveSession(input: GameSessionLeaveInput): Promise<void>;
  processAction(input: GameActionInput): Promise<{ state: Record<string, unknown>; events: GameEngineEvent[] }>;
  getState(sessionId: string): Promise<Record<string, unknown>>;
  settleRound(sessionId: string): Promise<GameRoundSettlement>;
}

export interface GameEngineEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface GamePlugin {
  definition: GameDefinition;
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
}
