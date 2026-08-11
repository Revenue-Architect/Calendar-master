function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function progressSegmentStates(done, total) {
  const count = Math.max(0, Math.floor(finite(done)));
  const size = Math.max(0, Math.floor(finite(total)));
  const filled = Math.min(count, size);
  return Array.from({ length: size }, (_, index) => index < filled);
}
