/**
 * Calendar Master — Morph Source & Destination Hooks
 *
 * Provides lightweight, zero-overhead React hooks to register DOM nodes
 * with MorphRegistry.
 *
 * Guarantees:
 * - Registration-only (zero pointer handlers, zero focus/click mutations).
 * - Stable callback ref across renders.
 * - In-place metadata updates without unregister/re-register churn.
 * - Zero measuring during regular renders (measurement occurs at transaction boundaries).
 * - React 19 StrictMode resilience.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §6
 */

import { useEffect, useRef, useCallback } from "react";
import { morphRegistry } from "./morphRegistry.js";

/**
 * Registers a DOM node as a physical morph source.
 */
export function useMorphSource({
  key,
  kind = "event",
  meta,
  shared,
  enabled = true,
  getSnapshot,
} = {}) {
  const nodeRef = useRef(null);
  const cleanupRef = useRef(null);
  const registeredKeyRef = useRef(null);

  // Keep latest mutable inputs in refs to prevent dependency churn
  const keyRef = useRef(key);
  keyRef.current = key;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  // Stable callback ref
  const setRef = useCallback((node) => {
    if (nodeRef.current === node) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      registeredKeyRef.current = null;
    }

    nodeRef.current = node;

    if (node && keyRef.current && enabledRef.current) {
      registeredKeyRef.current = keyRef.current;
      cleanupRef.current = morphRegistry.registerMorphNode({
        key: keyRef.current,
        node,
        kind: kindRef.current,
        role: "source",
        meta: metaRef.current,
        shared: sharedRef.current,
        getSnapshot: getSnapshotRef.current,
      });
    }
  }, []);

  // Update registry when identity (key / enabled / kind) or metadata changes
  useEffect(() => {
    const activeNode = nodeRef.current;
    if (!activeNode || !enabled || !key) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        registeredKeyRef.current = null;
      }
      return;
    }

    // If key changed or registration was missing, perform clean re-registration
    if (registeredKeyRef.current !== key || !cleanupRef.current) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      registeredKeyRef.current = key;
      cleanupRef.current = morphRegistry.registerMorphNode({
        key,
        node: activeNode,
        kind,
        role: "source",
        meta,
        shared,
        getSnapshot,
      });
    } else {
      // In-place metadata update without replacing the registry entry
      morphRegistry.updateMorphNode({
        key,
        node: activeNode,
        kind,
        role: "source",
        meta,
        shared,
        getSnapshot,
      });
    }
  }, [key, enabled, kind, meta, shared, getSnapshot]);

  // Clean unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        registeredKeyRef.current = null;
      }
    };
  }, []);

  return setRef;
}

/**
 * Registers a DOM node as a physical morph destination.
 */
export function useMorphDestination({
  key,
  kind = "event",
  meta,
  shared,
  enabled = true,
  getSnapshot,
} = {}) {
  const nodeRef = useRef(null);
  const cleanupRef = useRef(null);
  const registeredKeyRef = useRef(null);

  const keyRef = useRef(key);
  keyRef.current = key;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  const setRef = useCallback((node) => {
    if (nodeRef.current === node) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      registeredKeyRef.current = null;
    }

    nodeRef.current = node;

    if (node && keyRef.current && enabledRef.current) {
      registeredKeyRef.current = keyRef.current;
      cleanupRef.current = morphRegistry.registerMorphNode({
        key: keyRef.current,
        node,
        kind: kindRef.current,
        role: "destination",
        meta: metaRef.current,
        shared: sharedRef.current,
        getSnapshot: getSnapshotRef.current,
      });
    }
  }, []);

  useEffect(() => {
    const activeNode = nodeRef.current;
    if (!activeNode || !enabled || !key) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        registeredKeyRef.current = null;
      }
      return;
    }

    if (registeredKeyRef.current !== key || !cleanupRef.current) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      registeredKeyRef.current = key;
      cleanupRef.current = morphRegistry.registerMorphNode({
        key,
        node: activeNode,
        kind,
        role: "destination",
        meta,
        shared,
        getSnapshot,
      });
    } else {
      // In-place metadata update without replacing the registry entry
      morphRegistry.updateMorphNode({
        key,
        node: activeNode,
        kind,
        role: "destination",
        meta,
        shared,
        getSnapshot,
      });
    }
  }, [key, enabled, kind, meta, shared, getSnapshot]);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        registeredKeyRef.current = null;
      }
    };
  }, []);

  return setRef;
}
