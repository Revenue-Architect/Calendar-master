import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  applyScrollSnapshot,
  focusDialogOnOpen,
  restoreDialogFocus,
  snapshotAncestorScroll,
  trapDialogTab,
} from "../accessibility/dialogFocus.js";
import { fluidMorphFromRects } from "./fluidGeometry.js";
import { recentFluidTriggerRadius, recentFluidTriggerRect } from "./fluidTrigger.js";
import { MORPH_MS, MORPH_STAGE_CONTENT, MORPH_STAGE_REVEAL } from "./morphTiming.js";

function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0, pointerEvents: "none" }}>
      <path d="m4 4 8 8M12 4 4 12" />
    </svg>
  );
}

export default function Sheet({ T, onClose, title, children, headerAction = null, beforeClose = null, morph = "auto", morphSurface = null, closeSignal = null }) {
  /* Ignore a backdrop dismissal that arrives in the same tap that opened the sheet.
     Belt and braces alongside preventDefault at the source: any future path that
     opens a sheet from a touch inherits the protection. */
  const openedAt = useRef(Date.now());
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const openerRef = useRef(null);
  /* Capture before child layout effects run. Autofocus inside a sheet that is
     still translated onto its trigger will shove overflow ancestors; the
     snapshot is the page as it was, and the layout effect puts it back. */
  const pageScrollRef = useRef(null);
  if (pageScrollRef.current == null && typeof document !== "undefined") {
    pageScrollRef.current = snapshotAncestorScroll(document.documentElement);
  }
  const closeTimer = useRef(null);
  const closingRef = useRef(false);
  const morphRef = useRef(morph);
  morphRef.current = morph;
  const openedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const beforeCloseRef = useRef(beforeClose);
  const [closing, setClosing] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(null);
  const [heightReady, setHeightReady] = useState(false);
  const [morphStage, setMorphStage] = useState(morph === "notch" && morphSurface ? "source" : "open");
  const titleId = useRef(`sheet-title-${Math.random().toString(36).slice(2, 9)}`);
  const closeSignalRef = useRef(closeSignal);
  /* Captured once per sheet and refreshed only on a real change of window shape,
     so the keyboard cannot drive the sheet's height. See the measure effect. */
  const viewportCap = useRef(0);
  const viewportWidth = useRef(0);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { beforeCloseRef.current = beforeClose; }, [beforeClose]);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (beforeCloseRef.current && beforeCloseRef.current() === false) return;
    const panel = dialogRef.current;
    const reduced = typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || (panel && window.getComputedStyle(panel).animationName === "none")
    );
    let closeDuration = morphRef.current === "notch" ? 240 : 240;
    /* If someone dismisses while the source is still opening, reverse the same
       animation from its rendered position. Restarting a separate exit keyframe
       at a full-size sheet was the subtle snap behind the old close regression. */
    if (!reduced && morphRef.current === "notch" && panel) {
      /* Reverse only while the entry clip is still running. A settled sheet used
         to take this path too — any animation whose target was the panel counted
         — so nbnotchout never ran and the form could not leave before the fold. */
      const entry = panel.getAnimations().find((animation) => animation.animationName === "nbnotchin");
      const duration = Number(entry?.effect?.getTiming().duration);
      const currentTime = Number(entry?.currentTime);
      const inFlight = Boolean(entry)
        && Number.isFinite(duration) && duration > 0
        && Number.isFinite(currentTime) && currentTime < duration;
      const boundedTime = inFlight ? Math.max(0, Math.min(duration, currentTime)) : null;
      const style = window.getComputedStyle(panel);
      const x = panel.style.getPropertyValue("--fluid-x");
      const y = panel.style.getPropertyValue("--fluid-y");
      const insetX = panel.style.getPropertyValue("--fluid-inset-x");
      const insetY = panel.style.getPropertyValue("--fluid-inset-y");
      if (inFlight && x && y && insetX && insetY && typeof panel.animate === "function") {
        panel.dataset.fluidReverse = "true";
        /* Freeze exactly what is on screen before removing the CSS animation,
           then let WAAPI fold those compositor properties back to the trigger. */
        const from = { transform: style.transform, clipPath: style.clipPath };
        entry?.cancel();
        panel.style.animation = "none";
        panel.style.transform = from.transform;
        panel.style.clipPath = from.clipPath;
        panel.animate([
          from,
          {
            transform: `translate(${x}, ${y})`,
            clipPath: `inset(${insetY} ${insetX} round var(--fluid-radius, 999px))`,
          },
        ], {
          duration: boundedTime == null ? MORPH_MS : (boundedTime / duration) * MORPH_MS,
          easing: "cubic-bezier(.4,0,.3,1)",
          fill: "forwards",
        });
        closeDuration = boundedTime == null ? MORPH_MS : (boundedTime / duration) * MORPH_MS;
      }
    }
    closingRef.current = true;
    if (morphRef.current === "notch") setMorphStage("closing");
    setClosing(true);
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), reduced ? 0 : closeDuration);
  }, []);
  useEffect(() => {
    if (closeSignal == null || closeSignalRef.current === closeSignal) return;
    closeSignalRef.current = closeSignal;
    requestClose();
  }, [closeSignal, requestClose]);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    /* The cap is taken once and then only when the window genuinely changes
       shape. A software keyboard changes the height and never the width, and
       this sheet autofocuses a field the moment it opens — so reading
       innerHeight on every resize meant the keyboard's own slide-up animation
       re-measured and re-laid-out the sheet on every frame of it, underneath a
       morph that was still running. Width is the tell that separates a rotation
       or a window drag, which should re-cap, from a keyboard, which must not. */
    if (!viewportCap.current) viewportCap.current = window.innerHeight;
    if (!viewportWidth.current) viewportWidth.current = window.innerWidth;
    const measure = () => {
      const next = Math.min(content.scrollHeight, Math.round(viewportCap.current * .88));
      setSheetHeight(next);
      /* A notch sheet is mid-morph for its opening animation; letting height
         transition underneath it animates the same box on two curves at once. */
      if (morphRef.current === "notch" && !openedRef.current) return;
      window.requestAnimationFrame(() => setHeightReady(true));
    };
    const onResize = () => {
      if (window.innerWidth === viewportWidth.current) return;
      viewportWidth.current = window.innerWidth;
      viewportCap.current = window.innerHeight;
      measure();
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(content);
    window.addEventListener("resize", onResize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", onResize); };
  }, [morph]);
  const guardedClose = useCallback(() => {
    if (Date.now() - openedAt.current < 350) return;
    requestClose();
  }, [requestClose]);
  useEffect(() => {
    if (morph !== "notch") { openedRef.current = true; return undefined; }
    const panel = dialogRef.current;
    if (!panel) return undefined;
    const done = (event) => {
      /* Only the panel's own entry animation, not one bubbling from inside it. */
      if (event.target !== panel || closingRef.current) return;
      openedRef.current = true;
      setHeightReady(true);
    };
    panel.addEventListener("animationend", done);
    /* A belt for the case the animation never fires — a hidden tab, or reduced
       motion stripping it — so the sheet can never be left unable to resize. */
    const fallback = window.setTimeout(() => { openedRef.current = true; setHeightReady(true); }, 600);
    return () => {
      panel.removeEventListener("animationend", done);
      window.clearTimeout(fallback);
    };
  }, [morph]);
  useEffect(() => {
    if (morph !== "notch" || !morphSurface) {
      setMorphStage("open");
      return undefined;
    }
    /* Geometry owns the first beat. Keep the trigger's label and accent until
       the clip has a real sheet to land in; handing off at 70ms left a hole
       where neither NEW nor the form was the visible material. */
    const panel = dialogRef.current;
    const reduced = typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || (panel && window.getComputedStyle(panel).animationName === "none")
    );
    if (reduced) {
      setMorphStage("open");
      return undefined;
    }
    setMorphStage("source");
    const stage = (next) => { if (!closingRef.current) setMorphStage(next); };
    /* Kept as the same fractions of the container's travel the 320ms version
       used — 56%, 69%, 100% — so stretching MORPH_MS moves these with it rather
       than leaving the handoff stranded at an absolute millisecond that no
       longer means anything in the new timeline. */
    const reveal = window.setTimeout(() => stage("reveal"), MORPH_MS * MORPH_STAGE_REVEAL);
    const content = window.setTimeout(() => stage("content"), MORPH_MS * MORPH_STAGE_CONTENT);
    const open = window.setTimeout(() => stage("open"), MORPH_MS);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(content);
      window.clearTimeout(open);
    };
  }, [morph, morphSurface?.id]);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
      window.clearTimeout(closeTimer.current);
    };
  }, [requestClose]);
  useLayoutEffect(() => {
    openerRef.current = document.activeElement;
    const panel = dialogRef.current;
    /* The pressed control is the origin — and the only one. There used to be a
       fallback to whatever held focus, which sounds harmless and is not: focus
       lands on a view tab, or stays on the last thing clicked, so a sheet opened
       from the keyboard grew out of a button that had nothing to do with it. A
       press is the only evidence that a particular control opened this; with no
       press, the sheet arrives on its own terms. */
    if (panel && morphRef.current === "none") {
      /* Search is a command palette. It is opened from the keyboard and the
         header hundreds of times a day, so it must not travel and it must not
         borrow a nearby control as an origin. */
      panel.dataset.fluidOrigin = "none";
    }
    const triggerRect = morphRef.current === "none" ? null : recentFluidTriggerRect();
    if (panel && triggerRect) {
      /* Measure the panel as it will finally be, not as the entry animation has
         already made it.
         A CSS animation's first keyframe is applied the moment the element is
         first styled — which is before any layout effect runs — so the rect read
         here is the *pill*: `.nb-fluid`'s 0% is `translateY(26px) scale(.965)`,
         and `getBoundingClientRect` reports transformed boxes. The morph was
         being computed from its own output, so it started a few per cent too
         small and 26px too low and then snapped to the real box on the last
         frame. Suppressing the animation for the length of one measurement costs
         nothing — this is all still before the first paint — and the animation is
         handed back the correct numbers to start from. */
      const suppressed = panel.style.animation;
      panel.style.animation = "none";
      const panelRect = panel.getBoundingClientRect();
      panel.style.animation = suppressed;
      /* Named `geometry`, not `morph`: the prop of that name says *how* to move,
         this says *how far*, and letting the local shadow the prop silently
         compared an object to a string and lost the notch every time. */
      const geometry = fluidMorphFromRects(triggerRect, panelRect);
      panel.dataset.fluidOrigin = morphRef.current === "notch" ? "notch" : "trigger";
      panel.style.setProperty("--fluid-x", `${geometry.translateX}px`);
      panel.style.setProperty("--fluid-y", `${geometry.translateY}px`);
      /* The shape the reveal starts from, not a scale to grow the panel by:
         animating a scale magnifies everything inside the panel — see
         fluidGeometry.js. */
      panel.style.setProperty("--fluid-inset-x", `${geometry.insetX}px`);
      panel.style.setProperty("--fluid-inset-y", `${geometry.insetY}px`);
      /* The corner the reveal starts from is the trigger's own corner.
         It used to be a flat 999px, which is right for a pill — the NEW button is
         one — and badly wrong for anything wide and low. On a full-width event card
         a 999px radius makes the intermediate clip an enormous ellipse, so what the
         eye actually sees is a soft circular hole opening in the middle of the screen
         with a finished sheet behind it. That reads as a portal, not as the card
         being pulled out, which is the whole reason the morph did not feel connected.
         Reading the real radius makes a card open as a card and a pill as a pill. */
      const triggerRadius = Number.parseFloat(recentFluidTriggerRadius()) || 999;
      panel.style.setProperty("--fluid-radius", `${triggerRadius}px`);
    }
    const frame = window.requestAnimationFrame(() => {
      focusDialogOnOpen(dialogRef.current);
      applyScrollSnapshot(pageScrollRef.current);
    });
    /* Hold page chrome still for the length of the morph. Inner stream and
       ribbon scrollers are descendants, not ancestors, so they stay put. */
    const restorePageScroll = () => applyScrollSnapshot(pageScrollRef.current);
    restorePageScroll();
    window.addEventListener("scroll", restorePageScroll, true);
    const unlock = window.setTimeout(() => window.removeEventListener("scroll", restorePageScroll, true), MORPH_MS);
    /* `nb-sheet-h` transitions height, and it used to switch on one frame into
       the notch's own 360ms morph — two curves animating the same box, which is
       the bounce. The height transition waits until the shape has finished
       arriving. */
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(unlock);
      window.removeEventListener("scroll", restorePageScroll, true);
      restoreDialogFocus(openerRef.current);
    };
  }, []);
  return (
    <div className={`nb-scrim ${closing ? "nb-fluid-closing" : ""} fixed inset-0 z-50 flex items-end sm:items-center justify-center`} style={{ background: "rgba(0,0,0,0.72)" }} onClick={guardedClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId.current} data-test="sheet" data-sheet-title={title || "Details"} data-morph-source={morphSurface?.id} data-morph-stage={morphStage}
        onKeyDown={(event) => trapDialogTab(event, dialogRef.current)} onClick={(e) => e.stopPropagation()}
        className={`nb-fluid nb-sheet-scroll ${heightReady ? "nb-sheet-h" : ""} ${closing ? "nb-fluid-closing" : ""} relative w-full sm:max-w-md overflow-y-auto nb-s`} style={{ backgroundColor: morph === "notch" && morphSurface && (morphStage === "source" || morphStage === "closing") ? morphSurface.background : T.card, color: T.text, maxHeight: "88svh", height: sheetHeight == null ? "auto" : sheetHeight, "--morph-accent": morph === "notch" && morphSurface ? morphSurface.background : "transparent", "--morph-card": T.card }}>
        {morph === "notch" && morphSurface && (
          <div aria-hidden="true" data-test="morph-source-label" className="nb-morph-source-label" style={{
            color: morphSurface.color,
            fontFamily: morphSurface.font,
          }}>
            {morphSurface.label}
          </div>
        )}
        <div ref={contentRef} className="nb-notch-body">
        <div className="sticky top-0 flex items-center justify-between px-4 sm:px-5 pt-3 pb-2" style={{ background: T.card, zIndex: 3 }}>
          <span id={titleId.current} style={{ fontFamily: "var(--font-data)", color: T.dimText }} className="nb-data">{title || "Details"}</span>
          <div className="flex items-center gap-1.5">
            {headerAction}
            <button onClick={requestClose} aria-label="Close" style={{ color: T.dimText, fontFamily: "var(--font-data)" }} className="nb-tap nb-hover-icon -mr-1 px-2 py-1 text-sm flex items-center justify-center"><CloseIcon /></button>
          </div>
        </div>
        {/* Padding deeper than the panel's 24px corner radius, so the last row
            ends on straight edge instead of dying into the curve. */}
        <div className="px-4 sm:px-5" style={{ paddingBottom: 28 }}>{children}</div>
        {/* A sheet capped at 88vh cuts its last row mid-height with no sign that
            there is more. This rides the bottom of the scroll box and fades the
            cut into the panel, so "there is more below" is visible rather than
            inferred. It is inert, and it disappears when nothing is clipped. */}
        <div aria-hidden="true" className="sticky bottom-0 pointer-events-none" style={{
          height: 24, marginTop: -24,
          background: `linear-gradient(to bottom, transparent, ${T.card})`,
        }} />
        </div>
      </div>
    </div>
  );
}
