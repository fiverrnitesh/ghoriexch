/** Keep in sync with engine dice.constants (handoff 2s, final lock 5s). */
export const ENGINE_HANDOFF_S = 2;
export const ENGINE_FINAL_LOCK_S = 5;

/** 3D pass slide — fits inside DICE_HANDOFF. */
export const DICE_PASS_S = 1.7;
export const DICE_THROW_S = 0.55;
export const DICE_ROLL_S = 0.85;
export const DICE_SETTLE_S = 0.75;

/** Minimum time dice hover at roller before an auto-throw (spectator / timeout). */
export const MIN_READY_BEFORE_AUTO_THROW_MS = 2200;

/** Full throw chain after the hand reaches the roller. */
export const DICE_THROW_CHAIN_MS = Math.ceil(
  (DICE_THROW_S + DICE_ROLL_S + DICE_SETTLE_S) * 1000,
);

/** Minimum UI rolling window — covers handoff pass + ready hover + throw chain + buffer. */
export const MIN_ROLL_UI_MS = Math.ceil(DICE_PASS_S * 1000)
  + MIN_READY_BEFORE_AUTO_THROW_MS
  + DICE_THROW_CHAIN_MS
  + 600;

export const RESULT_REVEAL_MS = Math.max(5200, MIN_ROLL_UI_MS + 400);
export const NO_RESULT_REVEAL_MS = Math.max(3200, MIN_ROLL_UI_MS);
