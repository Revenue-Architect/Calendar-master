import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOM from "react-dom/client";
import { eventMorphKey } from "./morphKeys.js";
import { MorphSurface } from "./MorphSurface.js";
import { createMorphRegistry } from "./morphRegistry.js";
import { createMorphTransaction, MORPH_STATES } from "./morphTransaction.js";
import { interpolateIdentity } from "./morphInterpolate.js";

/* Phase 4 RED fixture — ARD §8 / plan Task 4.1.
 *
 * Expected overlay origin/settlement values are literals, not copies of
 * registry snapshots. A hardcoded overlay at SOURCE_A.x (48) must fail the
 * +8px negative control (SOURCE_OFFSET.x === 56). */

function box(x, y, width, height) {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

const SOURCE_A = box(48, 120, 160, 52);
const SOURCE_A_TITLE = box(56, 128, 88, 16);
const SOURCE_A_META = box(148, 130, 48, 12);
const SOURCE_A_MARKER = box(184, 126, 16, 16);

const SOURCE_OFFSET = box(56, 120, 160, 52);
const SOURCE_OFFSET_TITLE = box(64, 128, 88, 16);
const SOURCE_OFFSET_META = box(156, 130, 48, 12);
const SOURCE_OFFSET_MARKER = box(192, 126, 16, 16);

const SOURCE_B = box(88, 216, 160, 52);
const SOURCE_B_TITLE = box(96, 224, 88, 16);
const SOURCE_B_META = box(188, 226, 48, 12);
const SOURCE_B_MARKER = box(224, 222, 16, 16);

const DEST = box(24, 40, 360, 480);
const DEST_TITLE = box(48, 64, 200, 28);
const DEST_META = box(280, 70, 80, 16);
const DEST_MARKER = box(348, 68, 20, 20);
const DEST_RADIUS = 20;
const MID = box(36, 80, 260, 266);
const MID_RADIUS = 16;
const TITLE_MID = box(52, 96, 144, 22);
const META_MID = box(214, 100, 64, 14);
const MARKER_MID = box(266, 97, 18, 18);
const OPEN_20 = box(43.2, 104, 200, 137.6);
const OPEN_75 = box(30, 60, 310, 373);

const DECOY = box(999, 8, 40, 24);

const SOURCE_RADIUS = 12;
const SOURCE_PAINT = {
  background: "rgb(36, 37, 42)",
  color: "rgb(245, 245, 247)",
  borderColor: "rgb(60, 61, 66)",
};

const KEY = eventMorphKey({
  eventId: "evt-fixture-1",
  dateKey: "2026-08-25",
  view: "day",
  lane: "timeline",
});

class MockElement {
  constructor(tag) {
    this.tagName = tag ? String(tag).toUpperCase() : "DIV";
    this.nodeName = this.tagName;
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.nodeType = 1;
    this.isConnected = true;
    this.ownerDocument = globalThis.document;
    this._layout = box(0, 0, 0, 0);
    this._paint = {
      borderRadius: "0px",
      backgroundColor: "",
      color: "",
      borderColor: "",
    };
    this.textContent = "";
    this.style = {
      setProperty(name, value) {
        const camel = String(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this[camel] = value;
      },
      removeProperty(name) {
        const camel = String(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete this[camel];
      },
    };
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this.attributes, k)
      ? this.attributes[k]
      : null;
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  insertBefore(c, ref) {
    const i = this.children.indexOf(ref);
    if (i >= 0) this.children.splice(i, 0, c);
    else this.children.push(c);
    c.parentNode = this;
    return c;
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    const left = parsePx(this.style.left);
    const top = parsePx(this.style.top);
    const width = parsePx(this.style.width);
    const height = parsePx(this.style.height);
    if (left != null && top != null && width != null && height != null) {
      return box(left, top, width, height);
    }
    return { ...this._layout };
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const out = [];
    walk(this, (el) => {
      if (el !== this && matchesAttr(el, selector)) out.push(el);
    });
    return out;
  }
}

function parsePx(value) {
  if (value == null || value === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function walk(el, visit) {
  visit(el);
  for (const child of el.children || []) walk(child, visit);
}

function matchesAttr(el, selector) {
  const match = /^\[([^\s=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(selector);
  if (!match) return false;
  const [, name, expected] = match;
  const actual = el.getAttribute(name);
  if (expected == null) return actual != null;
  return actual === expected;
}

globalThis.HTMLIFrameElement = class HTMLIFrameElement {};
globalThis.HTMLElement = MockElement;
globalThis.Element = MockElement;
globalThis.Node = MockElement;

const body = new MockElement("body");
globalThis.document = {
  nodeType: 9,
  createElement: (t) => new MockElement(t),
  createElementNS: (_ns, t) => new MockElement(t),
  createTextNode: (t) => ({
    nodeType: 3,
    textContent: t,
    parentNode: null,
    ownerDocument: globalThis.document,
  }),
  createComment: (t) => ({
    nodeType: 8,
    data: t,
    parentNode: null,
    ownerDocument: globalThis.document,
  }),
  body,
  documentElement: body,
  activeElement: null,
  defaultView: null,
  addEventListener() {},
  removeEventListener() {},
  querySelector(selector) {
    return body.querySelector(selector);
  },
  querySelectorAll(selector) {
    return body.querySelectorAll(selector);
  },
};
globalThis.window = {
  document: globalThis.document,
  innerWidth: 1280,
  innerHeight: 800,
  HTMLIFrameElement: globalThis.HTMLIFrameElement,
  HTMLElement: MockElement,
  Element: MockElement,
  Node: MockElement,
  addEventListener() {},
  removeEventListener() {},
  getComputedStyle(el) {
    return {
      borderRadius: el?.style?.borderRadius || el?._paint?.borderRadius || "0px",
      backgroundColor: el?.style?.backgroundColor || el?._paint?.backgroundColor || "",
      color: el?.style?.color || el?._paint?.color || "",
      borderColor: el?.style?.borderColor || el?._paint?.borderColor || "",
      opacity: el?.style?.opacity || "1",
      fontFamily: "",
      fontSize: "",
      fontWeight: "",
      lineHeight: "",
    };
  },
};
globalThis.document.defaultView = globalThis.window;

function wait(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockAnimation(node, keyframes, timing, { computedProgress } = {}) {
  let resolve;
  let reject;
  const duration = Number(timing?.duration) || 1;
  const animation = {
    node,
    playState: "running",
    currentTime: 0,
    computedProgress,
    keyframes,
    timing,
    effect: {
      getTiming: () => ({ duration }),
      getComputedTiming: () => ({ progress: animation.computedProgress }),
    },
    cancel() {
      animation.playState = "idle";
      reject?.(new Error("cancelled"));
    },
    finished: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    finish() {
      animation.playState = "finished";
      resolve?.();
    },
  };
  return animation;
}

function shellTransformFor(from, to) {
  const fromRect = from.rect;
  const toRect = to.rect;
  return `translate3d(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px, 0px) scale(${fromRect.width / toRect.width}, ${fromRect.height / toRect.height})`;
}

function layerTranslateFor(from, to) {
  return `translate3d(${from.rect.left - to.rect.left}px, ${from.rect.top - to.rect.top}px, 0px)`;
}

function animationLabel(node) {
  if (node?.getAttribute("data-morph-shell") != null) return "shell";
  if (node?.getAttribute("data-morph-title") != null) return "title";
  if (node?.getAttribute("data-morph-meta") != null) return "meta";
  if (node?.getAttribute("data-morph-marker") != null) return "marker";
  return null;
}

function createShared(tag, attr, value, rect, text) {
  const el = new MockElement(tag);
  el.setAttribute(attr, value);
  el._layout = { ...rect };
  el.textContent = text || "";
  return el;
}

function createCardNode({
  rect,
  titleRect,
  metaRect,
  markerRect,
  titleText = "Design Sync",
  timeText = "10:00 AM",
  radius = SOURCE_RADIUS,
  paint = SOURCE_PAINT,
  isConnected = true,
} = {}) {
  const node = new MockElement("article");
  node.isConnected = isConnected;
  node._layout = { ...rect };
  node._paint = {
    borderRadius: `${radius}px`,
    backgroundColor: paint.background,
    color: paint.color,
    borderColor: paint.borderColor,
  };
  node.appendChild(createShared("span", "data-morph-title", "", titleRect, titleText));
  node.appendChild(createShared("span", "data-morph-meta", "", metaRect, timeText));
  node.appendChild(createShared("span", "data-morph-marker", "progress-ring", markerRect, ""));
  return node;
}

function assertRectEqual(actual, expected, label) {
  assert.ok(actual, `${label} rect is missing`);
  for (const key of ["x", "y", "width", "height", "left", "top", "right", "bottom"]) {
    const got = actual[key];
    const want = expected[key];
    if (got === want) continue;
    if (typeof got === "number" && typeof want === "number" && Math.abs(got - want) < 1e-6) continue;
    assert.equal(got, want, `${label} ${key}`);
  }
}

function overlayRoot(container) {
  return container.querySelector("[data-morph-overlay]");
}

function requireOverlay(container, reason) {
  const overlay = overlayRoot(container);
  assert.ok(overlay, reason);
  return overlay;
}

async function mountSurface(t, { transaction, registry }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  t.after(() => {
    root.unmount();
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function paint() {
    root.render(React.createElement(MorphSurface, {
      transactionSnapshot: transaction.getSnapshot(),
      transaction,
      registry,
    }));
  }

  paint();
  await wait();
  return {
    root,
    container,
    paint: async () => {
      paint();
      await wait();
    },
  };
}

function readShared(el) {
  if (!el) return null;
  const computed = window.getComputedStyle(el);
  return {
    text: (el.textContent || "").trim(),
    rect: { ...el.getBoundingClientRect() },
    type: el.getAttribute("data-morph-marker") || null,
    color: computed.color || "",
    fontFamily: computed.fontFamily || "",
    fontSize: computed.fontSize || "",
    fontWeight: computed.fontWeight || "",
    lineHeight: computed.lineHeight || "",
  };
}

function snapshotFromCard(node) {
  const rect = node.getBoundingClientRect();
  return {
    rect: { ...rect },
    radius: parseFloat(node._paint?.borderRadius) || 0,
    paint: {
      background: node._paint?.backgroundColor || "",
      color: node._paint?.color || "",
      borderColor: node._paint?.borderColor || "",
    },
    shared: {
      title: readShared(node.querySelector("[data-morph-title]")),
      meta: readShared(node.querySelector("[data-morph-meta]")),
      marker: readShared(node.querySelector("[data-morph-marker]")),
    },
  };
}

function registerSource(registry, rects) {
  const node = createCardNode(rects);
  const unregister = registry.registerMorphNode({
    key: KEY,
    node,
    kind: "event",
    role: "source",
    meta: { title: "Design Sync" },
    getSnapshot: snapshotFromCard,
  });
  return { node, unregister, snapshot: registry.snapshotMorphNode(KEY, "source") };
}

function registerDestination(registry) {
  const node = createCardNode({
    rect: DEST,
    titleRect: DEST_TITLE,
    metaRect: DEST_META,
    markerRect: DEST_MARKER,
    titleText: "Design Sync",
    timeText: "10:00 AM – 10:30 AM",
    radius: 20,
  });
  const unregister = registry.registerMorphNode({
    key: KEY,
    node,
    kind: "event",
    role: "destination",
    meta: { title: "Design Sync" },
    getSnapshot: snapshotFromCard,
  });
  return { node, unregister, snapshot: registry.snapshotMorphNode(KEY, "destination") };
}

test("negative control (fixture calibration): origin equality detects an 8px overlay miss", () => {
  const source = createCardNode({
    rect: SOURCE_OFFSET,
    titleRect: SOURCE_OFFSET_TITLE,
    metaRect: SOURCE_OFFSET_META,
    markerRect: SOURCE_OFFSET_MARKER,
  });
  const staleOverlay = createCardNode({
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });

  assert.equal(SOURCE_OFFSET.x, SOURCE_A.x + 8);
  assert.throws(
    () => assertRectEqual(
      staleOverlay.getBoundingClientRect(),
      source.getBoundingClientRect(),
      "overlay origin",
    ),
    (err) => {
      assert.equal(err.code, "ERR_ASSERTION");
      assert.match(String(err.message), /overlay origin x/);
      assert.equal(err.actual, SOURCE_A.x);
      assert.equal(err.expected, SOURCE_OFFSET.x);
      return true;
    },
  );
});

test("overlay origin equals the source snapshot rect at OPENING", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });

  const runId = transaction.startOpen({ key: KEY, source: snapshot });
  assert.equal(transaction.getState(), MORPH_STATES.OPENING);
  assert.equal(runId > 0, true);
  await paint();

  const overlay = requireOverlay(container, "overlay not found");
  assertRectEqual(overlay.getBoundingClientRect(), SOURCE_A, "overlay origin");
  assert.equal(parseFloat(window.getComputedStyle(overlay).borderRadius), SOURCE_RADIUS);
  assert.equal(window.getComputedStyle(overlay).backgroundColor, SOURCE_PAINT.background);
});

test("source getBoundingClientRect is unchanged while the morph overlay is open", async (t) => {
  const registry = createMorphRegistry();
  const { node, snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const before = node.getBoundingClientRect();
  assertRectEqual(before, SOURCE_A, "source before open");

  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  transaction.startOpen({ key: KEY, source: snapshot });
  await paint();

  requireOverlay(container, "overlay not found");
  assertRectEqual(node.getBoundingClientRect(), SOURCE_A, "source during morph");
  assertRectEqual(node.getBoundingClientRect(), before, "source before vs during");
});

test("OPENING suppresses source paint and IDLE restores it without moving the source box", async (t) => {
  const registry = createMorphRegistry();
  const { node, snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { paint } = await mountSurface(t, { transaction, registry });

  const runId = transaction.startOpen({ key: KEY, source: snapshot });
  await paint();

  assertRectEqual(node.getBoundingClientRect(), SOURCE_A, "source layout while paint suppressed");
  assert.equal(window.getComputedStyle(node).opacity, "0", "source paint suppressed");

  transaction.settleOpen(runId);
  await paint();
  assert.equal(window.getComputedStyle(node).opacity, "0", "source paint stays suppressed in OPEN");
  assertRectEqual(node.getBoundingClientRect(), SOURCE_A, "source layout in OPEN");

  transaction.startClose({ target: snapshot, runId });
  await paint();
  assert.equal(window.getComputedStyle(node).opacity, "0", "source paint stays suppressed in CLOSING");
  transaction.settleClose(runId);
  await paint();
  assert.equal(window.getComputedStyle(node).opacity, "1", "source paint restored");
  assertRectEqual(node.getBoundingClientRect(), SOURCE_A, "source layout after IDLE");
});

test("source paint suppression transfers to a connected replacement source", async (t) => {
  const registry = createMorphRegistry();
  const sourceA = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  sourceA.node.style.opacity = "0.6";
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });

  const runId = transaction.startOpen({ key: KEY, source: sourceA.snapshot });
  await paint();
  assert.equal(sourceA.node.style.opacity, "0", "source A is suppressed while opening");

  const sourceB = registerSource(registry, {
    rect: SOURCE_B,
    titleRect: SOURCE_B_TITLE,
    metaRect: SOURCE_B_META,
    markerRect: SOURCE_B_MARKER,
  });
  sourceB.node.style.opacity = "0.8";
  await paint();

  assert.equal(sourceA.node.style.opacity, "0.6", "source A is restored when ownership transfers");
  assert.equal(sourceB.node.style.opacity, "0", "source B becomes the suppressed live source");

  transaction.settleOpen(runId);
  transaction.startClose({ target: sourceB.snapshot, runId });
  transaction.settleClose(runId);
  await paint();

  assert.equal(sourceA.node.style.opacity, "0.6", "source A remains restored");
  assert.equal(sourceB.node.style.opacity, "0.8", "source B is restored on IDLE");
  assert.equal(overlayRoot(container), null, "overlay is removed after close");
});

test("shared title, meta, and marker start at source shared rects", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  transaction.startOpen({ key: KEY, source: snapshot });
  await paint();

  const overlay = overlayRoot(container);
  const title = overlay?.querySelector("[data-morph-title]");
  assert.ok(title, "shared title not found");
  const meta = overlay.querySelector("[data-morph-meta]");
  assert.ok(meta, "shared meta not found");
  const marker = overlay.querySelector("[data-morph-marker]");
  assert.ok(marker, "shared marker not found");
  assertRectEqual(title.getBoundingClientRect(), SOURCE_A_TITLE, "overlay title");
  assertRectEqual(meta.getBoundingClientRect(), SOURCE_A_META, "overlay meta");
  assertRectEqual(marker.getBoundingClientRect(), SOURCE_A_MARKER, "overlay marker");
  assert.equal(title.textContent, "Design Sync");
  assert.equal(meta.textContent, "10:00 AM");
  assert.equal(marker.getAttribute("data-morph-marker"), "progress-ring");
  assert.ok(!title.style.transform || !String(title.style.transform).includes("scale"));
  assert.ok(!meta.style.transform || !String(meta.style.transform).includes("scale"));
});

test("overlay settles to the destination rect once the destination is in the DOM", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot: sourceSnapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });

  const runId = transaction.startOpen({ key: KEY, source: sourceSnapshot });
  await paint();
  const { snapshot: destSnapshot } = registerDestination(registry);
  assert.equal(transaction.settleOpen(runId), true);
  assert.equal(transaction.getState(), MORPH_STATES.OPEN);
  assert.equal(transaction.setProgress(1, runId), false);
  await paint();

  const overlay = requireOverlay(container, "destination geometry not reached");
  assertRectEqual(overlay.getBoundingClientRect(), DEST, "overlay destination");
  assertRectEqual(
    overlay.querySelector("[data-morph-title]")?.getBoundingClientRect(),
    DEST_TITLE,
    "destination title",
  );
  assertRectEqual(
    overlay.querySelector("[data-morph-meta]")?.getBoundingClientRect(),
    DEST_META,
    "destination meta",
  );
  assertRectEqual(
    overlay.querySelector("[data-morph-marker]")?.getBoundingClientRect(),
    DEST_MARKER,
    "destination marker",
  );
  assert.ok(destSnapshot);
});

test("closing renders the host-supplied latest semantic source target", async (t) => {
  const registry = createMorphRegistry();
  const sourceA = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });

  const runId = transaction.startOpen({ key: KEY, source: sourceA.snapshot });
  transaction.settleOpen(runId);
  registerDestination(registry);
  await paint();

  sourceA.unregister();
  const sourceB = registerSource(registry, {
    rect: SOURCE_B,
    titleRect: SOURCE_B_TITLE,
    metaRect: SOURCE_B_META,
    markerRect: SOURCE_B_MARKER,
  });
  const latest = registry.snapshotMorphNode(KEY, "source");
  assert.equal(transaction.startClose({ target: latest, runId }), true);
  assert.equal(transaction.getState(), MORPH_STATES.CLOSING);
  await paint();

  const overlay = requireOverlay(container, "latest source not resolved");
  assertRectEqual(overlay.getBoundingClientRect(), SOURCE_B, "close target");
  assert.notEqual(overlay.getBoundingClientRect().x, SOURCE_A.x);
  assert.notEqual(overlay.getBoundingClientRect().y, SOURCE_A.y);
  assertRectEqual(
    overlay.querySelector("[data-morph-title]")?.getBoundingClientRect(),
    SOURCE_B_TITLE,
    "close title",
  );
  assert.ok(sourceB.node.isConnected);

  transaction.settleClose(runId);
  await paint();
  assert.equal(overlayRoot(container), null, "IDLE must unmount the overlay");
});

test("closing renders the host-supplied last-valid fallback and never uses activeElement", async (t) => {
  const registry = createMorphRegistry();
  const sourceA = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const decoy = createCardNode({
    rect: DECOY,
    titleRect: DECOY,
    metaRect: DECOY,
    markerRect: DECOY,
    titleText: "unrelated",
  });
  document.activeElement = decoy;

  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: sourceA.snapshot });
  transaction.settleOpen(runId);
  await paint();

  sourceA.node.isConnected = false;
  sourceA.unregister();
  const live = registry.resolveMorphNode(KEY, "source");
  assert.equal(live, null);
  const lastValid = registry.getLastMorphSnapshot(KEY, "source");
  assert.ok(lastValid, "last-valid source snapshot must survive unmount");
  assert.equal(lastValid.rect.x, SOURCE_A.x);

  assert.equal(transaction.startClose({ target: lastValid, runId }), true);
  await paint();

  const overlay = requireOverlay(container, "fallback geometry absent");
  const overlayRect = overlay.getBoundingClientRect();
  assertRectEqual(overlayRect, SOURCE_A, "last-valid source");
  assert.notEqual(overlayRect.x, DECOY.x);
  assert.notEqual(overlayRect.y, DECOY.y);
  assert.notEqual(document.activeElement.getBoundingClientRect().x, overlayRect.x);
});

