# Where new code goes

This freezes the current ownership map. It does not authorize a folder move.
Accepted ADR 0001 still owns the target tree. Finish that migration
incrementally. Do not invent a fourth documentation plane and do not grow
`Planner.jsx`.

## Precedence

Accepted ADR > approved SPEC > living PRD > `DESIGN.md` > interaction contracts
> QA/plans > agent memory.

## Source

| Kind of change | Put it here | Do not put it here |
| --- | --- | --- |
| Domain rule, command, query, migration | `src/domains/<bounded-context>/` and export it from that domain's `index.js` | `Planner.jsx`, another domain's internals |
| Persistence, schema cutover, import/export | `src/platform/persistence/` | Domain UI, `features/planner` overflow |
| Date, id, validation primitive | `src/shared/` | A domain or a one-off helper at the bottom of Planner |
| Application use-case, undo, projection, gesture arithmetic | `src/features/<area>/` until a real `src/app/` service exists | New helpers appended to Planner |
| Visible React surface | `src/features/*/Foo.jsx` for now; later `src/ui/...` once that tree exists | Markup added to the 8k-line Planner composition root |
| Sheet morph, fluid trigger snapshot, planner stylesheet | `src/features/motion/` (`morphTiming.js`, `fluidTrigger.js`, `plannerStyles.js`, `Sheet.jsx`) | A `<style>` template or `Sheet` function appended to Planner |
| Host storage adapter | `src/storage.js` | ErrorBoundary or a domain |

Planner remains the composition root: state, wiring, and existing surfaces.
New behavior extracts beside the owner. Tests stay colocated as `*.test.js`.
Browser specs stay in `tests/e2e/` and are not renamed as part of organization.

## Docs

| Kind | Living home |
| --- | --- |
| Architecture decision | `docs/adr/` |
| Product capability | `docs/product/` |
| In-force implementation contract | `docs/spec/` or `docs/interaction-contracts/` |
| Visual constitution | `DESIGN.md` |
| Completed plans and QA evidence | keep in place until an approved archive pass |

Do not add `.planning/` as a source of truth. The draft Convex/Expo PRD is not
binding on folder structure.
