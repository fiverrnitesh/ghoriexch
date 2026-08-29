import { Component, lazy, Suspense, useEffect, useState, useMemo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import { ProtectedRoute } from './modules/auth/ProtectedRoute';
import { AppShell, LoadingState, ErrorState, type NavItem } from './design-system';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught error in component tree:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#07040c' }}>
          <ErrorState
            message={this.state.error?.message ?? 'An unexpected error occurred'}
            onRetry={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
import { PLAYER_NAV, isAgent } from '@games/shared';
import { api } from './lib/api-client';
import { LobbyPage } from './modules/lobby/LobbyPage';
import { GameDetailPage } from './modules/lobby/GameDetailPage';
import { LoginPage } from './modules/auth/AuthPages';
import { ProfilePage } from './modules/account/ProfilePage';
import { AccountSettingsPage } from './modules/account/AccountSettingsPage';
import { WalletOverviewPage } from './modules/wallet/WalletOverviewPage';
import { DepositPage } from './modules/wallet/DepositPage';
import { WithdrawPage } from './modules/wallet/WithdrawPage';
import { TransactionsPage } from './modules/wallet/TransactionsPage';
import { RoomsPage } from './modules/rooms/RoomsPage';
import { GameHistoryPage } from './modules/game-history/GameHistoryPage';
import { NotificationsPage } from './modules/notifications/NotificationsPage';
import { DesignSystemPage } from './pages/DesignSystemPage';
import './design-system/styles/base.css';
import './design-system/styles/utilities.css';
import './modules/wallet/components/SandboxBanner.css';

const DiceLobbyPage = lazy(() =>
  import('./modules/games/dice/DiceGamePage').then((m) => ({ default: m.DiceLobbyPage })),
);
const DiceGamePage = lazy(() =>
  import('./modules/games/dice/DiceGamePage').then((m) => ({ default: m.DiceGamePage })),
);
const DownlinesPage = lazy(() =>
  import('./modules/agent/DownlinesPage').then((m) => ({ default: m.DownlinesPage })),
);

function DiceRouteFallback() {
  return <LoadingState message="Loading..." />;
}

function AppRoutes() {
  const { user, logout } = useAuth();
  const [balanceDisplay, setBalanceDisplay] = useState<string | undefined>();

  useEffect(() => {
    if (!user) {
      setBalanceDisplay(undefined);
      return;
    }
    api.get<{ availableBalance: string; environment: { sandbox: boolean } }>('/api/wallet')
      .then((w) => {
        const prefix = w.environment.sandbox ? '~' : '';
        setBalanceDisplay(`${prefix}${w.availableBalance}`);
      })
      .catch(() => setBalanceDisplay(undefined));
  }, [user]);

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = PLAYER_NAV.map((item) => ({ path: item.path, label: item.label }));
    if (user && isAgent(user.roles as any)) {
      items.splice(2, 0, { path: '/downlines', label: 'Downlines' });
    }
    return items;
  }, [user]);

  return (
    <AppShell navItems={navItems} user={user} balanceDisplay={balanceDisplay} onLogout={() => logout()}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route path="/" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
        <Route
          path="/games/dice"
          element={(
            <ProtectedRoute>
              <Suspense fallback={<DiceRouteFallback />}>
                <DiceLobbyPage />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/games/dice/play/:sessionId"
          element={(
            <ProtectedRoute>
              <Suspense fallback={<DiceRouteFallback />}>
                <DiceGamePage />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/downlines"
          element={(
            <ProtectedRoute>
              <Suspense fallback={<DiceRouteFallback />}>
                <DownlinesPage />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route path="/design-system" element={<ProtectedRoute><DesignSystemPage /></ProtectedRoute>} />
        <Route path="/games/:slug" element={<ProtectedRoute><GameDetailPage /></ProtectedRoute>} />

        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/profile/settings" element={<ProtectedRoute><AccountSettingsPage /></ProtectedRoute>} />

        <Route path="/wallet" element={<ProtectedRoute><WalletOverviewPage /></ProtectedRoute>} />
        <Route path="/wallet/deposit" element={<ProtectedRoute><DepositPage /></ProtectedRoute>} />
        <Route path="/wallet/withdraw" element={<ProtectedRoute><WithdrawPage /></ProtectedRoute>} />
        <Route path="/wallet/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />

        <Route path="/rooms" element={<ProtectedRoute><RoomsPage /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><GameHistoryPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
