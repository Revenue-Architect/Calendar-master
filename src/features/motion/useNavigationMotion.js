import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { navMobileMotion, navPageFit } from "./navPageFit.js";

const MOTION_MS = 520;
const CLOSED_PHASES = new Set(["closed", "closing"]);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/* This is the same deliberately quiet ease used by the static sheet rules. The
 * important detail here is not the particular curve, but that every moving
 * part is sampled from the same normalized progress value. CSS transitions
 * used to give the mask, carrier and drawer independent clocks, which is what
 * made the right edge appear late under load. */
function settleEase(value) {
  const t = clamp(value);
  return 1 - ((1 - t) ** 3);
}

function desktopViewport() {
  return typeof window === "undefined"
    || !window.matchMedia
    || !window.matchMedia("(max-width: 639.98px)").matches;
}

function matrixValue(value) {
  return Number(value.toFixed(3));
}

/**
 * Owns one reversible navigation run.
 *
 * Both desktop and mobile use a small requestAnimationFrame clock rather than
 * separate CSS transition lifecycles. The viewport mask, content carrier,
 * drawer, labels, and mobile rail all receive the same normalized progress, so
 * a reversal starts at the frame the user actually saw.
 */
export function useNavigationMotion({ reducedMotion = false } = {}) {
  const [phase, setPhase] = useState("closed");
  const [progress, setProgress] = useState(0);
  const [fit, setFit] = useState(() => navPageFit({
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1280,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 900,
  }));

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const progressRef = useRef(0);
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const desktopRef = useRef(desktopViewport());
  const fitRef = useRef(fit);
  const mountedRef = useRef(true);

  const runIdRef = useRef(0);
  const [runId, setRunId] = useState(0);
  const frameRef = useRef(null);
  const timerRef = useRef(null);

  const shellRef = useRef(null);
  const viewportRef = useRef(null);
  const carrierRef = useRef(null);
  const drawerRef = useRef(null);
  const toggleRef = useRef(null);
  const firstItemRef = useRef(null);
  const railRef = useRef(null);

  const updateProgressAttribute = useCallback((value) => {
    const shell = shellRef.current;
    if (shell) shell.dataset.navProgress = value.toFixed(2);
  }, []);

  const applyGeometryStyles = useCallback((targetFit) => {
    const shell = shellRef.current;
    if (!shell || !targetFit) return;
    shell.style.setProperty("--nav-frame-top", `${targetFit.frame.top}px`);
    shell.style.setProperty("--nav-frame-right", `${targetFit.frame.right}px`);
    shell.style.setProperty("--nav-frame-bottom", `${targetFit.frame.bottom}px`);
    shell.style.setProperty("--nav-frame-left", `${targetFit.frame.left}px`);
    shell.style.setProperty("--nav-carrier-x", `${targetFit.carrier.x}px`);
    shell.style.setProperty("--nav-carrier-y", `${targetFit.carrier.y}px`);
    shell.style.setProperty("--nav-page-x", `${targetFit.carrier.x}px`);
    shell.style.setProperty("--nav-page-y", `${targetFit.carrier.y}px`);
    shell.style.setProperty("--nav-clip-top", `${targetFit.clipTop}px`);
    shell.style.setProperty("--nav-clip-right", `${targetFit.clipRight}px`);
    shell.style.setProperty("--nav-clip-bottom", `${targetFit.clipBottom}px`);
    shell.style.setProperty("--nav-page-radius", `${targetFit.frame.radius}px`);
  }, []);

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const setPromotion = useCallback((active) => {
    const viewport = viewportRef.current;
    const carrier = carrierRef.current;
    const drawer = drawerRef.current;
    const rail = railRef.current;
    if (active) {
      viewport?.style.setProperty("will-change", "clip-path");
      viewport?.style.setProperty("contain", "layout paint");
      carrier?.style.setProperty("will-change", "transform");
      drawer?.style.setProperty("will-change", "transform");
      rail?.style.setProperty("will-change", "transform");
    } else {
      viewport?.style.removeProperty("will-change");
      viewport?.style.removeProperty("contain");
      carrier?.style.removeProperty("will-change");
      drawer?.style.removeProperty("will-change");
      rail?.style.removeProperty("will-change");
    }
  }, []);

  /* Apply one frame to every moving part. Desktop and mobile differ only in
     geometry; they never get separate clocks or CSS transition lifecycles. */
  const applyProgress = useCallback((rawProgress, targetFit) => {
    if (!targetFit) return;
    const p = clamp(rawProgress);
    const viewport = viewportRef.current;
    const carrier = carrierRef.current;
    const drawer = drawerRef.current;
    if (!viewport || !carrier || !drawer) return;

    viewport.style.transition = "none";
    carrier.style.transition = "none";
    drawer.style.transition = "none";
    if (desktopRef.current) {
      const frame = targetFit.frame;
      const carrierGeometry = targetFit.carrier;
      /* Every desktop edge is a direct viewport inset. In particular, the
       * right edge is never a cancellation of carrier travel and clipping. */
      viewport.style.clipPath = `inset(${matrixValue(frame.top * p)}px ${matrixValue(frame.right * p)}px ${matrixValue(frame.bottom * p)}px ${matrixValue(frame.left * p)}px round ${matrixValue(frame.radius * p)}px)`;
      carrier.style.transform = `translate3d(${matrixValue(carrierGeometry.x * p)}px, ${matrixValue(carrierGeometry.y * p)}px, 0)`;
    } else {
      const mobile = navMobileMotion({ progress: p, mobile: targetFit.mobile });
      viewport.style.clipPath = `inset(${matrixValue(mobile.frame.top)}px ${matrixValue(mobile.frame.right)}px ${matrixValue(mobile.frame.bottom)}px ${matrixValue(mobile.frame.left)}px round ${matrixValue(mobile.frame.radius)}px)`;
      carrier.style.transform = `translate3d(${matrixValue(mobile.carrier.x)}px, ${matrixValue(mobile.carrier.y)}px, 0)`;
      const rail = railRef.current;
      if (rail) {
        rail.style.transition = "none";
        rail.style.visibility = "visible";
        rail.style.transform = `translate3d(${matrixValue(mobile.rail.x)}px, 0, 0) rotate(180deg)`;
        /* Once more than two pixels are revealed the rail is a real action;
         * below that threshold it is clipped and cannot steal a pointer. */
        rail.style.pointerEvents = mobile.visibleRailWidth > 2 ? "auto" : "none";
      }
    }
    drawer.style.transform = `translate3d(${matrixValue(-36 * (1 - p))}%, 0, 0)`;

    const labels = drawer.querySelectorAll(".nb-nav-brand,.nb-nav-item,.nb-nav-membership");
    labels.forEach((label) => {
      const index = Number.parseFloat(label.style.getPropertyValue("--nav-index")) || 0;
      const delay = (index * 30) / MOTION_MS;
      const labelProgress = clamp((p - delay) / (1 - delay));
      label.style.transition = "none";
      label.style.transitionDelay = `${index * 30}ms`;
      label.style.opacity = `${matrixValue(labelProgress)}`;
      label.style.transform = `translate3d(${matrixValue(-14 * (1 - labelProgress))}px, 0, 0)`;
    });
    updateProgressAttribute(p);
  }, [updateProgressAttribute]);

  const restoreToggleFocus = useCallback((run) => {
    requestAnimationFrame(() => {
      if (runIdRef.current !== run || phaseRef.current !== "closed") return;
      toggleRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const settle = useCallback((run, target) => {
    if (!mountedRef.current || runIdRef.current !== run) return;
    const terminalPhase = target === 1 ? "open" : "closed";
    if (phaseRef.current !== "opening" && phaseRef.current !== "closing") return;
    cancelFrame();
    progressRef.current = target;
    applyProgress(target, fitRef.current);
    setPromotion(false);
    phaseRef.current = terminalPhase;
    setPhase(terminalPhase);
    setProgress(target);
    updateProgressAttribute(target);
    if (target === 1) {
      firstItemRef.current?.focus({ preventScroll: true });
    } else {
      restoreToggleFocus(run);
    }
  }, [applyProgress, cancelFrame, restoreToggleFocus, setPromotion, updateProgressAttribute]);

  const beginMotion = useCallback((target) => {
    const current = progressRef.current;
    if (target === 1 && phaseRef.current === "open") return;
    if (target === 0 && phaseRef.current === "closed") return;

    const run = runIdRef.current + 1;
    runIdRef.current = run;
    setRunId(run);
    cancelFrame();

    /* Opening snapshots geometry once. During a reversal the same snapshot is
       retained, preventing a resize from moving the destination underneath an
       active run. */
    if (target === 1) {
      const nextFit = navPageFit({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      fitRef.current = nextFit;
      setFit(nextFit);
      applyGeometryStyles(nextFit);
    }
    const targetFit = fitRef.current;
    const nextPhase = target === 1 ? "opening" : "closing";
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
    setProgress(current);
    updateProgressAttribute(current);

    if (reducedMotionRef.current) {
      progressRef.current = target;
      applyProgress(target, targetFit);
      phaseRef.current = target === 1 ? "open" : "closed";
      setPhase(phaseRef.current);
      setProgress(target);
      updateProgressAttribute(target);
      if (target === 1) firstItemRef.current?.focus({ preventScroll: true });
      else restoreToggleFocus(run);
      return;
    }

    setPromotion(true);
    /* Put the starting frame in the DOM before the first animation frame. This
       makes first-use paint deterministic even when Playwright or a busy main
       thread delays the click's next frame. */
    applyProgress(current, targetFit);
    const startedAt = performance.now();
    /* Keep one shared 520 ms clock even when reversing from an intermediate
       progress. Scaling duration by the remaining distance makes a reversal
       accelerate: an opening run interrupted near the middle would traverse
       its remaining geometry in a fraction of a frame budget, so the first
       reopening sample could jump away from the last closing sample. The
       normalized progress still starts at the exact current frame; only the
       shared clock remains constant. */
    const duration = MOTION_MS;
    const tick = (now) => {
      if (!mountedRef.current || runIdRef.current !== run) return;
      const elapsed = clamp((now - startedAt) / duration);
      const eased = settleEase(elapsed);
      const nextProgress = current + ((target - current) * eased);
      progressRef.current = nextProgress;
      applyProgress(nextProgress, targetFit);
      if (elapsed >= 1) {
        settle(run, target);
      } else {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    timerRef.current = window.setTimeout(() => settle(run, target), duration + 120);
  }, [applyGeometryStyles, applyProgress, cancelFrame, restoreToggleFocus, setPromotion, settle, updateProgressAttribute]);

  const open = useCallback(() => beginMotion(1), [beginMotion]);
  const close = useCallback(() => beginMotion(0), [beginMotion]);
  const toggle = useCallback(() => {
    if (phaseRef.current === "open" || phaseRef.current === "opening") close();
    else open();
  }, [close, open]);
  const reverse = useCallback(() => {
    if (phaseRef.current === "opening") close();
    else if (phaseRef.current === "closing") open();
  }, [close, open]);

  const handleTransitionEnd = useCallback((event) => {
    /* All navigation channels are clock-owned. A transitionend from a child
       (or a stale browser transition after a resize) must never settle a run. */
    void event;
  }, []);

  useLayoutEffect(() => {
    const applyResize = () => {
      desktopRef.current = desktopViewport();
      const isMotionActive = phaseRef.current === "opening" || phaseRef.current === "closing";
      if (isMotionActive) return;
      const nextFit = navPageFit({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      fitRef.current = nextFit;
      setFit(nextFit);
      applyGeometryStyles(nextFit);
      applyProgress(progressRef.current, nextFit);
    };

    applyResize();
    window.addEventListener("resize", applyResize);
    return () => window.removeEventListener("resize", applyResize);
  }, [applyGeometryStyles, applyProgress]);

  useLayoutEffect(() => {
    /* Establish the closed frame and off-screen rail before first interaction. */
    applyProgress(0, fitRef.current);
  }, [applyProgress]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || CLOSED_PHASES.has(phaseRef.current)) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    /* React Strict Mode deliberately mounts, cleans up, and mounts effects
       again in development. Resetting this guard on every setup keeps the
       shared rAF clock live after that probe, while the cleanup still prevents
       a completed component from mutating state. */
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelFrame();
    };
  }, [cancelFrame]);

  return {
    phase,
    progress,
    runId,
    navOpen: phase === "open",
    isInteracting: phase === "open" || phase === "opening",
    fit,
    open,
    close,
    toggle,
    reverse,
    shellRef,
    viewportRef,
    carrierRef,
    drawerRef,
    toggleRef,
    firstItemRef,
    railRef,
    handleTransitionEnd,
  };
}
