import type { PlayerChoice } from '@games/game-engine/browser';

/** Player-facing choice: EVEN is default; PAO is the explicit ODD alternate. */
export function formatChoiceLabel(choice: PlayerChoice | string | null | undefined): string {
  if (choice === 'ODD') return 'PAO';
  if (choice === 'EVEN') return 'EVEN';
  return 'EVEN';
}

export function choiceFromPao(paoActive: boolean): PlayerChoice {
  return paoActive ? 'ODD' : 'EVEN';
}
