import clsx from 'clsx';
import type { TPlayerColour } from '../../../../types';
import { playerColours } from '../../../../game/players/constants';
import styles from './Dice3D.module.css';

type Props = {
  diceNumber: number | undefined;
  isRolling: boolean;
  colour: TPlayerColour;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
};

export default function Dice3D({
  diceNumber = 6,
  isRolling,
  colour,
  isActive,
  disabled,
  onClick,
}: Props) {
  const getShowClass = (num: number | undefined) => {
    switch (num) {
      case 1:
        return styles.show1;
      case 2:
        return styles.show2;
      case 3:
        return styles.show3;
      case 4:
        return styles.show4;
      case 5:
        return styles.show5;
      case 6:
      default:
        return styles.show6;
    }
  };

  return (
    <button
      type="button"
      className={clsx(styles.diceScene, {
        [styles.interactive]: !disabled,
        [styles.rolling]: isRolling,
      })}
      onClick={onClick}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      title={!disabled ? 'Roll 3D Dice (Press D)' : undefined}
      style={{ '--player-colour': playerColours[colour] } as React.CSSProperties}
      aria-label={`Dice for ${colour} player${isRolling ? ' (Rolling)' : `: ${diceNumber}`}`}
    >
      {/* 3D Dynamic Ground Shadow */}
      <div className={styles.groundShadow} aria-hidden="true" />

      {/* Active player turn pulsing highlight ring */}
      {isActive && !isRolling && <div className={styles.turnRing} aria-hidden="true" />}

      {/* 3D Dice Cube */}
      <div
        className={clsx(styles.diceCube, isRolling ? styles.rolling : getShowClass(diceNumber))}
        aria-hidden="true"
      >
        {/* Face 1 (Front) */}
        <div className={clsx(styles.face, styles.front, styles.face1)}>
          <span className={clsx(styles.pip, styles.redPip)} />
        </div>

        {/* Face 6 (Back) */}
        <div className={clsx(styles.face, styles.back, styles.face6)}>
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
        </div>

        {/* Face 2 (Right) */}
        <div className={clsx(styles.face, styles.right, styles.face2)}>
          <span className={styles.pip} />
          <span className={styles.pip} />
        </div>

        {/* Face 5 (Left) */}
        <div className={clsx(styles.face, styles.left, styles.face5)}>
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
        </div>

        {/* Face 3 (Top) */}
        <div className={clsx(styles.face, styles.top, styles.face3)}>
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
        </div>

        {/* Face 4 (Bottom) */}
        <div className={clsx(styles.face, styles.bottom, styles.face4)}>
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
          <span className={styles.pip} />
        </div>
      </div>
    </button>
  );
}
