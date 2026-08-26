import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOM from "react-dom/client";
import { eventMorphKey } from "./morphKeys.js";
import { MorphSurface } from "./MorphSurface.js";
import { createMorphRegistry } from "./morphRegistry.js";
import { createMorphTransaction, MORPH_STATES } from "./morphTransaction.js";

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
    assert.equal(actual[key], expected[key], `${label} ${key}`);
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

test("close returns to remounted source B, not stale source A", async (t) => {
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

test("unavailable source closes to the last-valid semantic snapshot, never activeElement", async (t) => {
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
