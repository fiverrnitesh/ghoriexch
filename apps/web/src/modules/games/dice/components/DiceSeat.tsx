import { Html } from '@react-three/drei';
import { UserAvatar } from '../../../../design-system';
import { isFarVisualSlot, isSideVisualSlot } from '../utils/seatPositions';
import './DiceSeat.css';

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
  peerBetEnabled?: boolean;
  peerBetPending?: Array<{ label: string; amount: string }>;
  onHaar?: () => void;
  onZeet?: () => void;
}

export function DiceSeat({
  visualSlot,
  name,
  avatarUrl,
  isSelf,
  isActive,
  isDiceHolder,
  isWinner,
  isLoser,
  isSpectator,
  isEmpty,
  clickable,
  balance,
  onClick,
  peerBetEnabled,
  peerBetPending,
  onHaar,
  onZeet,
}: DiceSeatView) {
  const far = isFarVisualSlot(visualSlot);
  const side = isSideVisualSlot(visualSlot);

  const displayName = name || 'Seat';
  const shortName = displayName.length > 11 ? `${displayName.slice(0, 10)}…` : displayName;
  const status = isEmpty ? null : isWinner ? 'WIN' : null;

  return (
    <div
      className={[
        'dice-seat',
        'dice-seat--world',
        isSelf && 'dice-seat--self',
        isActive && 'dice-seat--active dice-seat--in-match',
        isDiceHolder && 'dice-seat--holder',
        isWinner && 'dice-seat--winner',
        isLoser && 'dice-seat--loser',
        isSpectator && !isActive && !isEmpty && 'dice-seat--spectator',
        clickable && 'dice-seat--clickable',
        isEmpty && 'dice-seat--empty',
        far && 'dice-seat--far',
        side && 'dice-seat--side',
      ].filter(Boolean).join(' ')}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onPointerDown={clickable ? (e) => e.stopPropagation() : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick?.(); } : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
    >
      <div className="dice-seat__avatar-wrap">
        <UserAvatar
          name={displayName}
          imageUrl={avatarUrl}
          size="lg"
          highlight={!isEmpty && !!(isActive || isWinner)}
          className="dice-seat__avatar"
        />
        {status ? (
          <span className="dice-seat__status">{status}</span>
        ) : null}
      </div>
      <div className="dice-seat__plate">
        <span className="dice-seat__name">{shortName}</span>
        {peerBetPending && peerBetPending.length > 0 ? (
          <div className="dice-seat__peer-pending">
            {peerBetPending.map((badge, idx) => (
              <span key={`${badge.label}-${idx}`} className="dice-seat__peer-pending-badge">
                {badge.label} {badge.amount}
              </span>
            ))}
          </div>
        ) : null}
        {isSelf && balance ? (
          <span className="dice-seat__balance">{balance}</span>
        ) : null}
      </div>
      {peerBetEnabled && !isEmpty ? (
        <div className="dice-seat__peer-bets" style={{ pointerEvents: 'auto' }}>
          <button
            type="button"
            className="dice-seat__peer-btn dice-seat__peer-btn--haar"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onHaar?.(); }}
          >
            Haar
          </button>
          <button
            type="button"
            className="dice-seat__peer-btn dice-seat__peer-btn--zeet"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onZeet?.(); }}
          >
            Zeet
          </button>
        </div>
      ) : null}
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
