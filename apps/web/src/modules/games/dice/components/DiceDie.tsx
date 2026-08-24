import './DiceDie.css';

export type DieFace = 1 | 3 | 4 | 6 | 'BLANK';

export function DiceDie({
  face,
  rolling = false,
  revealed = true,
  landed = false,
}: {
  face: DieFace;
  rolling?: boolean;
  revealed?: boolean;
  landed?: boolean;
}) {
  const label = face === 'BLANK' ? '' : String(face);

  return (
    <div
      className={[
        'dice-die',
        rolling && 'dice-die--rolling',
        !revealed && 'dice-die--hidden',
        landed && 'dice-die--landed',
        face === 'BLANK' && 'dice-die--blank',
      ].filter(Boolean).join(' ')}
      data-face={face}
    >
      <div className="dice-die__body">
        <div className="dice-die__face-top" />
        <div className="dice-die__face-front">
          {face === 'BLANK' ? (
            <span className="dice-die__blank-mark" aria-hidden="true" />
          ) : (
            <span className="dice-die__number">{label}</span>
          )}
        </div>
        <div className="dice-die__face-right" />
        <div className="dice-die__face-left" />
      </div>
      <div className="dice-die__shadow" aria-hidden="true" />
    </div>
  );
}

export function DicePair({
  dice,
  rolling = false,
  landed = false,
}: {
  dice: [DieFace, DieFace] | null;
  rolling?: boolean;
  landed?: boolean;
}) {
  const d = dice ?? [1, 1];
  const showFaces = !!dice && !rolling;

  return (
    <div className={`dice-pair ${rolling ? 'dice-pair--rolling' : ''} ${landed ? 'dice-pair--landed' : ''}`}>
      <DiceDie face={d[0]} rolling={rolling} revealed={showFaces || rolling} landed={landed} />
      <DiceDie face={d[1]} rolling={rolling} revealed={showFaces || rolling} landed={landed} />
    </div>
  );
}
