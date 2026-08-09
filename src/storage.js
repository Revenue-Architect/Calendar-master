/* Where the planner keeps its state.
 *
 * When embedded, the host supplies `window.storage`; standalone, we fall back to
 * localStorage. Probing happens once at module load rather than per call, because
 * a blocked localStorage (Safari private mode, disabled cookies, sandboxed iframe)
 * throws on *access*, not just on write.
 *
 * Reads never reject — a failure means "nothing saved yet", and the planner seeds
 * itself. Writes do reject, so the UI can flag that saving is broken and steer the
 * user toward exporting a copy.
 */

const host = typeof window !== "undefined" && window.storage ? window.storage : null;

const local = (() => {
  if (host || typeof window === "undefined") return null;
  try {
    const ls = window.localStorage;
    const probe = "nbmp:probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch (e) {
    return null;
  }
})();

export const writable = !!(host || local);

export async function get(key) {
  if (host) return host.get(key);
  if (!local) return null;
  const value = local.getItem(key);
  return value === null ? null : { value };
}

export async function set(key, value) {
  if (host) return host.set(key, value);
  if (!local) throw new Error("No writable storage on this device");
  local.setItem(key, value);
}

export async function remove(key) {
  if (host?.remove) return host.remove(key);
  if (host) return host.set(key, null);
  if (!local) throw new Error("No writable storage on this device");
  local.removeItem(key);
}
