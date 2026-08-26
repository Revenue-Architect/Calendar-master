export function clampProgress(t) {
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(1, t));
}

export function lerp(a, b, t) {
  return Number(a) + (Number(b) - Number(a)) * t;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function interpolateRect(from = {}, to = {}, t) {
  const p = clampProgress(t);
  const x = lerp(num(from.x, from.left), num(to.x, to.left), p);
  const y = lerp(num(from.y, from.top), num(to.y, to.top), p);
  const width = lerp(num(from.width), num(to.width), p);
  const height = lerp(num(from.height), num(to.height), p);
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function parseRgb(color) {
  if (!color || typeof color !== "string") return null;
  const match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function interpolateColor(from, to, t) {
  const p = clampProgress(t);
  const a = parseRgb(from);
  const b = parseRgb(to);
  if (!a || !b) {
    return p >= 1 ? (to || from || "") : (from || to || "");
  }
  return `rgb(${Math.round(lerp(a[0], b[0], p))}, ${Math.round(lerp(a[1], b[1], p))}, ${Math.round(lerp(a[2], b[2], p))})`;
}

export function interpolateShellGeometry(from, to, t, {
  fromRadius = 0,
  toRadius = 0,
  fromPaint,
  toPaint,
} = {}) {
  const p = clampProgress(t);
  const fromBg = fromPaint?.background ?? "";
  const toBg = toPaint?.background ?? "";
  return {
    rect: interpolateRect(from, to, p),
    radius: lerp(num(fromRadius), num(toRadius), p),
    paint: {
      background: interpolateColor(fromBg, toBg, p),
    },
    progress: p,
  };
}

export function interpolateSharedLayer(from, to, t) {
  if (!from && !to) return null;
  const p = clampProgress(t);
  const start = from || to;
  const end = to || from;
  if (!start?.rect || !end?.rect) return from || to || null;
  return {
    text: p >= 1 ? (end.text ?? start.text ?? "") : (start.text ?? end.text ?? ""),
    type: start.type || end.type || null,
    rect: interpolateRect(start.rect, end.rect, p),
    color: interpolateColor(start.color || start.style?.color, end.color || end.style?.color, p),
    fontFamily: start.fontFamily || start.style?.fontFamily || end.fontFamily || end.style?.fontFamily || "",
    fontSize: start.fontSize || start.style?.fontSize || end.fontSize || end.style?.fontSize || "",
    fontWeight: start.fontWeight || start.style?.fontWeight || end.fontWeight || end.style?.fontWeight || "",
    lineHeight: start.lineHeight || start.style?.lineHeight || end.lineHeight || end.style?.lineHeight || "",
    style: start.style || end.style || null,
  };
}

export function interpolateSharedElements(fromShared = {}, toShared = {}, t) {
  return {
    title: interpolateSharedLayer(fromShared.title, toShared.title, t),
    meta: interpolateSharedLayer(fromShared.meta, toShared.meta, t),
    marker: interpolateSharedLayer(fromShared.marker, toShared.marker, t),
  };
}

export function interpolateIdentity(from, to, t) {
  if (!from && !to) return null;
  const p = clampProgress(t);
  const start = from || to;
  const end = to || from;
  if (!start?.rect || !end?.rect) return start || end;
  const shell = interpolateShellGeometry(start.rect, end.rect, p, {
    fromRadius: start.radius ?? 0,
    toRadius: end.radius ?? 0,
    fromPaint: start.paint,
    toPaint: end.paint,
  });
  return {
    rect: shell.rect,
    radius: shell.radius,
    paint: shell.paint,
    shared: interpolateSharedElements(start.shared, end.shared, p),
    progress: p,
  };
}

export function isDestinationContentRevealed({
  progress,
  state,
  fromRect,
  toRect,
} = {}) {
  if (state === "open") return true;
  if (state !== "opening") return false;
  const p = clampProgress(progress);
  if (p >= 1) return true;
  if (!toRect) return false;
  const frame = interpolateRect(fromRect || toRect, toRect, p);
  return frame.width >= num(toRect.width) * 0.9 && frame.height >= num(toRect.height) * 0.9;
}

const savedSourceOpacity = new WeakMap();

export function suppressSourcePaint(node) {
  if (!node || !node.style) return;
  if (!savedSourceOpacity.has(node)) {
    savedSourceOpacity.set(node, node.style.opacity);
  }
  node.style.opacity = "0";
}

export function restoreSourcePaint(node) {
  if (!node || !node.style || !savedSourceOpacity.has(node)) return;
  const previous = savedSourceOpacity.get(node);
  savedSourceOpacity.delete(node);
  if (previous == null || previous === "") {
    if (typeof node.style.removeProperty === "function") node.style.removeProperty("opacity");
    else node.style.opacity = "";
  } else {
    node.style.opacity = previous;
  }
}
