---
name: Sheet motion scheduling
description: Performance rule for coordinating sheet morphs with content-driven resizing.
---

Sheet entry must complete using compositor-friendly geometry before content-driven height interpolation is enabled. Take the resting height before paint, keep observers disconnected during entry, absorb one final unanimated measurement at entry completion, then observe later content changes with coalesced and deduplicated updates.

**Why:** Transform/clip-path entry and `height` interpolation on the same scrolling panel caused repeated layout of sticky and overflow descendants. A live `ResizeObserver` amplified it by writing new height state while the morph was still running, producing visible stutter and a delayed second bounce.

**How to apply:** Whenever sheet motion or dynamic sheet content changes, preserve this sequence: initial measure → entry motion → final unanimated measure → enable resize observation. Do not fix stutter by easing tweaks while layout and compositor animations still overlap.