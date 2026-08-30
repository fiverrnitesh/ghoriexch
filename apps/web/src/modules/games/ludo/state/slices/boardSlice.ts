import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type TBoardState = {
  boardSideLength: number;
  boardTileSize: number;
  tokenHeight: number;
  tokenWidth: number;
};

export const NUMBER_OF_BLOCKS_IN_ONE_ROW = 15;
export const TOKEN_WIDTH_HEIGHT_RATIO = 0.739;

const DEFAULT_BOARD_SIZE = 600;

export const initialState: TBoardState = {
  boardSideLength: DEFAULT_BOARD_SIZE,
  boardTileSize: DEFAULT_BOARD_SIZE / NUMBER_OF_BLOCKS_IN_ONE_ROW,
  tokenHeight: (DEFAULT_BOARD_SIZE / NUMBER_OF_BLOCKS_IN_ONE_ROW) * 1.22,
  tokenWidth:
    (DEFAULT_BOARD_SIZE / NUMBER_OF_BLOCKS_IN_ONE_ROW) * 1.22 * TOKEN_WIDTH_HEIGHT_RATIO,
};

const reducers = {
  resizeBoard: (state: TBoardState, action: PayloadAction<number>) => {
    state.boardSideLength = action.payload;
    state.boardTileSize = action.payload / NUMBER_OF_BLOCKS_IN_ONE_ROW;
    state.tokenHeight = (action.payload / NUMBER_OF_BLOCKS_IN_ONE_ROW) * 1.22;
    state.tokenWidth =
      (action.payload / NUMBER_OF_BLOCKS_IN_ONE_ROW) * 1.22 * TOKEN_WIDTH_HEIGHT_RATIO;
  },
  clearBoardState: () => initialState,
};

const boardSlice = createSlice({
  name: 'board',
  initialState,
  reducers,
});

export const { resizeBoard, clearBoardState } = boardSlice.actions;

export default boardSlice.reducer;
