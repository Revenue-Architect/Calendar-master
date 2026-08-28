import React from "react";

import Sheet from "../motion/Sheet.jsx";

/* The Event Inspector keeps the battle-tested Sheet accessibility contract while
 * giving the physical-object path a distinct presentation boundary. The Sheet
 * remains the real, focusable destination; MorphSurface only carries the visual
 * shell and shared identity while this destination is intentionally hidden. */
export default function EventInspectorSurface({
  motionState,
  onMorphClose,
  physical = false,
  instant = false,
  objectMorphSource = null,
  ...sheetProps
}) {
  const presentation = physical
    ? "event-morph"
    : instant
      ? "instant"
      : (sheetProps.presentation || "sheet");

  return (
    <Sheet
      {...sheetProps}
      presentation={presentation}
      presentationState={physical ? motionState : null}
      objectMorphSource={physical ? objectMorphSource : null}
      onMorphClose={physical ? onMorphClose : null}
      eventInspectorSurface={physical ? "morph" : instant ? "instant" : undefined}
    />
  );
}
