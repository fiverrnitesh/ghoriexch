import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import type { GameHistoryEntry, GameHistorySummary, Paginated } from '../account/types';
import { LoadingState, EmptyState, SecondaryButton } from '../../design-system';
import './GameHistoryPage.css';

interface DiceRoundHistoryEntry {
  id: string;
  roundId: string;
  settledAt: string;
  player: string;
  opponent: string;
  die1: string;
  die2: string;
  hasBlank: boolean;
  choice: string;
  outcome: string;
  winner: string;
  loser: string;
  mainBetAmount: number | null;
  mainBetPayout: number | null;
  sideBets: Array<{ prediction: string; amount: number; status: string; role: string }>;
}

export function GameHistoryPage() {
  const [items, setItems] = useState<GameHistoryEntry[]>([]);
  const [diceRounds, setDiceRounds] = useState<DiceRoundHistoryEntry[]>([]);
  const [summary, setSummary] = useState<GameHistorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dicePage, setDicePage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [diceTotalPages, setDiceTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<'bets' | 'dice'>('bets');

  useEffect(() => {
    setLoading(true);
    if (tab === 'dice') {
      api.get<Paginated<DiceRoundHistoryEntry>>(`/api/dice/rounds?page=${dicePage}&pageSize=15`)
        .then((history) => {
          setDiceRounds(history.items);
          setDiceTotalPages(history.totalPages);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
      return;
    }

    const params = new URLSearchParams({ page: String(page), pageSize: '15' });
    if (statusFilter) params.set('status', statusFilter);

    Promise.all([
      api.get<Paginated<GameHistoryEntry>>(`/api/game-history?${params}`),
      page === 1 ? api.get<GameHistorySummary>('/api/game-history/summary') : Promise.resolve(null),
    ])
      .then(([history, sum]) => {
        setItems(history.items);
        setTotalPages(history.totalPages);
        if (sum) setSummary(sum);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, statusFilter, tab, dicePage]);

  if (loading && items.length === 0) return <LoadingState message="Loading game history..." />;

  return (
    <div className="history-page">
      <h1>Game History</h1>

      {summary && (
        <div className="history-stats">
          <div className="history-stat ds-panel"><span className="history-stat__val">{summary.totalBets}</span><span className="history-stat__lbl">Total Bets</span></div>
          <div className="history-stat ds-panel"><span className="history-stat__val">{summary.wins}</span><span className="history-stat__lbl">Wins</span></div>
          <div className="history-stat ds-panel"><span className="history-stat__val">{summary.losses}</span><span className="history-stat__lbl">Losses</span></div>
          <div className="history-stat ds-panel"><span className="history-stat__val">${summary.totalWagered}</span><span className="history-stat__lbl">Wagered</span></div>
        </div>
      )}

      <div className="history-filters">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <SecondaryButton size="sm" onClick={() => setTab('bets')} disabled={tab === 'bets'}>Bet History</SecondaryButton>
          <SecondaryButton size="sm" onClick={() => setTab('dice')} disabled={tab === 'dice'}>Dice Rounds</SecondaryButton>
        </div>
        {tab === 'bets' && (
        <select className="ds-input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All outcomes</option>
          {['WON', 'LOST', 'PENDING', 'SETTLED', 'REFUNDED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        )}
      </div>

      {tab === 'dice' ? (
        diceRounds.length === 0 ? (
          <EmptyState title="No dice rounds yet" description="Completed dice rounds will appear here." />
        ) : (
          <>
            <div className="history-list">
              {diceRounds.map((round) => (
                <article key={round.id} className="history-row ds-panel">
                  <div className="history-row__main">
                    <span className="history-row__game">Dice · {round.roundId}</span>
                    <span className="history-row__meta">
                      <span>{round.player} vs {round.opponent}</span>
                      <span>{round.die1} + {round.die2}{round.hasBlank ? ' (blank)' : ''}</span>
                      <span>{round.choice} → {round.outcome}</span>
                      <span>Winner: {round.winner}</span>
                    </span>
                    <time className="history-row__time">{new Date(round.settledAt).toLocaleString()}</time>
                  </div>
                  <div className="history-row__values">
                    {round.mainBetAmount !== null && <span className="history-row__amount">${round.mainBetAmount}</span>}
                    {round.mainBetPayout !== null && round.mainBetPayout > 0 && (
                      <span className="history-row__payout">+${round.mainBetPayout}</span>
                    )}
                    {round.sideBets.length > 0 && (
                      <span className="ds-badge ds-badge--muted">{round.sideBets.length} side bet(s)</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {diceTotalPages > 1 && (
              <div className="history-pagination">
                <SecondaryButton size="sm" disabled={dicePage <= 1} onClick={() => setDicePage((p) => p - 1)}>Previous</SecondaryButton>
                <span>Page {dicePage} of {diceTotalPages}</span>
                <SecondaryButton size="sm" disabled={dicePage >= diceTotalPages} onClick={() => setDicePage((p) => p + 1)}>Next</SecondaryButton>
              </div>
            )}
          </>
        )
      ) : items.length === 0 ? (
        <EmptyState title="No game history" description="Your bets and game sessions will appear here." />
      ) : (
        <div className="history-list">
          {items.map((entry) => (
            <article key={entry.id} className="history-row ds-panel">
              <div className="history-row__main">
                <span className="history-row__game">{entry.game.name}</span>
                <span className="history-row__meta">
                  {entry.game.category && <span>{entry.game.category}</span>}
                  {entry.room && <span>Room {entry.room.code}</span>}
                  {entry.roundNumber !== null && <span>Round {entry.roundNumber}</span>}
                </span>
                <time className="history-row__time">{new Date(entry.createdAt).toLocaleString()}</time>
              </div>
              <div className="history-row__values">
                <span className="history-row__amount">${entry.amount}</span>
                {entry.payout && <span className="history-row__payout">+${entry.payout}</span>}
                <span className={`ds-badge ds-badge--${entry.status === 'WON' || entry.status === 'SETTLED' ? 'live' : entry.status === 'LOST' ? 'danger' : 'muted'}`}>
                  {entry.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'bets' && totalPages > 1 && (
        <div className="history-pagination">
          <SecondaryButton size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</SecondaryButton>
          <span>Page {page} of {totalPages}</span>
          <SecondaryButton size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</SecondaryButton>
        </div>
      )}
    </div>
  );
}
