import { createElement, useLayoutEffect, useRef } from "react";
import { MORPH_EASING, MORPH_TIMING } from "./morphTokens.js";
import {
  interpolateIdentity,
  interpolateSharedLayer,
  isDestinationContentRevealed,
  restoreSourcePaint,
  suppressSourcePaint,
} from "./morphInterpolate.js";

const SHARED_LAYERS = ["title", "meta", "marker"];

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

function sharedTypeStyle(shared, rect = shared?.rect) {
  const style = viewportBox(rect);
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

function renderSharedLayer(shared, dataAttr, attrValue, { ref, style } = {}) {
  if (!shared?.rect) return null;
  const props = {
    ref,
    [dataAttr]: attrValue ?? "",
    style: style || sharedTypeStyle(shared),
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

function supportsCompositedAnimation() {
  return typeof Element !== "undefined"
    && typeof Element.prototype?.animate === "function";
}

function animationDuration(animation) {
  const effectDuration = animation?.effect?.getTiming?.().duration;
  const timingDuration = animation?.timing?.duration;
  const duration = Number(effectDuration ?? timingDuration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function animationProgress(animation) {
  if (!animation) return null;
  const computedProgress = animation.effect?.getComputedTiming?.().progress;
  if (computedProgress != null && Number.isFinite(Number(computedProgress))) {
    return Math.max(0, Math.min(1, Number(computedProgress)));
  }
  const duration = animationDuration(animation);
  const currentTime = animation.currentTime;
  if (duration != null && currentTime != null && Number.isFinite(Number(currentTime))) {
    return Math.max(0, Math.min(1, Number(currentTime) / duration));
  }
  return null;
}

function normalizeRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left ?? rect.x);
  const top = Number(rect.top ?? rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return {
    x: left,
    y: top,
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function sampleRenderedIdentity(record) {
  const rect = normalizeRect(record?.shellNode?.getBoundingClientRect?.());
  if (!rect) return null;
  const fallback = record.from || record.to || {};
  const computed = typeof window !== "undefined"
    ? window.getComputedStyle?.(record.shellNode)
    : null;
  const shared = {};
  for (const key of SHARED_LAYERS) {
    const fallbackLayer = fallback.shared?.[key];
    const layerRect = normalizeRect(record.sharedNodes?.[key]?.getBoundingClientRect?.());
    shared[key] = layerRect && fallbackLayer
      ? { ...fallbackLayer, rect: layerRect }
      : fallbackLayer || null;
  }
  return {
    ...fallback,
    rect,
    radius: Number.parseFloat(computed?.borderRadius) || fallback.radius || 0,
    paint: {
      ...(fallback.paint || {}),
      background: computed?.backgroundColor || fallback.paint?.background || "",
    },
    shared,
  };
}

function sampleAnimationRecord(record) {
  if (!record?.from || !record?.to) return null;
  const shellProgress = animationProgress(record.shellAnimation);
  if (shellProgress == null) return sampleRenderedIdentity(record);

  const sampled = interpolateIdentity(record.from, record.to, shellProgress);
  for (const key of SHARED_LAYERS) {
    const from = record.from.shared?.[key];
    const to = record.to.shared?.[key];
    if (!from && !to) {
      sampled.shared[key] = null;
      continue;
    }
    const progress = animationProgress(record.sharedAnimations?.[key]);
    sampled.shared[key] = interpolateSharedLayer(from, to, progress ?? shellProgress);
  }
  return sampled;
}

function animationPlan(snapshot, registry, interruptFromRef, activeAnimationRef) {
  const state = snapshot?.state;
  const source = snapshot?.sourceSnapshot;
  const dest = destFromRegistry(registry, snapshot?.key);
  const target = snapshot?.targetSnapshot;
  const progress = snapshot?.inFlightProgress ?? 0;

  if (state === "opening" && source?.rect) {
    return {
      from: interpolateIdentity(source, dest || source, progress),
      to: dest || source,
    };
  }
  if (state === "closing" && (dest?.rect || source?.rect) && target?.rect) {
    return {
      from: dest || source,
      to: target,
    };
  }
  if (state === "cancelling" && (source?.rect || dest?.rect)) {
    const sampled = sampleAnimationRecord(activeAnimationRef?.current);
    const fallback = supportsCompositedAnimation()
      ? null
      : interpolateIdentity(source, dest || source, progress);
    return {
      // A live WAAPI animation must be sampled at interruption. The progress
      // field is only a deterministic fallback for the non-WAAPI renderer.
      from: sampled || interruptFromRef.current || fallback,
      to: target || source || dest,
    };
  }
  return null;
}

function shellTransform(from, to) {
  const fromRect = from.rect;
  const toRect = to.rect;
  const scaleX = toRect.width ? fromRect.width / toRect.width : 1;
  const scaleY = toRect.height ? fromRect.height / toRect.height : 1;
  return `translate3d(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px, 0px) scale(${scaleX}, ${scaleY})`;
}

function layerTransform(from, to) {
  return `translate3d(${from.rect.left - to.rect.left}px, ${from.rect.top - to.rect.top}px, 0px)`;
}

function shellStyleForAnimation(from, to) {
  const style = viewportBox(to.rect);
  style.transform = shellTransform(from, to);
  style.transformOrigin = "0 0";
  style.borderRadius = `${to.radius ?? 0}px`;
  style.backgroundColor = to.paint?.background ?? "";
  style.willChange = "transform, border-radius, background-color";
  return style;
}

function sharedStyleForAnimation(from, to, textSource) {
  const style = sharedTypeStyle(textSource, to.rect);
  style.transform = layerTransform(from, to);
  style.transformOrigin = "0 0";
  style.width = `${to.rect.width}px`;
  style.height = `${to.rect.height}px`;
  style.willChange = "transform, width, height, color";
  return style;
}

function shellKeyframe(identity, base) {
  return {
    transform: shellTransform(identity, base),
    borderRadius: `${identity.radius ?? 0}px`,
    backgroundColor: identity.paint?.background ?? "",
  };
}

function sharedKeyframe(identity, base) {
  return {
    transform: layerTransform(identity, base),
    width: `${identity.rect.width}px`,
    height: `${identity.rect.height}px`,
    color: identity.color || identity.style?.color || "",
  };
}

function safeAnimate(node, keyframes, timing) {
  if (!node || typeof node.animate !== "function") return null;
  try {
    return node.animate(keyframes, timing);
  } catch {
    return null;
  }
}

function playOverlayAnimation({
  shellNode,
  sharedNodes,
  from,
  to,
  state,
  runId,
  transaction,
}) {
  if (!shellNode || !from?.rect || !to?.rect) return null;
  const duration = state === "opening" ? MORPH_TIMING.OBJECT_OPEN_MS : MORPH_TIMING.OBJECT_CLOSE_MS;
  const easing = state === "cancelling"
    ? MORPH_EASING.RETRACT
    : state === "closing"
      ? MORPH_EASING.RELEASE
      : MORPH_EASING.DECELERATE;
  const timing = { duration, easing, fill: "forwards" };
  const shellAnimation = safeAnimate(
    shellNode,
    [shellKeyframe(from, to), shellKeyframe(to, to)],
    timing,
  );
  if (!shellAnimation) return null;

  const sharedAnimations = {};
  for (const key of SHARED_LAYERS) {
    const fromLayer = from.shared?.[key];
    const toLayer = to.shared?.[key];
    if (!fromLayer?.rect || !toLayer?.rect) continue;
    const animation = safeAnimate(
      sharedNodes?.[key],
      [sharedKeyframe(fromLayer, toLayer), sharedKeyframe(toLayer, toLayer)],
      timing,
    );
    if (animation) {
      animation.finished?.then?.(() => {}, () => {});
      sharedAnimations[key] = animation;
    }
  }

  const record = {
    shellNode,
    sharedNodes,
    shellAnimation,
    sharedAnimations,
    from,
    to,
    state,
    runId,
  };

  shellAnimation.finished?.then?.(() => {
    if (transaction?.getRunId?.() !== runId && transaction?.getSnapshot?.()?.runId !== runId) {
      return;
    }
    if (state === "opening") transaction?.settleOpen?.(runId);
    if (state === "closing" || state === "cancelling") transaction?.settleClose?.(runId);
  }, () => {});
  return record;
}

function cancelAnimationRecord(record) {
  record?.shellAnimation?.cancel?.();
  for (const animation of Object.values(record?.sharedAnimations || {})) {
    animation?.cancel?.();
  }
}

export function MorphSurface({ transactionSnapshot, registry, transaction } = {}) {
  const overlayRef = useRef(null);
  const shellRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const interruptFromRef = useRef(null);
  const animationRef = useRef(null);
  const sharedNodesRef = useRef({});

  const state = transactionSnapshot?.state;
  if (state !== "cancelling") interruptFromRef.current = null;

  const frame = computeOverlayFrame(transactionSnapshot, registry, interruptFromRef);
  const plan = animationPlan(transactionSnapshot, registry, interruptFromRef, animationRef);
  const composited = supportsCompositedAnimation() && Boolean(plan?.from?.rect && plan?.to?.rect);
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
    if (liveSource && sourceNodeRef.current && sourceNodeRef.current !== liveSource) {
      restoreSourcePaint(sourceNodeRef.current);
    }
    if (liveSource) sourceNodeRef.current = liveSource;

    if (morphing && sourceNodeRef.current) suppressSourcePaint(sourceNodeRef.current);
    if (snap.state === "idle") {
      if (sourceNodeRef.current) restoreSourcePaint(sourceNodeRef.current);
      sourceNodeRef.current = null;
    }

    const overlay = overlayRef.current;
    const shell = shellRef.current;
    const previousPlan = animationRef.current;
    if (!morphing && previousPlan) {
      cancelAnimationRecord(previousPlan);
      animationRef.current = null;
    }
    if (!morphing || !overlay || !shell || typeof shell.animate !== "function") return undefined;

    const nextPlan = animationPlan(snap, registry, interruptFromRef, animationRef);
    if (!nextPlan?.from?.rect || !nextPlan?.to?.rect) return undefined;
    const record = playOverlayAnimation({
      shellNode: shell,
      sharedNodes: sharedNodesRef.current,
      from: nextPlan.from,
      to: nextPlan.to,
      state: snap.state,
      runId: snap.runId,
      transaction,
    });
    animationRef.current = record;

    return () => {
      if (record?.state === "opening") {
        const sampled = sampleAnimationRecord(record);
        if (sampled) interruptFromRef.current = sampled;
      }
      cancelAnimationRecord(record);
      if (animationRef.current === record) animationRef.current = null;
    };
  }, [transactionSnapshot, registry, transaction]);

  useLayoutEffect(() => () => {
    cancelAnimationRecord(animationRef.current);
    if (sourceNodeRef.current) restoreSourcePaint(sourceNodeRef.current);
    sourceNodeRef.current = null;
    animationRef.current = null;
  }, []);

  if (!frame?.rect) return null;

  const shared = frame.shared || {};
  const markerType = shared.marker?.type || "marker";
  const destBox = dest?.rect ? viewportBox(dest.rect) : null;
  const overlayStyle = {
    ...viewportBox(frame.rect),
    overflow: "visible",
    borderRadius: composited ? "0px" : `${frame.radius ?? 0}px`,
    backgroundColor: composited ? "transparent" : frame.paint?.background ?? "",
  };
  const shellStyle = composited
    ? shellStyleForAnimation(plan.from, plan.to)
    : {
      ...viewportBox(frame.rect),
      borderRadius: `${frame.radius ?? 0}px`,
      backgroundColor: frame.paint?.background ?? "",
    };

  const renderLayer = (key, dataAttr, attrValue) => {
    const rendered = composited ? plan.from.shared?.[key] || plan.to.shared?.[key] : shared[key];
    if (!rendered?.rect) return null;
    const style = composited && plan.from.shared?.[key]?.rect && plan.to.shared?.[key]?.rect
      ? sharedStyleForAnimation(plan.from.shared[key], plan.to.shared[key], rendered)
      : sharedTypeStyle(rendered);
    return renderSharedLayer(rendered, dataAttr, attrValue, {
      ref: (node) => {
        sharedNodesRef.current[key] = node;
      },
      style,
    });
  };

  return createElement(
    "div",
    {
      ref: overlayRef,
      "data-morph-overlay": "",
      style: overlayStyle,
    },
    createElement("div", {
      ref: shellRef,
      "data-morph-shell": "",
      style: shellStyle,
    }),
    renderLayer("title", "data-morph-title"),
    renderLayer("meta", "data-morph-meta"),
    renderLayer("marker", "data-morph-marker", markerType),
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
