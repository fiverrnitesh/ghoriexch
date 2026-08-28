import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../../components/Header/Header';
import { Navigation, MobileNavigation, type NavItem } from '../../components/Navigation/Navigation';
import { BalanceBadge } from '../../components/Wallet/WalletDisplay';
import { UserAvatar } from '../../components/UserAvatar/UserAvatar';
import { GoldButton, SecondaryButton } from '../../components/Button/Button';
import { ToastProvider } from '../../components/Toast/Toast';
import './AppShell.css';

export interface AppShellProps {
  children: ReactNode;
  minimal?: boolean;
  navItems?: NavItem[];
  user?: { displayName?: string | null; username: string } | null;
  balanceDisplay?: string;
  onLogout?: () => void;
  loginPath?: string;
  registerPath?: string;
}

export function AppShell({
  children,
  minimal,
  navItems = [],
  user,
  balanceDisplay,
  onLogout,
  loginPath = '/login',
  registerPath = '/register',
}: AppShellProps) {
  if (minimal) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    <ToastProvider>
      <div className="ds-app-shell">
        <Header
          navigation={navItems.length > 0 ? <Navigation items={navItems} /> : undefined}
          actions={
            user ? (
              <>
                {balanceDisplay !== undefined && (
                  <Link to="/wallet">
                    <BalanceBadge amount={balanceDisplay} variant="gold" size="sm" />
                  </Link>
                )}
                <UserAvatar name={user.displayName ?? user.username} size="sm" status="online" />
                <span className="ds-app-shell__username">{user.displayName ?? user.username}</span>
                {onLogout && <SecondaryButton size="sm" onClick={onLogout}>Logout</SecondaryButton>}
              </>
            ) : (
              <>
                <Link to={loginPath}><SecondaryButton size="sm">Login</SecondaryButton></Link>
                <Link to={registerPath}><GoldButton size="sm">Register</GoldButton></Link>
              </>
            )
          }
        />

        <main className="ds-app-shell__main">{children}</main>

        <footer className="ds-app-shell__footer">
          <p>Ghori Exch · Premium multiplayer gaming · Server-authoritative platform</p>
        </footer>

        {navItems.length > 0 && <MobileNavigation items={navItems} />}
      </div>
    </ToastProvider>
  );
}
