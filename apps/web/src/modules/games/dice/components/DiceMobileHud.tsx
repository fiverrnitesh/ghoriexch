import { Link } from 'react-router-dom';
import { BalanceBadge, UserAvatar } from '../../../../design-system';
import './DiceMobileHud.css';

export function DiceMobileHud({
  balanceDisplay,
  userName,
}: {
  balanceDisplay?: string;
  userName?: string;
  onLogout?: () => void;
}) {
  return (
    <header className="dice-mobile-hud" aria-label="Game header">
      <Link to="/" className="dice-mobile-hud__brand" aria-label="Exit to Lobby">
        <span className="dice-mobile-hud__mark">←</span>
      </Link>
      <div className="dice-mobile-hud__actions">
        {balanceDisplay != null ? (
          <Link to="/wallet">
            <BalanceBadge amount={balanceDisplay} variant="gold" size="sm" />
          </Link>
        ) : null}
        {userName ? <UserAvatar name={userName} size="sm" /> : null}
        {userName ? <span className="dice-mobile-hud__user">{userName}</span> : null}
      </div>
    </header>
  );
}
