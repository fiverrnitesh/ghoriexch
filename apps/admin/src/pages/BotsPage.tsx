import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';
import { PageHeader, DataTable, StatusBadge } from '../components/AdminLayout';

interface BotRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  game: { slug: string; name: string };
  config: Record<string, unknown>;
}

export function BotsPage() {
  const [bots, setBots] = useState<BotRow[]>([]);
  const [selected, setSelected] = useState<BotRow | null>(null);
  const [configJson, setConfigJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  const load = () => adminApi.get<BotRow[]>('/api/admin/bots').then(setBots).catch(console.error);
  useEffect(() => { void load(); }, []);

  const selectBot = (bot: BotRow) => {
    setSelected(bot);
    setConfigJson(JSON.stringify(bot.config ?? {}, null, 2));
  };

  const saveBot = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminApi.patch(`/api/admin/bots/${selected.id}`, {
        status: selected.status,
        config: JSON.parse(configJson),
      });
      await load();
      alert('Bot updated');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Bot Management" subtitle="BOT entities are separate from user accounts — never share player identity" />
      <div className="env-banner env-banner--sandbox" style={{ marginBottom: '1rem' }}>
        Bots are internal <strong>BOT entities</strong>. They do not use real user accounts.
      </div>
      <div className="split-layout">
        <DataTable
          columns={[
            { key: 'name', label: 'Bot', render: (r) => (
              <button type="button" className="link-gold link-btn bot-row" onClick={() => selectBot(r as unknown as BotRow)}>
                {r.avatarUrl ? <img src={String(r.avatarUrl)} alt="" className="bot-avatar" /> : null}
                {String(r.name)}
              </button>
            )},
            { key: 'game', label: 'Game', render: (r) => String((r.game as { name: string })?.name ?? '—') },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
          ]}
          rows={bots as unknown as Record<string, unknown>[]}
        />
        {selected && (
          <div className="panel detail-card">
            <div className="bot-header">
              {selected.avatarUrl && <img src={selected.avatarUrl} alt={selected.name} className="bot-avatar bot-avatar--lg" />}
              <div>
                <h3>{selected.name}</h3>
                <p className="text-muted">{selected.game.name}</p>
                <span className="badge badge--gold">BOT ENTITY</span>
              </div>
            </div>
            <label>Status
              <select className="input" value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value })}>
                {['ACTIVE', 'INACTIVE', 'MAINTENANCE'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Behavior Config (JSON)
              <textarea className="input code-input" rows={12} value={configJson} onChange={(e) => setConfigJson(e.target.value)} />
            </label>
            <button type="button" className="btn btn--gold" disabled={saving} onClick={saveBot}>Save Bot</button>
          </div>
        )}
      </div>
    </div>
  );
}
