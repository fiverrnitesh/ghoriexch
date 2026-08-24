import { getPhaseBadgeLabel } from '../utils/phaseLabels';
import './DiceMatchInfoBar.css';

export function DiceMatchInfoBar({
  holderName,
  opponentName,
  displayPhase,
  roundNumber,
}: {
  holderName: string;
  opponentName: string;
  displayPhase: string;
  roundNumber: number;
}) {
  if (!holderName || holderName === '—') return null;

  return (
    <div className="dice-match-info">
      <div className="dice-match-info__col">
        <span className="dice-match-info__label">Current Match</span>
        <span className="dice-match-info__value">
          {holderName} <span className="dice-match-info__vs">vs</span> {opponentName}
        </span>
      </div>
      <div className="dice-match-info__col">
        <span className="dice-match-info__label">Game Phase</span>
        <span className="dice-match-info__value dice-match-info__value--phase">
          {getPhaseBadgeLabel(displayPhase)}
        </span>
      </div>
      <div className="dice-match-info__col dice-match-info__col--roles">
        <span className="dice-match-info__label">Dice Holder</span>
        <span className="dice-match-info__value dice-match-info__value--gold">{holderName}</span>
      </div>
      <div className="dice-match-info__col dice-match-info__col--roles">
        <span className="dice-match-info__label">Opponent</span>
        <span className="dice-match-info__value">{opponentName}</span>
      </div>
      <div className="dice-match-info__round">Round {roundNumber || '—'}</div>
    </div>
  );
}
