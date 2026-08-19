/* Snapping a minute-of-day onto a grid, and choosing a start that fits.
 *
 * Pure arithmetic over minutes since midnight, which is why it sits in
 * shared/time/ beside duration.js and clockFormat.js rather than in a
 * feature. `startSlot` blocks Composer and WeekGrid; `snapTo` is its only
 * internal caller and SNAP is snapTo's, so SNAP stays private.
 */
const SNAP = 5;
const snapTo = (m, s = SNAP) => Math.max(0, Math.min(1440, Math.round(m / s) * s));
/* A start is a minute of the day, and a day has no minute 1440. Snapping "now" at
   23:53 rounded up to it and built "…T24:00", which the time model rejects — from
   inside render, so the whole page went blank. A new entry begins in the last slot
   the day actually has. */
const startSlot = (m, s = 15) => Math.min(snapTo(m, s), 1440 - s);

export {
  snapTo,
  startSlot,
};
