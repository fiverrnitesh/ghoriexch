import { useNavigate, useLocation } from 'react-router-dom';
import Game from './components/Game/Game';
import { useEffect, useState } from 'react';
import { useCleanup } from '../../hooks/useCleanup';
import type { TPlayerInitData } from '../../types';
import { isStorageSupported, deleteSaveFromStorage } from '../../game/storage/storage';
import { LudoMatchSetup } from '../../components/MatchSetup/LudoMatchSetup';
import {
  generatePlayersForCount,
  type TPlayerCountNumber,
} from '../../config/matchConfig';
import { useDispatch, useSelector } from 'react-redux';
import { setMatchConfig, startMatch, resetMatch } from '../../state/slices/matchSlice';
import type { RootState } from '../../state/store';
import { ludoSound } from '../../utils/sound';

let hasWarnedAboutStorage = false;

export default function Play() {
  const cleanup = useCleanup();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const isMatchActive = useSelector((state: RootState) => state.match.isMatchActive);

  const [activePlayers, setActivePlayers] = useState<TPlayerInitData[] | null>(() => {
    const stateInitData = (location.state as { initData?: TPlayerInitData[] })?.initData;
    if (stateInitData && stateInitData.length >= 2) return stateInitData;
    return null;
  });

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  useEffect(() => {
    const saveSupported = isStorageSupported();
    if (saveSupported === false && !hasWarnedAboutStorage) {
      hasWarnedAboutStorage = true;
      console.warn("Saving is currently unavailable. Your progress won't be saved this session.");
    }
  }, []);

  const handleStartMatch = (playerCount: TPlayerCountNumber, entryAmount: number) => {
    deleteSaveFromStorage();
    cleanup();
    ludoSound.unlock();
    dispatch(setMatchConfig({ playerCount, entryAmount }));
    dispatch(startMatch());
    const players = generatePlayersForCount(playerCount);
    setActivePlayers(players);
  };

  const handleBackToLobby = () => {
    dispatch(resetMatch());
    navigate('/');
  };

  if (!isMatchActive || !activePlayers) {
    return <LudoMatchSetup onStartMatch={handleStartMatch} onBack={handleBackToLobby} />;
  }

  return <Game initData={activePlayers} />;
}
