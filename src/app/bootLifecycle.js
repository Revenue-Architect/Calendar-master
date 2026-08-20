/*
 * The boot trail is deliberately independent from Planner and from the
 * notebook stores. It exists to answer "why did this document disappear?"
 * without ever copying the thing the document contains.
 *
 * A session-scoped store is used instead of the canonical notebook store so a
 * malformed or full diagnostics record can never prevent the planner from
 * booting. Every value written here is a bounded enum, token, or timestamp.
 */

export const BOOT_LIFECYCLE_VERSION = 1;
export const BOOT_LIFECYCLE_STORAGE_KEY = "nbmp:boot-lifecycle:v1";
export const MAX_BOOT_LIFECYCLE_EVENTS = 64;
export const DEFAULT_BUILD_ID = "dev";

const EVENT_TYPES = new Set([
  "boot-start",
  "pageshow",
  "pagehide",
  "visibilitychange",
  "freeze",
  "resume",
  "vite-before-full-reload",
  "bootstrap-failure",
  "boundary-failure",
  "root-commit",
]);
const NAVIGATION_TYPES = new Set(["navigate", "reload", "back-forward", "prerender", "unknown"]);
const VISIBILITY_STATES = new Set(["visible", "hidden", "unknown"]);
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function safeNow() {
  return new Date().toISOString();
}

function safeToken(value, fallback = "unknown") {
  const candidate = typeof value === "string" ? value : "";
  return SAFE_TOKEN.test(candidate) ? candidate : fallback;
}

function safeEventType(value) {
  return EVENT_TYPES.has(value) ? value : "bootstrap-failure";
}

function safeNavigationType(value) {
  return NAVIGATION_TYPES.has(value) ? value : "unknown";
}

function safeVisibility(value) {
  return VISIBILITY_STATES.has(value) ? value : "unknown";
}

function safeTimestamp(value) {
  if (typeof value === "string" && ISO_UTC_TIMESTAMP.test(value)) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && new Date(parsed).toISOString() === value) return value;
  }
  return safeNow();
}

