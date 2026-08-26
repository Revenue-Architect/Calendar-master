import { createElement, useLayoutEffect, useRef } from "react";
import { MORPH_EASING, MORPH_TIMING } from "./morphTokens.js";
import {
  interpolateIdentity,
  isDestinationContentRevealed,
  restoreSourcePaint,
  suppressSourcePaint,
} from "./morphInterpolate.js";

function viewportBox(rect) {
  if (!rect) return null;
  return {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
  };
}

function sharedTypeStyle(shared) {
  const style = viewportBox(shared.rect);
  if (!style) return null;
  const color = shared.color || shared.style?.color;
  const fontFamily = shared.fontFamily || shared.style?.fontFamily;
  const fontSize = shared.fontSize || shared.style?.fontSize;
  const fontWeight = shared.fontWeight || shared.style?.fontWeight;
  const lineHeight = shared.lineHeight || shared.style?.lineHeight;
  if (color) style.color = color;
  if (fontFamily) style.fontFamily = fontFamily;
  if (fontSize) style.fontSize = fontSize;
  if (fontWeight) style.fontWeight = fontWeight;
  if (lineHeight) style.lineHeight = lineHeight;
  return style;
}

function renderSharedLayer(shared, dataAttr, attrValue) {
  if (!shared?.rect) return null;
  const props = {
    [dataAttr]: attrValue ?? "",
    style: sharedTypeStyle(shared),
  };
  const text = shared.text ? shared.text : null;
  return createElement("div", props, text);
}

function destFromRegistry(registry, key) {
  if (!key || !registry) return null;
  return (
    registry.snapshotMorphNode?.(key, "destination")
    || registry.getLastMorphSnapshot?.(key, "destination")
    || null
  );
}

function computeOverlayFrame(snapshot, registry, interruptFromRef) {
  const state = snapshot?.state;
  const source = snapshot?.sourceSnapshot;
  const dest = destFromRegistry(registry, snapshot?.key);
  const target = snapshot?.targetSnapshot;
  const progress = snapshot?.inFlightProgress ?? 0;

  if (state === "opening" && source?.rect) {
    return interpolateIdentity(source, dest || source, progress);
  }
  if (state === "open") {
    if (dest?.rect) return dest;
    if (source?.rect) return interpolateIdentity(source, source, 1);
    return null;
  }
  if (state === "closing" && target?.rect) {
    return interpolateIdentity(dest || source, target, progress);
  }
  if (state === "cancelling" && (source?.rect || dest?.rect)) {
    if (!interruptFromRef.current) {
      interruptFromRef.current = interpolateIdentity(source, dest || source, progress);
    }
    return interruptFromRef.current;
  }
  return null;
}

function keyframeFromIdentity(identity) {
  if (!identity?.rect) return null;
  return {
    left: `${identity.rect.left}px`,
    top: `${identity.rect.top}px`,
    width: `${identity.rect.width}px`,
    height: `${identity.rect.height}px`,
    borderRadius: `${identity.radius ?? 0}px`,
    backgroundColor: identity.paint?.background ?? "",
  };
}

function playOverlayAnimation({
  node,
  from,
  to,
  state,
  runId,
  transaction,
}) {
  if (!node || typeof node.animate !== "function") return null;
  const start = keyframeFromIdentity(from);
  const end = keyframeFromIdentity(to);
  if (!start || !end) return null;
  const duration = state === "opening" ? MORPH_TIMING.OBJECT_OPEN_MS : MORPH_TIMING.OBJECT_CLOSE_MS;
  const easing = state === "cancelling"
    ? MORPH_EASING.RETRACT
    : state === "closing"
      ? MORPH_EASING.RELEASE
      : MORPH_EASING.DECELERATE;
  let animation;
  try {
    animation = node.animate([start, end], { duration, easing, fill: "forwards" });
  } catch {
    return null;
  }
  animation.finished?.then?.(() => {
    if (transaction?.getRunId?.() !== runId && transaction?.getSnapshot?.()?.runId !== runId) {
      return;
    }
    if (state === "opening") transaction?.settleOpen?.(runId);
    if (state === "closing" || state === "cancelling") transaction?.settleClose?.(runId);
  }, () => {});
  return animation;
}

