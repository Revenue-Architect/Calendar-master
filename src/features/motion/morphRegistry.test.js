import test from "node:test";
import assert from "node:assert/strict";
import { createMorphRegistry } from "./morphRegistry.js";

// Mock DOM Node helper for pure Node.js test environment
function createMockNode({
  x = 10,
  y = 20,
  width = 120,
  height = 48,
  titleText = "Event Title",
  timeText = "10:00 AM",
  hasProgress = false,
  isConnected = true,
} = {}) {
  const node = {
    isConnected,
    getBoundingClientRect: () => ({
      x,
      y,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      width,
      height,
    }),
    querySelector: (selector) => {
      if (selector.includes("nb-lead") || selector.includes("[data-morph-title]")) {
        return {
          isConnected,
          textContent: titleText,
          getBoundingClientRect: () => ({
            x: x + 8,
            y: y + 4,
            top: y + 4,
            left: x + 8,
            right: x + 80,
            bottom: y + 20,
            width: 72,
            height: 16,
          }),
        };
      }
      if (selector.includes("nb-task-time") || selector.includes("nb-event-time") || selector.includes("[data-morph-meta]")) {
        return {
          isConnected,
          textContent: timeText,
          getBoundingClientRect: () => ({
            x: x + 85,
            y: y + 5,
            top: y + 5,
            left: x + 85,
            right: x + 115,
            bottom: y + 17,
            width: 30,
            height: 12,
          }),
        };
      }
      if (hasProgress && (selector.includes("timeline-action-progress") || selector.includes("[data-morph-marker]"))) {
        return {
          isConnected,
          getAttribute: () => "progress-ring",
          getBoundingClientRect: () => ({
            x: x + width - 24,
            y: y + 6,
            top: y + 6,
            left: x + width - 24,
            right: x + width - 6,
            bottom: y + 24,
            width: 18,
            height: 18,
          }),
        };
      }
      return null;
    },
  };
  return node;
}

test("MorphRegistry supports independent source and destination coexistence on the same key", () => {
  const registry = createMorphRegistry();
  const sourceNode = createMockNode({ x: 50, y: 100, width: 200, height: 60, titleText: "Design Sync" });
  const destNode = createMockNode({ x: 20, y: 40, width: 400, height: 320, titleText: "Design Sync (Open)" });

  const key = "morph:event:sync-1:v:day:l:timeline";

  // Register source
  const unregSource = registry.registerMorphNode({
    key,
    node: sourceNode,
    kind: "event",
    role: "source",
    meta: { title: "Design Sync" },
  });

  // Register destination under SAME key
  const unregDest = registry.registerMorphNode({
    key,
    node: destNode,
    kind: "event",
    role: "destination",
    meta: { title: "Design Sync (Open)" },
  });

  // Both must resolve distinctly
  assert.equal(registry.resolveMorphNode(key, "source"), sourceNode, "Source node must resolve");
  assert.equal(registry.resolveMorphNode(key, "destination"), destNode, "Destination node must resolve");

  const sourceSnap = registry.snapshotMorphNode(key, "source");
  const destSnap = registry.snapshotMorphNode(key, "destination");

  assert.ok(sourceSnap, "Source snapshot must exist");
  assert.ok(destSnap, "Destination snapshot must exist");
  assert.equal(sourceSnap.role, "source");
  assert.equal(destSnap.role, "destination");
  assert.equal(sourceSnap.rect.width, 200);
  assert.equal(destSnap.rect.width, 400);

  // Unregister destination -> source must remain untouched
  unregDest();
  assert.equal(registry.resolveMorphNode(key, "destination"), null);
  assert.equal(registry.resolveMorphNode(key, "source"), sourceNode, "Source must survive destination unmount");

  unregSource();
  assert.equal(registry.resolveMorphNode(key, "source"), null);
});

test("MorphRegistry protects against stale unregisters per role", () => {
  const registry = createMorphRegistry();
  const sourceA = createMockNode({ x: 10, y: 10, width: 100, height: 40 });
  const sourceB = createMockNode({ x: 20, y: 20, width: 150, height: 50 });
  const destA = createMockNode({ x: 0, y: 0, width: 500, height: 400 });

  const key = "morph:task:task-1:v:timeline";

  // Source A registers
  const unregSourceA = registry.registerMorphNode({ key, node: sourceA, role: "source" });

  // Source B replaces Source A on the same key
  const unregSourceB = registry.registerMorphNode({ key, node: sourceB, role: "source" });

  // Dest A registers on the same key
  const unregDestA = registry.registerMorphNode({ key, node: destA, role: "destination" });

  // Stale Source A cleanup fires
  unregSourceA();

  // Active Source B and Dest A must remain
  assert.equal(registry.resolveMorphNode(key, "source"), sourceB, "Source B must survive stale Source A unregister");
  assert.equal(registry.resolveMorphNode(key, "destination"), destA, "Dest A must survive Source A unregister");

  unregSourceB();
  unregDestA();
});

