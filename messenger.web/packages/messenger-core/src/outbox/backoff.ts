const BASE_MS = 1_000;
const MAX_MS = 60_000;

export function computeBackoffMs(attempts: number): number {
  const exp = Math.min(BASE_MS * 2 ** attempts, MAX_MS);
  const jitter = Math.floor(Math.random() * exp * 0.2);
  return exp + jitter;
}