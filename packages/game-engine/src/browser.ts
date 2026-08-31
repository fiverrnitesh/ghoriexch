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
  DICE_MAX_REAL_PLAYERS,
  DICE_TABLE_SEAT_COUNT,
  DICE_TABLE_OCCUPANT_TARGET,
  DICE_SEAT,
  DICE_JOIN_ORDER,
  DICE_SEAT_LABEL,
  DICE_FILLER_BOTS,
} from './games/dice/dice.constants.js';
