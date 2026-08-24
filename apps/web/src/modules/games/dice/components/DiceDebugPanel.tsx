import { useState } from 'react';
import type { DiceGameState } from '@games/game-engine/browser';
import './DiceDebugPanel.css';

export function DiceDebugPanel({
  sessionId,
  state,
  currentUserId,
  wsConnected,
  lastAction,
  turnTimerSeconds,
}: {
  sessionId: string;
  state: DiceGameState;
  currentUserId?: string;
  wsConnected: boolean;
  lastAction?: string | null;
  turnTimerSeconds?: number;
}) {
  const [open, setOpen] = useState(true);

  if (!import.meta.env.DEV) return null;

  const match = state.activeMatch;
  const holderSeat = match ? state.seats.find((s) => s.seatIndex === match.holderSeatIndex) : null;
  const oppSeat = match ? state.seats.find((s) => s.seatIndex === match.opponentSeatIndex) : null;

  const holderId = holderSeat?.occupant?.type === 'USER'
    ? holderSeat.occupant.userId
    : holderSeat?.occupant?.botId;
  const oppId = oppSeat?.occupant?.type === 'USER'
    ? oppSeat.occupant.userId
    : oppSeat?.occupant?.botId;

  const isBotTurn = holderSeat?.occupant?.type === 'BOT' && state.phase === 'BETTING' && !state.mainBet;

  return (
    <div className="dice-debug">
      <button type="button" className="dice-debug__toggle" onClick={() => setOpen((v) => !v)}>
        DICE DEBUG {open ? '▾' : '▸'}
      </button>
      {open && (
        <pre className="dice-debug__body">
{`SESSION: ${sessionId}
ROUND: ${state.roundNumber} (${state.roundId || '—'})
PHASE: ${state.phase}
ACTIVE: ${holderSeat?.occupant?.name ?? '—'}
OPPONENT: ${oppSeat?.occupant?.name ?? '—'}
DICE HOLDER ID: ${holderId ?? '—'}
OPPONENT ID: ${oppId ?? '—'}
CURRENT USER: ${currentUserId ?? '—'}
PLAYERS: ${state.seats.filter((s) => s.occupant).length}
BOT TURN: ${isBotTurn}
MAIN BET: ${state.mainBet ? `${state.mainBet.choice} ₹${state.mainBet.amount} locked=${state.mainBet.locked}` : 'none'}
TURN STARTED: ${state.turnStartedAt ?? '—'}
TURN DEADLINE: ${state.turnDeadlineAt ?? '—'}
TURN TIMER ID: ${state.turnTimerId ?? '—'}
TURN REMAINING: ${turnTimerSeconds !== undefined ? `${turnTimerSeconds}s` : '—'}
SIDE BET DEADLINE: ${state.sideBetWindowEndsAt ?? '—'}
DICE: ${state.dice ? `${state.dice[0]} + ${state.dice[1]}` : '—'}
LAST ACTION: ${lastAction ?? '—'}
API: ${wsConnected ? 'WS CONNECTED' : 'POLLING'}`}
        </pre>
      )}
    </div>
  );
}
