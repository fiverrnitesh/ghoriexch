import { Link } from 'react-router-dom';
import '../styles/admin.css';

const NAV = [
  { path: '/', label: 'Dashboard' },
  { path: '/users', label: 'Users' },
  { path: '/wallets', label: 'Wallets' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/games', label: 'Games' },
  { path: '/rooms', label: 'Rooms' },
  { path: '/sessions', label: 'Sessions' },
  { path: '/bets', label: 'Bets' },
  { path: '/bots', label: 'Bots' },
  { path: '/audit-logs', label: 'Audit Logs' },
];

export function AdminLayout({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  sandboxMode?: boolean;
  testModeEnabled?: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar panel">
        <div className="admin-brand">
          <span className="admin-brand__mark">GHORI</span>
          <span>Exch Admin</span>
        </div>
        <nav className="admin-nav">
          {NAV.map(({ path, label }) => (
            <Link key={path} to={path} className="admin-nav__link">{label}</Link>
          ))}
        </nav>
        <button type="button" className="btn btn--ghost admin-logout" onClick={onLogout}>Logout</button>
      </aside>
      <div className="admin-content">
        <header className="admin-header">
          <h1>Platform Administration</h1>
          <div className="admin-header__badges">
            <span className="badge badge--gold">ADMIN</span>
          </div>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h2 className="page-header__title">{title}</h2>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    ['ACTIVE', 'COMPLETED', 'OPEN', 'WON', 'SETTLED', 'LIVE'].includes(status) ? 'badge--live'
      : ['SUSPENDED', 'BANNED', 'FAILED', 'LOST', 'CLOSED', 'CANCELLED'].includes(status) ? 'badge--danger'
        : ['PENDING', 'PROCESSING', 'MAINTENANCE', 'WAITING'].includes(status) ? 'badge--warn'
          : 'badge--gold';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = 'No data',
}: {
  columns: Array<{ key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode }>;
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) return <div className="loading">Loading...</div>;
  if (rows.length === 0) return <div className="empty-state panel">{emptyMessage}</div>;

  return (
    <div className="panel table-panel">
      <table className="data-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" className="btn btn--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button type="button" className="btn btn--ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function SandboxBanner({ message }: { message: string }) {
  return (
    <div className="env-banner env-banner--sandbox" role="alert">
      <strong>SANDBOX</strong> — {message}
    </div>
  );
}

export function TestModeBanner() {
  return (
    <div className="env-banner env-banner--test" role="alert">
      <strong>ADMIN TEST MODE</strong> — Controls only work on sessions explicitly marked TEST/SANDBOX. Never available in production.
    </div>
  );
}
