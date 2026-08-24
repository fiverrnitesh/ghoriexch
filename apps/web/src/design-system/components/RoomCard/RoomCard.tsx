import './RoomCard.css';

export interface RoomCardProps {
  name: string;
  code: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  minBet?: string | null;
  isPrivate?: boolean;
  onJoin?: () => void;
  joinLabel?: string;
}

export function RoomCard({
  name,
  code,
  status,
  playerCount,
  maxPlayers,
  minBet,
  isPrivate,
  onJoin,
  joinLabel = 'Join Room',
}: RoomCardProps) {
  return (
    <article className="ds-room-card ds-panel ds-panel--chrome">
      <div className="ds-room-card__header">
        <h3 className="ds-room-card__name">{name}</h3>
        <span className={`ds-badge ${status === 'OPEN' ? 'ds-badge--live' : 'ds-badge--muted'}`}>{status}</span>
      </div>
      <div className="ds-room-card__body">
        <div className="ds-room-card__code">
          <span className="ds-room-card__code-label">Room Code</span>
          <span className="ds-room-card__code-value">{code}</span>
        </div>
        <div className="ds-room-card__meta">
          <span>{playerCount}/{maxPlayers} players</span>
          {minBet && <span>Min {minBet}</span>}
          {isPrivate && <span className="ds-badge ds-badge--gold">Private</span>}
        </div>
      </div>
      {onJoin && status === 'OPEN' && (
        <div className="ds-room-card__footer">
          <button type="button" className="ds-room-card__join" onClick={onJoin}>{joinLabel}</button>
        </div>
      )}
    </article>
  );
}
