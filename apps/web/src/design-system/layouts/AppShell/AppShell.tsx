import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../../components/Header/Header';
import { Navigation, MobileNavigation, type NavItem } from '../../components/Navigation/Navigation';
import { BalanceBadge } from '../../components/Wallet/WalletDisplay';
import { UserAvatar } from '../../components/UserAvatar/UserAvatar';
import { SecondaryButton } from '../../components/Button/Button';
import { ToastProvider } from '../../components/Toast/Toast';
import './AppShell.css';

export interface AppShellProps {
  children: ReactNode;
  minimal?: boolean;
  navItems?: NavItem[];
  user?: { displayName?: string | null; username: string } | null;
  balanceDisplay?: string;
  onLogout?: () => void;
}

export function AppShell({
  children,
  minimal,
  navItems = [],
  user,
  balanceDisplay,
  onLogout,
}: AppShellProps) {
  if (minimal) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    <ToastProvider>
      <div className="ds-app-shell">
        <Header
          navigation={user && navItems.length > 0 ? <Navigation items={navItems} /> : undefined}
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
            ) : null
          }
        />

        <main className="ds-app-shell__main">{children}</main>

        <footer className="ds-app-shell__footer">
          <p>Ghori Exch · Premium multiplayer gaming · Server-authoritative platform</p>
        </footer>

        {user && navItems.length > 0 && <MobileNavigation items={navItems} />}
      </div>
    </ToastProvider>
  );
}
