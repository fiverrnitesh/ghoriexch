import type { ReactNode } from 'react';
import { UserAvatar } from '../UserAvatar/UserAvatar';
import './PlayerSeat.css';

export type SeatPosition =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

export interface PlayerSeatProps {
  name: string;
  balance?: string;
  avatarUrl?: string | null;
  position: SeatPosition;
  isSelf?: boolean;
  status?: 'online' | 'playing' | 'away';
  statusLabel?: string;
  highlight?: boolean;
  /** Slot for game-specific content (cards, pieces, etc.) */
  content?: ReactNode;
  ribbon?: string;
}

export function PlayerSeat({
  name,
  balance,
  avatarUrl,
  position,
  isSelf,
  status = 'online',
  statusLabel,
  highlight,
  content,
  ribbon,
}: PlayerSeatProps) {
  return (
    <div
      className={[
        'ds-player-seat',
        `ds-player-seat--${position}`,
        isSelf ? 'ds-player-seat--self' : '',
        highlight ? 'ds-player-seat--active' : '',
      ].filter(Boolean).join(' ')}
    >
      {ribbon && <span className="ds-player-seat__ribbon">{ribbon}</span>}
      <div className="ds-player-seat__row">
        <UserAvatar
          name={name}
          imageUrl={avatarUrl}
          size={isSelf ? 'lg' : 'md'}
          status={status}
          highlight={highlight || isSelf}
        />
        <div className="ds-player-seat__info">
          <span className="ds-player-seat__name">{name}{isSelf ? ' (You)' : ''}</span>
          {balance && <span className="ds-player-seat__balance">{balance}</span>}
          {statusLabel && <span className="ds-player-seat__status-label">{statusLabel}</span>}
        </div>
      </div>
      {content && <div className="ds-player-seat__content">{content}</div>}
    </div>
  );
}
