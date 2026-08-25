/**
 * Calendar Master — PlannerSurfaceHost
 *
 * Coordinates physical morph surfaces, overlay transactions, and spatial handshakes.
 *
 * Grounding: docs/plans/2026-08-25-002-physical-planner-motion-ard.md §4, §7
 */

import React, { useMemo, useEffect, useRef } from "react";
import { morphRegistry } from "../motion/morphRegistry.js";
import { MORPH_TIMING, MORPH_EASING } from "../motion/morphTokens.js";
import { createMorphTransaction, MORPH_STATES } from "../motion/morphTransaction.js";
import { useMorphDestination } from "../motion/useMorphSource.js";

export default function PlannerSurfaceHost({
  activeKey = null,
  surfaceKind = "event",
  surfaceMeta = {},
  isOpen = false,
  onClose,
  children,
}) {
  const txRef = useRef(null);
  if (!txRef.current) {
    txRef.current = createMorphTransaction();
  }

  const destRef = useMorphDestination({
    key: activeKey,
    kind: surfaceKind,
    meta: surfaceMeta,
    enabled: isOpen,
  });

  useEffect(() => {
    if (isOpen && activeKey) {
      const source = morphRegistry.getMorphSnapshot(activeKey);
      const runId = txRef.current.startOpen({ key: activeKey, source });
      const timer = setTimeout(() => {
        txRef.current.settleOpen(runId);
      }, MORPH_TIMING.OBJECT_OPEN_MS);
      return () => clearTimeout(timer);
    } else if (!isOpen && txRef.current.getState() !== MORPH_STATES.IDLE) {
      const runId = txRef.current.getRunId();
      txRef.current.startClose({ runId });
      const timer = setTimeout(() => {
        txRef.current.settleClose(runId);
      }, MORPH_TIMING.OBJECT_CLOSE_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeKey]);

  return (
    <div
      ref={destRef}
      data-planner-surface-host="true"
      data-surface-kind={surfaceKind}
      data-surface-open={isOpen ? "true" : "false"}
      style={{ pointerEvents: isOpen ? "auto" : "none" }}
    >
      {children}
    </div>
  );
}
