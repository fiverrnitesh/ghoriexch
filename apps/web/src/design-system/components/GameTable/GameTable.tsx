import type { ReactNode } from 'react';
import './GameTable.css';

export type TableShape = 'oval' | 'rectangular' | 'arena';

export interface GameTableProps {
  /** Content rendered at center of the table (pot, cards, game objects) */
  center?: ReactNode;
  /** Content above center (dealer, host) */
  top?: ReactNode;
  /** Player seats positioned around the table */
  children?: ReactNode;
  /** Brand/watermark text */
  watermark?: string;
  shape?: TableShape;
  className?: string;
}

export function GameTable({
  center,
  top,
  children,
  watermark,
  shape = 'oval',
  className = '',
}: GameTableProps) {
  return (
    <div className={`ds-game-table-wrap ${className}`}>
      <div className={`ds-game-table ds-game-table--${shape}`}>
        <div className="ds-game-table__rim">
          <div className="ds-game-table__felt">
            {watermark && <span className="ds-game-table__watermark">{watermark}</span>}
            {top && <div className="ds-game-table__top">{top}</div>}
            {center && <div className="ds-game-table__center">{center}</div>}
            <div className="ds-game-table__seats">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pot / pool display for center of table */
export function TablePot({ label = 'Pot', amount }: { label?: string; amount: string }) {
  return (
    <div className="ds-table-pot">
      <span className="ds-table-pot__label">{label}</span>
      <span className="ds-table-pot__amount">{amount}</span>
    </div>
  );
}
