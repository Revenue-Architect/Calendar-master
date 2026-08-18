---
name: Playwright runtime setup
description: Environment constraints for running the project's browser suites in a fresh Replit workspace.
---

The declared Playwright package does not guarantee that its matching Chromium binary or native Linux libraries are present in a fresh workspace.

**Why:** Browser checks can fail before the first assertion because the executable or shared libraries are absent. Installing those dependencies through generic package tooling can also add unrelated modules or port mappings to `.replit`.

**How to apply:** Treat executable/library launch failures as test-environment setup, not product failures. After provisioning the pinned browser runtime, review `.replit` and the lockfile so tooling-only metadata does not enter the product diff.