test("negative control: overlay origin turns red when source is offset +8px from a stale 48px origin", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_OFFSET,
    titleRect: SOURCE_OFFSET_TITLE,
    metaRect: SOURCE_OFFSET_META,
    markerRect: SOURCE_OFFSET_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  transaction.startOpen({ key: KEY, source: snapshot });
  await paint();

  const overlay = requireOverlay(container, "overlay not found");
  const overlayRect = overlay.getBoundingClientRect();
  assert.equal(SOURCE_OFFSET.x, SOURCE_A.x + 8);
  assertRectEqual(overlayRect, SOURCE_OFFSET, "offset overlay origin");
  assertRectEqual(
    overlay.querySelector("[data-morph-title]")?.getBoundingClientRect(),
    SOURCE_OFFSET_TITLE,
    "offset overlay title",
  );
});

test("OPENING at t=0.5 interpolates shell and shared layers without scale", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  registerDestination(registry);
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: snapshot });
  assert.equal(transaction.setProgress(0.5, runId), true);
  await paint();

  const overlay = requireOverlay(container, "overlay not found");
  assertRectEqual(overlay.getBoundingClientRect(), MID, "shell t=.5");
  assert.equal(parseFloat(window.getComputedStyle(overlay).borderRadius), MID_RADIUS);
  assertRectEqual(overlay.querySelector("[data-morph-title]")?.getBoundingClientRect(), TITLE_MID, "title t=.5");
  assertRectEqual(overlay.querySelector("[data-morph-meta]")?.getBoundingClientRect(), META_MID, "meta t=.5");
  assertRectEqual(overlay.querySelector("[data-morph-marker]")?.getBoundingClientRect(), MARKER_MID, "marker t=.5");
  assert.equal(overlay.querySelector("[data-morph-title]").textContent, "Design Sync");
  const title = overlay.querySelector("[data-morph-title]");
  assert.ok(!title.style.transform || !String(title.style.transform).includes("scale"));
  const destOnly = overlay.querySelector("[data-morph-destination-content]");
  assert.ok(destOnly, "destination-only layer exists");
  assert.equal(destOnly.style.opacity, "0");
});

