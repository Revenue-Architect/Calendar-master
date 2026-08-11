function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function fluidPillBox(containerRect, activeRect) {
  return {
    left: finite(activeRect.left) - finite(containerRect.left),
    top: finite(activeRect.top) - finite(containerRect.top),
    width: Math.max(0, finite(activeRect.width)),
    height: Math.max(0, finite(activeRect.height)),
  };
}

export function fluidPillStretch(previousBox, nextBox) {
  if (!previousBox || !nextBox) return 1;
  const distance = Math.abs(finite(previousBox.left) - finite(nextBox.left));
  return 1 + Math.min(0.18, distance / 400);
}

export function fluidMorphFromRects(triggerRect, panelRect) {
  const triggerCenterX = finite(triggerRect.left) + finite(triggerRect.width) / 2;
  const triggerCenterY = finite(triggerRect.top) + finite(triggerRect.height) / 2;
  const panelCenterX = finite(panelRect.left) + finite(panelRect.width) / 2;
  const panelCenterY = finite(panelRect.top) + finite(panelRect.height) / 2;
  const scale = (from, to) => Math.max(0.12, Math.min(1, to > 0 ? from / to : 1));

  return {
    translateX: triggerCenterX - panelCenterX,
    translateY: triggerCenterY - panelCenterY,
    scaleX: scale(finite(triggerRect.width), finite(panelRect.width)),
    scaleY: scale(finite(triggerRect.height), finite(panelRect.height)),
  };
}
