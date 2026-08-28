import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import { ProtectedRoute } from './modules/auth/ProtectedRoute';
import { AppShell, LoadingState } from './design-system';
import { PLAYER_NAV } from '@games/shared';
import { api } from './lib/api-client';
import { LobbyPage } from './modules/lobby/LobbyPage';
import { GameDetailPage } from './modules/lobby/GameDetailPage';
import { LoginPage, RegisterPage } from './modules/auth/AuthPages';
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

function DiceRouteFallback() {
  return <LoadingState message="Loading..." />;
}

const NAV_ITEMS = PLAYER_NAV.map((item) => ({ path: item.path, label: item.label }));

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

  return (
    <AppShell navItems={NAV_ITEMS} user={user} balanceDisplay={balanceDisplay} onLogout={() => logout()}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