test("destination stage is geometry-only at settled OPEN", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: snapshot });
  registerDestination(registry);
  transaction.settleOpen(runId);
  await paint();

  const overlay = requireOverlay(container, "destination geometry not reached");
  const destOnly = overlay.querySelector("[data-morph-destination-content]");
  assert.ok(destOnly);
  assert.equal(destOnly.style.opacity, "0");
  assert.equal(destOnly.style.visibility, "hidden");
  assert.equal(destOnly.textContent, "");
  assertRectEqual(destOnly.getBoundingClientRect(), DEST, "destination-only box");
  assert.ok(!overlay.style.transform || !String(overlay.style.transform).includes("scale"));
});

test("pre-existing source opacity restores exactly after IDLE", async (t) => {
  const registry = createMorphRegistry();
  const { node, snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  node.style.opacity = "0.6";
  const transaction = createMorphTransaction();
  const { paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: snapshot });
  await paint();
  assert.equal(node.style.opacity, "0");
  transaction.settleOpen(runId);
  transaction.startClose({ target: snapshot, runId });
  transaction.settleClose(runId);
  await paint();
  assert.equal(node.style.opacity, "0.6");
});

test("WAAPI animates the shell and each shared layer to its endpoint without scaling shared objects", async (t) => {
  const previous = MockElement.prototype.animate;
  const calls = [];
  MockElement.prototype.animate = function animate(keyframes, timing) {
    const animation = createMockAnimation(this, keyframes, timing);
    calls.push(animation);
    return animation;
  };
  t.after(() => {
    if (previous) MockElement.prototype.animate = previous;
    else delete MockElement.prototype.animate;
  });

  const registry = createMorphRegistry();
  const { snapshot: sourceSnapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const { snapshot: destinationSnapshot } = registerDestination(registry);
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: sourceSnapshot });
  await paint();

  const openingCalls = calls.slice(-4);
  const shell = openingCalls.find((animation) => animationLabel(animation.node) === "shell");
  assert.ok(shell, "shell WAAPI animation missing");
  assert.equal(shell.keyframes[0].left, undefined);
  assert.equal(shell.keyframes[0].top, undefined);
  assert.equal(shell.keyframes[0].width, undefined);
  assert.equal(shell.keyframes[0].height, undefined);
  assert.match(shell.keyframes[0].transform, /^translate3d\(.+\) scale\(.+\)$/);
  assert.equal(shell.keyframes[1].transform, "translate3d(0px, 0px, 0px) scale(1, 1)");

  for (const key of ["title", "meta", "marker"]) {
    const animation = openingCalls.find((candidate) => animationLabel(candidate.node) === key);
    assert.ok(animation, `${key} WAAPI animation missing`);
    assert.equal(
      animation.keyframes[0].transform,
      layerTranslateFor(sourceSnapshot.shared[key], destinationSnapshot.shared[key]),
      `${key} starts at source translation`,
    );
    assert.equal(animation.keyframes[1].transform, "translate3d(0px, 0px, 0px)", `${key} reaches destination translation`);
    assert.equal(animation.keyframes[0].width, `${sourceSnapshot.shared[key].rect.width}px`);
    assert.equal(animation.keyframes[0].height, `${sourceSnapshot.shared[key].rect.height}px`);
    assert.equal(animation.keyframes[1].width, `${destinationSnapshot.shared[key].rect.width}px`);
    assert.equal(animation.keyframes[1].height, `${destinationSnapshot.shared[key].rect.height}px`);
    assert.ok(!String(animation.keyframes[0].transform).includes("scale"), `${key} must not scale`);
    assert.ok(!String(animation.keyframes[1].transform).includes("scale"), `${key} must not scale`);
  }

  shell.finish();
  await wait(20);
  await paint();
  assert.equal(transaction.getState(), MORPH_STATES.OPEN);
  const overlay = requireOverlay(container, "settled overlay missing");
  assertRectEqual(overlay.querySelector("[data-morph-title]")?.getBoundingClientRect(), DEST_TITLE, "settled title endpoint");
  assertRectEqual(overlay.querySelector("[data-morph-meta]")?.getBoundingClientRect(), DEST_META, "settled meta endpoint");
  assertRectEqual(overlay.querySelector("[data-morph-marker]")?.getBoundingClientRect(), DEST_MARKER, "settled marker endpoint");
});

