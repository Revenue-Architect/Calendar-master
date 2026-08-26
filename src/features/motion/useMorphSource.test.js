import test from "node:test";
import assert from "node:assert/strict";
import { morphRegistry } from "./morphRegistry.js";
import { useMorphSource, useMorphDestination } from "./useMorphSource.js";

// Mock helper simulating React hook execution in a controlled environment
function createMockNode(id = "mock-node") {
  return {
    id,
    isConnected: true,
    getBoundingClientRect: () => ({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
    }),
  };
}

// Minimal React hook runtime harness for Node.js unit testing without browser DOM
function createHookHarness(hookFn, initialProps) {
  let currentProps = initialProps;
  let hookResult;
  let effectCleanups = [];

  // Minimal hook state slots
  const refSlots = [];
  let refIndex = 0;
  const callbackSlots = [];
  let callbackIndex = 0;

  // React mock globals for testing hook mechanics
  const ReactMock = {
    useRef: (initialVal) => {
      const idx = refIndex++;
      if (refSlots[idx] === undefined) {
        refSlots[idx] = { current: initialVal };
      }
      return refSlots[idx];
    },
    useCallback: (fn, deps) => {
      const idx = callbackIndex++;
      if (callbackSlots[idx] === undefined) {
        callbackSlots[idx] = { fn, deps };
      } else {
        const prev = callbackSlots[idx];
        const changed = !deps || !prev.deps || deps.some((d, i) => d !== prev.deps[i]);
        if (changed) {
          callbackSlots[idx] = { fn, deps };
        }
      }
      return callbackSlots[idx].fn;
    },
    useEffect: (effectFn, deps) => {
      // Execute effect synchronously for testing
      const cleanup = effectFn();
      if (typeof cleanup === "function") {
        effectCleanups.push(cleanup);
      }
    },
  };

  return {
    render: (newProps) => {
      if (newProps !== undefined) currentProps = newProps;
      refIndex = 0;
      callbackIndex = 0;
      // Inject React mock into test context if needed or run hookFn directly
    },
    unmount: () => {
      while (effectCleanups.length > 0) {
        const cleanup = effectCleanups.pop();
        cleanup();
      }
    },
  };
}

test("useMorphSource & useMorphDestination: registration contract and role isolation", () => {
  morphRegistry.clear();
  const sourceNode = createMockNode("source-1");
  const destNode = createMockNode("dest-1");
  const key = "morph:event:hook-test";

  // Simulate source registration
  const unregSource = morphRegistry.registerMorphNode({
    key,
    node: sourceNode,
    kind: "event",
    role: "source",
    meta: { title: "Hook Test" },
  });

  // Simulate dest registration
  const unregDest = morphRegistry.registerMorphNode({
    key,
    node: destNode,
    kind: "event",
    role: "destination",
    meta: { title: "Hook Test (Destination)" },
  });

  assert.equal(morphRegistry.resolveMorphNode(key, "source"), sourceNode);
  assert.equal(morphRegistry.resolveMorphNode(key, "destination"), destNode);

  const srcSnap = morphRegistry.snapshotMorphNode(key, "source");
  const destSnap = morphRegistry.snapshotMorphNode(key, "destination");
  assert.equal(srcSnap.role, "source");
  assert.equal(destSnap.role, "destination");

  unregDest();
  assert.equal(morphRegistry.resolveMorphNode(key, "destination"), null);
  assert.equal(morphRegistry.resolveMorphNode(key, "source"), sourceNode);

  unregSource();
  assert.equal(morphRegistry.resolveMorphNode(key, "source"), null);
});

test("useMorphSource: in-place metadata updates do not drop live DOM node", () => {
  morphRegistry.clear();
  const node = createMockNode("card-node");
  const key = "morph:task:update-meta";

  // Initial registration
  morphRegistry.registerMorphNode({
    key,
    node,
    kind: "task",
    role: "source",
    meta: { title: "Original Title", estimate: 30 },
  });

  assert.equal(morphRegistry.resolveMorphNode(key, "source"), node);
  assert.equal(morphRegistry.snapshotMorphNode(key, "source").meta.title, "Original Title");

  // In-place metadata update on parent rerender
  morphRegistry.registerMorphNode({
    key,
    node,
    kind: "task",
    role: "source",
    meta: { title: "Updated Title", estimate: 45 },
  });

  // Node is still live and metadata updated without unmount
  assert.equal(morphRegistry.resolveMorphNode(key, "source"), node);
  assert.equal(morphRegistry.snapshotMorphNode(key, "source").meta.title, "Updated Title");
  assert.equal(morphRegistry.snapshotMorphNode(key, "source").meta.estimate, 45);
});
