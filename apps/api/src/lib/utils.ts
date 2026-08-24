import { randomBytes } from 'node:crypto';

export function generateRoomCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function generateServerSeedHash(): { seed: string; hash: string } {
  const seed = randomBytes(32).toString('hex');
  // Hash stored separately; full verification happens at settlement time
  const hash = randomBytes(32).toString('hex');
  return { seed, hash };
}

export function decimalToString(value: { toString(): string }): string {
  return value.toString();
}

export function parseAmount(value: number | string): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num < 0) {
    throw new Error('Invalid amount');
  }
  return Math.round(num * 10000) / 10000;
}

/** Normalize Express route params to a single string value. */
export function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
