import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  applyScrollSnapshot,
  focusDialogOnOpen,
  inertDialogSiblings,
  restoreDialogFocus,
  snapshotAncestorScroll,
  trapDialogTab,
} from "../accessibility/dialogFocus.js";
import {
  anchoredFluidMorphFromRects,
  effectiveFluidSourceRadius,
  fluidMorphFromRects,
} from "./fluidGeometry.js";
import { recentFluidTriggerRadius, recentFluidTriggerRect } from "./fluidTrigger.js";
import { MONO } from "../../design/typography.js";
import {
  MORPH_CLOSE_MS,
  MORPH_CONTENT_BLUR_PX,
  MORPH_CONTENT_SCALE,
  MORPH_HANDOFF_SLIDE_PX,
  MORPH_MS,
  MORPH_STAGE_CONTENT,
  MORPH_STAGE_REVEAL,
  SHEET_ENTRY_MS,
} from "./morphTiming.js";
import { CloseIcon } from "../planner/icons.jsx";

const modalStack = [];
let bodyOverflowBeforeModal = null;

function registerModal(entry) {
  if (modalStack.length === 0) {
    bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  modalStack.push(entry);
  return () => {
    const index = modalStack.indexOf(entry);
    if (index === -1) return;
    modalStack.splice(index, 1);
    if (modalStack.length === 0) {
      document.body.style.overflow = bodyOverflowBeforeModal;
      bodyOverflowBeforeModal = null;
    }
  };
}

function isTopmostModal(entry) {
  return modalStack.at(-1) === entry;
}

function restoreSheetFocus(opener, closingPanel) {
  if (typeof document === "undefined") return false;
  const remaining = [...document.querySelectorAll('[data-test="sheet"]')]
    .filter((candidate) => candidate !== closingPanel && candidate.isConnected);
  const activeSheet = remaining.at(-1);
  if (activeSheet) {
    /* A lower Sheet can disappear while a newer Sheet remains open. Its
       opener is then either gone or behind the active modal; keep focus inside
       the topmost remaining Sheet instead of briefly returning focus to the
       background. */
    if (opener && activeSheet.contains(opener)) return restoreDialogFocus(opener);
    return focusDialogOnOpen(activeSheet) || activeSheet.contains(document.activeElement);
  }
  return restoreDialogFocus(opener);
}

/* Kept in step with Planner deliberately: this is the copy that runs.
   Planner's own Sheet was the newer of the two by 134 lines -- it had gained
   first-paint height measurement that this file never received -- so the merge
   went in that direction. Reversing it would have silently reverted that fix. */
export default function Sheet({ T, onClose, title, children, headerAction = null, beforeClose = null, morph = "auto", morphSurface = null, closeSignal = null, destinationRef = null }) {
  /* Ignore a backdrop dismissal that arrives in the same tap that opened the sheet.
     Belt and braces alongside preventDefault at the source: any future path that
     opens a sheet from a touch inherits the protection. */
  const openedAt = useRef(Date.now());
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const openerRef = useRef(null);
  const modalEntryRef = useRef({});
  /* Capture before React commits descendants such as Composer's autoFocus
     field. Reading document.activeElement in the layout effect is already too
     late: the dialog has mounted and the field has claimed focus. */
  const openerAtRenderRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  const focusRestoreFrame = useRef(null);
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
  /* The opening accent is the animation's job, not this state's. nbnotchwash
     paints var(--morph-accent) at 0% and animations outrank inline styles, so the
     carry is pixel-identical either way — but painting it from the stage made the
     sheet's *resting* colour depend on three setTimeouts firing. Where they did
     not, the sheet stayed a solid accent slab with the right colour sitting unused
     in the style attribute: the stage-open guarantee never matched, because the
     stage never got to open. Mobile Chrome throttles timers hard enough for that
     to be an ordinary device state, which is why it only ever showed on a phone.
     Mirrored in features/motion/Sheet.jsx, which is not wired up yet. */
  const [morphStage, setMorphStage] = useState(morph === "notch" && morphSurface ? "source" : "open");
  const titleId = useRef(`sheet-title-${Math.random().toString(36).slice(2, 9)}`);
  const closeSignalRef = useRef(closeSignal);
  /* Captured once per sheet and refreshed only on a real change of window shape,
     so the keyboard cannot drive the sheet's height. See the measure effect. */
  const viewportCap = useRef(0);
  const viewportWidth = useRef(0);
  const heightMeasureFrame = useRef(null);
  const lastSheetHeight = useRef(null);
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
    let closeDuration = morphRef.current === "notch" ? MORPH_CLOSE_MS : 300;
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
      const insetTop = panel.style.getPropertyValue("--fluid-inset-top");
      const insetRight = panel.style.getPropertyValue("--fluid-inset-right");
      const insetBottom = panel.style.getPropertyValue("--fluid-inset-bottom");
      const insetLeft = panel.style.getPropertyValue("--fluid-inset-left");
      if (inFlight && x && y && insetTop && insetRight && insetBottom && insetLeft && typeof panel.animate === "function") {
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
            clipPath: `inset(${insetTop} ${insetRight} ${insetBottom} ${insetLeft} round var(--fluid-radius, 999px))`,
          },
        ], {
          duration: boundedTime == null ? MORPH_CLOSE_MS : (boundedTime / duration) * MORPH_CLOSE_MS,
          easing: "cubic-bezier(.4,0,.3,1)",
          fill: "forwards",
        });
        closeDuration = boundedTime == null ? MORPH_CLOSE_MS : (boundedTime / duration) * MORPH_CLOSE_MS;

        /* The source label and destination body are independent CSS animations,
           so cancelling only the panel animation makes either identity pop to a
           fully-open/closed state for one frame. Freeze their actual computed
           values before cancellation, then hand those values to a matching
           WAAPI exit. No React state is updated per frame. */
        const freezeHandoff = (element, animationName, target) => {
          if (!element || typeof element.animate !== "function") return;
          const computed = window.getComputedStyle(element);
          const from = {
            opacity: computed.opacity,
            transform: computed.transform,
            filter: computed.filter,
          };
          element.style.opacity = from.opacity;
          element.style.transform = from.transform;
          element.style.filter = from.filter;
          element.getAnimations().filter((animation) => animation.animationName === animationName)
            .forEach((animation) => animation.cancel());
          element.animate([from, target], {
            duration: closeDuration,
            easing: "cubic-bezier(.22,1,.36,1)",
            fill: "forwards",
          });
        };
        freezeHandoff(
          panel.querySelector(".nb-notch-body"),
          "nbnotchbodyin",
          {
            opacity: "0",
            transform: `translateX(${MORPH_HANDOFF_SLIDE_PX}px) scale(${MORPH_CONTENT_SCALE})`,
            filter: `blur(${MORPH_CONTENT_BLUR_PX}px)`,
          },
        );
        freezeHandoff(
          panel.querySelector(".nb-morph-source-label"),
          "nbnotchlabelout",
          {
            opacity: "1",
            transform: "translateX(0) scale(1)",
            filter: "blur(0px)",
          },
        );
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
    /* Establish the final resting box before first paint, but do not animate its
       height yet. The panel's entry animation can then stay entirely on compositor
       properties instead of relaying out sticky/overflow descendants mid-flight. */
    const next = Math.min(content.scrollHeight, Math.round(viewportCap.current * .88));
    lastSheetHeight.current = next;
    setSheetHeight(next);
    return () => {
      window.cancelAnimationFrame(heightMeasureFrame.current);
      heightMeasureFrame.current = null;
    };
  }, [morph]);
  const guardedClose = useCallback(() => {
    if (Date.now() - openedAt.current < 350) return;
    requestClose();
  }, [requestClose]);
  useEffect(() => {
    const panel = dialogRef.current;
    if (!panel) return undefined;
    let heightReadyFrame = null;
    const finishEntry = () => {
      if (closingRef.current || openedRef.current) return;
      openedRef.current = true;
      /* Content can settle while the observer is intentionally disconnected
         (fonts and composer branches are common). Absorb that final geometry with
         transitions still off, then arm interpolation on the following frame.
         Otherwise the first observer record becomes a delayed second bounce. */
      const content = contentRef.current;
      if (content?.isConnected) {
        const next = Math.min(content.scrollHeight, Math.round(viewportCap.current * .88));
        if (lastSheetHeight.current !== next) {
          lastSheetHeight.current = next;
          setSheetHeight(next);
        }
      }
      heightReadyFrame = window.requestAnimationFrame(() => {
        heightReadyFrame = null;
        if (!closingRef.current) setHeightReady(true);
      });
    };
    const done = (event) => {
      /* Only the panel's own entry animation, not one bubbling from inside it. */
      if (event.target !== panel || closingRef.current) return;
      if (!["nbfluid", "nbfluidorigin", "nbnotchin"].includes(event.animationName)) return;
      finishEntry();
    };
    panel.addEventListener("animationend", done);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || window.getComputedStyle(panel).animationName === "none";
    /* A no-motion sheet can interpolate later changes immediately. All other sheet
       kinds—not only notch sheets—wait for their entry animation to finish. */
    const readyFrame = reduced ? window.requestAnimationFrame(finishEntry) : null;
    /* A belt for a backgrounded tab or cancelled CSS animation. */
    const entryDuration = morphRef.current === "notch" ? MORPH_MS : SHEET_ENTRY_MS;
    const fallback = reduced ? null : window.setTimeout(finishEntry, entryDuration + 120);
    return () => {
      panel.removeEventListener("animationend", done);
      window.clearTimeout(fallback);
      window.cancelAnimationFrame(readyFrame);
      window.cancelAnimationFrame(heightReadyFrame);
    };
  }, [morph]);
  useLayoutEffect(() => {
    if (!heightReady) return undefined;
    const content = contentRef.current;
    if (!content) return undefined;
    /* ResizeObserver can emit several records while an editor unfolds. Collapse
       those records into one read/write per frame and skip identical targets, so
       React never restarts the same height transition or creates an observer loop. */
    const scheduleMeasure = () => {
      if (closingRef.current || heightMeasureFrame.current != null) return;
      heightMeasureFrame.current = window.requestAnimationFrame(() => {
        heightMeasureFrame.current = null;
        if (closingRef.current || !content.isConnected) return;
        const next = Math.min(content.scrollHeight, Math.round(viewportCap.current * .88));
        if (lastSheetHeight.current === next) return;
        lastSheetHeight.current = next;
        setSheetHeight(next);
      });
    };
    const onResize = () => {
      if (window.innerWidth === viewportWidth.current) return;
      viewportWidth.current = window.innerWidth;
      viewportCap.current = window.innerHeight;
      scheduleMeasure();
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleMeasure) : null;
    observer?.observe(content);
    window.addEventListener("resize", onResize);
    scheduleMeasure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(heightMeasureFrame.current);
      heightMeasureFrame.current = null;
    };
  }, [heightReady]);
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
    const entry = modalEntryRef.current;
    const h = (e) => {
      if (e.key === "Escape" && isTopmostModal(entry)) requestClose();
    };
    const releaseModal = registerModal(entry);
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      releaseModal();
      window.clearTimeout(closeTimer.current);
    };
  }, [requestClose]);
  useLayoutEffect(() => {
    if (focusRestoreFrame.current != null) {
      window.cancelAnimationFrame(focusRestoreFrame.current);
      focusRestoreFrame.current = null;
    }
    openerRef.current = openerAtRenderRef.current;
    const panel = dialogRef.current;
    const restoreBackground = inertDialogSiblings(panel?.parentElement);
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
         here is the *animated* entry box, and `getBoundingClientRect` reports
         transformed boxes. Suppressing the animation for the length of one
         measurement costs nothing — this is all still before the first paint —
         and the animation is handed back the correct true-size numbers to start
         from. */
      const suppressed = panel.style.animation;
      panel.style.animation = "none";
      const panelRect = panel.getBoundingClientRect();
      panel.style.animation = suppressed;
      /* Named `geometry`, not `morph`: the prop of that name says *how* to move,
         this says *how far*, and letting the local shadow the prop silently
         compared an object to a string and lost the notch every time. */
      /* CSS resolves a pill's nominal `999px` radius against its own box, so a
         39x28 source control would be visually bounded to a 14px radius. Carry
         that effective radius into the growing clip, rather than carrying the
         unbounded token:
         once the visible window passes through a near-square, 999px normalizes
         into the circular/portal blob this morph is expressly meant to avoid.
         A real zero radius stays zero; only a missing snapshot uses the safe
         source-box bound. */
      const measuredRadius = Number.parseFloat(recentFluidTriggerRadius());
      const sourceRadius = effectiveFluidSourceRadius(
        triggerRect,
        Number.isFinite(measuredRadius) ? measuredRadius : 999,
      );
      const isNotch = morphRef.current === "notch";
      const geometry = isNotch
        ? anchoredFluidMorphFromRects(triggerRect, panelRect, { sourceRadius, targetRadius: 24 })
        : fluidMorphFromRects(triggerRect, panelRect);
      panel.dataset.fluidOrigin = isNotch ? "notch" : "trigger";
      if (isNotch) {
        panel.dataset.morphAnchorX = geometry.anchorX;
        panel.dataset.morphAnchorY = geometry.anchorY;
      } else {
        delete panel.dataset.morphAnchorX;
        delete panel.dataset.morphAnchorY;
      }
      panel.style.setProperty("--fluid-x", `${geometry.translateX}px`);
      panel.style.setProperty("--fluid-y", `${geometry.translateY}px`);
      /* The shape the reveal starts from, not a scale to grow the panel by:
         animating a scale magnifies everything inside the panel — see
         fluidGeometry.js. */
      if (isNotch) {
        panel.style.setProperty("--fluid-inset-top", `${geometry.insetTop}px`);
        panel.style.setProperty("--fluid-inset-right", `${geometry.insetRight}px`);
        panel.style.setProperty("--fluid-inset-bottom", `${geometry.insetBottom}px`);
        panel.style.setProperty("--fluid-inset-left", `${geometry.insetLeft}px`);
        panel.style.setProperty("--fluid-source-width", `${Math.max(0, triggerRect.width)}px`);
        panel.style.setProperty("--fluid-source-height", `${Math.max(0, triggerRect.height)}px`);
        panel.style.setProperty("--fluid-radius", `${geometry.sourceRadius}px`);
        panel.style.setProperty("--fluid-target-radius", `${geometry.targetRadius}px`);
      } else {
        /* Keep the symmetric pair as the ordinary keyframe contract, while
           exposing equivalent four-sided values for diagnostics and close-path
           tooling that reads the source window generically. */
        panel.style.setProperty("--fluid-inset-x", `${geometry.insetX}px`);
        panel.style.setProperty("--fluid-inset-y", `${geometry.insetY}px`);
        panel.style.setProperty("--fluid-inset-top", `${geometry.insetY}px`);
        panel.style.setProperty("--fluid-inset-right", `${geometry.insetX}px`);
        panel.style.setProperty("--fluid-inset-bottom", `${geometry.insetY}px`);
        panel.style.setProperty("--fluid-inset-left", `${geometry.insetX}px`);
        panel.style.setProperty("--fluid-radius", `${sourceRadius}px`);
        panel.style.setProperty("--fluid-target-radius", "24px");
      }
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
    const scrollGuardMs = morphRef.current === "notch" ? MORPH_MS : SHEET_ENTRY_MS;
    const unlock = window.setTimeout(() => window.removeEventListener("scroll", restorePageScroll, true), scrollGuardMs);
    /* `nb-sheet-h` transitions height, and it used to switch on one frame into
       the notch's own 360ms morph — two curves animating the same box, which is
       the bounce. The height transition waits until the shape has finished
       arriving. */
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(unlock);
      window.removeEventListener("scroll", restorePageScroll, true);
      restoreBackground();
      const opener = openerRef.current;
      restoreSheetFocus(opener, panel);
      focusRestoreFrame.current = window.requestAnimationFrame(() => {
        focusRestoreFrame.current = null;
        restoreSheetFocus(opener, panel);
      });
    };
  }, []);
  return (
    <div className={`nb-scrim ${closing ? "nb-fluid-closing" : ""} fixed inset-0 z-50 flex items-end sm:items-center justify-center`} style={{ background: "rgba(0,0,0,0.72)" }} onClick={guardedClose}>
      <div ref={(node) => {
        dialogRef.current = node;
        if (typeof destinationRef === "function") destinationRef(node);
        else if (destinationRef) destinationRef.current = node;
      }} role="dialog" aria-modal="true" aria-labelledby={titleId.current} data-test="sheet" data-sheet-title={title || "Details"} data-morph-source={morphSurface?.id} data-morph-stage={morphStage}
        onKeyDown={(event) => trapDialogTab(event, dialogRef.current)} onClick={(e) => e.stopPropagation()}
        className={`nb-fluid nb-sheet-scroll ${heightReady ? "nb-sheet-h" : ""} ${closing ? "nb-fluid-closing" : ""} relative w-full sm:max-w-md overflow-y-auto nb-s`} style={{ backgroundColor: morph === "notch" && morphSurface && morphStage === "closing" ? morphSurface.background : T.card, color: T.text, maxHeight: "88svh", height: sheetHeight == null ? "auto" : sheetHeight, "--morph-accent": morph === "notch" && morphSurface ? morphSurface.background : "transparent", "--morph-card": T.card }}>
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
          <span id={titleId.current} style={{ fontFamily: MONO, color: T.dimText }} className="nb-data">{title || "Details"}</span>
          <div className="flex items-center gap-1.5">
            {headerAction}
            <button onClick={requestClose} aria-label="Close" style={{ color: T.dimText, fontFamily: MONO }} className="nb-tap nb-hover-icon -mr-1 px-2 py-1 text-sm flex items-center justify-center"><CloseIcon /></button>
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
