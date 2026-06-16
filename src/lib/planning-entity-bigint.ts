/**
 * Planning Data entity IDs can exceed 32-bit int; Postgres columns use BIGINT.
 * APIs and client props use number; Prisma returns bigint for those fields.
 */

export function planningEntityToNumber(
  v: bigint | null | undefined,
): number | null {
  return v == null ? null : Number(v);
}

export function planningEntityToDb(
  v: number | null | undefined,
): bigint | null {
  if (v == null) return null;
  return BigInt(v);
}

export function lastSeenIdsToNumbers(ids: readonly bigint[]): number[] {
  return ids.map((id) => Number(id));
}
