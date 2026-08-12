/* Last-resort notebook probe used by the crash screen.
 *
 * Must stay independent of `src/storage.js` and of Planner: the app has just
 * failed, and importing the live port would couple recovery to a module that
 * itself touches window. The *order* still matches the port — host
 * `window.storage` first (embed), then `localStorage` (standalone) — so a
 * host-only notebook is no longer reported as "nothing to rescue".
 *
 * Keys are oldest-first. A crash during a v7→v8 cutover is exactly when the
 * previous key is the real notebook.
 */

export const RECOVERY_STATE_KEYS = [
  "nbmp:state:v8",
  "nbmp:state:v7",
  "nbmp:state:v6",
  "nbmp:state:v5",
  "nbmp:state:v4",
];

function valueOf(result) {
  if (result == null || result === "") return null;
  return typeof result === "object" && Object.hasOwn(result, "value") ? result.value : result;
}

function asRaw(value) {
  if (value == null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function readLocalNotebook(localStorageLike = typeof window !== "undefined" ? window.localStorage : null) {
  if (!localStorageLike || typeof localStorageLike.getItem !== "function") return null;
  for (const key of RECOVERY_STATE_KEYS) {
    try {
      const raw = localStorageLike.getItem(key);
      if (raw) return { key, raw };
    } catch {
      /* Storage itself may be the thing that is broken. Keep looking. */
    }
  }
  return null;
}

export async function readHostNotebook(host = typeof window !== "undefined" ? window.storage : null) {
  if (!host || typeof host.get !== "function") return null;
  for (const key of RECOVERY_STATE_KEYS) {
    try {
      const raw = asRaw(valueOf(await host.get(key)));
      if (raw) return { key, raw };
    } catch {
      /* Host storage may be the thing that is broken. Keep looking. */
    }
  }
  return null;
}

/** Host first, then localStorage. Either side failing does not hide the other. */
export async function readRecoverableNotebook({
  host = typeof window !== "undefined" ? window.storage : null,
  localStorageLike = typeof window !== "undefined" ? window.localStorage : null,
} = {}) {
  return (await readHostNotebook(host)) || readLocalNotebook(localStorageLike);
}
