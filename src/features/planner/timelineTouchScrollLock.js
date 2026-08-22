/* Sequence-keyed DOM mechanics for the active Day touch transaction.
 *
 * This helper deliberately has no phase, owner, commit, or cancel semantics.
 * `timelineInteractionState.js` remains the logical authority; this object only
 * snapshots one live stream node and puts its scroll position back. */

function inlineSnapshot(node) {
  return {
    overflowAnchor: node?.style?.overflowAnchor ?? "",
  };
}

function restoreInline(node, snapshot) {
  if (!node?.style || !snapshot) return;
  node.style.overflowAnchor = snapshot.overflowAnchor;
}

export function createTimelineTouchScrollLock() {
  let active = null;

  const matches = (sequence, { node = null, touchId = null } = {}) => (
    active != null
    && active.sequence === sequence
    && (!node || active.node === node)
    && (touchId == null || active.touchId === touchId)
  );

  return {
    acquire(sequence, node, { touchId = null } = {}) {
      if (!Number.isFinite(sequence) || !node) return false;
      if (active && active.sequence !== sequence) return false;
      if (active) return matches(sequence, { node, touchId });
      active = {
        sequence,
        node,
        touchId,
        scrollTop: Number.isFinite(node.scrollTop) ? node.scrollTop : 0,
        inline: inlineSnapshot(node),
      };
      /* Avoid layout anchoring from changing the captured offset while the
         gesture is live. This is restored on every matching release. */
      if (node.style) node.style.overflowAnchor = "none";
      node.scrollTop = active.scrollTop;
      return true;
    },

    isActive(sequence, options) {
      return matches(sequence, options);
    },

    lockedScrollTop(sequence, options) {
      return matches(sequence, options) ? active.scrollTop : null;
    },

    /** Enforce and report whether this sequence owns the node. */
    enforce(sequence, options) {
      if (!matches(sequence, options)) return false;
      if (active.node.scrollTop !== active.scrollTop) active.node.scrollTop = active.scrollTop;
      return true;
    },

    /** Release only the matching sequence/node; stale calls cannot unlock a newer one. */
    release(sequence, options = {}) {
      if (!matches(sequence, options)) return false;
      const { node, inline, scrollTop } = active;
      if (node && Number.isFinite(scrollTop)) node.scrollTop = scrollTop;
      restoreInline(node, inline);
      active = null;
      return true;
    },

    /** Cleanup for a replaced node is still sequence-keyed and idempotent. */
    releaseNode(sequence, node) {
      return this.release(sequence, { node });
    },

    snapshot() {
      if (!active) return null;
      return { sequence: active.sequence, node: active.node, touchId: active.touchId, scrollTop: active.scrollTop };
    },
  };
}

export function acquireTimelineTouchScrollLock(lock, node, sequence, touchId) {
  if (!lock || !node || !Number.isFinite(sequence)) return false;
  return lock.acquire(sequence, node, { touchId });
}

export function releaseTimelineTouchScrollLock(lock, sequence, touchId = null) {
  const active = lock?.snapshot?.();
  if (!active || (Number.isFinite(sequence) && active.sequence !== sequence)) return false;
  return lock.release(active.sequence, { node: active.node, touchId: touchId ?? active.touchId });
}
