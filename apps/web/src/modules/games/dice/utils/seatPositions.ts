import {
  pointOnTableRim,
  SEAT_Y,
  TABLE_CORNER,
  TABLE_RX,
  TABLE_RZ,
} from '../scene/tableGeometry';

export { TABLE_RX, TABLE_RZ, SEAT_Y };

/** Six intentional seats along the long table sides (3 far, 3 near). */
export const VISUAL_SLOT_COUNT = 6;

/** Visual slot ids matching the reference labels. */
export const SLOT = {
  P1: 0, // near centre (local player)
  P5: 1, // near left
  P4: 2, // far left
  P2: 3, // far centre (house bot)
  P6: 4, // far right
  P3: 5, // near right
} as const;

/**
 * Target layout — 3 vertical columns on the rail (reference image):
 *
 *   P4 (far left)   P2 (far centre)   P6 (far right)
 *   P5 (near left)  P1 (near centre)  P3 (near right)
 *
 * 0° = +X, 90° = +Z (near). Each seat: pointOnTableRim() at curve-join angle.
 *
 * The camera is elevated, so equal world X does NOT give equal screen X — the
 * far rail projects narrower than the near rail. Near-side angles are therefore
 * pulled inward (141.8° / 38.2° rather than mirroring the far row) so each pair
 * lands in one straight screen column while staying on the rim curve.
 */
function rimSeat(angleDeg: number, outward = 0.10) {
  const p = pointOnTableRim(TABLE_RX, TABLE_RZ, TABLE_CORNER, angleDeg);
  const len = Math.hypot(p.x, p.z) || 1;
  return {
    x: p.x + (p.x / len) * outward,
    z: p.z + (p.z / len) * outward,
  };
}

const P1_POS = rimSeat(90, 0.12); // near centre
const P2_POS = rimSeat(270, 0.20); // far centre — extra outward so Html clears the dice
const P4_POS = rimSeat(213.53, 0.18); // far left
const P5_POS = rimSeat(141.8, 0.10); // near left — column-matched to P4
const P6_POS = rimSeat(326.47, 0.18); // far right
const P3_POS = rimSeat(38.2, 0.10); // near right — column-matched to P6

/**
 * Far-row Html anchor. Kept on the rail (not dropped into the felt) so the
 * name plate sits on the wood band and the avatar sits outside the dice zone.
 */
const FAR_SEAT_Y = 0.16;

const SLOT_LAYOUT = [
  { x: P1_POS.x, z: P1_POS.z, scale: 1.34, y: SEAT_Y - 0.1, depth: 1 }, // P1
  { x: P5_POS.x, z: P5_POS.z, scale: 1.04, y: SEAT_Y, depth: 0.92 }, // P5
  { x: P4_POS.x, z: P4_POS.z, scale: 0.84, y: FAR_SEAT_Y, depth: 0.18 }, // P4
  { x: P2_POS.x, z: P2_POS.z, scale: 0.88, y: FAR_SEAT_Y, depth: 0 }, // P2
  { x: P6_POS.x, z: P6_POS.z, scale: 0.84, y: FAR_SEAT_Y, depth: 0.18 }, // P6
  { x: P3_POS.x, z: P3_POS.z, scale: 1.04, y: SEAT_Y, depth: 0.92 }, // P3
] as const;

/** Remaining slots for human players once self (P1) and bot (P2) are placed. */
const OTHER_PLAYER_SLOTS = [SLOT.P5, SLOT.P4, SLOT.P6, SLOT.P3] as const;

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
