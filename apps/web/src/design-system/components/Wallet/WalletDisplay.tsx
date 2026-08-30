import './WalletDisplay.css';

export interface WalletDisplayProps {
  balance: string;
  available?: string;
  locked?: string;
  currency?: string;
  compact?: boolean;
  className?: string;
}

export function WalletDisplay({
  balance,
  available,
  locked,
  currency = 'PKR',
  compact,
  className = '',
}: WalletDisplayProps) {
  const symbol = currency === 'PKR' ? '₨ ' : currency === 'USD' ? '$' : currency === 'INR' ? '₹ ' : `${currency} `;

  if (compact) {
    return (
      <div className={`ds-wallet-display ds-wallet-display--compact ${className}`}>
        <span className="ds-wallet-display__label">Balance</span>
        <span className="ds-wallet-display__amount">{symbol}{balance}</span>
      </div>
    );
  }

  return (
    <div className={`ds-wallet-display ds-panel ds-panel--chrome ${className}`}>
      <div className="ds-panel__header">
        <h3 className="ds-panel__title">Wallet</h3>
      </div>
      <div className="ds-panel__body">
        <div className="ds-wallet-display__main">
          <span className="ds-wallet-display__label">Total Balance</span>
          <span className="ds-stat-value">{symbol}{balance}</span>
        </div>
        {(available !== undefined || locked !== undefined) && (
          <div className="ds-wallet-display__row">
            {available !== undefined && (
              <div className="ds-wallet-display__cell">
                <span className="ds-wallet-display__sublabel">Available</span>
                <span className="ds-wallet-display__subvalue">{symbol}{available}</span>
              </div>
            )}
            {locked !== undefined && (
              <div className="ds-wallet-display__cell">
                <span className="ds-wallet-display__sublabel">Locked</span>
                <span className="ds-wallet-display__subvalue">{symbol}{locked}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export interface BalanceBadgeProps {
  amount: string;
  currency?: string;
  variant?: 'gold' | 'muted' | 'success';
  size?: 'sm' | 'md';
  onClick?: () => void;
}

export function BalanceBadge({ amount, currency = 'USD', variant = 'gold', size = 'md', onClick }: BalanceBadgeProps) {
  const symbol = currency === 'USD' ? '$' : currency;
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ds-balance-badge ds-balance-badge--${variant} ds-balance-badge--${size}`}
      onClick={onClick}
    >
      <span className="ds-balance-badge__icon" aria-hidden="true">◆</span>
      <span className="ds-balance-badge__amount">{symbol}{amount}</span>
    </Tag>
  );
}
