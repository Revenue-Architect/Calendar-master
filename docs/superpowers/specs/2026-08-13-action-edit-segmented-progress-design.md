# Action edit segmented progress

**Status:** Approved for implementation  
**Date:** 2026-08-13

## Intent

The Actions page shows checklist progress as count-based segments that fill from
left to right. The Action edit sheet currently uses a continuous percentage bar,
so the same Action communicates progress differently depending on where it is
opened.

## Design

Use one passive `SegmentedProgress` view for both surfaces. It receives the theme,
completed count, total count, and accessible label. It derives segment occupancy
with the existing `progressSegmentStates` helper, so completion order never changes
which segment is filled. It owns the existing restrained fill/stagger animation so
the Actions card and edit sheet remain visually consistent.

The edit sheet keeps its existing `done / total` text beside the bar. The component
returns no markup when the checklist is empty, preserving the current no-progress
state. No task model, persistence command, modal lifecycle, or dependency changes
are part of this fix.

## Verification

- Existing progress geometry tests continue to prove left-to-right count semantics.
- The production web build must pass.
- The full unit suite must pass.
- The final diff must be limited to the shared progress view, its focused test,
  the two render call sites, and this design record.
