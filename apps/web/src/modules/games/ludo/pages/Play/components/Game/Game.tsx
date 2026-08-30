import { useEffect, useRef, useState } from 'react';
import { clearPlayersState, registerNewPlayer, setPlayerSequence } from '../../../../state/slices/playersSlice';
import Board from '../Board/Board';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { hydrateRootState, type AppDispatch, type RootState } from '../../../../state/store';
import { clearDiceState, registerDice } from '../../../../state/slices/diceSlice';
import GameFinishedScreen from '../GameFinishedScreen/GameFinishedScreen';
import type { TPlayerInitData } from '../../../../types';
import { useNavigate } from 'react-router-dom';
import { playerCountToWord } from '../../../../game/players/logic';
import { addToGameInactiveTime, setGameStartTime } from '../../../../state/slices/sessionSlice';
import styles from './Game.module.css';
import { retrieveState } from '../../../../game/storage/retrieveState';
import { deleteSaveFromStorage, saveExists } from '../../../../game/storage/storage';
import { useExecuteBotMove } from '../../../../hooks/useExecuteBotMove';
import { useRollDice } from '../../../../hooks/useRollDice';
import { playerSequences } from '../../../../game/players/constants';
import { logError } from '../../../../utils/logError';
import { saveState } from '../../../../game/storage/saveState';
import { ludoSound } from '../../../../utils/sound';
import { resetMatch } from '../../../../state/slices/matchSlice';

export const EXIT_MESSAGE = 'Are you sure you want to exit?';

type Props = {
  initData: TPlayerInitData[] | undefined;
};

export default function Game({ initData }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const boardTileSize = useSelector((state: RootState) => state.board.boardTileSize);
  const { isGameEnded, playerFinishOrder, currentPlayerColour, players } = useSelector(
    (state: RootState) => state.players
  );
  const [isMuted, setIsMuted] = useState(false);
  const playersRegisteredInitiallyRef = useRef(true);
  const gameInactiveStartTime = useRef(0);
  const navigate = useNavigate();
  const store = useStore<RootState>();
  const executeBotMove = useExecuteBotMove();
  const rollDice = useRollDice();

  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    ludoSound.setMuted(nextMuted);
    if (!nextMuted) {
      ludoSound.unlock();
      ludoSound.play('token_step');
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isGameEnded) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isGameEnded]);

  useEffect(() => {
    if (saveExists()) {
      const { success, data } = retrieveState(store.getState());
      if (success) {
        store.dispatch(hydrateRootState(data));
        return;
      } else {
        deleteSaveFromStorage();
      }
    }

    if (!initData) return;
    const playerCountWord = playerCountToWord(initData.length);
    const calculatedSequence = playerSequences[playerCountWord];

    dispatch(clearPlayersState());
    dispatch(clearDiceState());
    dispatch(setPlayerSequence({ playerCount: playerCountWord }));
    dispatch(setGameStartTime(Date.now()));

    for (let i = 0; i < initData.length; i++) {
      dispatch(
        registerNewPlayer({
          name: initData[i].name,
          colour: calculatedSequence[i],
          isBot: initData[i].isBot,
        })
      );
      dispatch(registerDice(calculatedSequence[i]));
    }
    playersRegisteredInitiallyRef.current = false;
  }, [dispatch, initData, store]);

  useEffect(() => {
    if (players.length === 0) return;
    const currentPlayer = store
      .getState()
      .players.players.find((p) => p.colour === currentPlayerColour);
    if (currentPlayer?.isBot) {
      rollDice(currentPlayerColour)
        .then((diceNumber) => executeBotMove(currentPlayerColour, diceNumber))
        .catch(logError('Game.botTurnEffect'));
    }
  }, [currentPlayerColour, executeBotMove, rollDice, store, players.length]);

  useEffect(() => {
    const handlePageVisibilityChange = () => {
      if (isGameEnded) return;
      if (document.visibilityState === 'hidden') {
        gameInactiveStartTime.current = Date.now();
        try {
          saveState(store.getState());
        } catch {
          console.warn('Skipped saving: game state is transitional.');
        }
      } else if (document.visibilityState === 'visible' && gameInactiveStartTime.current > 0) {
        const now = Date.now();
        dispatch(addToGameInactiveTime(now - gameInactiveStartTime.current));
        try {
          saveState(store.getState());
        } catch {
          console.warn('Skipped saving: game state is transitional.');
        }
        gameInactiveStartTime.current = 0;
      }
    };
    document.addEventListener('visibilitychange', handlePageVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handlePageVisibilityChange);
  }, [dispatch, isGameEnded, store]);

  const handleExitBtnClick = () => {
    if (isGameEnded || confirm(EXIT_MESSAGE)) {
      deleteSaveFromStorage();
      dispatch(resetMatch());
      navigate('/');
    }
  };

  return (
    <div
      className={styles.game}
      style={
        {
          '--board-tile-size': `${boardTileSize}px`,
        } as React.CSSProperties
      }
    >
      <Board />
      <button
        type="button"
        aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        className={styles.soundBtn}
        onClick={toggleSound}
        title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      <button
        type="button"
        aria-label="Exit button"
        className={styles.exitBtn}
        onClick={handleExitBtnClick}
      >
        &times;
      </button>
      {isGameEnded && <GameFinishedScreen playerFinishOrder={playerFinishOrder} />}
    </div>
  );
}
