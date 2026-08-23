/* The navigation frame, its toggle, and the drawer itself.
 *
 * `NavigationFrame` coordinates motion through `useNavigationMotion` and wraps
 * the planner as children inside a viewport and carrier, so toggling the menu
 * reconciles the shell, frame mask, carrier translation, and drawer without
 * re-rendering or remounting the planner tree. `NavigationToggle` is the
 * consumer; `NavigationShell` is the drawer's markup.
 */
import React, { useCallback, useMemo } from "react";
import { MONO } from "../../design/typography.js";
import { useNavigationMotion } from "../motion/useNavigationMotion.js";
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
  const motion = useNavigationMotion({ reducedMotion });
  const {
    phase,
    progress,
    runId,
    open: openNavigation,
    close: closeNavigation,
    toggle: toggleNavigation,
    shellRef,
    viewportRef,
    carrierRef,
    drawerRef,
    toggleRef,
    firstItemRef,
    railRef,
    handleTransitionEnd,
  } = motion;

  const navOpen = phase === "open";
  const isInteracting = phase === "open" || phase === "opening";

  const contextValue = useMemo(() => ({
    navOpen,
    phase,
    toggleNavigation,
    toggleRef,
  }), [navOpen, phase, toggleNavigation, toggleRef]);

  const closeAfter = useCallback((action) => {
    action?.();
    closeNavigation();
  }, [closeNavigation]);

  return (
    <NavigationContext.Provider value={contextValue}>
      <div
        ref={shellRef}
        data-test="nav-shell"
        data-nav-state={phase}
        data-nav-run={runId}
        data-nav-run-id={runId}
        data-nav-progress={progress.toFixed(2)}
        className="nb-nav-shell"
        style={shellStyle}
      >
        <NavigationShell
          drawerRef={drawerRef}
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
          ref={viewportRef}
          data-test="nav-motion-viewport"
          data-testid="nav-motion-viewport"
          className={`nb-nav-viewport nb-nav-motion-viewport ${navOpen ? "nb-nav-motion-viewport-open" : ""}`}
        >
          <div
            ref={carrierRef}
            data-test="nav-motion-carrier"
            data-testid="nav-motion-carrier"
            className={`nb-nav-carrier nb-nav-motion-carrier ${navOpen ? "nb-nav-motion-carrier-open" : ""}`}
            onTransitionEnd={handleTransitionEnd}
          >
            <div
              data-test="app-surface"
              className={`nb-root nb-app-surface ${navOpen ? "nb-app-surface-open" : ""} flex flex-col`}
              onPointerDown={(event) => {
                if (!isInteracting || event.target.closest("[data-test='nav-toggle']")) return;
                event.preventDefault();
                closeNavigation();
              }}
              style={surfaceStyle}
            >
              {children}
            </div>
          </div>
          <div className="nb-nav-motion-mask" aria-hidden="true">
            <i data-nav-mask="top" />
            <i data-nav-mask="right" />
            <i data-nav-mask="bottom" />
            <i data-nav-mask="left" />
            <i data-nav-mask="top-left" />
            <i data-nav-mask="top-right" />
            <i data-nav-mask="bottom-left" />
            <i data-nav-mask="bottom-right" />
          </div>
          <button
            ref={railRef}
            data-test="mobile-calendar-return"
            type="button"
            aria-label={phase === "closing" ? "Reopen navigation" : "Return to calendar"}
            aria-hidden={phase === "closed" ? "true" : undefined}
            tabIndex={phase === "closed" ? -1 : 0}
            onClick={toggleNavigation}
            className="nb-mobile-calendar-return"
          >
            CALENDAR
          </button>
        </div>
      </div>
    </NavigationContext.Provider>
  );
}

export function NavigationToggle({ onPress }) {
  const navigation = React.useContext(NavigationContext);
  return (
    <button
      ref={navigation?.toggleRef}
      data-test="nav-toggle"
      type="button"
      aria-label="Toggle primary navigation"
      aria-controls="planner-navigation"
      aria-expanded={navigation?.navOpen ?? false}
      onClick={() => {
        onPress?.();
        navigation?.toggleNavigation();
      }}
      className="nb-shell-control nb-tap nb-hover-icon w-8 h-8 flex items-center justify-center"
      title="Navigation"
    >
      <MenuIcon />
    </button>
  );
}

function NavigationShell({
  drawerRef,
  phase,
  firstItemRef,
  onTimeline,
  onActions,
  onSetup,
  onNotes,
  onShortcuts,
  onToday,
}) {
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
    <aside
      ref={drawerRef}
      id="planner-navigation"
      role="navigation"
      aria-label="Primary navigation"
      aria-hidden={hidden}
      /* `inert=""` is dropped as a falsy boolean attribute, which left every
         drawer control focusable inside an `aria-hidden` subtree — six dead tab
         stops before the header, announced to nobody. */
      inert={hidden || undefined}
      className="nb-navigation"
    >
      <div className="nb-nav-brand mb-7" style={{ "--nav-index": 0 }}>
        <p className="text-xs tracking-[.18em]" style={{ fontFamily: MONO, color: "#8f908b" }}>CALENDAR MASTER</p>
        <p className="text-2xl font-semibold tracking-tight mt-1">Your day, in view.</p>
      </div>
      <div className="flex flex-col gap-1">
        {items.map(([label, onClick], index) => (
          <button
            key={label}
            ref={index === 0 ? firstItemRef : null}
            type="button"
            onClick={onClick}
            className="nb-nav-item nb-hover-control"
            style={{ "--nav-index": index + 1 }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 mt-5 pt-5" style={{ borderTop: "1px solid #313237" }}>
        {utilityItems.map(([label, onClick], index) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="nb-nav-item nb-hover-control"
            style={{ "--nav-index": index + 4 }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="nb-nav-membership" style={{ "--nav-index": 7 }}>
        <p className="text-xs tracking-[.14em]" style={{ fontFamily: MONO }}>OFFLINE READY</p>
        <p className="text-base mt-1 leading-snug">Your day still works with no signal.</p>
      </div>
    </aside>
  );
}
