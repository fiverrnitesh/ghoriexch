import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { adminApi } from './lib/admin-api';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { WalletsPage, TransactionsPage } from './pages/WalletsPage';
import { GamesPage } from './pages/GamesPage';
import { RoomsPage, SessionsPage } from './pages/RoomsPage';
import { BetsPage } from './pages/BetsPage';
import { BotsPage } from './pages/BotsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { TestModePage } from './pages/TestModePage';
import './styles/admin.css';

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('company');
  const [password, setPassword] = useState('DevPassword123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_ADMIN_API_URL ?? ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      adminApi.setToken(json.data.accessToken);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="panel login-card">
        <h1>Admin Sign In</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
          <button type="submit" className="btn btn--gold" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <p className="login-hint">Dev: company / DevPassword123!</p>
      </div>
    </div>
  );
}

function AdminApp() {
  const [authed, setAuthed] = useState(!!adminApi.getToken());
  const [flags, setFlags] = useState({ sandboxMode: false, testModeEnabled: false });

  useEffect(() => {
    if (!authed) return;
    adminApi.get<{ sandboxMode: boolean; adminTestModeEnabled: boolean }>('/api/admin/dashboard')
      .then((d) => setFlags({ sandboxMode: d.sandboxMode, testModeEnabled: d.adminTestModeEnabled }))
      .catch(() => {});
  }, [authed]);

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  return (
    <AdminLayout
      sandboxMode={flags.sandboxMode}
      testModeEnabled={flags.testModeEnabled}
      onLogout={() => { adminApi.logout(); setAuthed(false); }}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/wallets" element={<WalletsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/bets" element={<BetsPage />} />
        <Route path="/bots" element={<BotsPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/test-mode" element={<TestModePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminApp />
    </BrowserRouter>
  );
}
