/* The navigation frame, its toggle, and the drawer itself.
 *
 * `NavigationFrame` owns the open/closed phase and wraps the planner as
 * children, so toggling the menu reconciles the shell, the surface and one
 * context consumer without re-rendering the planner tree. `NavigationToggle`
 * is the consumer; `NavigationShell` is the drawer's markup. The context and
 * the drawer stay private to this module — Planner renders only the frame and
 * the toggle.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { MONO } from "../../design/typography.js";
import { navPageFit } from "../motion/navPageFit.js";
import { MenuIcon } from "./icons.jsx";

const NavigationContext = React.createContext(null);

export function NavigationFrame({
  reducedMotion,
  shellStyle,
  surfaceStyle,
  children,
  onTimeline,
  onActions,
  onSetup,
  onNotes,
  onShortcuts,
  onToday,
}) {
  /* Phase ownership stays at the lightweight frame boundary. Toggling the menu
     updates the shell, surface and one context consumer without reconciling the
     planner tree or remounting any planner content. */
  const [phase, setPhase] = useState("closed");
  const phaseRef = useRef(phase);
  const shellRef = useRef(null);
  const toggleRef = useRef(null);
  const firstItemRef = useRef(null);
  const closeTimerRef = useRef(null);
  const motionRunRef = useRef(0);
  phaseRef.current = phase;

  const restoreToggleFocus = useCallback((run) => {
    requestAnimationFrame(() => {
      if (motionRunRef.current !== run || phaseRef.current === "open") return;
      toggleRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const finishClose = useCallback((run) => {
    if (motionRunRef.current !== run || phaseRef.current !== "closing") return;
    window.clearTimeout(closeTimerRef.current);
    phaseRef.current = "closed";
    setPhase("closed");
  }, []);

  const openNavigation = useCallback(() => {
    if (phaseRef.current === "open") return;
    motionRunRef.current += 1;
    window.clearTimeout(closeTimerRef.current);
    phaseRef.current = "open";
    setPhase("open");
  }, []);

  const closeNavigation = useCallback(() => {
    if (phaseRef.current === "closed" || phaseRef.current === "closing") return;
    const run = motionRunRef.current + 1;
    motionRunRef.current = run;
    window.clearTimeout(closeTimerRef.current);
    restoreToggleFocus(run);
    if (reducedMotion) {
      phaseRef.current = "closed";
      setPhase("closed");
      return;
    }
    phaseRef.current = "closing";
    setPhase("closing");
    /* transitionend owns normal completion. The run-scoped fallback only covers
       browsers that cancel transitions during visibility or lifecycle changes. */
    closeTimerRef.current = window.setTimeout(() => finishClose(run), 700);
  }, [finishClose, reducedMotion, restoreToggleFocus]);

  const toggleNavigation = useCallback(() => {
    if (phaseRef.current === "open") closeNavigation();
    else openNavigation();
  }, [closeNavigation, openNavigation]);

  const finishOnSurfaceTransition = useCallback((event) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    /* An interrupted transition may deliver completion after a newer command.
       Only accept the event once the current surface has actually reached the
       closed transform; otherwise the active close keeps running. */
    let transform;
    try {
      transform = new DOMMatrixReadOnly(getComputedStyle(event.currentTarget).transform);
    } catch {
      return;
    }
    if (Math.abs(transform.m41) > 0.5 || Math.abs(transform.m42) > 0.5) return;
    finishClose(motionRunRef.current);
  }, [finishClose]);

  useEffect(() => {
    if (phase !== "open") return undefined;
    const frame = requestAnimationFrame(() => firstItemRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || phaseRef.current === "closed") return;
      event.preventDefault();
      closeNavigation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeNavigation]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useLayoutEffect(() => {
    const apply = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const fit = navPageFit({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
      shell.style.setProperty("--nav-page-x", `${fit.travelX}px`);
      shell.style.setProperty("--nav-page-y", `${fit.travelY}px`);
      shell.style.setProperty("--nav-clip-top", `${fit.clipTop}px`);
      shell.style.setProperty("--nav-clip-right", `${fit.clipRight}px`);
      shell.style.setProperty("--nav-clip-bottom", `${fit.clipBottom}px`);
      shell.style.setProperty("--nav-page-radius", `${fit.radius}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const navOpen = phase === "open";
  const contextValue = useMemo(() => ({
    navOpen,
    toggleNavigation,
    toggleRef,
  }), [navOpen, toggleNavigation]);
  const closeAfter = useCallback((action) => {
    action();
    closeNavigation();
  }, [closeNavigation]);

  return (
    <NavigationContext.Provider value={contextValue}>
      <div ref={shellRef} data-test="nav-shell" data-nav-state={phase} className="nb-nav-shell" style={shellStyle}>
        <NavigationShell
          phase={phase}
          firstItemRef={firstItemRef}
          onTimeline={() => closeAfter(onTimeline)}
          onActions={() => closeAfter(onActions)}
          onSetup={() => closeAfter(onSetup)}
          onNotes={() => closeAfter(onNotes)}
          onShortcuts={() => closeAfter(onShortcuts)}
          onToday={() => closeAfter(onToday)}
        />
        <div
          data-test="app-surface"
          className={`nb-root nb-app-surface ${navOpen ? "nb-app-surface-open" : ""} flex flex-col`}
          onTransitionEnd={finishOnSurfaceTransition}
          onPointerDown={(event) => {
            if (!navOpen || event.target.closest("[data-test='nav-toggle'], [data-test='mobile-calendar-return']")) return;
            event.preventDefault();
            closeNavigation();
          }}
          style={surfaceStyle}
        >
          <button data-test="mobile-calendar-return" type="button" aria-label="Return to calendar" onClick={closeNavigation} className="nb-mobile-calendar-return">CALENDAR</button>
          {children}
        </div>
      </div>
    </NavigationContext.Provider>
  );
}

export function NavigationToggle({ onPress }) {
  const navigation = React.useContext(NavigationContext);
  return (
    <button
      ref={navigation.toggleRef}
      data-test="nav-toggle"
      type="button"
      aria-label="Toggle primary navigation"
      aria-controls="planner-navigation"
      aria-expanded={navigation.navOpen}
      onClick={() => {
        onPress();
        navigation.toggleNavigation();
      }}
      className="nb-shell-control nb-tap nb-hover-icon w-8 h-8 flex items-center justify-center"
      title="Navigation"
    >
      <MenuIcon />
    </button>
  );
}

function NavigationShell({ phase, firstItemRef, onTimeline, onActions, onSetup, onNotes, onShortcuts, onToday }) {
  const items = [
    ["Timeline", onTimeline],
    ["Actions", onActions],
    ["Setup", onSetup],
  ];
  const utilityItems = [
    ["Notes", onNotes],
    ["Shortcuts", onShortcuts],
    ["Today", onToday],
  ];
  const hidden = phase !== "open";
  return (
    <aside id="planner-navigation" role="navigation" aria-label="Primary navigation" aria-hidden={hidden} inert={hidden} className="nb-navigation">
      <div className="nb-nav-brand mb-7" style={{ "--nav-index": 0 }}>
        <p className="text-xs tracking-[.18em]" style={{ fontFamily: MONO, color: "#8f908b" }}>CALENDAR MASTER</p>
        <p className="text-2xl font-semibold tracking-tight mt-1">Your day, in view.</p>
      </div>
      <div className="flex flex-col gap-1">
        {items.map(([label, onClick], index) => (
          <button key={label} ref={index === 0 ? firstItemRef : null} type="button" onClick={onClick}
            className="nb-nav-item nb-hover-control" style={{ "--nav-index": index + 1 }}>{label}</button>
        ))}
      </div>
      <div className="flex flex-col gap-1 mt-5 pt-5" style={{ borderTop: "1px solid #313237" }}>
        {utilityItems.map(([label, onClick], index) => (
          <button key={label} type="button" onClick={onClick}
            className="nb-nav-item nb-hover-control" style={{ "--nav-index": index + 4 }}>{label}</button>
        ))}
      </div>
      <div className="nb-nav-membership" style={{ "--nav-index": 7 }}>
        <p className="text-xs tracking-[.14em]" style={{ fontFamily: MONO }}>LOCAL FIRST</p>
        <p className="text-base mt-1 leading-snug">Everything in this planner stays on this device.</p>
      </div>
    </aside>
  );
}
