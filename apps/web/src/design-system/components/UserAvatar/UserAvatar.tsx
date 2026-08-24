import './UserAvatar.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'away' | 'offline' | 'playing';

export interface UserAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  status?: AvatarStatus;
  highlight?: boolean;
  className?: string;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function UserAvatar({ name, imageUrl, size = 'md', status, highlight, className = '' }: UserAvatarProps) {
  return (
    <div
      className={[
        'ds-avatar',
        `ds-avatar--${size}`,
        highlight ? 'ds-avatar--highlight' : '',
        className,
      ].filter(Boolean).join(' ')}
      title={name}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="ds-avatar__img" />
      ) : (
        <span className="ds-avatar__initials">{initials(name)}</span>
      )}
      {status && <span className={`ds-avatar__status ds-avatar__status--${status}`} aria-label={status} />}
    </div>
  );
}
