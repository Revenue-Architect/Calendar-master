import { MORPH_STATES } from "./morphTransaction.js";

/**
 * Resolves the return geometry at the close boundary, rather than reusing the
 * source snapshot captured when the surface opened. The registry owns both the
 * live semantic node and its retained last-valid geometry when that node has
 * disappeared.
 */
export function resolveLatestMorphCloseTarget({ registry, key, fallbackSnapshot } = {}) {
  const latestSource = key
    ? registry?.getMorphSnapshot?.(key, "source")
    : null;
  return latestSource ?? fallbackSnapshot ?? null;
}

/**
 * Starts the active transaction's close using its own semantic key. Callers
 * deliberately pass the existing transaction snapshot so a handoff cannot use
 * the incoming surface's key as the return target.
 */
export function startCloseWithLatestSource({ transaction, snapshot, registry } = {}) {
  if (!transaction || !snapshot) return false;

  const target = resolveLatestMorphCloseTarget({
    registry,
    key: snapshot.key,
    fallbackSnapshot: snapshot.sourceSnapshot,
  });

  return transaction.startClose({ target, runId: snapshot.runId });
}

/**
 * Holds the semantic key outside the transaction until that close run reaches
 * IDLE. `settleClose()` intentionally clears transaction snapshots before its
 * IDLE notification, so the key cannot be recovered from the final snapshot.
 */
export function createMorphCloseSnapshotRelease({ registry } = {}) {
  let pendingClose = null;

  function trackClose({ key, runId } = {}) {
    if (!key || runId == null) return false;
    pendingClose = { key, runId };
    return true;
  }

  function onTransactionStateChange(snapshot) {
    if (!pendingClose || !snapshot) return false;

    // A newer run owns its own history; an old close must never release it.
    if (snapshot.runId > pendingClose.runId) {
      pendingClose = null;
      return false;
    }

    if (
      snapshot.state !== MORPH_STATES.IDLE
      || snapshot.runId !== pendingClose.runId
    ) {
      return false;
    }

    registry?.releaseMorphSnapshots?.(pendingClose.key);
    pendingClose = null;
    return true;
  }

  return { trackClose, onTransactionStateChange };
}
