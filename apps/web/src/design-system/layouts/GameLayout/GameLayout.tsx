import type { ReactNode } from 'react';
import { CountdownTimer } from '../../components/CountdownTimer/CountdownTimer';
import { BalanceBadge } from '../../components/Wallet/WalletDisplay';
import './GameLayout.css';

export interface GameLayoutProps {
  /** Game title shown in top bar */
  title: string;
  /** Optional subtitle (room code, round info) */
  subtitle?: string;
  /** Player balance chip */
  balance?: string;
  /** Countdown duration in seconds */
  timerSeconds?: number;
  timerLabel?: string;
  onTimerComplete?: () => void;
  /** Main game table / arena area */
  table: ReactNode;
  /** Side betting panel (right on desktop, bottom sheet area on mobile) */
  bettingPanel?: ReactNode;
  /** Bottom action bar */
  actionBar?: ReactNode;
  /** Top-right slot (settings, leave, etc.) */
  headerActions?: ReactNode;
  onLeave?: () => void;
}

export function GameLayout({
  title,
  subtitle,
  balance,
  timerSeconds,
  timerLabel,
  onTimerComplete,
  table,
  bettingPanel,
  actionBar,
  headerActions,
  onLeave,
}: GameLayoutProps) {
  return (
    <div className="ds-game-layout">
      <header className="ds-game-layout__header">
        <div className="ds-game-layout__title-block">
          {onLeave && (
            <button type="button" className="ds-game-layout__back" onClick={onLeave} aria-label="Leave game">
              ←
            </button>
          )}
          <div>
            <h1 className="ds-game-layout__title">{title}</h1>
            {subtitle && <p className="ds-game-layout__subtitle">{subtitle}</p>}
          </div>
        </div>
        <div className="ds-game-layout__header-right">
          {timerSeconds !== undefined && (
            <CountdownTimer durationSeconds={timerSeconds} label={timerLabel} variant="gold" size="sm" onComplete={onTimerComplete} />
          )}
          {balance && <BalanceBadge amount={balance.replace(/^\$/, '')} />}
          {headerActions}
        </div>
      </header>

      <div className="ds-game-layout__body">
        <div className="ds-game-layout__arena">{table}</div>
        {bettingPanel && <aside className="ds-game-layout__sidebar">{bettingPanel}</aside>}
      </div>

      {actionBar && <footer className="ds-game-layout__actions">{actionBar}</footer>}
    </div>
  );
}
