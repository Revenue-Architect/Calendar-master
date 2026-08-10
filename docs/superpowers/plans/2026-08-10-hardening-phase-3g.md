# Accessibility, Diagnostics, and Input Hardening — Phase 3G Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` task-by-task. Every
> behavior starts with a focused failing Node test and is published only after the
> complete repository passes.

**Goal:** Close the remaining local-first reliability, accessibility, and
untrusted-input foundation gaps without adding remote telemetry or provider scope.

**Architecture:** Small pure modules own focus calculations, diagnostic records,
and import bounds. Planner integrates them only at its UI and persistence seams;
Notes retains its canonical portable transforms.

**Tech Stack:** React 19, JavaScript ES modules, Vite 7, Node built-in test runner.

## Task 1 — Bound untrusted Notes import input

- [x] Add failing portability tests for oversized plain text, Markdown, native
  note/tag/attachment counts, and an oversized native block before any transform.
- [x] Implement explicit constants and validate bounds in the Notes portability
  parser before normalizing a bundle or creating a note.
- [x] Run focused portability tests green.

## Task 2 — Dialog focus and live announcements

- [x] Add failing pure tests for first/last/empty dialog focus cycling.
- [x] Implement focusable-element collection and tab-cycle handling in a focused
  accessibility module; adopt it in `Sheet` with opener restoration and a labelled
  title. Add polite/assertive live-region semantics to existing trust messages.
- [x] Run the focused accessibility tests and production build green.

## Task 3 — Redacted local diagnostics

- [x] Add failing tests for diagnostic normalization, capped retention, content-free
  export, missing/malformed storage behavior, and no diagnostic-store feedback loop.
- [x] Implement a versioned diagnostics model/store and wire later Planner
  persistence failures into it without saving arbitrary error text.
- [x] Run focused diagnostics tests green.

## Task 4 — QA and publication

- [x] Add design/plan/product/QA documentation and mark the shared foundation
  complete.
- [x] Run `npm test`, `npm run build`, `git diff --check`, and production audit;
  attempt available browser flows and state exact limitations.
- [x] Commit `feat: harden planner accessibility and diagnostics`, publish non-force
  to `main`, fetch/rebase, and verify identical local/remote tree hashes.
