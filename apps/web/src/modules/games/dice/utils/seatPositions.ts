import {
  ellipseEqualArcAngles,
  ellipseOutwardNormal,
  pointOnTableRim,
  SEAT_Y,
  TABLE_RX,
  TABLE_RZ,
} from '../scene/tableGeometry';
import { DICE_SEAT, DICE_SEAT_LABEL } from '@games/game-engine/browser';

export { TABLE_RX, TABLE_RZ, SEAT_Y, DICE_SEAT_LABEL };

export const VISUAL_SLOT_COUNT = 8;

/** Visual slot ids. Camera-near is P1; far/top is P2. */
export const SLOT = {
  P1: 0, // near center
  P5: 1, // bottom-left
  P4: 2, // left
  P2: 3, // far center
  P7: 4, // top-right
  P6: 5, // right
  P8: 6, // bottom-right
  P3: 7, // top-left
} as const;

/**
 * Equal arc-length around the oval, starting at self (+Z / 90°) and walking
 * toward the left tip, then Shoot (−Z), then the right tip, back to self.
 * Equal clock-angles bunch at the pointed ends of a wide ellipse.
 */
const ARC = ellipseEqualArcAngles(TABLE_RX, TABLE_RZ, VISUAL_SLOT_COUNT, 90);
const SLOT_ANGLES = [
  ARC[0]!, // P1 self
  ARC[1]!, // P5 bottom-left
  ARC[2]!, // P4 left
  ARC[4]!, // P2 Shoot (halfway around)
  ARC[5]!, // P7 top-right
  ARC[6]!, // P6 right
  ARC[7]!, // P8 bottom-right
  ARC[3]!, // P3 top-left
] as const;

/** Sit on the outer gold rail, slightly outside the ellipse rim. */
const SEAT_OUTWARD = 0.2;

/** Far-row Html anchor. Kept on the rail so the name plate sits on the wood band. */
const FAR_SEAT_Y = 0.16;
const SIDE_SEAT_Y = 0.3;

function layoutForAngle(angleDeg: number) {
  const rim = pointOnTableRim(TABLE_RX, TABLE_RZ, angleDeg);
  const n = ellipseOutwardNormal(TABLE_RX, TABLE_RZ, angleDeg);
  const x = rim.x + n.x * SEAT_OUTWARD;
  const z = rim.z + n.z * SEAT_OUTWARD;
  const far = z < -0.05;
  const near = z > 0.05;
  const y = far ? FAR_SEAT_Y : near ? SEAT_Y - 0.1 : SIDE_SEAT_Y;
  const depth = (z / TABLE_RZ + 1) / 2;
  const scale = far ? 1.05 : near ? 1.0 : 0.96;
  return { x, z, y, scale, depth, angleDeg };
}

const SLOT_LAYOUT = SLOT_ANGLES.map(layoutForAngle);

/**
 * Clockwise visual slots from B (bottom), matching increasing seatIndex:
 * B, G, E, D, Shoot, H, F, C.
 */
const CLOCKWISE_FROM_B = [
  SLOT.P1, // B
  SLOT.P5, // G
  SLOT.P4, // E
  SLOT.P3, // D
  SLOT.P2, // Shoot
  SLOT.P7, // H
  SLOT.P6, // F
  SLOT.P8, // C
] as const;

/**
 * Map absolute seatIndex → oval slot. Local player is rotated to bottom-center;
 * spectators see B at the bottom and Shoot at the top.
 *
 * With self at B (0): Shoot→top, C→bottom-right, G→bottom-left, E/F tips, D/H far diagonals.
 */
export function resolveVisualSlots(
  occupiedSeatIndexes: number[],
  _maxSeats: number,
  selfSeatIndex: number | null,
  _isTigerAt?: (seatIndex: number) => boolean,
  _isSelfAt?: (seatIndex: number) => boolean,
) {
  const origin = selfSeatIndex ?? DICE_SEAT.B;
  const assignments = new Map<number, number>();
  for (const seatIndex of occupiedSeatIndexes) {
    const rotated = (((seatIndex - origin) % VISUAL_SLOT_COUNT) + VISUAL_SLOT_COUNT) % VISUAL_SLOT_COUNT;
    assignments.set(seatIndex, CLOCKWISE_FROM_B[rotated]!);
  }
  return assignments;
}

/** Inverse of resolveVisualSlots — which absolute seat sits in this visual slot. */
export function absoluteSeatForVisualSlot(visualSlot: number, selfSeatIndex: number | null = null) {
  const origin = selfSeatIndex ?? DICE_SEAT.B;
  const rotated = CLOCKWISE_FROM_B.findIndex((slot) => slot === visualSlot);
  if (rotated < 0) return origin;
  return (rotated + origin) % VISUAL_SLOT_COUNT;
}

export function diagramLabelForSeat(seatIndex: number) {
  return DICE_SEAT_LABEL[seatIndex] ?? `Seat ${seatIndex}`;
}

/** @deprecated Use resolveVisualSlots — kept for callers passing a single seat. */
export function getVisualSlot(
  seatIndex: number,
  _maxSeats: number,
  selfSeatIndex: number | null,
) {
  const origin = selfSeatIndex ?? DICE_SEAT.B;
  const rotated = (((seatIndex - origin) % VISUAL_SLOT_COUNT) + VISUAL_SLOT_COUNT) % VISUAL_SLOT_COUNT;
  return CLOCKWISE_FROM_B[rotated]!;
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
    const n = ellipseOutwardNormal(TABLE_RX, TABLE_RZ, layout.angleDeg);
    x += n.x * boost;
    z += n.z * boost;
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

/** Top half of the oval (negative Z) — Shoot and the two far diagonal seats. */
export function isFarVisualSlot(visualSlot?: number) {
  if (visualSlot == null) return false;
  const slot = ((visualSlot % VISUAL_SLOT_COUNT) + VISUAL_SLOT_COUNT) % VISUAL_SLOT_COUNT;
  return SLOT_LAYOUT[slot]!.z < -0.05;
}

/** Left / right of the oval (closer to the long-axis tips than to top/bottom). */
export function isSideVisualSlot(visualSlot?: number) {
  if (visualSlot == null) return false;
  const slot = ((visualSlot % VISUAL_SLOT_COUNT) + VISUAL_SLOT_COUNT) % VISUAL_SLOT_COUNT;
  const { x, z } = SLOT_LAYOUT[slot]!;
  return Math.abs(x) > Math.abs(z) * 1.15;
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

export function formatCurrency(amount: string | number, currency = 'PKR') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return '—';
  if (currency === 'PKR') return `₨ ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
  if (currency === 'INR') return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return `₨ ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}
