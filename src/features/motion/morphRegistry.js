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

function isElementConnected(el) {
  if (!el) return false;
  if (typeof el.isConnected === "boolean") return el.isConnected;
  if (typeof document !== "undefined" && document.body) {
    return document.body.contains(el);
  }
  return true;
}

function resolveElement(target, rootNode, defaultSelector) {
  if (target === undefined) {
    if (defaultSelector && rootNode && typeof rootNode.querySelector === "function") {
      return rootNode.querySelector(defaultSelector);
    }
    return null;
  }
  if (!target) return null;

  // React ref object
  if (typeof target === "object" && "current" in target) {
    return target.current || null;
  }
  // Selector string
  if (typeof target === "string" && rootNode && typeof rootNode.querySelector === "function") {
    return rootNode.querySelector(target);
  }
  // Direct DOM or mock node
  if (typeof target === "object" && typeof target.getBoundingClientRect === "function") {
    return target;
  }
  return null;
}

function extractElementSnapshot(el, fallbackText = "") {
  if (!el || !isElementConnected(el)) return null;
  const rect = el.getBoundingClientRect();
  const text = el.textContent?.trim() || fallbackText || "";
  let style = null;
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const computed = window.getComputedStyle(el);
    style = {
      color: computed.color || "",
      fontFamily: computed.fontFamily || "",
      fontSize: computed.fontSize || "",
      fontWeight: computed.fontWeight || "",
      lineHeight: computed.lineHeight || "",
    };
  }
  return {
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
    color: style?.color || "",
    fontFamily: style?.fontFamily || "",
    fontSize: style?.fontSize || "",
    fontWeight: style?.fontWeight || "",
    lineHeight: style?.lineHeight || "",
  };
}

function extractSharedElements(rootNode, explicitShared = {}) {
  const shared = {
    title: null,
    meta: null,
    marker: null,
  };

  // 1. Shared Title extraction
  const titleTarget = explicitShared.title;
  const titleEl = resolveElement(titleTarget, rootNode, ".nb-lead, [data-morph-title]");
  if (titleEl) {
    shared.title = extractElementSnapshot(titleEl);
  }

  // 2. Shared Meta/Time extraction
  const metaTarget = explicitShared.meta;
  const metaEl = resolveElement(metaTarget, rootNode, ".nb-task-time, .nb-event-time, [data-morph-meta]");
  if (metaEl) {
    shared.meta = extractElementSnapshot(metaEl);
  }

  // 3. Shared Marker/Progress extraction
  const markerTarget = explicitShared.marker;
  const markerEl = resolveElement(markerTarget, rootNode, '[data-test="timeline-action-progress"], [data-morph-marker]');
  if (markerEl && isElementConnected(markerEl)) {
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
    if (!isElementConnected(node)) {
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

    if (!isElementConnected(node)) {
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
    let color = "";
    let borderColor = "";

    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      const computed = window.getComputedStyle(node);
      borderRadius = parseFloat(computed.borderRadius) || 0;
      backgroundColor = computed.backgroundColor || "";
      color = computed.color || "";
      borderColor = computed.borderColor || "";
    }

    const viewport = {
      width: typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 1280,
      height: typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 800,
    };

    const shared = extractSharedElements(node, explicitShared);
    const capturedAt = Date.now();

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
      radius: borderRadius,
      borderRadius,
      paint: {
        background: backgroundColor,
        color,
        borderColor,
      },
      backgroundColor,
      viewport,
      meta: { ...meta },
      shared,
      capturedAt,
      isConnected: true,
      timestamp: capturedAt,
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
