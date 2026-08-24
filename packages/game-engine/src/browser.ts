/**
 * Browser-safe Dice surface: types and constants only.
 * Server RNG, settlement, timers, and the engine stay on the Node entry.
 */
export type * from './games/dice/dice.types.js';
export {
  DIE_FACES,
  OPPOSITE_FACES,
  NUMBERED_FACES,
  DEFAULT_DICE_CONFIG,
  DICE_ACTIONS,
  DICE_EVENTS,
} from './games/dice/dice.constants.js';
