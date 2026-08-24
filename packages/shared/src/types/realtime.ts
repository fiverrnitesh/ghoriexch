export const REALTIME_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECONNECT: 'reconnect',
  ERROR: 'error',

  // Room
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_STATE: 'room:state',
  ROOM_PLAYER_JOINED: 'room:player_joined',
  ROOM_PLAYER_LEFT: 'room:player_left',

  // Session
  SESSION_JOIN: 'session:join',
  SESSION_LEAVE: 'session:leave',
  SESSION_STATE: 'session:state',
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',

  // Game
  GAME_ACTION: 'game:action',
  GAME_EVENT: 'game:event',
  GAME_TIMER: 'game:timer',
  GAME_ROUND_START: 'game:round_start',
  GAME_ROUND_END: 'game:round_end',
  GAME_RESULT: 'game:result',

  // Betting
  BET_PLACE: 'bet:place',
  BET_UPDATE: 'bet:update',
  BET_SETTLED: 'bet:settled',
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export interface RoomStatePayload {
  roomId: string;
  gameId: string;
  status: string;
  players: Array<{ userId: string; username: string; seatIndex: number | null; status: string }>;
  sessionId: string | null;
  metadata: Record<string, unknown>;
}

export interface GameEventPayload {
  sessionId: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface GameResultPayload {
  sessionId: string;
  roundNumber: number;
  result: Record<string, unknown>;
  serverSeedHash: string | null;
  auditRef: string;
}
