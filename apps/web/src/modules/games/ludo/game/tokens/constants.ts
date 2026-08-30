import type { Easing } from 'framer-motion';
import type { TPlayerColour, TCoordinate } from '../../types';
import type { TTokenDirection, TTokenPath } from '../../types/tokens';

export const transitionStates = {
  forward: {
    timingFn: 'easeInOut',
    durationMs: 500,
  },
  backward: {
    timingFn: 'linear',
    durationMs: 100,
  },
} as const satisfies Record<TTokenDirection, { durationMs: number; timingFn: Easing }>;

export const GENERAL_TOKEN_PATH: TTokenPath[] = [
  {
    startCoords: { x: 6, y: 13 },
    endCoords: { x: 6, y: 9 },
  },
  {
    startCoords: { x: 5, y: 8 },
    endCoords: { x: 1, y: 8 },
  },
  {
    startCoords: { x: 0, y: 8 },
    endCoords: { x: 0, y: 6 },
  },
  {
    startCoords: { x: 1, y: 6 },
    endCoords: { x: 5, y: 6 },
  },
  {
    startCoords: { x: 6, y: 5 },
    endCoords: { x: 6, y: 1 },
  },
  {
    startCoords: { x: 6, y: 0 },
    endCoords: { x: 8, y: 0 },
  },
  {
    startCoords: { x: 8, y: 1 },
    endCoords: { x: 8, y: 5 },
  },
  {
    startCoords: { x: 9, y: 6 },
    endCoords: { x: 13, y: 6 },
  },
  {
    startCoords: { x: 14, y: 6 },
    endCoords: { x: 14, y: 8 },
  },
  {
    startCoords: { x: 13, y: 8 },
    endCoords: { x: 9, y: 8 },
  },
  {
    startCoords: { x: 8, y: 9 },
    endCoords: { x: 8, y: 13 },
  },
  {
    startCoords: { x: 8, y: 14 },
    endCoords: { x: 6, y: 14 },
  },
];

export const TOKEN_HOME_ENTRY_PATH: Record<TPlayerColour, TTokenPath> = {
  blue: {
    startCoords: { x: 7, y: 13 },
    endCoords: { x: 7, y: 8 },
  },
  red: {
    startCoords: { x: 1, y: 7 },
    endCoords: { x: 6, y: 7 },
  },
  green: {
    startCoords: { x: 7, y: 1 },
    endCoords: { x: 7, y: 6 },
  },
  yellow: {
    startCoords: { x: 13, y: 7 },
    endCoords: { x: 8, y: 7 },
  },
};

export const TOKEN_START_COORDINATES: Record<TPlayerColour, TCoordinate> = {
  blue: { x: 6, y: 13 },
  red: { x: 1, y: 6 },
  green: { x: 8, y: 1 },
  yellow: { x: 13, y: 8 },
};

export const TOKEN_SAFE_COORDINATES: TCoordinate[] = [
  ...Object.values(TOKEN_START_COORDINATES),
  { x: 8, y: 12 },
  { x: 2, y: 8 },
  { x: 6, y: 2 },
  { x: 12, y: 6 },
];

export const TOKEN_LOCKED_COORDINATES: Record<TPlayerColour, TCoordinate[]> = {
  blue: [
    { x: 1.7, y: 10.7 },
    { x: 3.3, y: 10.7 },
    { x: 1.7, y: 12.3 },
    { x: 3.3, y: 12.3 },
  ],
  red: [
    { x: 1.7, y: 1.7 },
    { x: 3.3, y: 1.7 },
    { x: 1.7, y: 3.3 },
    { x: 3.3, y: 3.3 },
  ],
  green: [
    { x: 10.7, y: 1.7 },
    { x: 12.3, y: 1.7 },
    { x: 10.7, y: 3.3 },
    { x: 12.3, y: 3.3 },
  ],
  yellow: [
    { x: 10.7, y: 10.7 },
    { x: 12.3, y: 10.7 },
    { x: 10.7, y: 12.3 },
    { x: 12.3, y: 12.3 },
  ],
};
