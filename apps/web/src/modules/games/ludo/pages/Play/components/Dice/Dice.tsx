import { useCallback, useEffect, useMemo } from 'react';
import { type TPlayerColour } from '../../../../types';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../state/store';
import { isAnyTokenActiveOfColour } from '../../../../game/tokens/logic';
import styles from './Dice.module.css';
import clsx from 'clsx';
import { useRollDice } from '../../../../hooks/useRollDice';
import { useHandlePostDiceRoll } from '../../../../hooks/useHandlePostDiceRoll';
import { useChangeTurn } from '../../../../hooks/useChangeTurn';
import { logError } from '../../../../utils/logError';
import Dice3D from './Dice3D';

type Props = {
  colour: TPlayerColour;
  playerName: string;
};

export default function Dice({ colour, playerName }: Props) {
  const {
    isAnyTokenMoving,
    isGameEnded,
    currentPlayerColour: currentPlayer,
    players,
  } = useSelector((state: RootState) => state.players);
  const { diceNumber, isPlaceholderShowing } =
    useSelector((state: RootState) => state.dice.dice.find((d) => d.colour === colour)) ?? {};

  const anyTokenActive = useMemo(
    () => isAnyTokenActiveOfColour(colour, players),
    [colour, players]
  );
  const handlePostDiceRoll = useHandlePostDiceRoll();
  const changeTurnFn = useChangeTurn();
  const rollDice = useRollDice();
  const isBot = players.find((p) => p.colour === colour)?.isBot;
  const isCurrentPlayer = currentPlayer === colour;
  const isDiceDisabled =
    !isCurrentPlayer ||
    anyTokenActive ||
    isAnyTokenMoving ||
    isGameEnded ||
    isPlaceholderShowing ||
    isBot;

  const handleDiceClick = useCallback(async () => {
    if (isDiceDisabled) return;
    const diceNumber = await rollDice(colour);
    const res = await handlePostDiceRoll(colour, diceNumber);
    if (res?.shouldChangeTurn) changeTurnFn();
  }, [colour, handlePostDiceRoll, isDiceDisabled, rollDice, changeTurnFn]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.key.toLowerCase() !== 'd' || isDiceDisabled) return;
      handleDiceClick().catch(logError('Dice.handleKeyDown'));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDiceClick, isDiceDisabled]);

  return (
    <div className={clsx(styles.diceContainer, styles[colour])}>
      <Dice3D
        diceNumber={diceNumber}
        isRolling={Boolean(isPlaceholderShowing)}
        colour={colour}
        isActive={!isDiceDisabled}
        disabled={Boolean(isDiceDisabled)}
        onClick={handleDiceClick}
      />
      <span className={styles.playerName}>{playerName}</span>
    </div>
  );
}
