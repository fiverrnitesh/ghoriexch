import './Lists.css';

export interface GameHistoryItem {
  id: string;
  gameName: string;
  amount: string;
  status: string;
  payout?: string | null;
  date: string;
}

export interface GameHistoryProps {
  items: GameHistoryItem[];
  emptyMessage?: string;
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    WON: 'live',
    SETTLED: 'live',
    LOST: 'danger',
    CANCELLED: 'muted',
    PENDING: 'warning',
    ACCEPTED: 'gold',
  };
  return map[status] ?? 'muted';
};

export function GameHistory({ items, emptyMessage = 'No game history yet' }: GameHistoryProps) {
  if (items.length === 0) {
    return <p className="ds-list-empty">{emptyMessage}</p>;
  }

  return (
    <div className="ds-list ds-list--history">
      {items.map((item) => (
        <div key={item.id} className="ds-list-row">
          <div className="ds-list-row__main">
            <span className="ds-list-row__title">{item.gameName}</span>
            <span className="ds-list-row__meta">{item.date}</span>
          </div>
          <div className="ds-list-row__values">
            <span className="ds-list-row__amount">${item.amount}</span>
            <span className={`ds-badge ds-badge--${statusBadge(item.status)}`}>{item.status}</span>
            {item.payout && <span className="ds-list-row__payout">+${item.payout}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface TransactionItem {
  id: string;
  type: string;
  amount: string;
  status: string;
  description?: string | null;
  date: string;
}

export interface TransactionListProps {
  items: TransactionItem[];
  emptyMessage?: string;
}

export function TransactionList({ items, emptyMessage = 'No transactions yet' }: TransactionListProps) {
  if (items.length === 0) {
    return <p className="ds-list-empty">{emptyMessage}</p>;
  }

  const isDebit = (type: string) => type.includes('DEBIT') || type === 'WITHDRAWAL';

  return (
    <div className="ds-list ds-list--transactions">
      {items.map((item) => (
        <div key={item.id} className="ds-list-row">
          <div className="ds-list-row__main">
            <span className="ds-list-row__title">{item.type.replace(/_/g, ' ')}</span>
            {item.description && <span className="ds-list-row__meta">{item.description}</span>}
            <span className="ds-list-row__meta">{item.date}</span>
          </div>
          <div className="ds-list-row__values">
            <span className={`ds-list-row__amount ${isDebit(item.type) ? 'ds-list-row__amount--debit' : 'ds-list-row__amount--credit'}`}>
              {isDebit(item.type) ? '-' : '+'}${item.amount}
            </span>
            <span className={`ds-badge ds-badge--${item.status === 'COMPLETED' ? 'live' : 'muted'}`}>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
