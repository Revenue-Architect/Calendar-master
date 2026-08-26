import test from "node:test";
import assert from "node:assert/strict";
import React, { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { morphRegistry } from "./morphRegistry.js";
import { useMorphSource, useMorphDestination } from "./useMorphSource.js";

// Mock DOM environment for React 19 in Node.js
class MockElement {
  constructor(tag) {
    this.tagName = tag ? tag.toUpperCase() : "DIV";
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.nodeType = 1;
    this.isConnected = true;
    this.ownerDocument = globalThis.document;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  getAttribute(k) {
    return this.attributes[k];
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
    return { x: 10, y: 20, top: 20, left: 10, right: 110, bottom: 70, width: 100, height: 50 };
  }
  querySelector() {
    return null;
  }
}

globalThis.HTMLIFrameElement = class HTMLIFrameElement {};
globalThis.HTMLElement = MockElement;
globalThis.Element = MockElement;
globalThis.Node = MockElement;

globalThis.document = {
  nodeType: 9,
  createElement: (t) => new MockElement(t),
  createElementNS: (ns, t) => new MockElement(t),
  createTextNode: (t) => ({ nodeType: 3, textContent: t, parentNode: null, ownerDocument: globalThis.document }),
  createComment: (t) => ({ nodeType: 8, data: t, parentNode: null, ownerDocument: globalThis.document }),
  body: new MockElement("body"),
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
  defaultView: null,
};
globalThis.window = {
  document: globalThis.document,
  HTMLIFrameElement: globalThis.HTMLIFrameElement,
  HTMLElement: MockElement,
  Element: MockElement,
  Node: MockElement,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document.defaultView = globalThis.window;

function wait(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("Blocker 3: useMorphSource real React StrictMode lifecycle, stable ref, and in-place updates", async () => {
  morphRegistry.clear();

  let capturedRef1 = null;
  let capturedRef2 = null;
  let renderCount = 0;

  function SourceComponent({ keyValue, meta, enabled = true }) {
    renderCount++;
    const ref = useMorphSource({
      key: keyValue,
      kind: "task",
      meta,
      enabled,
    });
    if (renderCount === 1) capturedRef1 = ref;
    else capturedRef2 = ref;
    return React.createElement("div", { ref, "data-test": "source-element" });
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);

  // 1. Initial Mount under React.StrictMode
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(SourceComponent, {
        keyValue: "morph:task:task-1",
        meta: { title: "Original Title", estimate: 30 },
      })
    )
  );
  await wait();

  // Assert registered under key
  const liveNode = morphRegistry.resolveMorphNode("morph:task:task-1", "source");
  assert.ok(liveNode, "Live DOM node must be registered under StrictMode");
  const snap1 = morphRegistry.snapshotMorphNode("morph:task:task-1", "source");
  assert.equal(snap1.meta.title, "Original Title");
  assert.equal(snap1.meta.estimate, 30);

  // 2. Rerender with new inline meta object (same key)
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(SourceComponent, {
        keyValue: "morph:task:task-1",
        meta: { title: "Updated Title", estimate: 45 },
      })
    )
  );
  await wait();

  // Assert callback ref identity is strictly preserved across renders
  assert.equal(capturedRef1, capturedRef2, "Callback ref identity must remain strictly stable");

  // Assert node was NOT dropped or churned, and metadata updated in-place
  const liveNodeAfterRerender = morphRegistry.resolveMorphNode("morph:task:task-1", "source");
  assert.equal(liveNodeAfterRerender, liveNode, "Same live DOM node must remain registered without unmount");
  const snap2 = morphRegistry.snapshotMorphNode("morph:task:task-1", "source");
  assert.equal(snap2.meta.title, "Updated Title");
  assert.equal(snap2.meta.estimate, 45);

  // 3. Disable (enabled: false)
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(SourceComponent, {
        keyValue: "morph:task:task-1",
        meta: { title: "Updated Title" },
        enabled: false,
      })
    )
  );
  await wait();
  assert.equal(morphRegistry.resolveMorphNode("morph:task:task-1", "source"), null, "Disabled source must be unregistered");

  // 4. Re-enable (enabled: true)
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(SourceComponent, {
        keyValue: "morph:task:task-1",
        meta: { title: "Re-enabled Title" },
        enabled: true,
      })
    )
  );
  await wait();
  assert.equal(morphRegistry.resolveMorphNode("morph:task:task-1", "source"), liveNode, "Re-enabled source must be restored");

  // 5. Key Change ("morph:task:task-1" -> "morph:task:task-2")
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(SourceComponent, {
        keyValue: "morph:task:task-2",
        meta: { title: "New Key Title" },
        enabled: true,
      })
    )
  );
  await wait();
  assert.equal(morphRegistry.resolveMorphNode("morph:task:task-1", "source"), null, "Old key must be unregistered");
  assert.equal(morphRegistry.resolveMorphNode("morph:task:task-2", "source"), liveNode, "New key must be registered");

  // 6. Unmount
  root.unmount();
  await wait();
  assert.equal(morphRegistry.resolveMorphNode("morph:task:task-2", "source"), null, "Unmounted component must unregister live source");
});