test("unmounting during OPENING restores the source opacity", async (t) => {
  const previous = MockElement.prototype.animate;
  MockElement.prototype.animate = function animate(keyframes, timing) {
    return createMockAnimation(this, keyframes, timing);
  };
  t.after(() => {
    if (previous) MockElement.prototype.animate = previous;
    else delete MockElement.prototype.animate;
  });

  const registry = createMorphRegistry();
  const { node, snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  node.style.opacity = "0.6";
  const transaction = createMorphTransaction();
  const mounted = await mountSurface(t, { transaction, registry });
  transaction.startOpen({ key: KEY, source: snapshot });
  await mounted.paint();
  assert.equal(node.style.opacity, "0");

  mounted.root.unmount();
  await wait();
  assert.equal(node.style.opacity, "0.6");
});

test("closing uses the same geometry model reversed toward the host target", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  registerDestination(registry);
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: snapshot });
  transaction.settleOpen(runId);
  transaction.startClose({ target: snapshot, runId });
  assert.equal(transaction.setProgress(0.5, runId), true);
  await paint();

  const overlay = requireOverlay(container, "close midpoint missing");
  assertRectEqual(overlay.getBoundingClientRect(), MID, "close t=.5 is dest→source midpoint");
});

test("CANCELLING samples the active WAAPI frame at 20%, 50%, and 75% without setProgress", async (t) => {
  const previous = MockElement.prototype.animate;
  const calls = [];
  MockElement.prototype.animate = function animate(keyframes, timing) {
    const animation = createMockAnimation(this, keyframes, timing);
    calls.push(animation);
    return animation;
  };
  t.after(() => {
    if (previous) MockElement.prototype.animate = previous;
    else delete MockElement.prototype.animate;
  });

  for (const { timelineProgress, visualProgress } of [
    { timelineProgress: 0.2, visualProgress: 0.31 },
    { timelineProgress: 0.5, visualProgress: 0.82 },
    { timelineProgress: 0.75, visualProgress: 0.91 },
  ]) {
    const registry = createMorphRegistry();
    const { snapshot: sourceSnapshot } = registerSource(registry, {
      rect: SOURCE_A,
      titleRect: SOURCE_A_TITLE,
      metaRect: SOURCE_A_META,
      markerRect: SOURCE_A_MARKER,
    });
    const { snapshot: destinationSnapshot } = registerDestination(registry);
    const transaction = createMorphTransaction();
    const { paint } = await mountSurface(t, { transaction, registry });
    const runId = transaction.startOpen({ key: KEY, source: sourceSnapshot });
    await paint();

    const openingShell = calls.slice(-4).find((animation) => animationLabel(animation.node) === "shell");
    assert.ok(openingShell, `opening shell animation missing at ${timelineProgress}`);
    openingShell.currentTime = openingShell.timing.duration * timelineProgress;
    openingShell.computedProgress = visualProgress;

    let setProgressCalls = 0;
    const originalSetProgress = transaction.setProgress;
    transaction.setProgress = (...args) => {
      setProgressCalls += 1;
      return originalSetProgress(...args);
    };

    assert.equal(transaction.startClose({ target: sourceSnapshot, runId }), true);
    assert.equal(transaction.getState(), MORPH_STATES.CANCELLING);
    await paint();
    assert.equal(setProgressCalls, 0, "the interruption boundary must not synchronize through setProgress");

    const cancellingShell = calls.slice(-4).find((animation) => animationLabel(animation.node) === "shell");
    assert.ok(cancellingShell, `cancelling shell animation missing at ${timelineProgress}`);
    const actualOpeningFrame = interpolateIdentity(sourceSnapshot, destinationSnapshot, visualProgress);
    assert.equal(
      cancellingShell.keyframes[0].transform,
      shellTransformFor(actualOpeningFrame, sourceSnapshot),
      `cancelling keyframe must start at the actual ${visualProgress} visual frame`,
    );
    assert.notEqual(
      cancellingShell.keyframes[0].transform,
      shellTransformFor(interpolateIdentity(sourceSnapshot, destinationSnapshot, timelineProgress), sourceSnapshot),
      `cancelling keyframe must not use the ${timelineProgress} timeline frame when easing reports ${visualProgress}`,
    );
    assert.notEqual(
      cancellingShell.keyframes[0].transform,
      shellTransformFor(sourceSnapshot, sourceSnapshot),
      `cancelling at ${timelineProgress} must not snap to the source`,
    );
    assert.notEqual(
      cancellingShell.keyframes[0].transform,
      shellTransformFor(destinationSnapshot, sourceSnapshot),
      `cancelling at ${timelineProgress} must not snap to the destination`,
    );
  }
});

