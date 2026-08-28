import { useLayoutEffect, useRef } from "react";

import {
  eventTimelineLensDisplacement,
  isTimelineLensTargetBelowSource,
} from "../motion/eventTimelineLens.js";

const TARGET_SELECTOR = "[data-event-timeline-lens-target]";
const PLANE_SELECTOR = "[data-event-timeline-lens-plane]";

function hasInlineProperty(node, name) {
  return node.style.getPropertyValue(name) !== "" || node.style.getPropertyPriority(name) !== "";
}

/*
 * A presentation-only spacer for Event expansion.  The Event source and all
 * calendar calculations retain their original boxes; only selected painted
 * timeline layers receive a compositor `translate` while the real Inspector is
 * open.  Do not move Event top/duration/lane, row height, scroll height, or any
 * gesture coordinates into this component.
 */
export default function EventTimelineLens({
  sourceSnapshot,
  surfaceNode,
  state,
  enabled = false,
  reducedMotion = false,
  spacing = 12,
}) {
  const sessionRef = useRef(null);
  const optionsRef = useRef({ state, reducedMotion, spacing });
  optionsRef.current = { state, reducedMotion, spacing };

  useLayoutEffect(() => {
    const sourceRect = sourceSnapshot?.rect;
    if (!enabled || !sourceRect || !surfaceNode?.isConnected) return undefined;

    const entries = Array.from(document.querySelectorAll(TARGET_SELECTOR))
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ node, rect }) => node !== surfaceNode && isTimelineLensTargetBelowSource(rect, sourceRect))
      .map(({ node }) => ({
        node,
        hadOffset: hasInlineProperty(node, "--event-timeline-lens-y"),
        offset: node.style.getPropertyValue("--event-timeline-lens-y"),
        offsetPriority: node.style.getPropertyPriority("--event-timeline-lens-y"),
        willChange: node.style.willChange,
      }));
    /* A transform contributes visual overflow to a scroll container in Chromium.
       Clip only the fixed-height paint plane while this modal presentation is
       active so the lens cannot alter the timeline's real scrollHeight. */
    const planes = [...new Set(entries
      .map(({ node }) => node.closest(PLANE_SELECTOR))
      .filter(Boolean))]
      .map((node) => ({
        node,
        hadOverflow: hasInlineProperty(node, "overflow"),
        overflow: node.style.getPropertyValue("overflow"),
        overflowPriority: node.style.getPropertyPriority("overflow"),
      }));
    for (const plane of planes) plane.node.style.setProperty("overflow", "clip");

    let frame = null;
    const update = () => {
      frame = null;
      if (!surfaceNode.isConnected) return;
      const { state: currentState, reducedMotion: currentReducedMotion, spacing: currentSpacing } = optionsRef.current;
      const displacement = eventTimelineLensDisplacement({
        sourceHeight: sourceRect.height,
        expandedHeight: surfaceNode.getBoundingClientRect().height,
        spacing: currentSpacing,
        state: currentState,
        reducedMotion: currentReducedMotion,
      });
      for (const entry of entries) {
        entry.node.style.setProperty("--event-timeline-lens-y", `${displacement}px`);
        entry.node.style.willChange = "translate";
      }
    };
    const scheduleUpdate = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(update);
    };

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(surfaceNode);
    sessionRef.current = { update: scheduleUpdate };
    scheduleUpdate();

    return () => {
      observer?.disconnect();
      if (frame != null) window.cancelAnimationFrame(frame);
      if (sessionRef.current?.update === scheduleUpdate) sessionRef.current = null;
      for (const entry of entries) {
        if (entry.hadOffset) {
          entry.node.style.setProperty("--event-timeline-lens-y", entry.offset, entry.offsetPriority);
        } else {
          entry.node.style.removeProperty("--event-timeline-lens-y");
        }
        entry.node.style.willChange = entry.willChange;
      }
      for (const plane of planes) {
        if (plane.hadOverflow) {
          plane.node.style.setProperty("overflow", plane.overflow, plane.overflowPriority);
        } else {
          plane.node.style.removeProperty("overflow");
        }
      }
    };
  }, [enabled, sourceSnapshot?.key, sourceSnapshot?.rect?.height, sourceSnapshot?.rect?.top, surfaceNode]);

  useLayoutEffect(() => {
    sessionRef.current?.update();
  }, [state, reducedMotion, spacing]);

  return null;
}
