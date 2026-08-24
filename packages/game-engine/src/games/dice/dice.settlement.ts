const settledRounds = new Set<string>();

export function claimRoundSettlement(roundId: string): boolean {
  const key = `settle-${roundId}`;
  if (settledRounds.has(key)) return false;
  settledRounds.add(key);
  return true;
}

export function isRoundSettled(roundId: string): boolean {
  return settledRounds.has(`settle-${roundId}`);
}

export function resetRoundSettlements(): void {
  settledRounds.clear();
}
