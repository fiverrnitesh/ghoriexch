import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type DashboardStats } from '../lib/admin-api';
import { PageHeader, SandboxBanner } from '../components/AdminLayout';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    adminApi.get<DashboardStats>('/api/admin/dashboard').then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div className="loading">Loading dashboard...</div>;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers },
    { label: 'Active Users', value: stats.activeUsers },
    { label: 'Online Users', value: stats.onlineUsers },
    { label: 'Total Games', value: stats.totalGames },
    { label: 'Active Rooms', value: stats.activeRooms },
    { label: 'Live Sessions', value: stats.activeSessions },
    { label: 'Total Bets', value: stats.totalBets },
    { label: 'Bets (24h)', value: stats.betsLast24h },
    { label: 'Tx Volume (24h)', value: `$${stats.transactionVolume24h}` },
    { label: 'Pending Withdrawals', value: stats.pendingWithdrawals },
    { label: 'Pending Deposits', value: stats.pendingDeposits },
    { label: 'Platform Balance', value: `$${stats.totalPlatformBalance}` },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Platform overview and recent activity" />
      {stats.sandboxMode && <SandboxBanner message="Wallet sandbox mode is active. All balances are simulated — NOT real money." />}
      {stats.adminTestModeEnabled && (
        <div className="env-banner env-banner--test" style={{ marginBottom: '1rem' }}>
          <strong>ADMIN TEST MODE ENABLED</strong> — <Link to="/test-mode">Open test controls</Link>
        </div>
      )}
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="panel stat-card">
            <div className="stat-card__label">{c.label}</div>
            <div className="stat-card__value">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="panel activity-panel">
        <h3 className="panel-title">Recent Activity</h3>
        <div className="activity-list">
          {stats.recentActivity.length === 0 ? (
            <p className="text-muted">No recent activity</p>
          ) : stats.recentActivity.map((a) => (
            <div key={`${a.type}-${a.id}`} className="activity-item">
              <span className={`badge ${a.type === 'audit' ? 'badge--gold' : 'badge--live'}`}>{a.action}</span>
              <span>{a.actor ?? '—'}</span>
              <span className="text-muted">{a.targetType ?? a.type}</span>
              {a.amount && <span>${a.amount}</span>}
              <time className="text-muted">{new Date(a.timestamp).toLocaleString()}</time>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
