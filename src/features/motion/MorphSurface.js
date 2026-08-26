import { createElement } from "react";

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

export function MorphSurface({ transactionSnapshot } = {}) {
  if (transactionSnapshot?.state !== "opening" || !transactionSnapshot?.sourceSnapshot) {
    return null;
  }

  const source = transactionSnapshot.sourceSnapshot;
  const rect = source.rect;
  if (!rect) return null;

  const shared = source.shared || {};
  const markerType = shared.marker?.type || "marker";

  return createElement(
    "div",
    {
      "data-morph-overlay": "",
      style: {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: `${source.radius ?? 0}px`,
        backgroundColor: source.paint?.background ?? "",
        pointerEvents: "none",
      },
    },
    renderSharedLayer(shared.title, "data-morph-title"),
    renderSharedLayer(shared.meta, "data-morph-meta"),
    renderSharedLayer(shared.marker, "data-morph-marker", markerType),
  );
}
