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
  timerSeconds?: number;
  timerMaxSeconds?: number;
  timerActive?: boolean;
}

const TIMER_RADIUS = 46;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

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
  timerSeconds,
  timerMaxSeconds = 15,
  timerActive,
}: DiceSeatView) {
  const far = isFarVisualSlot(visualSlot);

  if (isEmpty) {
    return null;
  }

  const shortName = name.length > 11 ? `${name.slice(0, 10)}…` : name;
  const status = isWinner
    ? 'WIN'
    : isYourTurn
      ? 'YOUR TURN'
      : isDiceHolder
        ? 'TURN'
        : null;

  const hasTimer = Boolean(timerActive && timerSeconds !== undefined && timerSeconds >= 0);
  const currentSec = Math.max(0, timerSeconds ?? 0);
  const maxSec = Math.max(1, timerMaxSeconds ?? 15);
  const ratio = Math.min(1, Math.max(0, currentSec / maxSec));
  const strokeDashoffset = TIMER_CIRCUMFERENCE * (1 - ratio);

  // Color logic:
  // Starts green -> turns yellow when time is little remaining (<= 8s or <= 40%) -> turns red when <= 5s
  const timerColorClass = currentSec <= 5
    ? 'dice-seat__timer--danger'
    : currentSec <= 8 || ratio <= 0.45
      ? 'dice-seat__timer--warning'
      : 'dice-seat__timer--normal';

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
      <div className={`dice-seat__avatar-wrap ${hasTimer ? `dice-seat__avatar-wrap--timer ${timerColorClass}` : ''}`}>
        {hasTimer ? (
          <svg className="dice-seat__timer-svg" viewBox="0 0 100 100">
            <circle
              className="dice-seat__timer-track"
              cx="50"
              cy="50"
              r={TIMER_RADIUS}
            />
            <circle
              className="dice-seat__timer-circle"
              cx="50"
              cy="50"
              r={TIMER_RADIUS}
              style={{
                strokeDasharray: TIMER_CIRCUMFERENCE,
                strokeDashoffset,
              }}
            />
          </svg>
        ) : null}
        <UserAvatar
          name={name}
          imageUrl={avatarUrl}
          size="lg"
          highlight={!!(isDiceHolder || isYourTurn || isWinner)}
          className="dice-seat__avatar"
        />
        {hasTimer ? (
          <span className="dice-seat__timer-badge">{currentSec}s</span>
        ) : status ? (
          <span className="dice-seat__status">{status}</span>
        ) : null}
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
