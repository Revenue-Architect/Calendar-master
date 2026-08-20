function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function progressSegmentStates(done, total) {
  const count = Math.max(0, Math.floor(finite(done)));
  const size = Math.max(0, Math.floor(finite(total)));
  const filled = Math.min(count, size);
  return Array.from({ length: size }, (_, index) => index < filled);
}

export function holdProgress(elapsedMs, holdDurationMs = 640) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(holdDurationMs) || holdDurationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / holdDurationMs));
}

export function holdRatchetStep(progress) {
  const p = Math.min(1, Math.max(0, finite(progress)));
  return 0.17 - 0.11 * p;
}

export function holdRadialDashOffset(radius, progress) {
  const r = Math.max(0, finite(radius, 13));
  const p = Math.min(1, Math.max(0, finite(progress)));
  return 2 * Math.PI * r * (1 - p);
}
