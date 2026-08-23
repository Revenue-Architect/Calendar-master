import { useCallback, useEffect, useRef, useState } from "react";

/* A row that scrolls sideways with no scrollbar and no cue does not look like a
   row that scrolls — it looks like a row that is broken, because the chip at the
   edge is simply cut in half against the panel's corner. This reports which ends
   still have something beyond them, so the row can fade there and only there: a
   fade on a row that already fits would just be a chip with a dimmed corner. */
export default function useEdgeFade(externalRef = null) {
  const ownRef = useRef(null);
  const ref = externalRef ?? ownRef;
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges((current) => {
      const next = { start: el.scrollLeft > 2, end: max > 2 && el.scrollLeft < max - 2 };
      return current.start === next.start && current.end === next.end ? current : next;
    });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);
  /* No dependency list: the row's contents change without its box changing, and
     an observer watching the box would never hear about it. */
  useEffect(measure);
  if (!edges.start && !edges.end) return [ref, {}];
  const mask = `linear-gradient(to right, transparent 0, #000 ${edges.start ? 18 : 0}px,`
    + ` #000 calc(100% - ${edges.end ? 22 : 0}px), transparent 100%)`;
  return [ref, { maskImage: mask, WebkitMaskImage: mask }];
}
