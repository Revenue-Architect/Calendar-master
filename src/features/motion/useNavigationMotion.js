import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { navMobileMotion, navPageFit, sideWallInsets } from "./navPageFit.js";

const MOTION_MS = 520;
const CLOSED_PHASES = new Set(["closed", "closing"]);
const NAV_EASE = "cubic-bezier(.22,.61,.36,1)";
const CORNER_MASKS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/* Keep the browser-owned timeline on the shell's --nav-ease curve. Sampling the
 * curve here is only for reversal bookkeeping; visual interpolation remains in
 * WAAPI rather than being written by React on every frame. */
function cubicBezier(value, x1, y1, x2, y2) {
  const x = clamp(value);
  let low = 0;
  let high = 1;
  for (let index = 0; index < 18; index += 1) {
    const t = (low + high) / 2;
    const sample = (3 * (1 - t) ** 2 * t * x1) + (3 * (1 - t) * t ** 2 * x2) + t ** 3;
    if (sample < x) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return (3 * (1 - t) ** 2 * t * y1) + (3 * (1 - t) * t ** 2 * y2) + t ** 3;
}

function settleEase(value) {
  return cubicBezier(value, 0.22, 0.61, 0.36, 1);
}

function desktopViewport() {
  return typeof window === "undefined"
    || !window.matchMedia
    || !window.matchMedia("(max-width: 639.98px)").matches;
}

function matrixValue(value) {
  return Number(value.toFixed(3));
}

function viewportClip(progress, targetFit, desktop) {
  const p = clamp(progress);
  if (desktop) {
    const frame = targetFit.frame;
    return `inset(${matrixValue(frame.top * p)}px ${matrixValue(frame.right * p)}px ${matrixValue(frame.bottom * p)}px ${matrixValue(frame.left * p)}px round ${matrixValue(frame.radius * p)}px)`;
  }
  const mobile = navMobileMotion({ progress: p, mobile: targetFit.mobile });
  return `inset(${matrixValue(mobile.frame.top)}px ${matrixValue(mobile.frame.right)}px ${matrixValue(mobile.frame.bottom)}px ${matrixValue(mobile.frame.left)}px round ${matrixValue(mobile.frame.radius)}px)`;
}

function carrierTransform(progress, targetFit, desktop) {
  const p = clamp(progress);
  const carrier = desktop
    ? targetFit.carrier
    : navMobileMotion({ progress: p, mobile: targetFit.mobile }).carrier;
  const x = desktop ? carrier.x * p : carrier.x;
  const y = desktop ? carrier.y * p : carrier.y;
  return `translate3d(${matrixValue(x)}px, ${matrixValue(y)}px, 0)`;
}

function maskFrame(targetFit, desktop) {
  if (desktop) return targetFit.frame;
  return {
    top: 14,
    right: 0,
    bottom: 14,
    left: Number(targetFit.mobile?.x) || 0,
    radius: 16,
  };
}

function maskTransform(progress, targetFit, desktop, name) {
  const p = clamp(progress);
  const frame = maskFrame(targetFit, desktop);
  const radius = frame.radius;
  const distance = 1 - p;
  const transforms = {
    top: [0, -frame.top * distance],
    right: [frame.right * distance, 0],
    bottom: [0, frame.bottom * distance],
    left: [-frame.left * distance, 0],
    "top-left": [-(frame.left + radius) * distance, -(frame.top + radius) * distance],
    "top-right": [(frame.right + radius) * distance, -(frame.top + radius) * distance],
    "bottom-left": [-(frame.left + radius) * distance, (frame.bottom + radius) * distance],
    "bottom-right": [(frame.right + radius) * distance, (frame.bottom + radius) * distance],
  };
  const [x, y] = transforms[name] || [0, 0];
  /* A rounded clip's radius is r*p, not the destination radius translated
     into place. CSS sets each corner's transform origin at its interior-facing
     corner, so this scale keeps both its arc and its outer-frame position on
     the same geometry as inset(... round r*p). */
  const scale = CORNER_MASKS.has(name) ? ` scale(${matrixValue(p)})` : "";
  return `translate3d(${matrixValue(x)}px, ${matrixValue(y)}px, 0)${scale}`;
}

function drawerTransform(progress) {
  return `translate3d(${matrixValue(-36 * (1 - clamp(progress)))}%, 0, 0)`;
}

function labelStyle(progress, index) {
  const p = clamp(progress);
  const delay = (index * 30) / MOTION_MS;
  const labelProgress = clamp((p - delay) / (1 - delay));
  return {
    opacity: `${matrixValue(labelProgress)}`,
    transform: `translate3d(${matrixValue(-14 * (1 - labelProgress))}px, 0, 0)`,
  };
}

/* WAAPI interpolates the geometry in the browser. Sampling the existing
 * shared ease into a short keyframe list keeps the current normalized clock
 * (including label staggering) without asking React to write visual styles on
 * every frame. The list is authored once per logical run, not per frame. */
function sampledKeyframes(from, target, styleForProgress) {
  const steps = 24;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const progress = from + ((target - from) * t);
    return { offset: t, ...styleForProgress(progress) };
  });
}

