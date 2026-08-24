import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

export interface HeaderProps {
  logo?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
}

export function Header({ logo, navigation, actions }: HeaderProps) {
  return (
    <header className="ds-header">
      <div className="ds-header__inner">
        {logo ?? (
          <Link to="/" className="ds-header__logo">
            <span className="ds-header__logo-mark">GO</span>
            <span className="ds-header__logo-text">Exchange</span>
          </Link>
        )}
        {navigation}
        <div className="ds-header__actions">{actions}</div>
      </div>
    </header>
  );
}
