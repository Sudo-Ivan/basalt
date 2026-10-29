/**
 * Whether a timestamp recorded at lastSuccessAt is still within a
 * freshness window ending at now.
 */
export function isListFresh(
  lastSuccessAt: number,
  now: number,
  windowMs: number
): boolean {
  const elapsed = now - lastSuccessAt
  return elapsed >= 0 && elapsed < windowMs
}
