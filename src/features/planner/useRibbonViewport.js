import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  RIBBON_EDGE_BUFFER_DAYS,
  RIBBON_FALLBACK_CELL_WIDTH,
  RIBBON_MAX_POSITION_RETRIES,
  RIBBON_POSITION_STATES,
  RIBBON_RADIUS_DAYS,
  RIBBON_RENDER_BUFFER_DAYS,
  RIBBON_RENDER_WINDOW_DAYS,
  RIBBON_SHIFT_DAYS,
  nextRibbonRetry,
  ribbonIntersection,
  ribbonKeyboardAnchorIndex,
  ribbonLogicalCenter,
  ribbonRevealTarget,
  ribbonScrollLeftForLogicalCenter,
} from "./ribbonViewport.js";
import { addDaysToKey, diffDays } from "../../shared/time/dateKey.js";

const RIBBON_SMOOTH_RELEASE_MS = 600;
const GEOMETRY_RETRY_REASONS = new Set([
  "nonzero-resize",
  "visibility-restored",
  "fonts-ready",
]);

/* Owns only the ribbon viewport lifecycle. Planner still owns dates and the
 * virtual range; this hook owns the DOM transaction that makes the selected
 * cell visible inside that range. */
export default function useRibbonViewport({
  enabled,
  ready,
  mounted,
  selectedDateKey,
  zoom,
  viewMode,
  ribbonRange,
  ribbonSpan,
  ribbonWindowStart,
  setRibbonWindowStart,
  setRibbonRange,
}) {
  const stripRef = useRef(null);
  const activeRef = useRef(null);
  const ribbonNodeRef = useRef(null);
  const ribbonWindowStartRef = useRef(ribbonWindowStart);
  const ribbonShiftPendingRef = useRef(false);
  const ribbonScrollAnchorRef = useRef(null);
  const ribbonCenterPendingRef = useRef(false);
  const ribbonVirtualWindowLockRef = useRef(false);
  const ribbonScrollLockRef = useRef(null);
  const ribbonLogicalCenterRef = useRef(null);
  const ribbonPositionRunRef = useRef(0);
  const ribbonPositionedDateRef = useRef(null);
  const ribbonPositionRequestRef = useRef(null);
  const ribbonPositionAttemptFrameRef = useRef(null);
  const ribbonPositionRetryTimerRef = useRef(null);
  const ribbonPositionStateRef = useRef({ status: RIBBON_POSITION_STATES.idle, run: 0, retries: 0, reason: null });
  const ribbonRetryPositionRef = useRef(null);
  const [ribbonNode, setRibbonNode] = useState(null);
  const [ribbonActiveNode, setRibbonActiveNode] = useState(null);
  const [positionState, setPositionState] = useState(ribbonPositionStateRef.current);
  const [edges, setEdges] = useState({ start: false, end: false });
  /* Seeded synchronously rather than left null until the first effect runs: the
     contract is that a rendered ribbon always owns exactly one tab stop, and an
     anchor that arrives after paint makes that true by timing instead of by
     construction. Every input here is a prop, so no measurement is needed —
     `logicalCenter` is null on a cold mount and the helper falls back to the
     rendered middle, which the selected day supersedes as soon as it is in
     range. */
  const [keyboardAnchorIndex, setKeyboardAnchorIndex] = useState(() => ribbonKeyboardAnchorIndex({
    selectedIndex: diffDays(selectedDateKey, ribbonRange.startKey),
    windowStart: ribbonWindowStart,
    windowLength: Math.min(RIBBON_RENDER_WINDOW_DAYS, Math.max(0, ribbonSpan - ribbonWindowStart)),
    logicalCenter: null,
  }));

  const rememberLogicalCenter = useCallback((strip = stripRef.current) => {
    if (!strip || strip.clientWidth <= 0) return ribbonLogicalCenterRef.current;
    const cell = strip.querySelector("[data-day]");
    const cellWidth = cell?.getBoundingClientRect?.().width || cell?.offsetWidth || 0;
    const logicalCenter = ribbonLogicalCenter({
      scrollLeft: strip.scrollLeft,
      clientWidth: strip.clientWidth,
      cellWidth,
    });
    if (logicalCenter != null) ribbonLogicalCenterRef.current = logicalCenter;
    return logicalCenter;
  }, []);

  /* The ribbon's one keyboard entry point, derived from the centre this hook
     already remembers. Kept as state because the tab stop is rendered by
     Planner and has to move when a browse carries the window off the
     selection; it changes at most once per browse, not per scroll event. */
  const syncKeyboardAnchor = useCallback(() => {
    const windowStart = ribbonWindowStartRef.current;
    const windowLength = Math.min(RIBBON_RENDER_WINDOW_DAYS, Math.max(0, ribbonSpan - windowStart));
    const next = ribbonKeyboardAnchorIndex({
      selectedIndex: diffDays(selectedDateKey, ribbonRange.startKey),
      windowStart,
      windowLength,
      logicalCenter: ribbonLogicalCenterRef.current,
    });
    setKeyboardAnchorIndex((current) => (current === next ? current : next));
  }, [ribbonRange.startKey, ribbonSpan, selectedDateKey]);

  const cancelScrollLock = useCallback(() => {
    const lock = ribbonScrollLockRef.current;
    if (!lock) return;
    if (lock.fallbackFirst != null) cancelAnimationFrame(lock.fallbackFirst);
    if (lock.fallbackSecond != null) cancelAnimationFrame(lock.fallbackSecond);
    if (lock.fallbackTimer != null) clearTimeout(lock.fallbackTimer);
    ribbonScrollLockRef.current = null;
  }, []);

  useEffect(() => {
    ribbonWindowStartRef.current = ribbonWindowStart;
  }, [ribbonWindowStart]);

  const updatePositionState = useCallback((next) => {
    const current = ribbonPositionStateRef.current;
    const value = typeof next === "function" ? next(current) : next;
    if (!value || (value.status === current.status && value.run === current.run
      && value.retries === current.retries && value.reason === current.reason)) return;
    ribbonPositionStateRef.current = value;
    setPositionState(value);
  }, []);

  const measureEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
    setEdges((current) => {
      const next = { start: strip.scrollLeft > 2, end: max > 2 && strip.scrollLeft < max - 2 };
      return current.start === next.start && current.end === next.end ? current : next;
    });
  }, []);

  const releaseScroll = useCallback((run) => {
    const lock = ribbonScrollLockRef.current;
    if (!lock || lock.run !== run) return;
    const preserveLogicalCenter = lock.preserveLogicalCenter === true;
    cancelScrollLock();
    const result = ribbonIntersection(stripRef.current, activeRef.current);
    if (result.ok || preserveLogicalCenter) {
      rememberLogicalCenter();
      updatePositionState((current) => current.run === run
        ? { ...current, status: RIBBON_POSITION_STATES.settled, reason: "scroll-settled" }
        : current);
      return;
    }
    ribbonRetryPositionRef.current?.("post-scroll-intersection", { run });
  }, [cancelScrollLock, rememberLogicalCenter, updatePositionState]);

  const attachRibbon = useCallback((node) => {
    stripRef.current = node;
    if (ribbonNodeRef.current === node) return;
    cancelScrollLock();
    ribbonNodeRef.current = node;
    setRibbonNode(node);
    ribbonPositionRequestRef.current = null;
    const idle = { status: RIBBON_POSITION_STATES.idle, run: ribbonPositionRunRef.current, retries: 0, reason: "node-remount" };
    ribbonPositionStateRef.current = idle;
    setPositionState(idle);
    setEdges({ start: false, end: false });
  }, [cancelScrollLock]);

  const attachActiveRibbon = useCallback((node) => {
    activeRef.current = node;
    setRibbonActiveNode(node);
  }, []);

  const reveal = useCallback((behavior = "auto", center = false, run = null) => {
    const strip = stripRef.current;
    const cell = activeRef.current;
    const request = ribbonPositionRequestRef.current;
    const preserveLogicalCenter = request?.preserveLogicalCenter === true
      && ribbonLogicalCenterRef.current != null;
    if (run != null && (!request || request.run !== run)) return { status: "stale-run", run };
    if (!strip || strip.isConnected === false
      || (!cell && !preserveLogicalCenter)
      || (cell && cell.isConnected === false)) return { status: "missing-node", run };
    let target;
    if (preserveLogicalCenter) {
      const firstCell = strip.querySelector("[data-day]");
      const cellWidth = firstCell?.getBoundingClientRect?.().width || firstCell?.offsetWidth || 0;
      const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const logicalTarget = ribbonScrollLeftForLogicalCenter({
        logicalCenter: ribbonLogicalCenterRef.current,
        clientWidth: strip.clientWidth,
        cellWidth,
        maxScrollLeft,
      });
      if (logicalTarget == null) {
        updatePositionState((current) => current.run === run
          ? { ...current, status: RIBBON_POSITION_STATES.blockedZeroWidth, reason: "logical-center-unavailable" }
          : current);
        return { status: RIBBON_POSITION_STATES.blockedZeroWidth, target: null, changed: false, run };
      }
      const current = Number(strip.scrollLeft) || 0;
      target = {
        status: "outside-viewport",
        ok: true,
        target: logicalTarget,
        changed: Math.abs(logicalTarget - current) >= 1,
      };
    } else {
      target = ribbonRevealTarget(strip, cell, { center, inset: 24 });
    }
    if (target.status === "blocked-zero-width" || target.status === "missing-node") {
      updatePositionState((current) => current.run === run
        ? { ...current, status: target.status, reason: "zero-width-or-disconnected" }
        : current);
      return { ...target, run };
    }
    if (!target.changed && (target.ok || preserveLogicalCenter)) {
      updatePositionState((current) => current.run === run
        ? { ...current, status: RIBBON_POSITION_STATES.settled, reason: "intersection-confirmed" }
        : current);
      return { ...target, status: RIBBON_POSITION_STATES.settled, run };
    }
    if (!target.changed) {
      updatePositionState((current) => current.run === run
        ? { ...current, status: RIBBON_POSITION_STATES.blockedZeroWidth, reason: "cell-cannot-fit" }
        : current);
      return { ...target, status: RIBBON_POSITION_STATES.blockedZeroWidth, run };
    }
    const previous = ribbonPositionStateRef.current;
    const existingLock = ribbonScrollLockRef.current;
    if (existingLock && existingLock.run === run) return { ...target, status: RIBBON_POSITION_STATES.positioning, run };
    const lock = {
      run,
      supportsScrollEnd: "onscrollend" in strip,
      preserveLogicalCenter,
      fallbackFirst: null,
      fallbackSecond: null,
      fallbackTimer: null,
    };
    ribbonScrollLockRef.current = lock;
    updatePositionState((current) => current.run === run
      ? { ...current, status: RIBBON_POSITION_STATES.positioning, reason: "programmatic-scroll" }
      : current);
    const scrollBehavior = behavior === "smooth" && previous.status === RIBBON_POSITION_STATES.settled ? "smooth" : "auto";
    if (typeof strip.scrollTo === "function") strip.scrollTo({ left: target.target, behavior: scrollBehavior });
    else strip.scrollLeft = target.target;
    if (scrollBehavior === "smooth") {
      lock.fallbackTimer = setTimeout(() => releaseScroll(run), RIBBON_SMOOTH_RELEASE_MS);
    } else {
      lock.fallbackFirst = requestAnimationFrame(() => {
        lock.fallbackSecond = requestAnimationFrame(() => releaseScroll(run));
      });
    }
    return { ...target, status: RIBBON_POSITION_STATES.positioning, run };
  }, [releaseScroll, updatePositionState]);

  const runAttempt = useCallback(() => {
    const request = ribbonPositionRequestRef.current;
    if (!request) return;
    const result = reveal(request.behavior, request.center, request.run);
    if (result.status === "missing-node") {
      updatePositionState((current) => current.run === request.run
        ? { ...current, status: RIBBON_POSITION_STATES.blockedZeroWidth, reason: request.reason }
        : current);
    }
  }, [reveal, updatePositionState]);

  const scheduleAttempt = useCallback(() => {
    if (ribbonPositionAttemptFrameRef.current != null || !ribbonPositionRequestRef.current) return;
    ribbonPositionAttemptFrameRef.current = requestAnimationFrame(() => {
      ribbonPositionAttemptFrameRef.current = null;
      runAttempt();
    });
  }, [runAttempt]);

  const beginPosition = useCallback((reason, {
    center = false,
    behavior = "auto",
    preserveLogicalCenter = false,
  } = {}) => {
    cancelScrollLock();
    const run = ribbonPositionRunRef.current + 1;
    ribbonPositionRunRef.current = run;
    ribbonPositionRequestRef.current = {
      run,
      retries: 0,
      center,
      behavior,
      preserveLogicalCenter,
      reason,
    };
    updatePositionState({ status: RIBBON_POSITION_STATES.positioning, run, retries: 0, reason });
    scheduleAttempt();
    return run;
  }, [cancelScrollLock, scheduleAttempt, updatePositionState]);

  const retryPosition = useCallback((reason, { run = null, center = null } = {}) => {
    const current = ribbonPositionRequestRef.current;
    if (run != null && (!current || current.run !== run)) return;
    if (!current) {
      beginPosition(reason, { center: center ?? true, behavior: "auto" });
      return;
    }
    if (ribbonPositionStateRef.current.run === current.run
      && ribbonPositionStateRef.current.status === RIBBON_POSITION_STATES.settled) {
      if (!GEOMETRY_RETRY_REASONS.has(reason) || ribbonLogicalCenterRef.current == null) return;
      beginPosition(reason, {
        center: false,
        behavior: "auto",
        preserveLogicalCenter: true,
      });
      return;
    }
    const retries = nextRibbonRetry(current.retries, RIBBON_MAX_POSITION_RETRIES);
    if (retries == null) {
      updatePositionState((value) => value.run === current.run
        ? { ...value, status: RIBBON_POSITION_STATES.blockedZeroWidth, reason: `retry-limit:${reason}` }
        : value);
      return;
    }
    ribbonPositionRequestRef.current = {
      ...current,
      retries,
      center: center == null ? current.center : center,
      behavior: "auto",
      preserveLogicalCenter: current.preserveLogicalCenter === true,
      reason,
    };
    updatePositionState((value) => value.run === current.run
      ? { ...value, status: RIBBON_POSITION_STATES.positioning, retries, reason }
      : value);
    clearTimeout(ribbonPositionRetryTimerRef.current);
    ribbonPositionRetryTimerRef.current = setTimeout(scheduleAttempt, 0);
  }, [beginPosition, scheduleAttempt, updatePositionState]);
  ribbonRetryPositionRef.current = retryPosition;

  const setWindow = useCallback((next) => {
    const proposed = typeof next === "function" ? next(ribbonWindowStartRef.current) : next;
    const clamped = Math.max(0, Math.min(ribbonSpan - RIBBON_RENDER_WINDOW_DAYS, Math.round(proposed)));
    if (clamped === ribbonWindowStartRef.current) return;
    ribbonVirtualWindowLockRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ribbonVirtualWindowLockRef.current = false;
      rememberLogicalCenter();
    }));
    ribbonWindowStartRef.current = clamped;
    setRibbonWindowStart(clamped);
  }, [rememberLogicalCenter, ribbonSpan, setRibbonWindowStart]);

  const shift = useCallback((direction) => {
    if (ribbonShiftPendingRef.current) return;
    const strip = stripRef.current;
    const cell = strip?.querySelector("[data-day]");
    const width = cell?.getBoundingClientRect().width || RIBBON_FALLBACK_CELL_WIDTH;
    const signedDays = direction === "before" ? -RIBBON_SHIFT_DAYS : RIBBON_SHIFT_DAYS;
    ribbonShiftPendingRef.current = true;
    ribbonScrollAnchorRef.current = direction === "before"
      ? width * RIBBON_SHIFT_DAYS
      : -width * RIBBON_SHIFT_DAYS;
    setWindow((current) => current + (direction === "before" ? RIBBON_SHIFT_DAYS : -RIBBON_SHIFT_DAYS));
    setRibbonRange((current) => ({
      startKey: addDaysToKey(current.startKey, signedDays),
      endKey: addDaysToKey(current.endKey, signedDays),
    }));
  }, [setRibbonRange, setWindow]);

  const onScroll = useCallback(() => {
    const strip = stripRef.current;
    measureEdges();
    if (!strip || ribbonShiftPendingRef.current || ribbonScrollLockRef.current || ribbonVirtualWindowLockRef.current) return;
    rememberLogicalCenter(strip);
    syncKeyboardAnchor();
    const cell = strip.querySelector("[data-day]");
    const width = cell?.getBoundingClientRect().width || RIBBON_FALLBACK_CELL_WIDTH;
    const edge = Math.max(160, width * RIBBON_EDGE_BUFFER_DAYS);
    if (strip.scrollLeft <= edge) { shift("before"); return; }
    if (strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - edge) { shift("after"); return; }
    setWindow(Math.floor(strip.scrollLeft / width) - RIBBON_RENDER_BUFFER_DAYS);
  }, [measureEdges, rememberLogicalCenter, setWindow, shift, syncKeyboardAnchor]);

  const ensureDateVisible = useCallback((key) => {
    if (!enabled || (zoom !== "week" && zoom !== "day")) return;
    if (key < ribbonRange.startKey || key >= ribbonRange.endKey) {
      ribbonCenterPendingRef.current = true;
      setWindow(RIBBON_RADIUS_DAYS - RIBBON_RENDER_BUFFER_DAYS);
      return;
    }
    const index = diffDays(key, ribbonRange.startKey);
    const windowEnd = Math.min(ribbonSpan, ribbonWindowStartRef.current + RIBBON_RENDER_WINDOW_DAYS);
    if (index < ribbonWindowStartRef.current || index >= windowEnd) {
      ribbonCenterPendingRef.current = true;
      setWindow(index - RIBBON_RENDER_BUFFER_DAYS);
    }
  }, [enabled, ribbonRange.endKey, ribbonRange.startKey, ribbonSpan, setWindow, zoom]);

  useLayoutEffect(() => {
    const anchor = ribbonScrollAnchorRef.current;
    if (anchor == null || !stripRef.current) return;
    ribbonVirtualWindowLockRef.current = true;
    stripRef.current.scrollLeft = Math.max(0, stripRef.current.scrollLeft + anchor);
    ribbonScrollAnchorRef.current = null;
    ribbonShiftPendingRef.current = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ribbonVirtualWindowLockRef.current = false;
      rememberLogicalCenter();
    }));
  }, [rememberLogicalCenter, ribbonRange.startKey, ribbonRange.endKey]);

  useLayoutEffect(() => {
    if (!enabled || !ready || !ribbonNode) return;
    /* A missing active cell has two meanings: a fresh strip whose virtual
       window has not rendered the selected date yet, or a user scrolling the
       same strip far enough that selection leaves the 56-day window. Only the
       former has no position request yet and needs semantic-remount window
       preparation; the latter must remain a manual browse. */
    if (ribbonPositionRequestRef.current == null) ensureDateVisible(selectedDateKey);
    if (!ribbonActiveNode) return;
    /* Readiness is scoped to the mounted strip, not to whether the previous
       scroll transaction happened to emit `scrollend` yet. Chromium can omit
       that event for an instant `scrollTo`, leaving the state as positioning
       even though the selected cell is already painted. A following adjacent
       date must inherit the current scroll position, never mistake that stale
       state for first mount and recenter by one whole cell. A remounted strip
       has no request yet, so it still receives the initial placement policy. */
    const initial = ribbonPositionRequestRef.current == null;
    const selectedDateChanged = ribbonPositionedDateRef.current !== selectedDateKey;
    const centerForWindow = initial || ribbonCenterPendingRef.current;
    if (!initial && !selectedDateChanged && !ribbonCenterPendingRef.current) return;
    beginPosition("view-ready", {
      center: centerForWindow,
      behavior: centerForWindow ? "auto" : "smooth",
    });
    ribbonPositionedDateRef.current = selectedDateKey;
    ribbonCenterPendingRef.current = false;
  }, [beginPosition, enabled, ensureDateVisible, ready, ribbonActiveNode, ribbonNode, selectedDateKey]);

  useLayoutEffect(() => {
    if (!ribbonCenterPendingRef.current || !ribbonNode || !ribbonActiveNode) return;
    beginPosition("virtual-window-remount", { center: false, behavior: "auto" });
    ribbonCenterPendingRef.current = false;
  }, [beginPosition, mounted, ribbonActiveNode, ribbonNode, ribbonRange.endKey, ribbonRange.startKey, ribbonWindowStart]);

  useEffect(() => {
    if (!ribbonNode) return undefined;
    let live = true;
    const onScrollEnd = () => {
      const lock = ribbonScrollLockRef.current;
      if (lock) releaseScroll(lock.run);
    };
    const retryIfVisible = (reason) => {
      if (!live || document.visibilityState === "hidden") return;
      measureEdges();
      if (ribbonNode.clientWidth > 0) retryPosition(reason);
    };
    const onResize = () => retryIfVisible("nonzero-resize");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") retryIfVisible("visibility-restored");
    };
    ribbonNode.addEventListener("scrollend", onScrollEnd);
    ribbonNode.addEventListener("scroll", measureEdges, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
    observer?.observe(ribbonNode);
    measureEdges();
    const fontPromise = document.fonts?.ready
      ? document.fonts.ready.then(() => retryIfVisible("fonts-ready")).catch(() => {})
      : null;
    return () => {
      live = false;
      cancelScrollLock();
      if (ribbonPositionAttemptFrameRef.current != null) {
        cancelAnimationFrame(ribbonPositionAttemptFrameRef.current);
        ribbonPositionAttemptFrameRef.current = null;
      }
      clearTimeout(ribbonPositionRetryTimerRef.current);
      ribbonNode.removeEventListener("scrollend", onScrollEnd);
      ribbonNode.removeEventListener("scroll", measureEdges);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
      void fontPromise;
    };
  }, [cancelScrollLock, measureEdges, releaseScroll, retryPosition, ribbonNode]);

  useEffect(syncKeyboardAnchor, [syncKeyboardAnchor, ribbonWindowStart, ribbonNode]);

  return {
    attachRibbon,
    attachActiveRibbon,
    onScroll,
    edges,
    keyboardAnchorIndex,
    positionState,
    setWindow,
    ensureDateVisible,
  };
}
