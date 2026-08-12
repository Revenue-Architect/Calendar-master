import assert from "node:assert/strict";
import test from "node:test";

import { eventForUi } from "./eventPresentation.js";

test("a segmented overnight occurrence keeps the day's slice, not the full span", () => {
  const view = eventForUi({
    id: "overnight:2026-08-09",
    date: "2026-08-09",
    start: 1410,
    dur: 30,
    timing: {
      kind: "timed",
      timeZoneMode: "floating",
      startLocal: "2026-08-09T23:30",
      endLocal: "2026-08-10T01:00",
    },
  });
  assert.equal(view.start, 1410);
  assert.equal(view.dur, 30);
});

test("an unsegmented multi-day timed event is clipped to the remaining minutes of its start day", () => {
  const view = eventForUi({
    id: "long",
    timing: {
      kind: "timed",
      timeZoneMode: "floating",
      startLocal: "2026-08-09T22:00",
      endLocal: "2026-08-11T02:00",
    },
  });
  assert.equal(view.start, 1320);
  assert.equal(view.dur, 120, "22:00 through midnight, not the 28-hour trip");
});
