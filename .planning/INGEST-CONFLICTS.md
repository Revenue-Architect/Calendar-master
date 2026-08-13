## Conflict Detection Report

### BLOCKERS (0)

### WARNINGS (0)

### INFO (3)

[INFO] Resolved: daily-note cardinality
  Note: User approved 2026-08-13. Each user/date has at most one primary daily note plus zero or more additional day-linked notes. Default editor resolves/creates the primary note. Additional notes require explicit creation. Event/task-linked notes do not compete for the primary slot. Living PRD 2.2 and decision log updated.

[INFO] Auto-resolved: SPEC > PRD on Week Action gestures
  Note: docs/interaction-contracts/planner-interactions.md defers Week Action move, resize, and swipe. docs/product/planner-foundation.md section 6.3 says drag to move, resize, or change date. SPEC wins. Synthesized constraint keeps Week Action gestures deferred.

[INFO] Complementary, not contradictory: ADR target tree vs SPEC freeze
  Note: docs/adr/0001-domain-oriented-modular-monolith.md owns the target modular-monolith tree. docs/spec/structure.md freezes the current ownership map and does not authorize a folder move. Both retained. SPEC placement rules are the in-force constraint until the ADR migration continues incrementally.