/**
 * Owns one reversible navigation run.
 *
 * Both desktop and mobile use one browser-owned animation transaction rather
 * than separate CSS transition lifecycles. The viewport mask, content carrier,
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
  const clockRef = useRef(null);
  const animationsRef = useRef([]);

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
    const mask = maskFrame(targetFit, desktopRef.current);
    shell.style.setProperty("--nav-mask-top", `${mask.top}px`);
    shell.style.setProperty("--nav-mask-right", `${mask.right}px`);
    shell.style.setProperty("--nav-mask-bottom", `${mask.bottom}px`);
    shell.style.setProperty("--nav-mask-left", `${mask.left}px`);
    shell.style.setProperty("--nav-mask-radius", `${mask.radius}px`);
  }, []);

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const cancelAnimations = useCallback(() => {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
  }, []);

  const setPromotion = useCallback((active) => {
    const viewport = viewportRef.current;
    const carrier = carrierRef.current;
    const drawer = drawerRef.current;
    const rail = railRef.current;
    const masks = viewport?.querySelectorAll("[data-nav-mask]") || [];
    if (active) {
      /* The stage has no animated clip-path in the transform-wall design. */
      viewport?.style.removeProperty("will-change");
      viewport?.style.setProperty("contain", "layout paint");
      carrier?.style.setProperty("will-change", "transform");
      drawer?.style.setProperty("will-change", "transform");
      rail?.style.setProperty("will-change", "transform");
      masks.forEach((mask) => mask.style.setProperty("will-change", "transform"));
    } else {
      viewport?.style.removeProperty("will-change");
      viewport?.style.removeProperty("contain");
      carrier?.style.removeProperty("will-change");
      drawer?.style.removeProperty("will-change");
      rail?.style.removeProperty("will-change");
      masks.forEach((mask) => mask.style.removeProperty("will-change"));
    }
  }, []);

  /* Apply only a terminal frame (or the initial closed frame). Active travel is
     authored once with WAAPI below; this function must not become a per-frame
     style writer again. */
  const applyProgress = useCallback((rawProgress, targetFit, { active = false } = {}) => {
    if (!targetFit) return;
    const p = clamp(rawProgress);
    const viewport = viewportRef.current;
    const carrier = carrierRef.current;
    const drawer = drawerRef.current;
    if (!viewport || !carrier || !drawer) return;

    viewport.style.transition = "none";
    carrier.style.transition = "none";
    drawer.style.transition = "none";
    viewport.style.clipPath = active ? "none" : viewportClip(p, targetFit, desktopRef.current);
    carrier.style.transform = carrierTransform(p, targetFit, desktopRef.current);
    const desktop = desktopRef.current;
    const liveInsets = desktop ? sideWallInsets(p, maskFrame(targetFit, true)) : null;
    viewport.querySelectorAll("[data-nav-mask]").forEach((mask) => {
      /* The transform walls own the frame only during active travel. At either
         terminal state the viewport clip owns the rounded edge; leaving a
         corner wall painted over that clip cuts a concave notch into the card. */
      const name = mask.dataset.navMask;
      mask.style.visibility = active ? "visible" : "hidden";
      mask.style.opacity = active ? "1" : "0";
      mask.style.transform = maskTransform(p, targetFit, desktop, name);
      if (active && liveInsets && (name === "left" || name === "right")) {
        mask.style.top = `${liveInsets.top}px`;
        mask.style.bottom = `${liveInsets.bottom}px`;
      } else {
        mask.style.removeProperty("top");
        mask.style.removeProperty("bottom");
      }
    });
    if (!desktopRef.current) {
      const mobile = navMobileMotion({ progress: p, mobile: targetFit.mobile });
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
    drawer.style.transform = drawerTransform(p);

    const labels = drawer.querySelectorAll(".nb-nav-brand,.nb-nav-item,.nb-nav-membership");
    labels.forEach((label) => {
      const index = Number.parseFloat(label.style.getPropertyValue("--nav-index")) || 0;
      const style = labelStyle(p, index);
      label.style.transition = "none";
      label.style.transitionDelay = `${index * 30}ms`;
      label.style.opacity = style.opacity;
      label.style.transform = style.transform;
    });
    updateProgressAttribute(p);
  }, [updateProgressAttribute]);

  const restoreToggleFocus = useCallback((run) => {
    requestAnimationFrame(() => {
      if (runIdRef.current !== run || phaseRef.current !== "closed") return;
      toggleRef.current?.focus({ preventScroll: true });
    });
  }, []);

  /* Same deferral as the toggle, and for a sharper reason: the drawer is `inert`
     until React commits the open phase, and an inert element refuses focus
     silently. Focusing in the same tick as `setPhase` therefore left the keyboard
     on the toggle with the menu open. */
  const focusFirstItem = useCallback((run) => {
    /* Two frames, not one: the first still lands before React has committed the
       open phase, and `.focus()` on a drawer that is momentarily `inert` fails
       silently — which left the keyboard on the toggle with the menu open. The
       ribbon's viewport hook waits the same two frames for the same reason. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (runIdRef.current !== run || phaseRef.current !== "open") return;
      firstItemRef.current?.focus({ preventScroll: true });
    }));
  }, []);

  const visualProgress = useCallback(() => {
    const carrier = carrierRef.current;
    const targetFit = fitRef.current;
    if (!carrier || !targetFit) return progressRef.current;
    const transform = getComputedStyle(carrier).transform;
    const values = transform.match(/^matrix3d\((.+)\)$/)?.[1]?.split(",")
      || transform.match(/^matrix\((.+)\)$/)?.[1]?.split(",");
    if (!values) return progressRef.current;
    const x = Number(values[values.length === 16 ? 12 : 4]);
    const destination = desktopRef.current
      ? targetFit.carrier.x
      : (Number(targetFit.mobile?.x) || 0) + (Number(targetFit.mobile?.railWidth) || 44);
    if (!Number.isFinite(x) || destination <= 0) return progressRef.current;
    return clamp(x / destination);
  }, []);

  const sampleProgress = useCallback((now = performance.now()) => {
    const clock = clockRef.current;
    if (!clock) {
      const sampled = visualProgress();
      progressRef.current = sampled;
      return sampled;
    }
    const elapsed = clamp((now - clock.startedAt) / clock.duration);
    const next = clock.source + ((clock.target - clock.source) * settleEase(elapsed));
    progressRef.current = next;
    return next;
  }, [visualProgress]);

  const settle = useCallback((run, target) => {
    if (!mountedRef.current || runIdRef.current !== run) return;
    const terminalPhase = target === 1 ? "open" : "closed";
    if (phaseRef.current !== "opening" && phaseRef.current !== "closing") return;
    cancelFrame();
    cancelAnimations();
    clockRef.current = null;
    progressRef.current = target;
    applyProgress(target, fitRef.current);
    setPromotion(false);
    phaseRef.current = terminalPhase;
    setPhase(terminalPhase);
    setProgress(target);
    updateProgressAttribute(target);
    if (target === 1) {
      focusFirstItem(run);
    } else {
      restoreToggleFocus(run);
    }
  }, [applyProgress, cancelAnimations, cancelFrame, focusFirstItem, restoreToggleFocus, setPromotion, updateProgressAttribute]);

  const startBrowserMotion = useCallback((run, source, target, targetFit) => {
    const viewport = viewportRef.current;
    const carrier = carrierRef.current;
    const drawer = drawerRef.current;
    if (!viewport || !carrier || !drawer || typeof viewport.animate !== "function") return false;

    const shell = shellRef.current;
    const easing = getComputedStyle(shell).getPropertyValue("--nav-ease").trim() || NAV_EASE;
    const timing = { duration: MOTION_MS, easing, fill: "both" };
    const animations = [];
    const animate = (node, keyframes) => {
      const animation = node.animate(keyframes, timing);
      animations.push(animation);
      return animation;
    };

    try {
      /* The viewport remains an un-clipped stage during travel. Static shell
         walls move into the four margins, so the large planner surface is not
         repainted for a changing clip path. */
      const finish = animate(carrier, sampledKeyframes(source, target, (value) => ({
        transform: carrierTransform(value, targetFit, desktopRef.current),
      })));
      animate(drawer, sampledKeyframes(source, target, (value) => ({
        transform: drawerTransform(value),
      })));

      const labels = drawer.querySelectorAll(".nb-nav-brand,.nb-nav-item,.nb-nav-membership");
      labels.forEach((label) => {
        const index = Number.parseFloat(label.style.getPropertyValue("--nav-index")) || 0;
        animate(label, sampledKeyframes(source, target, (value) => labelStyle(value, index)));
      });

      viewport.querySelectorAll("[data-nav-mask]").forEach((mask) => {
        const name = mask.dataset.navMask;
        animate(mask, sampledKeyframes(source, target, (value) => {
          const style = {
            transform: maskTransform(value, targetFit, desktopRef.current, name),
          };
          if (desktopRef.current && (name === "left" || name === "right")) {
            const insets = sideWallInsets(value, maskFrame(targetFit, true));
            style.top = `${insets.top}px`;
            style.bottom = `${insets.bottom}px`;
          }
          return style;
        }));
      });

      if (!desktopRef.current) {
        const rail = railRef.current;
        if (rail) {
          rail.style.visibility = "visible";
          rail.style.pointerEvents = "auto";
          animate(rail, sampledKeyframes(source, target, (value) => {
            const mobile = navMobileMotion({ progress: value, mobile: targetFit.mobile });
            return { transform: `translate3d(${matrixValue(mobile.rail.x)}px, 0, 0) rotate(180deg)` };
          }));
        }
      }

      finish.onfinish = () => settle(run, target);
      animationsRef.current = animations;
      return true;
    } catch (error) {
      animations.forEach((animation) => animation.cancel());
      animationsRef.current = [];
      throw error;
    }
  }, [settle]);

  const beginMotion = useCallback((target) => {
    const current = sampleProgress();
    if (target === 1 && phaseRef.current === "open") return;
    if (target === 0 && phaseRef.current === "closed") return;

    const run = runIdRef.current + 1;
    runIdRef.current = run;
    setRunId(run);
    cancelFrame();
    cancelAnimations();
    clockRef.current = null;

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
      if (target === 1) focusFirstItem(run);
      else restoreToggleFocus(run);
      return;
    }

    setPromotion(true);
    /* Put the starting frame in the DOM before handing the travel to the
       browser. This makes first-use paint deterministic even when Playwright
       or a busy main thread delays the next compositor sample. */
    applyProgress(current, targetFit, { active: true });
    const startedAt = performance.now();
    clockRef.current = {
      run,
      source: current,
      target,
      direction: target > current ? "opening" : "closing",
      startedAt,
      duration: MOTION_MS,
      state: nextPhase,
    };
    const started = startBrowserMotion(run, current, target, targetFit);
    if (!started) {
      settle(run, target);
      return;
    }

    /* Keep one shared logical clock for the dataset and reversal sampling. The
       visual channels themselves are browser-owned animations; this ticker only
       exposes progress to focus/interaction tests and never writes geometry. */
    const tick = (now) => {
      if (!mountedRef.current || runIdRef.current !== run || !clockRef.current) return;
      const next = sampleProgress(now);
      updateProgressAttribute(next);
      if ((now - startedAt) < MOTION_MS) frameRef.current = requestAnimationFrame(tick);
      else frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [applyGeometryStyles, applyProgress, cancelAnimations, cancelFrame, restoreToggleFocus, sampleProgress, setPromotion, settle, startBrowserMotion, updateProgressAttribute]);

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
      cancelAnimations();
      clockRef.current = null;
    };
  }, [cancelAnimations, cancelFrame]);

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
