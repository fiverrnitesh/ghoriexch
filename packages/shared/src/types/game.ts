export const GAME_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  MAINTENANCE: 'MAINTENANCE',
  DISABLED: 'DISABLED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type GameStatus = (typeof GAME_STATUSES)[keyof typeof GAME_STATUSES];

export const SESSION_STATUSES = {
  WAITING: 'WAITING',
  STARTING: 'STARTING',
  IN_PROGRESS: 'IN_PROGRESS',
  SETTLING: 'SETTLING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ABANDONED: 'ABANDONED',
} as const;

export type GameSessionStatus = (typeof SESSION_STATUSES)[keyof typeof SESSION_STATUSES];

export interface GameCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  category: string | null;
  provider: string | null;
  minPlayers: number;
  maxPlayers: number;
  status: GameStatus;
  thumbnailUrl: string | null;
}

export interface GameSessionSummary {
  id: string;
  gameId: string;
  roomId: string | null;
  status: GameSessionStatus;
  roundNumber: number;
  playerCount: number;
  startedAt: string | null;
}

export interface RoomSummary {
  id: string;
  gameId: string;
  name: string;
  code: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
  minBet: string | null;
  maxBet: string | null;
  isPrivate: boolean;
}
