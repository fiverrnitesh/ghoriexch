import { Link } from 'react-router-dom';
import { BalanceBadge, UserAvatar } from '../../../../design-system';
import './DiceMobileHud.css';

const HUD_NAV = [
  { path: '/games/dice', label: 'Ghori' },
  { path: '/wallet', label: 'Wallet' },
  { path: '/history', label: 'History' },
  { path: '/profile', label: 'Profile' },
];

export function DiceMobileHud({
  balanceDisplay,
  userName,
  onLogout,
}: {
  balanceDisplay?: string;
  userName?: string;
  onLogout?: () => void;
}) {
  return (
    <header className="dice-mobile-hud" aria-label="Game header">
      <Link to="/" className="dice-mobile-hud__brand">
        <span className="dice-mobile-hud__mark">GHORI EXCH</span>
      </Link>
      <nav className="dice-mobile-hud__nav" aria-label="Main navigation">
        {HUD_NAV.map((item) => (
          <Link key={item.path} to={item.path} className="dice-mobile-hud__link">
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="dice-mobile-hud__actions">
        {balanceDisplay != null ? (
          <Link to="/wallet">
            <BalanceBadge amount={balanceDisplay} variant="gold" size="sm" />
          </Link>
        ) : null}
        {userName ? <UserAvatar name={userName} size="sm" /> : null}
        {userName ? <span className="dice-mobile-hud__user">{userName}</span> : null}
        {onLogout ? (
          <button type="button" className="dice-mobile-hud__logout" onClick={onLogout}>
            Logout
          </button>
        ) : null}
      </div>
    </header>
  );
}
