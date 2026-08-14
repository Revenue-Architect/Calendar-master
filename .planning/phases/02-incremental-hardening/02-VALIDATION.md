---
phase: 2
slug: incremental-hardening
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-14
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js Test Runner (`node:test`) |
| **Config file** | `package.json` (npm test script: `node --test src/**/*.test.js`) |
| **Quick run command** | `node --test src/domains/notes/tests/notes.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~1 second (quick) / ~22 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test src/domains/notes/tests/notes.test.js`
- **After every plan wave:** Run `npm test`
- **Before `$gsd-verify-work`:** Full suite must be green (550+ tests passing)
- **Max feedback latency:** 2 seconds for unit test feedback

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | NOTE-02 | — | Uniqueness of primary daily note per dateKey | unit | `node --test src/domains/notes/tests/notes.test.js` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | NOTE-03 | — | Explicit creation of additional day-linked notes & designate primary | unit | `node --test src/domains/notes/tests/notes.test.js` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | ARCH-03 | — | Logic extracts beside owner; no growth in `Planner.jsx` | unit / linter | `npm test` | ✅ | ⬜ pending |
| 02-02-02 | 02 | 2 | PROD-03 | — | Provider APIs and external sync remain deferred | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (`node:test` test harness already runs 550 tests across all domains).

---

## Manual-Only Verifications

All phase behaviors have automated verification via `node:test` unit and projection tests.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all dependencies
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-08-14
