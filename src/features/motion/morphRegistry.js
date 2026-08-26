/**
 * Calendar Master — MorphRegistry
 *
 * Role-aware spatial registry for physical morph transitions.
 * Coexists source and destination nodes under the same semantic key,
 * extracts first-class shared element snapshots (data-morph-title, data-morph-meta, data-morph-marker),
 * deep-freezes immutable geometry snapshots, and supports non-destructive snapshot releases.
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
  return Object.freeze({
    text,
    rect: Object.freeze({
      x: rect.x,
      y: rect.y,
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }),
    style: style ? Object.freeze({ ...style }) : null,
    color: style?.color || "",
    fontFamily: style?.fontFamily || "",
    fontSize: style?.fontSize || "",
    fontWeight: style?.fontWeight || "",
    lineHeight: style?.lineHeight || "",
  });
}

function extractSharedElements(rootNode, explicitShared = {}) {
  const shared = {
    title: null,
    meta: null,
    marker: null,
  };

  // 1. Shared Title extraction (via explicit ref or generic [data-morph-title])
  const titleTarget = explicitShared.title;
  const titleEl = resolveElement(titleTarget, rootNode, "[data-morph-title]");
  if (titleEl) {
    shared.title = extractElementSnapshot(titleEl);
  }

  // 2. Shared Meta/Time extraction (via explicit ref or generic [data-morph-meta])
  const metaTarget = explicitShared.meta;
  const metaEl = resolveElement(metaTarget, rootNode, "[data-morph-meta]");
  if (metaEl) {
    shared.meta = extractElementSnapshot(metaEl);
  }

  // 3. Shared Marker/Progress extraction (via explicit ref or generic [data-morph-marker])
  const markerTarget = explicitShared.marker;
  const markerEl = resolveElement(markerTarget, rootNode, "[data-morph-marker]");
  if (markerEl && isElementConnected(markerEl)) {
    const rect = markerEl.getBoundingClientRect();
    const type = markerEl.getAttribute?.("data-morph-marker") || "marker";
    shared.marker = Object.freeze({
      type,
      rect: Object.freeze({
        x: rect.x,
        y: rect.y,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }),
      style: null,
    });
  }

  return Object.freeze(shared);
}

function deepFreezeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  Object.freeze(snapshot);
  if (snapshot.rect) Object.freeze(snapshot.rect);
  if (snapshot.paint) Object.freeze(snapshot.paint);
  if (snapshot.viewport) Object.freeze(snapshot.viewport);
  if (snapshot.meta) Object.freeze(snapshot.meta);
  if (snapshot.shared) {
    Object.freeze(snapshot.shared);
    if (snapshot.shared.title) {
      Object.freeze(snapshot.shared.title);
      if (snapshot.shared.title.rect) Object.freeze(snapshot.shared.title.rect);
      if (snapshot.shared.title.style) Object.freeze(snapshot.shared.title.style);
    }
    if (snapshot.shared.meta) {
      Object.freeze(snapshot.shared.meta);
      if (snapshot.shared.meta.rect) Object.freeze(snapshot.shared.meta.rect);
      if (snapshot.shared.meta.style) Object.freeze(snapshot.shared.meta.style);
    }
    if (snapshot.shared.marker) {
      Object.freeze(snapshot.shared.marker);
      if (snapshot.shared.marker.rect) Object.freeze(snapshot.shared.marker.rect);
    }
  }
  return snapshot;
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
      throw new Error(`registerMorphNode: role must be "source" or "destination", received "${role}"`);
    }

    const rec = getRecord(key, true);
    const entry = {
      key,
      node,
      kind,
      role,
      meta: { ...meta },
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

    // If completely empty of both live and snapshots, prune the map entry
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
      const snap = deepFreezeSnapshot(getSnapshot(node, meta));
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

    const snapshot = deepFreezeSnapshot({
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
    });

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

  /**
   * Releases historical snapshots for a key while preserving live source and destination nodes.
   * Prunes map entry only when neither live nodes nor snapshots remain.
   */
  function releaseMorphSnapshots(key, role) {
    if (!key) return;
    const rec = getRecord(key, false);
    if (!rec) return;

    if (role === "source") {
      rec.lastSourceSnapshot = null;
    } else if (role === "destination") {
      rec.lastDestinationSnapshot = null;
    } else {
      rec.lastSourceSnapshot = null;
      rec.lastDestinationSnapshot = null;
    }

    if (!rec.source && !rec.destination && !rec.lastSourceSnapshot && !rec.lastDestinationSnapshot) {
      records.delete(key);
    }
  }

  /**
   * Non-destructive alias for releaseMorphSnapshots (preserves mounted live DOM nodes).
   */
  function releaseMorphKey(key) {
    releaseMorphSnapshots(key);
  }

  /**
   * Hard administrative deletion of key and all associated nodes and snapshots.
   */
  function deleteMorphKey(key) {
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
    releaseMorphSnapshots,
    releaseMorphKey,
    deleteMorphKey,
    getRegisteredKeys,
    clear,
  };
}

// Global default instance
export const morphRegistry = createMorphRegistry();
