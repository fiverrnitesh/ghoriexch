import { Html } from '@react-three/drei';
import { UserAvatar } from '../../../../design-system';
import './DiceSeat.css';

function isFarVisualSlot(visualSlot?: number) {
  return visualSlot === 2 || visualSlot === 3 || visualSlot === 4 || visualSlot === 5;
}

export interface DiceSeatView {
  seatIndex: number;
  visualSlot?: number;
  name: string;
  avatarUrl?: string | null;
  occupantUserId?: string | null;
  isSelf?: boolean;
  isEmpty?: boolean;
  isActive?: boolean;
  isDiceHolder?: boolean;
  isYourTurn?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  isSpectator?: boolean;
  clickable?: boolean;
  balance?: string | null;
  onClick?: () => void;
}

export function DiceSeat({
  visualSlot,
  name,
  avatarUrl,
  isSelf,
  isActive,
  isDiceHolder,
  isYourTurn,
  isWinner,
  isLoser,
  isSpectator,
  isEmpty,
  clickable,
  balance,
  onClick,
}: DiceSeatView) {
  const far = isFarVisualSlot(visualSlot);

  if (isEmpty) {
    return (
      <div
        className={[
          'dice-seat',
          'dice-seat--world',
          'dice-seat--empty',
          far && 'dice-seat--far',
        ].filter(Boolean).join(' ')}
        aria-hidden="true"
      >
        <div className="dice-seat__avatar-wrap dice-seat__avatar-wrap--empty" />
        <div className="dice-seat__plate dice-seat__plate--empty" />
      </div>
    );
  }

  const shortName = name.length > 11 ? `${name.slice(0, 10)}…` : name;
  const status = isWinner
    ? 'WIN'
    : isYourTurn
      ? 'YOUR TURN'
      : isDiceHolder
        ? 'TURN'
        : null;

  return (
    <div
      className={[
        'dice-seat',
        'dice-seat--world',
        isSelf && 'dice-seat--self',
        isActive && 'dice-seat--active dice-seat--in-match',
        isDiceHolder && 'dice-seat--holder',
        isYourTurn && 'dice-seat--your-turn',
        isWinner && 'dice-seat--winner',
        isLoser && 'dice-seat--loser',
        isSpectator && !isActive && 'dice-seat--spectator',
        clickable && 'dice-seat--clickable',
        far && 'dice-seat--far',
      ].filter(Boolean).join(' ')}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onPointerDown={clickable ? (e) => e.stopPropagation() : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick?.(); } : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
    >
      <div className="dice-seat__avatar-wrap">
        <UserAvatar
          name={name}
          imageUrl={avatarUrl}
          size={isSelf ? 'lg' : 'md'}
          highlight={!!(isDiceHolder || isYourTurn || isWinner)}
          className="dice-seat__avatar"
        />
        {status ? <span className="dice-seat__status">{status}</span> : null}
      </div>
      <div className="dice-seat__plate">
        <span className="dice-seat__name">{shortName}</span>
        {isSelf && balance ? (
          <span className="dice-seat__balance">{balance}</span>
        ) : null}
      </div>
    </div>
  );
}

export function DiceSeatHtml({
  position,
  scale = 1,
  seat,
}: {
  position: [number, number, number];
  scale?: number;
  seat: DiceSeatView;
}) {
  // The translate repeats what `center` normally applies: a transform passed via
  // `style` replaces drei's own, which would otherwise anchor the seat by its
  // top-left corner and make its screen X depend on name-plate width.
  return (
    <Html
      position={position}
      center
      distanceFactor={15}
      zIndexRange={[20, 0]}
      pointerEvents="none"
      wrapperClass="dice-seat-html"
      style={{
        pointerEvents: 'none',
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      <DiceSeat {...seat} />
    </Html>
  );
}
