import type { DieFace } from './DiceDie';
import './DiceResult.css';

export function DiceResult({
  display,
  dice,
  rolling,
}: {
  display?: {
    parity: 'ODD' | 'EVEN' | null;
    parityLabel?: string | null;
    outcome: 'WIN' | 'LOSS' | 'NO_RESULT' | null;
    hasBlank: boolean;
  } | null;
  dice: [DieFace, DieFace] | null;
  rolling: boolean;
}) {
  if (rolling || (!display && !dice)) return null;

  const parity = display?.parityLabel ?? display?.parity;
  const outcome = display?.outcome;
  const showDiceLine = dice && !rolling;
  const isNoResult = outcome === 'NO_RESULT';

  if (!parity && !isNoResult && !display?.hasBlank) return null;

  return (
    <div className={`dice-result-panel ${outcome === 'WIN' ? 'dice-result-panel--win' : outcome === 'LOSS' ? 'dice-result-panel--loss' : isNoResult ? 'dice-result-panel--no-result' : ''}`}>
      {isNoResult ? (
        <span className="dice-result-panel__parity">NO RESULT</span>
      ) : parity ? (
        <span className="dice-result-panel__parity">{parity}</span>
      ) : null}
      {showDiceLine && display?.hasBlank ? (
        <span className="dice-result-panel__blank">BLANK</span>
      ) : null}
    </div>
  );
}
