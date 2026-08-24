import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';
import { PageHeader, TestModeBanner } from '../components/AdminLayout';

export function TestModePage() {
  const [status, setStatus] = useState<{ enabled: boolean; warning: string } | null>(null);
  const [gameSlug, setGameSlug] = useState('dice');
  const [hostUserId, setHostUserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [betId, setBetId] = useState('');
  const [walletUserId, setWalletUserId] = useState('');
  const [walletAmount, setWalletAmount] = useState('100');
  const [resultJson, setResultJson] = useState('{"outcome":"test"}');
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    adminApi.get<{ enabled: boolean; warning: string }>('/api/admin/test/status').then(setStatus).catch(console.error);
  }, []);

  const appendLog = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l].slice(0, 20));

  const createTestSession = async () => {
    try {
      const res = await adminApi.post<{ sessionId: string }>('/api/admin/test/sessions', { gameSlug, hostUserId });
      setSessionId(res.sessionId);
      appendLog(`Created test session ${res.sessionId}`);
    } catch (err) {
      appendLog(`Error: ${(err as Error).message}`);
    }
  };

  const forceResult = async () => {
    try {
      await adminApi.post(`/api/admin/test/sessions/${sessionId}/force-result`, { result: JSON.parse(resultJson) });
      appendLog('Forced test result');
    } catch (err) {
      appendLog(`Error: ${(err as Error).message}`);
    }
  };

  const simulate = async (outcome: string) => {
    try {
      await adminApi.post(`/api/admin/test/sessions/${sessionId}/simulate`, { betId, outcome });
      appendLog(`Simulated ${outcome}`);
    } catch (err) {
      appendLog(`Error: ${(err as Error).message}`);
    }
  };

  const walletAdjust = async (operation: 'credit' | 'debit') => {
    try {
      await adminApi.post('/api/admin/test/wallet-adjust', {
        userId: walletUserId,
        operation,
        amount: parseFloat(walletAmount),
        note: 'Admin test mode adjustment',
      });
      appendLog(`Wallet ${operation} $${walletAmount}`);
    } catch (err) {
      appendLog(`Error: ${(err as Error).message}`);
    }
  };

  if (!status) return <div className="loading">Loading test mode status...</div>;

  return (
    <div>
      <PageHeader title="Admin Test Mode" subtitle="Development-only sandbox controls for settlement testing" />
      <TestModeBanner />
      {!status.enabled && (
        <div className="env-banner env-banner--sandbox">
          Test mode is <strong>disabled</strong>. Set <code>ADMIN_TEST_MODE=true</code> in development .env
        </div>
      )}

      <div className="test-grid">
        <div className="panel detail-card">
          <h3>Create Test Session</h3>
          <label>Game Slug<input className="input" value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} /></label>
          <label>Host User ID<input className="input" value={hostUserId} onChange={(e) => setHostUserId(e.target.value)} placeholder="player user id" /></label>
          <button type="button" className="btn btn--gold" disabled={!status.enabled} onClick={createTestSession}>Create TEST Session</button>
          {sessionId && <p className="mono text-muted">Session: {sessionId}</p>}
        </div>

        <div className="panel detail-card">
          <h3>Force Result</h3>
          <label>Result JSON<textarea className="input code-input" rows={4} value={resultJson} onChange={(e) => setResultJson(e.target.value)} /></label>
          <button type="button" className="btn btn--ghost" disabled={!status.enabled || !sessionId} onClick={forceResult}>Force Result</button>
        </div>

        <div className="panel detail-card">
          <h3>Simulate Settlement</h3>
          <label>Bet ID<input className="input" value={betId} onChange={(e) => setBetId(e.target.value)} /></label>
          <div className="action-row">
            <button type="button" className="btn btn--ghost" disabled={!status.enabled} onClick={() => simulate('WIN')}>Simulate Win</button>
            <button type="button" className="btn btn--ghost" disabled={!status.enabled} onClick={() => simulate('LOSS')}>Simulate Loss</button>
            <button type="button" className="btn btn--ghost" disabled={!status.enabled} onClick={() => simulate('BLANK')}>Blank Dice</button>
            <button type="button" className="btn btn--ghost" disabled={!status.enabled} onClick={() => simulate('REFUND')}>Refund</button>
          </div>
        </div>

        <div className="panel detail-card">
          <h3>Test Wallet</h3>
          <label>User ID<input className="input" value={walletUserId} onChange={(e) => setWalletUserId(e.target.value)} /></label>
          <label>Amount<input className="input" type="number" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} /></label>
          <div className="action-row">
            <button type="button" className="btn btn--gold" disabled={!status.enabled} onClick={() => walletAdjust('credit')}>Sandbox Credit</button>
            <button type="button" className="btn btn--ghost" disabled={!status.enabled} onClick={() => walletAdjust('debit')}>Sandbox Debit</button>
          </div>
        </div>

        <div className="panel detail-card">
          <h3>Dice TEST MODE — Force Outcome</h3>
          <p className="text-muted">Requires a dice test session. Shows <strong>TEST MODE</strong> in game UI when active.</p>
          <div className="action-row" style={{ flexWrap: 'wrap' }}>
            {[
              ['1', '1'], ['3', '3'], ['4', '4'], ['6', '6'],
              ['BLANK', '1'], ['BLANK', '3'], ['BLANK', '4'], ['BLANK', '6'], ['BLANK', 'BLANK'],
              ['1', '3'], ['1', '4'], ['3', '4'], ['4', '6'],
            ].map(([die1, die2]) => (
              <button
                key={`${die1}-${die2}`}
                type="button"
                className="btn btn--ghost"
                disabled={!status.enabled || !sessionId}
                onClick={async () => {
                  try {
                    await adminApi.post(`/api/admin/test/sessions/${sessionId}/force-dice`, { die1, die2 });
                    appendLog(`Forced dice ${die1} + ${die2}`);
                  } catch (err) {
                    appendLog(`Error: ${(err as Error).message}`);
                  }
                }}
              >
                {die1} + {die2}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel detail-card" style={{ marginTop: '1rem' }}>
        <h3>Activity Log</h3>
        <ul className="test-log">{log.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
