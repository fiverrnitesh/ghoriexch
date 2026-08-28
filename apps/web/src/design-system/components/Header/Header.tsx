import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

export interface HeaderProps {
  logo?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  centered?: boolean;
}

export function Header({ logo, navigation, actions, centered }: HeaderProps) {
  const isCentered = centered || (!navigation && !actions);
  return (
    <header className={`ds-header ${isCentered ? 'ds-header--centered' : ''}`}>
      <div className="ds-header__inner">
        {logo ?? (
          <Link to="/" className="ds-header__logo">
            <span className="ds-header__logo-mark">Ghori</span>
            <span className="ds-header__logo-text">Exch</span>
          </Link>
        )}
        {navigation}
        {actions ? <div className="ds-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
