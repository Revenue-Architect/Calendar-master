function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function progressSegmentStates(done, total) {
  const count = Math.max(0, Math.floor(finite(done)));
  const size = Math.max(0, Math.floor(finite(total)));
  const filled = Math.min(count, size);
  return Array.from({ length: size }, (_, index) => index < filled);
}

export const PROGRESS_STAGGER_STEP_MS = 60;
export const PROGRESS_STAGGER_CAP_MS = 160;
export const PROGRESS_FILL_MS = 200;

export function progressSegmentDelay(index, previousDone, doneCount, {
  stepMs = PROGRESS_STAGGER_STEP_MS,
  capMs = PROGRESS_STAGGER_CAP_MS,
} = {}) {
  const from = Math.max(0, Math.min(finite(previousDone), finite(doneCount)));
  const newly = Math.max(0, index - from);
  if (newly === 0) return 0;
  const lastNew = Math.max(0, Math.floor(finite(doneCount)) - 1 - from);
  const lastRaw = lastNew * stepMs;
  if (lastRaw <= capMs) return newly * stepMs;
  return (newly / lastNew) * capMs;
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