test("Blocker 3: useMorphDestination real React lifecycle and source/destination coexistence", async () => {
  morphRegistry.clear();

  const key = "morph:event:coexist-test";

  function SourceView() {
    const ref = useMorphSource({ key, kind: "event", meta: { title: "Source Card" } });
    return React.createElement("div", { ref, "data-test": "source" });
  }

  function DestinationView() {
    const ref = useMorphDestination({ key, kind: "event", meta: { title: "Inspector Sheet" } });
    return React.createElement("div", { ref, "data-test": "destination" });
  }

  function App({ showDest = true }) {
    return React.createElement(
      StrictMode,
      null,
      React.createElement("div", null, React.createElement(SourceView), showDest ? React.createElement(DestinationView) : null)
    );
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);

  // Mount both source and destination simultaneously under same key
  root.render(React.createElement(App, { showDest: true }));
  await wait();

  const liveSource = morphRegistry.resolveMorphNode(key, "source");
  const liveDest = morphRegistry.resolveMorphNode(key, "destination");
  assert.ok(liveSource, "Source node must be registered");
  assert.ok(liveDest, "Destination node must be registered");
  assert.notEqual(liveSource, liveDest, "Source and destination must be distinct DOM nodes");

  const snapSrc = morphRegistry.snapshotMorphNode(key, "source");
  const snapDest = morphRegistry.snapshotMorphNode(key, "destination");
  assert.equal(snapSrc.meta.title, "Source Card");
  assert.equal(snapDest.meta.title, "Inspector Sheet");

  // Unmount destination only
  root.render(React.createElement(App, { showDest: false }));
  await wait();

  assert.equal(morphRegistry.resolveMorphNode(key, "destination"), null, "Destination must unregister on unmount");
  assert.equal(morphRegistry.resolveMorphNode(key, "source"), liveSource, "Source must survive destination unmount");

  // Clean up
  root.unmount();
  await wait();
  assert.equal(morphRegistry.resolveMorphNode(key, "source"), null);
});

test("Issue 4: zero unregister churn on repeated metadata updates while component stays mounted", async () => {
  morphRegistry.clear();

  const originalRegister = morphRegistry.registerMorphNode;
  const originalUpdate = morphRegistry.updateMorphNode;
  const originalUnregister = morphRegistry.unregisterMorphNode;

  let registerCalls = 0;
  let updateCalls = 0;
  let unregisterCalls = 0;

  morphRegistry.registerMorphNode = function (...args) {
    registerCalls++;
    return originalRegister.apply(this, args);
  };
  morphRegistry.updateMorphNode = function (...args) {
    updateCalls++;
    return originalUpdate.apply(this, args);
  };
  morphRegistry.unregisterMorphNode = function (...args) {
    unregisterCalls++;
    return originalUnregister.apply(this, args);
  };

  try {
    function ChurnTestComponent({ title, count }) {
      const ref = useMorphSource({
        key: "morph:task:churn-test",
        kind: "task",
        meta: { title, count },
      });
      return React.createElement("div", { ref });
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    // 1. Initial Mount
    root.render(React.createElement(ChurnTestComponent, { title: "Title 1", count: 1 }));
    await wait();

    const registerCallsAfterMount = registerCalls;
    const updateCallsAfterMount = updateCalls;
    const unregisterCallsAfterMount = unregisterCalls;

    assert.ok(registerCallsAfterMount >= 1, "Mount must register with registry");
    assert.equal(unregisterCallsAfterMount, 0, "Mount must not call unregister");

    // 2. 5 successive renders with new inline meta objects
    for (let i = 2; i <= 6; i++) {
      root.render(React.createElement(ChurnTestComponent, { title: `Title ${i}`, count: i }));
      await wait(10);
    }

    // Verify:
    // - Zero unregister calls during prop updates
    // - Zero new register calls during prop updates
    // - updateMorphNode was called for each rerender
    assert.equal(
      unregisterCalls,
      unregisterCallsAfterMount,
      "In-place metadata updates must cause zero unregister calls"
    );
    assert.equal(
      registerCalls,
      registerCallsAfterMount,
      "In-place metadata updates must not re-register the node"
    );
    assert.equal(
      updateCalls - updateCallsAfterMount,
      5,
      "Each rerender must route to updateMorphNode"
    );

    const finalSnap = morphRegistry.snapshotMorphNode("morph:task:churn-test", "source");
    assert.equal(finalSnap.meta.title, "Title 6");
    assert.equal(finalSnap.meta.count, 6);

    // 3. Unmount must cleanly invoke unregisterMorphNode
    root.unmount();
    await wait();

    assert.ok(
      unregisterCalls > unregisterCallsAfterMount,
      "Unmount must trigger unregisterMorphNode"
    );
  } finally {
    morphRegistry.registerMorphNode = originalRegister;
    morphRegistry.updateMorphNode = originalUpdate;
    morphRegistry.unregisterMorphNode = originalUnregister;
  }
});

