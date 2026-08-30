import type { TPlayerColour, TPlayerCount } from '../../types';

export const playerColours = {
  blue: '#005c9e',
  red: '#e60000',
  green: '#008000',
  yellow: '#ffd700',
} as const;

export const MAX_PLAYER_NAME_LENGTH = 15;
export const playerSequences: Record<TPlayerCount, TPlayerColour[]> = {
  two: ['blue', 'green'],
  three: ['blue', 'red', 'green'],
  four: ['blue', 'red', 'green', 'yellow'],
} as const;