function randomToken(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch {
    /* A timestamp is sufficient for local diagnostics if crypto is blocked. */
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionStorage() {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function normaliseEvent(event = {}, sessionId = randomToken("boot")) {
  const input = event && typeof event === "object" ? event : {};
  return {
    sessionId: safeToken(input.sessionId, sessionId),
    type: safeEventType(input.type),
    at: safeTimestamp(input.at),
    reason: safeToken(input.reason),
    navigationType: safeNavigationType(input.navigationType),
    visibility: safeVisibility(input.visibility),
  };
}

export function createBootLifecycle(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const sessionId = safeToken(source.sessionId, randomToken("boot"));
  const events = Array.isArray(source.events)
    ? source.events.map((event) => normaliseEvent(event, sessionId)).slice(-MAX_BOOT_LIFECYCLE_EVENTS)
    : [];
  return {
    version: BOOT_LIFECYCLE_VERSION,
    buildId: safeToken(source.buildId, DEFAULT_BUILD_ID),
    sessionId,
    startedAt: safeTimestamp(source.startedAt),
    navigationType: safeNavigationType(source.navigationType),
    events,
  };
}

export function readBootLifecycle(storage = getSessionStorage()) {
  if (!storage || typeof storage.getItem !== "function") return createBootLifecycle();
  try {
    const raw = storage.getItem(BOOT_LIFECYCLE_STORAGE_KEY);
    if (!raw) return createBootLifecycle();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return createBootLifecycle();
    if (parsed.version !== BOOT_LIFECYCLE_VERSION) return createBootLifecycle();
    return createBootLifecycle(parsed);
  } catch {
    /* Diagnostics corruption is not a boot blocker. */
    return createBootLifecycle();
  }
}

export function writeBootLifecycle(ledger, storage = getSessionStorage()) {
  const next = createBootLifecycle(ledger);
  try {
    storage?.setItem?.(BOOT_LIFECYCLE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Quota/private-mode errors must never reach the planner boot path. */
  }
  return next;
}

export function appendBootLifecycleEvent(ledger, event) {
  const current = createBootLifecycle(ledger);
  const nextEvent = normaliseEvent(event, current.sessionId);
  /* StrictMode mounts effects twice in development. Root commit is a lifecycle
     fact, not two separate navigations, so keep it idempotent per session. */
  if (nextEvent.type === "root-commit" && current.events.some(
    (entry) => entry.type === "root-commit" && entry.sessionId === current.sessionId,
  )) {
    return current;
  }
  return createBootLifecycle({ ...current, events: [...current.events, nextEvent] });
}

export function recordBootLifecycleEvent(type, details = {}, storage = getSessionStorage()) {
  const current = readBootLifecycle(storage);
  const next = appendBootLifecycleEvent(current, { ...details, type });
  return writeBootLifecycle(next, storage);
}

function navigationType() {
  try {
    const entry = globalThis.performance?.getEntriesByType?.("navigation")?.[0];
    return safeNavigationType(entry?.type);
  } catch {
    return "unknown";
  }
}

function visibility() {
  try {
    return safeVisibility(globalThis.document?.visibilityState);
  } catch {
    return "unknown";
  }
}

function buildId() {
  try {
    return safeToken(globalThis.__PLANNER_BUILD_ID__, DEFAULT_BUILD_ID);
  } catch {
    return DEFAULT_BUILD_ID;
  }
}

export function installBootLifecycleListeners({ storage = getSessionStorage(), build = buildId() } = {}) {
  const previous = readBootLifecycle(storage);
  const initial = createBootLifecycle({
    buildId: build,
    navigationType: navigationType(),
    startedAt: safeNow(),
    sessionId: randomToken("boot"),
    events: [
      ...previous.events,
      { type: "boot-start", reason: "document-load", navigationType: navigationType(), visibility: visibility() },
    ],
  });
  writeBootLifecycle(initial, storage);

  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return initial;
  const record = (type, details = {}) => recordBootLifecycleEvent(type, details, storage);
  const onPageShow = () => record("pageshow", { visibility: visibility() });
  const onPageHide = () => record("pagehide", { visibility: visibility() });
  const onVisibility = () => record("visibilitychange", { visibility: visibility() });
  const onFreeze = () => record("freeze", { visibility: visibility() });
  const onResume = () => record("resume", { visibility: visibility() });
  const onBeforeFullReload = () => record("vite-before-full-reload");
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("freeze", onFreeze);
  window.addEventListener("resume", onResume);
  window.addEventListener("vite:beforeFullReload", onBeforeFullReload);

  return {
    ...initial,
    dispose() {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("freeze", onFreeze);
      window.removeEventListener("resume", onResume);
      window.removeEventListener("vite:beforeFullReload", onBeforeFullReload);
    },
  };
}

export function startBootLifecycle(options = {}) {
  const lifecycle = installBootLifecycleListeners(options);
  if (typeof window !== "undefined") {
    /* A tiny diagnostics surface for the existing developer console. It is a
       function, not the ledger itself, so callers cannot mutate our record. */
    window.__plannerBootDiagnostics = () => readBootLifecycle(options.storage || getSessionStorage());
    window.__plannerClearBootDiagnostics = () => clearBootLifecycle(options.storage || getSessionStorage());
  }
  return lifecycle;
}

export function markRootCommitted(details = {}, storage = getSessionStorage()) {
  return recordBootLifecycleEvent("root-commit", { ...details, reason: "success" }, storage);
}

export function recordBootstrapFailure(reason = "entry-failed", storage = getSessionStorage()) {
  return recordBootLifecycleEvent("bootstrap-failure", { reason }, storage);
}

export function recordBoundaryFailure(storage = getSessionStorage()) {
  return recordBootLifecycleEvent("boundary-failure", { reason: "react-render" }, storage);
}

export function clearBootLifecycle(storage = getSessionStorage()) {
  try { storage?.removeItem?.(BOOT_LIFECYCLE_STORAGE_KEY); } catch { /* best effort */ }
}
