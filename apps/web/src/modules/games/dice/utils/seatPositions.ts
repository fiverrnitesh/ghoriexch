import {
  SEAT_Y,
  TABLE_RX,
  TABLE_RZ,
} from '../scene/tableGeometry';

export { TABLE_RX, TABLE_RZ, SEAT_Y };

/** Eight intentional seats around the table (4 far, 4 near). */
export const VISUAL_SLOT_COUNT = 8;

/** Visual slot ids matching the 8-player table layout. */
export const SLOT = {
  P1: 0, // near center-left (local player / main seat)
  P5: 1, // near far-left
  P4: 2, // far left
  P2: 3, // far center-left (Shoot / house bot)
  P7: 4, // far center-right
  P6: 5, // far right
  P8: 6, // near far-right
  P3: 7, // near center-right
} as const;

/**
 * Calculate coordinates for seats distributed evenly along the table rail.
 * - Top (far) row: 4 seats distributed horizontally at X = -3.75, -1.25, +1.25, +3.75 (Z = -TABLE_RZ - 0.16)
 * - Bottom (near) row: 4 seats distributed horizontally at X = -3.75, -1.25, +1.25, +3.75 (Z = +TABLE_RZ + 0.14)
 */
const X_COL1 = -3.75;
const X_COL2 = -1.25;
const X_COL3 = 1.25;
const X_COL4 = 3.75;

const FAR_Z = -(TABLE_RZ + 0.16);
const NEAR_Z = TABLE_RZ + 0.14;

// 4 columns evenly distributed along X across the table
const P5_POS = { x: X_COL1, z: NEAR_Z }; // col 1: near far-left
const P1_POS = { x: X_COL2, z: NEAR_Z }; // col 2: near center-left (self)
const P3_POS = { x: X_COL3, z: NEAR_Z }; // col 3: near center-right
const P8_POS = { x: X_COL4, z: NEAR_Z }; // col 4: near far-right

const P4_POS = { x: X_COL1, z: FAR_Z };  // col 1: far left
const P2_POS = { x: X_COL2, z: FAR_Z };  // col 2: far center-left (Shoot)
const P7_POS = { x: X_COL3, z: FAR_Z };  // col 3: far center-right
const P6_POS = { x: X_COL4, z: FAR_Z };  // col 4: far right

/**
 * Far-row Html anchor. Kept on the rail so the name plate sits on the wood band.
 */
const FAR_SEAT_Y = 0.16;

const SLOT_LAYOUT = [
  { x: P1_POS.x, z: P1_POS.z, scale: 1.15, y: SEAT_Y - 0.1, depth: 1 }, // P1 (0) - self
  { x: P5_POS.x, z: P5_POS.z, scale: 0.95, y: SEAT_Y, depth: 0.92 }, // P5 (1)
  { x: P4_POS.x, z: P4_POS.z, scale: 0.80, y: FAR_SEAT_Y, depth: 0.18 }, // P4 (2)
  { x: P2_POS.x, z: P2_POS.z, scale: 0.84, y: FAR_SEAT_Y, depth: 0 }, // P2 (3) - Shoot
  { x: P7_POS.x, z: P7_POS.z, scale: 0.84, y: FAR_SEAT_Y, depth: 0 }, // P7 (4)
  { x: P6_POS.x, z: P6_POS.z, scale: 0.80, y: FAR_SEAT_Y, depth: 0.18 }, // P6 (5)
  { x: P8_POS.x, z: P8_POS.z, scale: 0.95, y: SEAT_Y, depth: 0.92 }, // P8 (6)
  { x: P3_POS.x, z: P3_POS.z, scale: 0.95, y: SEAT_Y, depth: 0.92 }, // P3 (7)
] as const;

/** Remaining slots for players once self (P1) and Shoot bot (P2) are placed. */
const OTHER_PLAYER_SLOTS = [
  SLOT.P3,
  SLOT.P7,
  SLOT.P5,
  SLOT.P4,
  SLOT.P6,
  SLOT.P8,
] as const;

function relativeSeatOffset(seatIndex: number, origin: number, maxSeats: number) {
  return (((seatIndex - origin) % maxSeats) + maxSeats) % maxSeats;
}

/**
 * Assign each occupied backend seat to one of the six reference visual slots.
 * Self is always P1; TIGER/house bot is always P2; others fill P5/P4/P6/P3.
 */
export function resolveVisualSlots(
  occupiedSeatIndexes: number[],
  maxSeats: number,
  selfSeatIndex: number | null,
  isTigerAt: (seatIndex: number) => boolean,
  isSelfAt: (seatIndex: number) => boolean,
) {
  const origin = selfSeatIndex ?? occupiedSeatIndexes[0] ?? 0;
  const assignments = new Map<number, number>();

  for (const seatIndex of occupiedSeatIndexes) {
    if (isSelfAt(seatIndex)) {
      assignments.set(seatIndex, SLOT.P1);
    } else if (isTigerAt(seatIndex)) {
      assignments.set(seatIndex, SLOT.P2);
    }
  }

  const others = occupiedSeatIndexes
    .filter((idx) => !assignments.has(idx))
    .sort(
      (a, b) =>
        relativeSeatOffset(a, origin, maxSeats) - relativeSeatOffset(b, origin, maxSeats),
    );

  others.forEach((seatIndex, i) => {
    const slot = OTHER_PLAYER_SLOTS[i];
    if (slot !== undefined) assignments.set(seatIndex, slot);
  });

  return assignments;
}

/** @deprecated Use resolveVisualSlots — kept for callers passing a single seat. */
export function getVisualSlot(
  seatIndex: number,
  maxSeats: number,
  selfSeatIndex: number | null,
) {
  const layoutSeats = Math.min(Math.max(1, maxSeats), VISUAL_SLOT_COUNT);
  const origin = selfSeatIndex ?? 0;
  return (((seatIndex - origin) % layoutSeats) + layoutSeats) % layoutSeats;
}

export function getSeatWorldPosition(
  visualSlot: number,
  isSelf = false,
  opts?: { outwardBoost?: number },
) {
  const slot = ((visualSlot % VISUAL_SLOT_COUNT) + VISUAL_SLOT_COUNT) % VISUAL_SLOT_COUNT;
  const layout = SLOT_LAYOUT[slot]!;
  const scale = slot === SLOT.P1 && !isSelf ? 1.08 : layout.scale;

  let x = layout.x;
  let z = layout.z;
  const boost = opts?.outwardBoost ?? 0;
  if (boost > 0) {
    const len = Math.hypot(x, z) || 1;
    x += (x / len) * boost;
    z += (z / len) * boost;
  }

  return {
    x,
    y: layout.y,
    z,
    scale,
    depth: layout.depth,
    visualSlot: slot,
  };
}

/** @deprecated Legacy 2D helper — kept for any CSS overlays still importing it. */
export function getSeatPosition(
  seatIndex: number,
  maxSeats = 7,
  selfSeatIndex: number | null = null,
) {
  const slot = getVisualSlot(seatIndex, maxSeats, selfSeatIndex);
  const world = getSeatWorldPosition(slot, slot === SLOT.P1);
  return {
    left: 50 + (world.x / TABLE_RX) * 47,
    top: 50 + (world.z / TABLE_RZ) * 40,
    scale: world.scale,
    zIndex: Math.round(8 + world.depth * 24),
    depth: world.depth,
  };
}

export function formatCurrency(amount: string | number, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return '—';
  if (currency === 'INR') return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
