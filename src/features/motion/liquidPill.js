/* The plate that slides under the active pill.
 *
 * It measures the active child, remembers where it was, and reports a stretch
 * for the travel between the two — so the plate reads as one liquid body being
 * pulled, not a rectangle being teleported.
 *
 * It lives here rather than beside the pills that call it because it is motion,
 * not presentation: it computes geometry through fluidGeometry's
 * `fluidPillStretch`, its sibling in this folder, and it renders nothing.
 */
import { useLayoutEffect, useRef, useState } from "react";

import { fluidPillStretch } from "./fluidGeometry.js";

export function useLiquidPill(wrapRef, deps) {
  const [box, setBox] = useState(null);
  const [stretch, setStretch] = useState(1);
  const [settled, setSettled] = useState(false);
  const boxRef = useRef(null);
  const settle = useRef(null);
  /* Whether the plate has ever had a position. It is the only case that must not
     animate — a plate arriving from 0,0 on first paint would fly in from the
     corner. Every later move is a real travel and should transition.
     This used to unsettle on every dependency change, which meant each tab pick
     spent a frame with transitions off and then a requestAnimationFrame turning
     them back on. Measured, that put the plate 120ms behind the click: the page
     finished its 300ms slide while the plate was still waiting to start, which
     is most of why the nav and the page read as two separate events. */
  const placed = useRef(false);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    let settleFrame = null;
    const move = () => {
      const active = wrap.querySelector('[data-active="true"]');
      if (!active) { boxRef.current = null; setBox(null); return; }
      const next = {
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      };
      const previous = boxRef.current;
      if (previous && Math.abs(previous.left - next.left) > 1) {
        setStretch(fluidPillStretch(previous, next));
        clearTimeout(settle.current);
        settle.current = setTimeout(() => setStretch(1), 210);
      }
      boxRef.current = next;
      setBox(next);
      if (placed.current) { setSettled(true); return; }
      /* First placement only: commit the box with transitions off, then enable
         them a frame later so the plate is simply *there* rather than arriving. */
      placed.current = true;
      window.cancelAnimationFrame(settleFrame);
      settleFrame = window.requestAnimationFrame(() => setSettled(true));
    };
    move();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(move) : null;
    observer?.observe(wrap);
    window.addEventListener("resize", move);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", move);
      clearTimeout(settle.current);
      window.cancelAnimationFrame(settleFrame);
    };
  }, deps);

  return { box, stretch, settled };
}
