/**
 * Calendar Master — Morph Source & Destination Hooks
 *
 * Provides lightweight, zero-overhead React hooks to register DOM nodes
 * with MorphRegistry. Does not touch pointer/touch event handlers.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §6
 */

import { useEffect, useRef, useCallback } from "react";
import { morphRegistry } from "./morphRegistry.js";

/**
 * Registers a DOM node as a physical morph source.
 *
 * @param {Object} options
 * @param {string} options.key - Unique semantic morph key (e.g. from morphKeys.js)
 * @param {string} [options.kind="event"] - "event" | "task" | "note" | "slot" | "control"
 * @param {Object} [options.meta] - Semantic metadata (title, startMinute, color, etc.)
 * @param {boolean} [options.enabled=true] - Whether registration is active
 * @param {Function} [options.getSnapshot] - Custom geometry extractor
 * @returns {Function} ref callback to attach to the source DOM element
 */
export function useMorphSource({
  key,
  kind = "event",
  meta,
  enabled = true,
  getSnapshot,
} = {}) {
  const nodeRef = useRef(null);
  const cleanupRef = useRef(null);

  const register = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    nodeRef.current = node;

    if (node && key && enabled) {
      cleanupRef.current = morphRegistry.registerMorphNode({
        key,
        node,
        kind,
        role: "source",
        meta,
        getSnapshot,
      });
    }
  }, [key, kind, meta, enabled, getSnapshot]);

  // Handle updates to key/meta/enabled while node is mounted
  useEffect(() => {
    if (nodeRef.current && key && enabled) {
      if (cleanupRef.current) cleanupRef.current();
      cleanupRef.current = morphRegistry.registerMorphNode({
        key,
        node: nodeRef.current,
        kind,
        role: "source",
        meta,
        getSnapshot,
      });
    } else if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [key, kind, meta, enabled, getSnapshot]);

  return register;
}

/**
 * Registers a DOM node as a physical morph destination.
 */
export function useMorphDestination({
  key,
  kind = "event",
  meta,
  enabled = true,
} = {}) {
  const nodeRef = useRef(null);
  const cleanupRef = useRef(null);

  const register = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    nodeRef.current = node;

    if (node && key && enabled) {
      cleanupRef.current = morphRegistry.registerMorphNode({
        key,
        node,
        kind,
        role: "destination",
        meta,
      });
    }
  }, [key, kind, meta, enabled]);

  useEffect(() => {
    if (nodeRef.current && key && enabled) {
      if (cleanupRef.current) cleanupRef.current();
      cleanupRef.current = morphRegistry.registerMorphNode({
        key,
        node: nodeRef.current,
        kind,
        role: "destination",
        meta,
      });
    } else if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [key, kind, meta, enabled]);

  return register;
}
