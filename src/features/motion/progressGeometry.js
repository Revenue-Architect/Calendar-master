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

function polarPoint(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/* Clockwise arcs from 12 o'clock. One item is a closed circle so a lone
   step does not look like a broken ring. */
export function progressRingSegments(total, {
  cx = 10,
  cy = 10,
  r = 7,
  gapDeg = 14,
  startDeg = -90,
} = {}) {
  const n = Math.max(0, Math.floor(finite(total)));
  if (!n) return [];
  if (n === 1) {
    return [{
      kind: "circle",
      cx,
      cy,
      r,
      length: 2 * Math.PI * r,
      from: { x: cx, y: cy - r },
    }];
  }
  const slot = 360 / n;
  const gap = Math.min(slot * 0.28, Math.max(6, finite(gapDeg, 14)));
  const sweep = slot - gap;
  return Array.from({ length: n }, (_, index) => {
    const start = startDeg + index * slot + gap / 2;
    const end = start + sweep;
    const from = polarPoint(cx, cy, r, start);
    const to = polarPoint(cx, cy, r, end);
    const large = sweep > 180 ? 1 : 0;
    return {
      kind: "arc",
      d: `M ${from.x.toFixed(4)} ${from.y.toFixed(4)} A ${r} ${r} 0 ${large} 1 ${to.x.toFixed(4)} ${to.y.toFixed(4)}`,
      length: (sweep * Math.PI / 180) * r,
      from,
      to,
    };
  });
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
