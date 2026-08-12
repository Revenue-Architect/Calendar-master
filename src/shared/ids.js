/* Stable identifiers for anything that is persisted.
 *
 * Planner historically used `Math.random().toString(36).slice(2, 9)` — seven
 * characters, no uniqueness guarantee. That is fine for a React `key` that
 * lives one toast long. It is not fine for event, task, note, exception, or
 * motivation-entry ids: those are written to the notebook and compared later
 * by identity. A collision would silently merge or overwrite records.
 *
 * `crypto.randomUUID()` is the platform id. The fallback exists only so unit
 * tests on older Node still run; it is not a second scheme the rest of the
 * app should depend on. Ephemeral UI keys (filter ids, animation tokens)
 * may keep using a short random if they never touch storage.
 */

export function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const time = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 12);
  return `id-${time}-${noise}`;
}
