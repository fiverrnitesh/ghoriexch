import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { api } from '../../../../lib/api-client';
import './DiceDevControls.css';

interface DemoPlayer {
  email: string;
  displayName: string;
}

export function DiceDevControls({
  sessionId,
  onRefresh,
  variant = 'default',
  debug,
}: {
  sessionId: string;
  onRefresh: () => void;
  variant?: 'default' | 'play';
  debug?: {
    phase: string;
    mainBet: boolean;
    canSideBet: boolean;
    pendingPeerBetCount?: number;
    role: string;
    seated: boolean;
    clickableSeats: string[];
    match?: {
      holder: number;
      opponent: number;
      holderLabel: string;
      opponentLabel: string;
    } | null;
    seats?: Array<{
      seatIndex: number;
      label: string;
      name: string;
      type: string | null;
      botId?: string;
      userId?: string;
    }>;
  } | null;
}) {
  const navigate = useNavigate();
  const { demoLogin } = useAuth();
  const [open, setOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [players, setPlayers] = useState<DemoPlayer[]>([]);

  useEffect(() => {
    api.get<{ players: DemoPlayer[] }>('/api/demo/status')
      .then((s) => setPlayers(s.players))
      .catch(() => {});
  }, []);

  if (!import.meta.env.DEV) return null;

  const run = async (key: string, fn: () => Promise<{ sessionId?: string } | void>) => {
    setBusy(key);
    try {
      const result = await fn();
      if (result?.sessionId && result.sessionId !== sessionId) {
        navigate(`/games/dice/play/${result.sessionId}`, { replace: true });
      } else {
        onRefresh();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const switchPlayer = async (email: string) => {
    setBusy(email);
    try {
      await demoLogin(email);
      try {
        await api.post(`/api/sessions/${sessionId}/join`, {});
      } catch {
        // already seated
      }
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`dice-dev-controls${variant === 'play' ? ' dice-dev-controls--play' : ''}`}>
      <button
        type="button"
        className="dice-dev-controls__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Developer tools {open ? '▾' : '▸'}
      </button>

      {open && (
        <div className="dice-dev-controls__panel">
          <div className="dice-dev-controls__test-as">
            <span>TEST AS PLAYER</span>
            <div className="dice-dev-controls__test-grid">
              {players.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  disabled={!!busy}
                  onClick={() => void switchPlayer(p.email)}
                >
                  {p.displayName}
                </button>
              ))}
            </div>
          </div>

          <div className="dice-dev-controls__grid">
            <button type="button" disabled={!!busy} onClick={() => void run('add', () => api.post(`/api/demo/sessions/${sessionId}/add-players`, {}))}>
              Add Demo Players
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('start', () => api.post(`/api/demo/sessions/${sessionId}/start-round`, {}))}>
              Force Start Round
            </button>
            <button
              type="button"
              className="dice-dev-controls__primary"
              disabled={!!busy}
              onClick={() => void run('force-bet', () => api.post(`/api/demo/sessions/${sessionId}/force-main-bet`, {}))}
            >
              Force Main Bet ($100 EVEN)
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void run('sim-side', () => api.post(`/api/demo/sessions/${sessionId}/simulate-side-bet`, {}))}
            >
              Simulate Side Bet (Rahul → holder)
            </button>
            <button type="button" disabled={!!busy} onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? 'Hide bet debug' : 'Show bet debug'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('2', () => api.post(`/api/demo/sessions/${sessionId}/fill`, { preset: '2' }))}>
              2 Player Demo
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('4', () => api.post(`/api/demo/sessions/${sessionId}/fill`, { preset: '4' }))}>
              4 Player Demo
            </button>
            <button
              type="button"
              className="dice-dev-controls__primary"
              disabled={!!busy}
              onClick={() => void run('6', () => api.post(`/api/demo/sessions/${sessionId}/fill`, { preset: '6' }))}
            >
              6 Player Test (Full UI)
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('full', () => api.post(`/api/demo/sessions/${sessionId}/fill`, { preset: 'full' }))}>
              Full Table
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('reset', () => api.post(`/api/demo/sessions/${sessionId}/reset-table`, {}))}>
              Reset Table
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run('balances', () => api.post('/api/demo/reset-balances', {}))}>
              Reset Balances
            </button>
            <button type="button" disabled={!!busy} onClick={() => navigate('/')}>
              Leave Table
            </button>
          </div>

          {showDebug && debug ? (
            <pre className="dice-dev-controls__debug">{`phase: ${debug.phase}
mainBet: ${debug.mainBet ? 'yes' : 'no'}
canSideBet: ${debug.canSideBet}
pendingPeerBets: ${debug.pendingPeerBetCount ?? 0}
role: ${debug.role}
seated: ${debug.seated}
clickable: ${debug.clickableSeats.join(', ') || 'none'}
match: ${debug.match ? `${debug.match.holderLabel}(${debug.match.holder}) vs ${debug.match.opponentLabel}(${debug.match.opponent})` : 'none'}
seats:
${(debug.seats ?? []).map((s) => `  ${s.label}#${s.seatIndex} ${s.name} [${s.type ?? 'empty'}${s.botId ? `/${s.botId}` : ''}]`).join('\n')}`}</pre>
          ) : null}
        </div>
      )}
    </div>
  );
}
