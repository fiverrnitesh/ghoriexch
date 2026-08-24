import { useEffect, useState } from 'react';
import { adminApi, type Paginated } from '../lib/admin-api';
import { PageHeader, DataTable, StatusBadge, Pagination } from '../components/AdminLayout';

export function GamesPage() {
  const [data, setData] = useState<Paginated<Record<string, unknown>> | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [configKey, setConfigKey] = useState('settings');
  const [configJson, setConfigJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  const load = () => adminApi.get<Paginated<Record<string, unknown>>>('/api/admin/games').then(setData).catch(console.error);

  useEffect(() => { void load(); }, []);

  const openGame = async (id: string) => {
    const game = await adminApi.get<Record<string, unknown>>(`/api/admin/games/${id}`);
    setSelected(game);
    setConfigJson(JSON.stringify((game.configurations as unknown[])?.[0] ?? {}, null, 2));
  };

  const saveGame = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminApi.patch(`/api/admin/games/${selected.id}`, {
        status: selected.status,
        minPlayers: Number(selected.minPlayers),
        maxPlayers: Number(selected.maxPlayers),
        minBet: selected.minBet ? Number(selected.minBet) : null,
        maxBet: selected.maxBet ? Number(selected.maxBet) : null,
        version: selected.version,
      });
      await load();
      alert('Game updated');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminApi.put(`/api/admin/games/${selected.id}/config`, {
        key: configKey,
        value: JSON.parse(configJson),
      });
      alert('Configuration saved');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Game Management" subtitle="Enable/disable games, maintenance mode, bet limits, and configuration" />
      <div className="split-layout">
        <DataTable
          columns={[
            { key: 'name', label: 'Game', render: (r) => (
              <button type="button" className="link-gold link-btn" onClick={() => openGame(String(r.id))}>{String(r.name)}</button>
            )},
            { key: 'slug', label: 'Slug' },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'version', label: 'Version' },
          ]}
          rows={data?.items ?? []}
        />
        {selected && (
          <div className="panel detail-card">
            <h3>{String(selected.name)}</h3>
            <div className="form-grid">
              <label>Status
                <select className="input" value={String(selected.status)} onChange={(e) => setSelected({ ...selected, status: e.target.value })}>
                  {['DRAFT', 'ACTIVE', 'MAINTENANCE', 'DISABLED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Version<input className="input" value={String(selected.version ?? '')} onChange={(e) => setSelected({ ...selected, version: e.target.value })} /></label>
              <label>Min Players<input className="input" type="number" value={Number(selected.minPlayers)} onChange={(e) => setSelected({ ...selected, minPlayers: e.target.value })} /></label>
              <label>Max Players<input className="input" type="number" value={Number(selected.maxPlayers)} onChange={(e) => setSelected({ ...selected, maxPlayers: e.target.value })} /></label>
              <label>Min Bet<input className="input" type="number" value={String(selected.minBet ?? '')} onChange={(e) => setSelected({ ...selected, minBet: e.target.value })} /></label>
              <label>Max Bet<input className="input" type="number" value={String(selected.maxBet ?? '')} onChange={(e) => setSelected({ ...selected, maxBet: e.target.value })} /></label>
            </div>
            <button type="button" className="btn btn--gold" disabled={saving} onClick={saveGame}>Save Game</button>
            <hr className="divider" />
            <h4>Configuration JSON</h4>
            <label>Key<input className="input" value={configKey} onChange={(e) => setConfigKey(e.target.value)} /></label>
            <textarea className="input code-input" rows={8} value={configJson} onChange={(e) => setConfigJson(e.target.value)} />
            <button type="button" className="btn btn--ghost" disabled={saving} onClick={saveConfig}>Save Config</button>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} totalPages={data.totalPages} onPage={() => {}} />}
    </div>
  );
}