export function MorphSurface({ transactionSnapshot, registry, transaction } = {}) {
  const overlayRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const interruptFromRef = useRef(null);
  const animationRef = useRef(null);

  const state = transactionSnapshot?.state;
  if (state !== "cancelling") interruptFromRef.current = null;

  const frame = computeOverlayFrame(transactionSnapshot, registry, interruptFromRef);
  const dest = destFromRegistry(registry, transactionSnapshot?.key);
  const revealDestination = isDestinationContentRevealed({
    progress: frame?.progress ?? transactionSnapshot?.inFlightProgress ?? 0,
    state,
    fromRect: transactionSnapshot?.sourceSnapshot?.rect,
    toRect: dest?.rect,
  });

  useLayoutEffect(() => {
    const snap = transactionSnapshot || {};
    const morphing = snap.state === "opening"
      || snap.state === "open"
      || snap.state === "closing"
      || snap.state === "cancelling";

    const liveSource = snap.key ? registry?.resolveMorphNode?.(snap.key, "source") : null;
    if (liveSource) sourceNodeRef.current = liveSource;

    if (morphing && sourceNodeRef.current) suppressSourcePaint(sourceNodeRef.current);
    if (snap.state === "idle") {
      if (sourceNodeRef.current) restoreSourcePaint(sourceNodeRef.current);
      sourceNodeRef.current = null;
    }

    animationRef.current?.cancel?.();
    animationRef.current = null;

    const overlay = overlayRef.current;
    if (!morphing || !overlay || typeof overlay.animate !== "function") return undefined;

    const source = snap.sourceSnapshot;
    const destIdentity = destFromRegistry(registry, snap.key);
    const target = snap.targetSnapshot;
    let from;
    let to;
    if (snap.state === "opening") {
      from = interpolateIdentity(source, destIdentity || source, snap.inFlightProgress || 0);
      to = interpolateIdentity(source, destIdentity || source, 1);
    } else if (snap.state === "closing") {
      from = interpolateIdentity(destIdentity || source, target, 0);
      to = interpolateIdentity(destIdentity || source, target, 1);
    } else if (snap.state === "cancelling") {
      from = interruptFromRef.current || interpolateIdentity(source, destIdentity || source, snap.inFlightProgress || 0);
      to = target;
    } else {
      return undefined;
    }

    animationRef.current = playOverlayAnimation({
      node: overlay,
      from,
      to,
      state: snap.state,
      runId: snap.runId,
      transaction,
    });

    return () => {
      animationRef.current?.cancel?.();
      animationRef.current = null;
    };
  }, [transactionSnapshot, registry, transaction]);

  if (!frame?.rect) return null;

  const shared = frame.shared || {};
  const markerType = shared.marker?.type || "marker";
  const destBox = dest?.rect ? viewportBox(dest.rect) : null;

  return createElement(
    "div",
    {
      ref: overlayRef,
      "data-morph-overlay": "",
      style: {
        position: "fixed",
        left: `${frame.rect.left}px`,
        top: `${frame.rect.top}px`,
        width: `${frame.rect.width}px`,
        height: `${frame.rect.height}px`,
        borderRadius: `${frame.radius ?? 0}px`,
        backgroundColor: frame.paint?.background ?? "",
        pointerEvents: "none",
      },
    },
    renderSharedLayer(shared.title, "data-morph-title"),
    renderSharedLayer(shared.meta, "data-morph-meta"),
    renderSharedLayer(shared.marker, "data-morph-marker", markerType),
    destBox
      ? createElement("div", {
        "data-morph-destination-content": "",
        style: {
          ...destBox,
          opacity: revealDestination ? "1" : "0",
          visibility: revealDestination ? "visible" : "hidden",
        },
      }, "destination-only content")
      : null,
  );
}
