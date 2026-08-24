export interface GameContext {
  sessionId: string;
  gameId: string;
  roomId: string | null;
  roundNumber: number;
  players: GamePlayerContext[];
  state: Record<string, unknown>;
  serverSeedHash: string | null;
  nonce: number;
}

export interface GamePlayerContext {
  userId: string;
  seatIndex: number | null;
  status: string;
  state: Record<string, unknown>;
}

export interface SettlementContext {
  sessionId: string;
  bets: Array<{
    betId: string;
    userId: string;
    amount: number;
    selection: Record<string, unknown>;
  }>;
}
