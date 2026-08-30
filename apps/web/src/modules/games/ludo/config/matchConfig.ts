import type { TPlayerInitData } from '../types';

export type TPlayerCountNumber = 2 | 3 | 4;

export const ENTRY_AMOUNTS = [10, 25, 50, 100, 250, 500] as const;
export type TEntryAmount = (typeof ENTRY_AMOUNTS)[number];

export const DEFAULT_PLAYER_COUNT: TPlayerCountNumber = 4;
export const DEFAULT_ENTRY_AMOUNT: TEntryAmount = 50;

export interface MatchConfig {
  playerCount: TPlayerCountNumber;
  entryAmount: number;
  prizePool: number;
}

/**
 * Configurable prize pool calculation rule.
 * Total Entry = entryAmount * playerCount
 * Prize pool calculates virtual game credits awarded to winner(s).
 */
export function calculatePrizePool(playerCount: TPlayerCountNumber, entryAmount: number): number {
  return playerCount * entryAmount;
}

/**
 * Generates valid player init data for the LibreLudo game engine.
 * The human user is 'You' (Blue), and opponents are bot players.
 */
export function generatePlayersForCount(count: TPlayerCountNumber): TPlayerInitData[] {
  if (count === 2) {
    return [
      { name: 'You', isBot: false },
      { name: 'Bot1', isBot: true },
    ];
  }
  if (count === 3) {
    return [
      { name: 'You', isBot: false },
      { name: 'Bot1', isBot: true },
      { name: 'Bot2', isBot: true },
    ];
  }
  return [
    { name: 'You', isBot: false },
    { name: 'Bot1', isBot: true },
    { name: 'Bot2', isBot: true },
    { name: 'Bot3', isBot: true },
  ];
}
