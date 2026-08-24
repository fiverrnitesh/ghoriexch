/** DEV-only 10-player live simulation room — must match prisma/seed.ts users */
export const SIMULATION_ROOM_CODE = 'DICE10SIM';
export const SIMULATION_ROOM_NAME = '10 PLAYER LIVE TEST';

export const SIMULATION_PLAYERS = [
  { email: 'player1@games.local', displayName: 'Player 1', balance: 10000 },
  { email: 'rahul@games.local', displayName: 'Player 2', balance: 10000 },
  { email: 'tanya@games.local', displayName: 'Player 3', balance: 10000 },
  { email: 'rohit@games.local', displayName: 'Player 4', balance: 10000 },
  { email: 'sneha@games.local', displayName: 'Player 5', balance: 10000 },
  { email: 'arjun@games.local', displayName: 'Player 6', balance: 10000 },
  { email: 'priya@games.local', displayName: 'Player 7', balance: 10000 },
  { email: 'vikram@games.local', displayName: 'Player 8', balance: 10000 },
  { email: 'neha@games.local', displayName: 'Player 9', balance: 10000 },
  { email: 'player2@games.local', displayName: 'Player 10', balance: 10000 },
] as const;

export const SIM_BET_AMOUNTS = [10, 25, 50, 100, 250, 500] as const;

export interface SimulationConfig {
  opponentAcceptRate: number;
  timeoutRate: number;
  sideBetParticipationRate: number;
  sideBetAcceptRate: number;
  speed: 'normal' | 'fast';
  maxRounds: number;
  continuous: boolean;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  opponentAcceptRate: 0.85,
  timeoutRate: 0.07,
  sideBetParticipationRate: 0.4,
  sideBetAcceptRate: 0.75,
  speed: 'normal',
  maxRounds: 0,
  continuous: true,
};

export interface SimulationStats {
  roundsCompleted: number;
  roundsTimedOut: number;
  roundsSettled: number;
  mainBetsPlaced: number;
  opponentMatches: number;
  opponentRejectsOrTimeouts: number;
  sideBetsPlaced: number;
  sideBetsAccepted: number;
  sideBetsRejected: number;
  diceRolls: number;
  oddWins: number;
  evenWins: number;
  blankResults: number;
  platformFeesGenerated: number;
  settlementErrors: number;
  walletErrors: number;
  websocketErrors: number;
  rotationErrors: number;
  failedRoundCount: number;
  failedRounds: Array<{ round: number; phase: string; player: string; action: string; error: string }>;
}

export function createEmptySimulationStats(): SimulationStats {
  return {
    roundsCompleted: 0,
    roundsTimedOut: 0,
    roundsSettled: 0,
    mainBetsPlaced: 0,
    opponentMatches: 0,
    opponentRejectsOrTimeouts: 0,
    sideBetsPlaced: 0,
    sideBetsAccepted: 0,
    sideBetsRejected: 0,
    diceRolls: 0,
    oddWins: 0,
    evenWins: 0,
    blankResults: 0,
    platformFeesGenerated: 0,
    settlementErrors: 0,
    walletErrors: 0,
    websocketErrors: 0,
    rotationErrors: 0,
    failedRoundCount: 0,
    failedRounds: [],
  };
}
