/**
 * Calendar Master — MorphRegistry
 *
 * Central registry for semantic motion sources and destinations.
 * Captures live geometry, typography snapshots, and visual markers for
 * physical morphing transitions without triggering React re-renders.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §6
 */

export function createMorphRegistry() {
  const entries = new Map();

  /**
   * Registers a DOM node with a semantic morph key.
   *
   * @param {Object} params
   * @param {string} params.key - Unique semantic morph key (e.g. from morphKeys.js)
   * @param {HTMLElement} params.node - Real DOM element
   * @param {string} [params.kind] - "event" | "task" | "note" | "slot" | "control"
   * @param {string} [params.role] - "source" | "destination" | "both"
   * @param {Object} [params.meta] - Arbitrary semantic metadata (e.g. title, startMinute, color)
   * @param {Function} [params.getSnapshot] - Custom geometry/data extractor
   * @returns {Function} cleanup function that unregisters this exact node
   */
  function registerMorphNode({
    key,
    node,
    kind = "event",
    role = "source",
    meta = {},
    getSnapshot,
  }) {
    if (!key || typeof key !== "string") {
      throw new Error("registerMorphNode requires a non-empty string key");
    }
    if (!node || !(node instanceof (typeof HTMLElement !== "undefined" ? HTMLElement : Object))) {
      throw new Error("registerMorphNode requires a valid DOM node");
    }

    const entry = {
      key,
      node,
      kind,
      role,
      meta,
      getSnapshot,
      registeredAt: Date.now(),
    };

    entries.set(key, entry);

    return () => {
      unregisterMorphNode(key, node);
    };
  }

  /**
   * Unregisters a morph node, but ONLY if the currently registered node matches `node`.
   * Protects against React 19 StrictMode / rapid mount-unmount races.
   */
  function unregisterMorphNode(key, node) {
    if (!key || !node) return;
    const existing = entries.get(key);
    if (existing && existing.node === node) {
      entries.delete(key);
    }
  }

  /**
   * Captures an immutable geometry and typography snapshot for a registered key.
   *
   * @param {string} key
   * @returns {Object|null} snapshot or null if unregistered/disconnected
   */
  function getMorphSnapshot(key) {
    if (!key) return null;
    const entry = entries.get(key);
    if (!entry || !entry.node) return null;

    const { node, meta, getSnapshot } = entry;

    // Disconnected nodes cannot yield valid viewport coordinates
    if (typeof document !== "undefined" && !document.body.contains(node)) {
      return null;
    }

    if (typeof getSnapshot === "function") {
      return getSnapshot(node, meta);
    }

    const rect = node.getBoundingClientRect();
    let computed = null;
    let borderRadius = 0;
    let backgroundColor = "";

    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      computed = window.getComputedStyle(node);
      borderRadius = parseFloat(computed.borderRadius) || 0;
      backgroundColor = computed.backgroundColor || "";
    }

    return {
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
      isConnected: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Returns all active registered keys.
   */
  function getRegisteredKeys() {
    return Array.from(entries.keys());
  }

  /**
   * Clears the registry (useful for test resets).
   */
  function clear() {
    entries.clear();
  }

  return {
    registerMorphNode,
    unregisterMorphNode,
    getMorphSnapshot,
    getRegisteredKeys,
    clear,
  };
}

// Global default instance
export const morphRegistry = createMorphRegistry();
