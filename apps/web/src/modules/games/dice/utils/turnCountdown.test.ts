import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTurnCountdown,
  getRemainingSecondsFromDeadline,
  getSideBetRemainingSeconds,
  shouldShowTurnCountdown,
} from './turnCountdown.js';

describe('turnCountdown utils', () => {
  it('formats MM:SS for player turn display', () => {
    assert.equal(formatTurnCountdown(59), '00:59');
    assert.equal(formatTurnCountdown(60), '01:00');
    assert.equal(formatTurnCountdown(125), '02:05');
  });

  it('derives remaining seconds from server deadline', () => {
    const now = Date.parse('2026-08-16T21:00:00.000Z');
    const deadline = '2026-08-16T21:01:00.000Z';
    assert.equal(getRemainingSecondsFromDeadline(deadline, now), 60);
    assert.equal(getRemainingSecondsFromDeadline(deadline, now + 20_000), 40);
    assert.equal(getRemainingSecondsFromDeadline(deadline, now + 60_000), 0);
  });

  it('shows turn countdown during the full BETTING window', () => {
    assert.equal(
      shouldShowTurnCountdown({
        phase: 'BETTING',
        turnDeadlineAt: '2026-08-16T21:00:15.000Z',
        activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 1 },
        mainBet: null,
      }),
      true,
    );
    assert.equal(
      shouldShowTurnCountdown({
        phase: 'BETTING',
        turnDeadlineAt: '2026-08-16T21:00:15.000Z',
        activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 1 },
        mainBet: { userId: 'u0', amount: 100, choice: 'ODD', locked: false, holderLocked: true },
      }),
      true,
    );
    assert.equal(
      shouldShowTurnCountdown({
        phase: 'SIDE_BETTING',
        turnDeadlineAt: '2026-08-16T21:00:15.000Z',
        activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 1 },
        mainBet: null,
      }),
      false,
    );
  });

  it('does not reset side bet countdown helper independently', () => {
    const now = Date.parse('2026-08-16T21:00:00.000Z');
    assert.equal(getSideBetRemainingSeconds('2026-08-16T21:00:10.000Z', now), 10);
  });
});
