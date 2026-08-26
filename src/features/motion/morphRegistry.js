/**
 * Calendar Master — MorphRegistry
 *
 * Role-aware spatial registry for physical morph transitions.
 * Coexists source and destination nodes under the same semantic key,
 * extracts first-class shared element snapshots (title, meta, marker),
 * and retains last-valid snapshots across unmount for graceful reversals.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §6
 */

function extractSharedElements(node, explicitShared = {}) {
  const shared = {
    title: explicitShared.title || null,
    meta: explicitShared.meta || null,
    marker: explicitShared.marker || null,
  };

  if (!node || typeof node.querySelector !== "function") {
    return shared;
  }

  // 1. Shared Title extraction (if not explicitly provided)
  if (!shared.title) {
    const titleEl = node.querySelector(".nb-lead, [data-morph-title]");
    if (titleEl && typeof titleEl.getBoundingClientRect === "function") {
      const rect = titleEl.getBoundingClientRect();
      const text = titleEl.textContent?.trim() || "";
      let style = null;
      if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
        const computed = window.getComputedStyle(titleEl);
        style = {
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          lineHeight: computed.lineHeight,
          color: computed.color,
        };
      }
      shared.title = {
        text,
        rect: {
          x: rect.x,
          y: rect.y,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        style,
      };
    }
  }

  // 2. Shared Meta/Time extraction
  if (!shared.meta) {
    const metaEl = node.querySelector(".nb-task-time, .nb-event-time, [data-morph-meta]");
    if (metaEl && typeof metaEl.getBoundingClientRect === "function") {
      const rect = metaEl.getBoundingClientRect();
      const text = metaEl.textContent?.trim() || "";
      let style = null;
      if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
        const computed = window.getComputedStyle(metaEl);
        style = {
          fontSize: computed.fontSize,
          color: computed.color,
        };
      }
      shared.meta = {
        text,
        rect: {
          x: rect.x,
          y: rect.y,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        style,
      };
    }
  }

  // 3. Shared Marker/Progress extraction
  if (!shared.marker) {
    const markerEl = node.querySelector('[data-test="timeline-action-progress"], [data-morph-marker]');
    if (markerEl && typeof markerEl.getBoundingClientRect === "function") {
      const rect = markerEl.getBoundingClientRect();
      const type = markerEl.getAttribute?.("data-morph-marker") || "progress-ring";
      shared.marker = {
        type,
        rect: {
          x: rect.x,
          y: rect.y,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        style: null,
      };
    }
  }

  return shared;
}

export function createMorphRegistry() {
  // Map<key, { source: liveEntry | null, destination: liveEntry | null, lastSourceSnapshot: snapshot | null, lastDestinationSnapshot: snapshot | null }>
  const records = new Map();

  function getRecord(key, createIfMissing = false) {
    let rec = records.get(key);
    if (!rec && createIfMissing) {
      rec = {
        source: null,
        destination: null,
        lastSourceSnapshot: null,
        lastDestinationSnapshot: null,
      };
      records.set(key, rec);
    }
    return rec || null;
  }

  function registerMorphNode({
    key,
    node,
    kind = "event",
    role = "source",
    meta = {},
    shared = {},
    getSnapshot,
  }) {
    if (!key || typeof key !== "string") {
      throw new Error("registerMorphNode requires a non-empty string key");
    }
    if (!node || !(node instanceof (typeof HTMLElement !== "undefined" ? HTMLElement : Object))) {
      throw new Error("registerMorphNode requires a valid DOM node");
    }
    if (role !== "source" && role !== "destination") {
      role = "source";
    }

    const rec = getRecord(key, true);
    const entry = {
      key,
      node,
      kind,
      role,
      meta,
      shared,
      getSnapshot,
      registeredAt: Date.now(),
    };

    rec[role] = entry;

    return () => {
      unregisterMorphNode(key, node, role);
    };
  }

  function unregisterMorphNode(key, node, role) {
    if (!key || !node) return;
    const rec = getRecord(key, false);
    if (!rec) return;

    if (role) {
      if (rec[role] && rec[role].node === node) {
        rec[role] = null;
      }
    } else {
      if (rec.source && rec.source.node === node) rec.source = null;
      if (rec.destination && rec.destination.node === node) rec.destination = null;
    }

    // If completely empty of both live and snapshots, we can delete the key
    if (!rec.source && !rec.destination && !rec.lastSourceSnapshot && !rec.lastDestinationSnapshot) {
      records.delete(key);
    }
  }

  function resolveMorphNode(key, role = "source") {
    if (!key) return null;
    const rec = getRecord(key, false);
    if (!rec || !rec[role]) return null;

    const node = rec[role].node;
    if (typeof document !== "undefined" && !document.body.contains(node)) {
      return null;
    }
    return node;
  }

  function snapshotMorphNode(key, role = "source") {
    if (!key) return null;
    const rec = getRecord(key, false);
    if (!rec || !rec[role]) return null;

    const entry = rec[role];
    const { node, meta, shared: explicitShared, getSnapshot } = entry;

    if (typeof document !== "undefined" && !document.body.contains(node)) {
      return null;
    }

    if (typeof getSnapshot === "function") {
      const snap = getSnapshot(node, meta);
      if (role === "source") rec.lastSourceSnapshot = snap;
      else rec.lastDestinationSnapshot = snap;
      return snap;
    }

    const rect = node.getBoundingClientRect();
    let borderRadius = 0;
    let backgroundColor = "";

    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      const computed = window.getComputedStyle(node);
      borderRadius = parseFloat(computed.borderRadius) || 0;
      backgroundColor = computed.backgroundColor || "";
    }

    const shared = extractSharedElements(node, explicitShared);

    const snapshot = {
      key,
      kind: entry.kind,
      role: entry.role,
      rect: {
        x: rect.x,
        y: rect.y,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      borderRadius,
      backgroundColor,
      meta: { ...meta },
      shared,
      isConnected: true,
      timestamp: Date.now(),
    };

    if (role === "source") {
      rec.lastSourceSnapshot = snapshot;
    } else {
      rec.lastDestinationSnapshot = snapshot;
    }

    return snapshot;
  }

  function getLastMorphSnapshot(key, role = "source") {
    if (!key) return null;
    const rec = getRecord(key, false);
    if (!rec) return null;
    return role === "source" ? rec.lastSourceSnapshot : rec.lastDestinationSnapshot;
  }

  // Backwards-compatible alias for existing consumers:
  function getMorphSnapshot(key, role = "source") {
    const live = snapshotMorphNode(key, role);
    if (live) return live;
    return getLastMorphSnapshot(key, role);
  }

  function releaseMorphKey(key) {
    if (!key) return;
    records.delete(key);
  }

  function getRegisteredKeys() {
    return Array.from(records.keys());
  }

  function clear() {
    records.clear();
  }

  return {
    registerMorphNode,
    unregisterMorphNode,
    resolveMorphNode,
    snapshotMorphNode,
    getLastMorphSnapshot,
    getMorphSnapshot,
    releaseMorphKey,
    getRegisteredKeys,
    clear,
  };
}

// Global default instance
export const morphRegistry = createMorphRegistry();
