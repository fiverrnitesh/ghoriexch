import { UserAvatar } from '../UserAvatar/UserAvatar';
import './PlayerCard.css';

export interface PlayerCardProps {
  name: string;
  subtitle?: string;
  balance?: string;
  avatarUrl?: string | null;
  status?: 'online' | 'away' | 'offline' | 'playing';
  highlight?: boolean;
  badge?: string;
  onClick?: () => void;
}

export function PlayerCard({
  name,
  subtitle,
  balance,
  avatarUrl,
  status,
  highlight,
  badge,
  onClick,
}: PlayerCardProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ds-player-card ${highlight ? 'ds-player-card--highlight' : ''}`}
      onClick={onClick}
    >
      <UserAvatar name={name} imageUrl={avatarUrl} size="md" status={status} highlight={highlight} />
      <div className="ds-player-card__info">
        <span className="ds-player-card__name">{name}</span>
        {subtitle && <span className="ds-player-card__subtitle">{subtitle}</span>}
      </div>
      {balance && <span className="ds-player-card__balance">{balance}</span>}
      {badge && <span className="ds-badge ds-badge--gold">{badge}</span>}
    </Tag>
  );
}
