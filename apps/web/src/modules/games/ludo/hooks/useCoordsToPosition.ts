import { useStore } from 'react-redux';
import type { TCoordinate } from '../types';
import type { TTokenAlignmentData } from '../types';
import type { RootState } from '../state/store';
import { useCallback } from 'react';

export const useCoordsToPosition = (): ((
  coords: TCoordinate,
  tokenAlignmentData: TTokenAlignmentData
) => { x: number; y: number }) => {
  const store = useStore<RootState>();
  return useCallback(
    (coords: TCoordinate, tokenAlignmentData: TTokenAlignmentData) => {
      const { boardTileSize, tokenHeight, tokenWidth } = store.getState().board;
      const { xOffset, yOffset } = tokenAlignmentData;
      const tileCenterX = coords.x * boardTileSize + boardTileSize / 2;
      const tileCenterY = coords.y * boardTileSize + boardTileSize / 2;

      // Check if the coordinate is in the home base (fractional locked coordinates)
      const isHomeCoord = !Number.isInteger(coords.x) || !Number.isInteger(coords.y);

      const x = tileCenterX - tokenWidth / 2 + xOffset * boardTileSize;
      // In home sockets: center the spherical token head (cy=15/46) concentric in the socket well
      // On the board path: align the token pin tip (cy=43.5/46) at the center of the path cell
      const yAnchor = isHomeCoord ? 15 / 46 : 43.5 / 46;
      const y = tileCenterY - yAnchor * tokenHeight + yOffset * boardTileSize;

      return { x, y };
    },
    [store]
  );
};
