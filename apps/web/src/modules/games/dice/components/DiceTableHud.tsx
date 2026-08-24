import './DiceTableHud.css';

export function DiceTableHud({
  roundNumber,
  holderName,
  opponentName,
  displayPhase,
  timerSeconds,
}: {
  roundNumber: number;
  holderName?: string;
  opponentName?: string;
  displayPhase: string;
  timerSeconds?: number;
}) {
  return (
    <div className="dice-table-hud">
      <span className="dice-table-hud__round">ROUND {roundNumber || '—'}</span>
      <span className="dice-table-hud__phase">{displayPhase.replace(/_/g, ' ')}</span>
      {timerSeconds !== undefined ? (
        <span className="dice-table-hud__time">{String(Math.max(0, timerSeconds)).padStart(2, '0')}s</span>
      ) : null}
      {holderName && opponentName ? (
        <p className="dice-table-hud__match">
          {holderName.toUpperCase()} <span>VS</span> {opponentName.toUpperCase()}
        </p>
      ) : null}
    </div>
  );
}