test("CANCELLING does not snap to a changed close target", async (t) => {
  const registry = createMorphRegistry();
  const sourceA = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  registerDestination(registry);
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  const runId = transaction.startOpen({ key: KEY, source: sourceA.snapshot });
  transaction.setProgress(0.5, runId);
  await paint();
  sourceA.unregister();
  const sourceB = registerSource(registry, {
    rect: SOURCE_B,
    titleRect: SOURCE_B_TITLE,
    metaRect: SOURCE_B_META,
    markerRect: SOURCE_B_MARKER,
  });
  transaction.startClose({ target: registry.snapshotMorphNode(KEY, "source"), runId });
  await paint();
  const overlay = requireOverlay(container, "cancel origin missing");
  assertRectEqual(overlay.getBoundingClientRect(), MID, "cancel starts at opening progress");
  assert.notEqual(overlay.getBoundingClientRect().x, SOURCE_B.x);
  assert.ok(sourceB.node.isConnected);
});

test("stale WAAPI completion from an old run does not settle a newer run", async (t) => {
  const previous = MockElement.prototype.animate;
  const calls = [];
  MockElement.prototype.animate = function animate(keyframes, timing) {
    let resolve;
    let reject;
    const animation = {
      playState: "running",
      keyframes,
      timing,
      cancel() {
        animation.playState = "idle";
        reject?.(new Error("cancelled"));
      },
      finished: new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      }),
      finish() {
        animation.playState = "finished";
        resolve?.();
      },
    };
    calls.push(animation);
    return animation;
  };
  t.after(() => {
    if (previous) MockElement.prototype.animate = previous;
    else delete MockElement.prototype.animate;
  });

  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { paint } = await mountSurface(t, { transaction, registry });
  transaction.startOpen({ key: KEY, source: snapshot });
  await paint();
  const stale = calls[0];
  assert.ok(stale);

  transaction.startClose({ target: snapshot });
  transaction.settleClose(transaction.getRunId());
  const firstRun = transaction.getRunId();
  transaction.startOpen({ key: KEY, source: snapshot });
  await paint();
  const secondRun = transaction.getRunId();
  assert.notEqual(secondRun, firstRun);
  stale.finish();
  await wait(20);
  assert.equal(transaction.getState(), MORPH_STATES.OPENING);
  assert.equal(transaction.getRunId(), secondRun);
});

test("rapid close then reopen renders the new opening origin", async (t) => {
  const registry = createMorphRegistry();
  const { snapshot } = registerSource(registry, {
    rect: SOURCE_A,
    titleRect: SOURCE_A_TITLE,
    metaRect: SOURCE_A_META,
    markerRect: SOURCE_A_MARKER,
  });
  const transaction = createMorphTransaction();
  const { container, paint } = await mountSurface(t, { transaction, registry });
  let runId = transaction.startOpen({ key: KEY, source: snapshot });
  await paint();
  transaction.startClose({ target: snapshot, runId });
  transaction.settleClose(runId);
  await paint();
  runId = transaction.startOpen({ key: KEY, source: snapshot });
  await paint();
  assertRectEqual(requireOverlay(container, "reopen overlay missing").getBoundingClientRect(), SOURCE_A, "reopen origin");
});
