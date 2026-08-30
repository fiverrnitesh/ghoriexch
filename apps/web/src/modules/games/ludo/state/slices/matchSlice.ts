import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_ENTRY_AMOUNT,
  DEFAULT_PLAYER_COUNT,
  calculatePrizePool,
  type TPlayerCountNumber,
} from '../../config/matchConfig';

export interface MatchState {
  playerCount: TPlayerCountNumber;
  entryAmount: number;
  prizePool: number;
  isMatchActive: boolean;
}

export const initialState: MatchState = {
  playerCount: DEFAULT_PLAYER_COUNT,
  entryAmount: DEFAULT_ENTRY_AMOUNT,
  prizePool: calculatePrizePool(DEFAULT_PLAYER_COUNT, DEFAULT_ENTRY_AMOUNT),
  isMatchActive: false,
};

const matchSlice = createSlice({
  name: 'match',
  initialState,
  reducers: {
    setMatchConfig: (
      state,
      action: PayloadAction<{ playerCount: TPlayerCountNumber; entryAmount: number }>
    ) => {
      state.playerCount = action.payload.playerCount;
      state.entryAmount = action.payload.entryAmount;
      state.prizePool = calculatePrizePool(action.payload.playerCount, action.payload.entryAmount);
    },
    startMatch: (state) => {
      state.isMatchActive = true;
    },
    resetMatch: (state) => {
      state.isMatchActive = false;
    },
  },
});

export const { setMatchConfig, startMatch, resetMatch } = matchSlice.actions;
export default matchSlice.reducer;
