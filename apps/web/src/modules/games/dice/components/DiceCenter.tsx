import { DicePair, type DieFace } from './DiceDie';
import { DiceResult } from './DiceResult';
import { formatChoiceLabel } from '../utils/choiceLabels';
import './DiceCenter.css';

export function DiceCenter({
  dice,
  rolling,
  displayResult,
  matchLabel,
  displayPhase,
  stakeLabel,
  winnerName,
  passToName,
  personalOutcome,
}: {
  dice: [DieFace, DieFace] | null;
  rolling: boolean;
  displayResult?: {
    parity: 'ODD' | 'EVEN' | null;
    outcome: 'WIN' | 'LOSS' | 'NO_RESULT' | null;
    hasBlank: boolean;
  } | null;
  matchLabel?: { holder: string; opponent: string } | null;
  displayPhase?: string;
  stakeLabel?: string | null;
  winnerName?: string | null;
  passToName?: string | null;
  personalOutcome?: 'WON' | 'LOST' | null;
}) {
  const isNoResult = displayResult?.outcome === 'NO_RESULT';
  const showCompletedResult = !rolling && displayResult && !isNoResult && (displayResult.parity || displayResult.outcome || winnerName);
  const showNoResult = !rolling && isNoResult;

  return (
    <div className={`dice-center ${rolling ? 'dice-center--rolling' : ''}`}>
      {matchLabel && (
        <div className="dice-center__match">
          <span className="dice-center__match-label">CURRENT MATCH</span>
          <p>
            {matchLabel.holder.toUpperCase()}
            <span>VS</span>
            {matchLabel.opponent.toUpperCase()}
          </p>
        </div>
      )}

      {stakeLabel && !showCompletedResult && !showNoResult && (
        <div className="dice-center__pot">
          <span className="dice-center__coins" aria-hidden="true">
            <i /><i /><i />
          </span>
          <strong>{stakeLabel}</strong>
        </div>
      )}

      <DicePair dice={dice} rolling={rolling} landed={!!dice && !rolling} />

      {rolling ? (
        <div className="dice-center__status">
          <strong>ROLLING</strong>
        </div>
      ) : showNoResult ? (
        <div className="dice-center__status">
          <strong>NO RESULT</strong>
          {passToName ? (
            <span className="dice-center__pass">DICE PASSES TO: {passToName.toUpperCase()}</span>
          ) : null}
        </div>
      ) : showCompletedResult && winnerName ? (
        <div className="dice-center__ribbon" role="status">
          <span className="dice-center__ribbon-label">WINNER</span>
          <strong>{winnerName.toUpperCase()}</strong>
          {personalOutcome ? (
            <span className={`dice-center__personal dice-center__personal--${personalOutcome.toLowerCase()}`}>
              {personalOutcome === 'WON' ? 'WIN' : 'LOSS'}
            </span>
          ) : null}
        </div>
      ) : displayPhase && displayPhase !== 'BETTING' && displayPhase !== 'ACCEPT_BETS' && displayPhase !== 'ROLL_READY' ? (
        <div className="dice-center__status">
          <strong>{displayPhase.replace(/_/g, ' ')}</strong>
        </div>
      ) : null}

      {!showNoResult && (
        <DiceResult
          display={displayResult ? {
            ...displayResult,
            parityLabel: displayResult.parity ? formatChoiceLabel(displayResult.parity) : null,
          } : null}
          dice={dice}
          rolling={rolling}
        />
      )}
    </div>
  );
}