test("Task 4: MorphRegistry preserves last valid snapshot across unmount, replacement, and explicit release", () => {
  const registry = createMorphRegistry();
  const source1 = createMockNode({ x: 100, y: 200, width: 180, height: 45, titleText: "Original Title" });
  const key = "morph:event:retain-test";

  const unreg1 = registry.registerMorphNode({
    key,
    node: source1,
    role: "source",
    meta: { title: "Original Title" },
  });

  // 1. Snapshot before unmount
  const initialSnap = registry.snapshotMorphNode(key, "source");
  assert.ok(initialSnap);
  assert.equal(initialSnap.rect.width, 180);
  assert.equal(initialSnap.meta.title, "Original Title");

  // 2. Source unmounts
  unreg1();
  assert.equal(registry.resolveMorphNode(key, "source"), null, "Live source node is gone");

  // 3. Last valid snapshot is retained
  const retainedSnap = registry.getLastMorphSnapshot(key, "source");
  assert.ok(retainedSnap, "Last snapshot must be preserved after unmount");
  assert.equal(retainedSnap.rect.width, 180);
  assert.equal(retainedSnap.meta.title, "Original Title");

  // 4. Replacement source registers (e.g. view switch or remount)
  const source2 = createMockNode({ x: 120, y: 220, width: 220, height: 50, titleText: "Replaced Title" });
  const unreg2 = registry.registerMorphNode({
    key,
    node: source2,
    role: "source",
    meta: { title: "Replaced Title" },
  });
  assert.equal(registry.resolveMorphNode(key, "source"), source2, "Replacement source is now live truth");

  // 5. Deliberately snapshot new replacement
  const replacedSnap = registry.snapshotMorphNode(key, "source");
  assert.equal(replacedSnap.rect.width, 220);
  assert.equal(registry.getLastMorphSnapshot(key, "source").meta.title, "Replaced Title");

  // 6. Explicit release prunes key memory
  unreg2();
  registry.releaseMorphKey(key);
  assert.equal(registry.getLastMorphSnapshot(key, "source"), null);
  assert.equal(registry.resolveMorphNode(key, "source"), null);
});

test("Task 3: MorphRegistry captures normalized shared element snapshots (title, meta, marker, paint, radius, viewport)", () => {
  const registry = createMorphRegistry();
  const node = createMockNode({
    x: 40,
    y: 80,
    width: 240,
    height: 64,
    titleText: "Sprint Planning",
    timeText: "2:00 PM",
    hasProgress: true,
  });

  const key = "morph:event:shared-elements";
  registry.registerMorphNode({
    key,
    node,
    role: "source",
    meta: { title: "Sprint Planning", time: "2:00 PM" },
  });

  const snap = registry.snapshotMorphNode(key, "source");
  assert.ok(snap);
  assert.ok(snap.paint, "Snapshot must include paint container");
  assert.ok(snap.viewport, "Snapshot must include viewport container");
  assert.ok(snap.capturedAt > 0, "Snapshot must include capturedAt timestamp");
  assert.equal(typeof snap.radius, "number");

  assert.ok(snap.shared, "Snapshot must include shared elements container");

  // Title shared snapshot
  assert.ok(snap.shared.title, "Title shared snapshot must exist");
  assert.equal(snap.shared.title.text, "Sprint Planning");
  assert.deepEqual(snap.shared.title.rect, {
    x: 48,
    y: 84,
    top: 84,
    left: 48,
    right: 120,
    bottom: 100,
    width: 72,
    height: 16,
  });

  // Meta / time shared snapshot
  assert.ok(snap.shared.meta, "Meta shared snapshot must exist");
  assert.equal(snap.shared.meta.text, "2:00 PM");

  // Marker / progress shared snapshot
  assert.ok(snap.shared.marker, "Marker shared snapshot must exist");
  assert.equal(snap.shared.marker.rect.width, 18);
});

test("Task 3: MorphRegistry handles explicit ref/node shared bindings and disconnected child nodes safely", () => {
  const registry = createMorphRegistry();
  const rootNode = createMockNode({ x: 0, y: 0, width: 100, height: 100 });
  const explicitTitleNode = createMockNode({ x: 10, y: 10, width: 60, height: 20, titleText: "Custom Explicit" });
  const disconnectedNode = createMockNode({ isConnected: false });

  const key = "morph:event:explicit-shared";
  registry.registerMorphNode({
    key,
    node: rootNode,
    role: "source",
    shared: {
      title: explicitTitleNode,
      meta: { current: disconnectedNode }, // Ref object to disconnected element
      marker: null,
    },
  });

  const snap = registry.snapshotMorphNode(key, "source");
  assert.ok(snap);
  assert.ok(snap.shared.title);
  assert.equal(snap.shared.title.rect.width, 60);
  assert.equal(snap.shared.meta, null, "Disconnected child ref must yield null safely without throwing");
});

test("negative control: invalid registration parameters throw immediately", () => {
  const registry = createMorphRegistry();
  assert.throws(() => registry.registerMorphNode({ key: "", node: createMockNode() }), /non-empty string key/);
  assert.throws(() => registry.registerMorphNode({ key: "valid-key", node: null }), /valid DOM node/);
  assert.equal(registry.snapshotMorphNode("non-existent-key", "source"), null);
  assert.equal(registry.resolveMorphNode("non-existent-key", "source"), null);
});

test("negative control: flawed single-entry overwrite model cannot support coexistence", () => {
  const naiveRegistry = new Map();
  const sourceNode = createMockNode({ width: 100 });
  const destNode = createMockNode({ width: 400 });
  const key = "test-key";

  naiveRegistry.set(key, { node: sourceNode, role: "source" });
  naiveRegistry.set(key, { node: destNode, role: "destination" });

  // Naive overwrite loses source reference
  assert.notEqual(naiveRegistry.get(key).node, sourceNode);
});
