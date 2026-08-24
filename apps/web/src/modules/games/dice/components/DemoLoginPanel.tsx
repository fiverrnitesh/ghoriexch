import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api-client';
import './DemoLoginPanel.css';

interface DemoPlayer {
  email: string;
  displayName: string;
  avatarUrl: string;
}

export function DemoLoginPanel({
  onLogin,
}: {
  onLogin: (email: string) => Promise<void>;
}) {
  const [players, setPlayers] = useState<DemoPlayer[]>([]);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    api.get<{ enabled: boolean; players: DemoPlayer[]; admin: { email: string } }>('/api/demo/status')
      .then((s: { enabled: boolean; players: DemoPlayer[]; admin: { email: string } }) => {
        if (s.enabled) {
          setPlayers(s.players);
          setAdminEmail(s.admin.email);
        }
      })
      .catch(() => {});
  }, []);

  if (!import.meta.env.DEV || players.length === 0) return null;

  const click = async (email: string) => {
    setLoading(email);
    try {
      await onLogin(email);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="demo-login-panel">
      <h3>DEMO LOGIN</h3>
      <p className="demo-login-panel__hint">Development only — sandbox accounts</p>
      <div className="demo-login-panel__grid">
        {players.map((p) => (
          <button
            key={p.email}
            type="button"
            className="demo-login-panel__user"
            disabled={!!loading}
            onClick={() => void click(p.email)}
          >
            <img src={p.avatarUrl} alt="" className="demo-login-panel__avatar" />
            <span>{p.displayName}</span>
          </button>
        ))}
        {adminEmail && (
          <button
            type="button"
            className="demo-login-panel__user demo-login-panel__user--admin"
            disabled={!!loading}
            onClick={() => void click(adminEmail)}
          >
            ADMIN
          </button>
        )}
      </div>
    </div>
  );
}
