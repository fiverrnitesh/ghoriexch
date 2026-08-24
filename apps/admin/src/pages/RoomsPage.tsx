import { useEffect, useState } from 'react';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, StatusBadge, Pagination } from '../components/AdminLayout';

interface LiveDiceRoom {
  id: string;
  label: string;
  status: string;
  createdAt: string;
  realPlayerCount: number;
  maxRealPlayers: number;
  tigerPresent: boolean;
  seatedPlayers: string[];
  activePlayer: string | null;
  opponent: string | null;
  roundNumber: number;
  phase: string;
  remainingTimerSeconds: number | null;
  currentBets: { amount: number; choice: string; locked: boolean } | null;
  dice: unknown;
  settlement: string | null;
}

export function RoomsPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [liveDice, setLiveDice] = useState<LiveDiceRoom[]>([]);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [page, setPage] = useState(1);

  const loadLive = () => {
    adminApi.get<LiveDiceRoom[]>('/api/admin/rooms/live-dice').then(setLiveDice).catch(console.error);
  };

  useEffect(() => {
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/rooms?page=${page}`).then(setData).catch(console.error);
    loadLive();
  }, [page]);

  const viewRoom = async (id: string) => {
    const room = await adminApi.get<Record<string, unknown>>(`/api/admin/rooms/${id}`);
    setDetail(room);
  };

  const closeRoom = async (id: string) => {
    if (!confirm('Close this room?')) return;
    await adminApi.post(`/api/admin/rooms/${id}/close`);
    setDetail(null);
    adminApi.get<Paginated<Record<string, unknown>>>(`/api/admin/rooms?page=${page}`).then(setData);
    loadLive();
  };

  return (
    <div>
      <PageHeader title="Room Management" subtitle="Live Dice rooms and all platform rooms" />

      <section className="panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Live Dice Rooms</h2>
        {liveDice.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No live Dice rooms.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {liveDice.map((room) => (
              <button
                key={room.id}
                type="button"
                className="link-btn"
                style={{
                  textAlign: 'left',
                  padding: '0.85rem 1rem',
                  border: '1px solid rgba(201,162,39,0.25)',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.2)',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
                onClick={() => void viewRoom(room.id)}
              >
                <strong>{room.label}</strong>
                {' · '}
                {room.realPlayerCount}/{room.maxRealPlayers} players
                {room.tigerPresent ? ' + Shoot' : ''}
                <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {room.seatedPlayers.join(', ') || '—'}
                  {room.activePlayer ? ` · ACTIVE: ${room.activePlayer}` : ''}
                  {room.opponent ? ` vs ${room.opponent}` : ''}
                  {' · '}PHASE: {room.phase}
                  {room.remainingTimerSeconds != null ? ` · TIMER: ${String(room.remainingTimerSeconds).padStart(2, '0')}s` : ''}
                  {' · '}Round {room.roundNumber || '—'}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="split-layout">
        <DataTable
          columns={[
            { key: 'name', label: 'Room', render: (r) => (
              <button type="button" className="link-gold link-btn" onClick={() => viewRoom(String(r.id))}>{String(r.name)}</button>
            )},
            { key: 'code', label: 'Code' },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'playerCount', label: 'Players' },
            { key: 'activeGame', label: 'Active Game', render: (r) => String(r.activeGame ?? '—') },
            { key: 'roundNumber', label: 'Round', render: (r) => String(r.roundNumber ?? '—') },
          ]}
          rows={data?.items ?? []}
        />
        {detail && (
          <div className="panel detail-card">
            <h3>{String(detail.name)}</h3>
            <dl className="detail-dl">
              <dt>Room ID</dt><dd className="mono">{String(detail.id)}</dd>
              <dt>Status</dt><dd><StatusBadge status={String(detail.status)} /></dd>
              <dt>Game</dt><dd>{String((detail.game as { name: string })?.name ?? '—')}</dd>
              <dt>Real players</dt><dd>{String(detail.realPlayerCount ?? detail.playerCount)} / {String(detail.maxRealPlayers ?? detail.maxPlayers)}</dd>
              <dt>Shoot</dt><dd>{detail.tigerPresent ? 'Present' : '—'}</dd>
              <dt>Created</dt><dd>{String(detail.createdAt ?? '—')}</dd>
            </dl>
            {Boolean(detail.dice) && (
              <>
                <h4>Live Dice</h4>
                <dl className="detail-dl">
                  <dt>Seated</dt><dd>{((detail.dice as LiveDiceRoom).seatedPlayers ?? []).join(', ') || '—'}</dd>
                  <dt>Active</dt><dd>{String((detail.dice as LiveDiceRoom).activePlayer ?? '—')}</dd>
                  <dt>Opponent</dt><dd>{String((detail.dice as LiveDiceRoom).opponent ?? '—')}</dd>
                  <dt>Phase</dt><dd>{String((detail.dice as LiveDiceRoom).phase)}</dd>
                  <dt>Timer</dt><dd>{(detail.dice as LiveDiceRoom).remainingTimerSeconds != null ? `${(detail.dice as LiveDiceRoom).remainingTimerSeconds}s` : '—'}</dd>
                  <dt>Bets</dt><dd>{(detail.dice as LiveDiceRoom).currentBets ? JSON.stringify((detail.dice as LiveDiceRoom).currentBets) : '—'}</dd>
                  <dt>Dice</dt><dd>{(detail.dice as LiveDiceRoom).dice ? JSON.stringify((detail.dice as LiveDiceRoom).dice) : '—'}</dd>
                  <dt>Result</dt><dd>{String((detail.dice as LiveDiceRoom).settlement ?? '—')}</dd>
                </dl>
              </>
            )}
            {(detail.activeSession as Record<string, unknown>) && (
              <>
                <h4>Active Session</h4>
                <dl className="detail-dl">
                  <dt>Round</dt><dd>{String((detail.activeSession as { roundNumber: number }).roundNumber)}</dd>
                  <dt>Status</dt><dd>{String((detail.activeSession as { status: string }).status)}</dd>
                </dl>
                <ul className="player-list">
                  {((detail.activeSession as { players: Array<{ username: string; status: string }> }).players ?? []).map((p) => (
                    <li key={p.username}>{p.username} — {p.status}</li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => closeRoom(String(detail.id))}>Close Room</button>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}

export function SessionsPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    adminApi.get<Paginated<Record<string, unknown>>>('/api/admin/sessions').then(setData).catch(console.error);
  }, []);

  return (
    <div>
      <PageHeader title="Game Sessions" subtitle="Active sessions across all games" />
      <div className="split-layout">
        <DataTable
          columns={[
            { key: 'id', label: 'Session', render: (r) => (
              <button type="button" className="link-gold link-btn mono" onClick={() => adminApi.get<Record<string, unknown>>(`/api/admin/sessions/${r.id}`).then(setDetail)}>{String(r.id).slice(0, 8)}…</button>
            )},
            { key: 'game', label: 'Game', render: (r) => String((r.game as { name: string })?.name ?? '—') },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'isTestMode', label: 'Test', render: (r) => r.isTestMode ? <span className="badge badge--test">TEST</span> : '—' },
            { key: 'playerCount', label: 'Players' },
            { key: 'roundNumber', label: 'Round' },
          ]}
          rows={data?.items ?? []}
        />
        {detail && (
          <div className="panel detail-card">
            <h3>Session Detail</h3>
            {Boolean(detail.isTestMode) && <span className="badge badge--test">TEST MODE</span>}
            <dl className="detail-dl">
              <dt>Game</dt><dd>{String((detail.game as { name: string })?.name)}</dd>
              <dt>Room</dt><dd>{String((detail.room as { code: string })?.code ?? '—')}</dd>
              <dt>Round</dt><dd>{String(detail.roundNumber)}</dd>
            </dl>
            <h4>Players</h4>
            <ul className="player-list">
              {((detail.players as Array<{ username: string; status: string }>) ?? []).map((p) => (
                <li key={p.username}>{p.username} — {p.status}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
