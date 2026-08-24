import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

export interface NavItem {
  path: string;
  label: string;
  icon?: string;
}

export interface NavigationProps {
  items: NavItem[];
  className?: string;
}

export function Navigation({ items, className = '' }: NavigationProps) {
  const location = useLocation();

  return (
    <nav className={`ds-nav ${className}`} aria-label="Main navigation">
      {items.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`ds-nav__link ${location.pathname === item.path ? 'ds-nav__link--active' : ''}`}
        >
          {item.icon && <span className="ds-nav__icon" aria-hidden="true">{item.icon}</span>}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

const MOBILE_ICONS: Record<string, string> = {
  '/': '🏠',
  '/rooms': '🚪',
  '/wallet': '💰',
  '/history': '📋',
  '/profile': '👤',
  '/notifications': '🔔',
};

export function MobileNavigation({ items }: { items: NavItem[] }) {
  const location = useLocation();

  return (
    <nav className="ds-mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`ds-mobile-nav__link ${location.pathname === item.path ? 'ds-mobile-nav__link--active' : ''}`}
        >
          <span className="ds-mobile-nav__icon" aria-hidden="true">
            {item.icon ?? MOBILE_ICONS[item.path] ?? '•'}
          </span>
          <span className="ds-mobile-nav__label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
