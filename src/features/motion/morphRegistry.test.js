import test from "node:test";
import assert from "node:assert/strict";
import { createMorphRegistry } from "./morphRegistry.js";

// Mock DOM Node helper with generic motion attributes
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
      if (selector.includes("[data-morph-title]")) {
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
      if (selector.includes("[data-morph-meta]")) {
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
      if (hasProgress && selector.includes("[data-morph-marker]")) {
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

test("Blocker 2: releaseMorphSnapshots clears geometry history without unregistering mounted live nodes", () => {
  const registry = createMorphRegistry();
  const sourceNode = createMockNode({ x: 10, y: 20, width: 100, height: 40, titleText: "Live Card" });
  const key = "morph:event:card-1";

  // 1. Source card registers
  const unreg = registry.registerMorphNode({
    key,
    node: sourceNode,
    role: "source",
    meta: { title: "Live Card" },
  });

  // 2. Open inspector -> snapshot taken
  const snap1 = registry.snapshotMorphNode(key, "source");
  assert.ok(snap1);
  assert.equal(registry.getLastMorphSnapshot(key, "source").rect.width, 100);

  // 3. Close inspector -> transaction finishes and releases snapshots
  registry.releaseMorphSnapshots(key, "source");

  // Historical snapshot is released
  assert.equal(registry.getLastMorphSnapshot(key, "source"), null);

  // BUT live source is still mounted and still resolves!
  assert.equal(registry.resolveMorphNode(key, "source"), sourceNode, "Live source must not be wiped by release");

  // 4. Second open captures origin cleanly again without re-mounting
  const snap2 = registry.snapshotMorphNode(key, "source");
  assert.ok(snap2, "Second open must successfully snapshot live source");
  assert.equal(snap2.rect.width, 100);

  // 5. When card unmounts and snapshots released, key is pruned
  unreg();
  registry.releaseMorphSnapshots(key);
  assert.equal(registry.resolveMorphNode(key, "source"), null);
  assert.equal(registry.getLastMorphSnapshot(key, "source"), null);
});

test("Blocker 5: snapshot immutability is strictly enforced on motion geometry", () => {
  const registry = createMorphRegistry();
  const sourceNode = createMockNode({ x: 50, y: 60, width: 150, height: 50 });
  const key = "morph:event:immutable-test";

  registry.registerMorphNode({ key, node: sourceNode, role: "source" });

  const snap = registry.snapshotMorphNode(key, "source");
  assert.ok(snap);
  assert.equal(snap.rect.x, 50);

  // Attempt to mutate snapshot geometry
  assert.throws(() => {
    snap.rect.x = 999;
  }, /Cannot assign to read only property/);

  // Assert retained snapshot in registry was not corrupted
  const retained = registry.getLastMorphSnapshot(key, "source");
  assert.equal(retained.rect.x, 50);
});

test("Blocker 6: invalid roles throw immediately on registration", () => {
  const registry = createMorphRegistry();
  const node = createMockNode();

  assert.throws(
    () => registry.registerMorphNode({ key: "test-role", node, role: "destintion" }),
    /role must be "source" or "destination"/
  );
  assert.throws(
    () => registry.registerMorphNode({ key: "test-role", node, role: "other" }),
    /role must be "source" or "destination"/
  );
});

test("Blocker 4: MorphRegistry uses generic semantic attributes (data-morph-*) without product CSS classes", () => {
  const registry = createMorphRegistry();
  const node = createMockNode({
    x: 40,
    y: 80,
    width: 240,
    height: 64,
    titleText: "Generic Title",
    timeText: "2:00 PM",
    hasProgress: true,
  });

  const key = "morph:event:generic-shared";
  registry.registerMorphNode({
    key,
    node,
    role: "source",
  });

  const snap = registry.snapshotMorphNode(key, "source");
  assert.ok(snap);
  assert.ok(snap.shared.title, "Shared title via data-morph-title must be captured");
  assert.equal(snap.shared.title.text, "Generic Title");
  assert.ok(snap.shared.meta, "Shared meta via data-morph-meta must be captured");
  assert.equal(snap.shared.meta.text, "2:00 PM");
  assert.ok(snap.shared.marker, "Shared marker via data-morph-marker must be captured");
  assert.equal(snap.shared.marker.rect.width, 18);
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

test("Issue 3: consistent role validation across all registry APIs", () => {
  const registry = createMorphRegistry();
  const node = createMockNode();
  const key = "role-validation-key";

  registry.registerMorphNode({ key, node, role: "source" });
  registry.snapshotMorphNode(key, "source");

  // All role-aware APIs must reject invalid role strings with descriptive error
  const invalidRole = "destintion"; // typo
  assert.throws(() => registry.getLastMorphSnapshot(key, invalidRole), /role must be "source" or "destination"/);
  assert.throws(() => registry.snapshotMorphNode(key, invalidRole), /role must be "source" or "destination"/);
  assert.throws(() => registry.resolveMorphNode(key, invalidRole), /role must be "source" or "destination"/);
  assert.throws(() => registry.getMorphSnapshot(key, invalidRole), /role must be "source" or "destination"/);
  assert.throws(() => registry.releaseMorphSnapshots(key, invalidRole), /role must be "source" or "destination"/);
  assert.throws(() => registry.unregisterMorphNode(key, node, invalidRole), /role must be "source" or "destination"/);
  assert.throws(() => registry.updateMorphNode({ key, node, role: invalidRole }), /role must be "source" or "destination"/);

  // Valid role operations must succeed
  assert.ok(registry.getLastMorphSnapshot(key, "source"));
  assert.equal(registry.getLastMorphSnapshot(key, "destination"), null);

  // undefined role in releaseMorphSnapshots clears both without error
  registry.releaseMorphSnapshots(key, undefined);
  assert.equal(registry.getLastMorphSnapshot(key, "source"), null);
});

test("Issue 4: updateMorphNode updates metadata in place without re-registration churn", () => {
  const registry = createMorphRegistry();
  const node = createMockNode({ titleText: "Initial Title" });
  const key = "update-test-key";

  registry.registerMorphNode({
    key,
    node,
    role: "source",
    meta: { count: 1 },
  });

  // Update with matching node and key
  const updated = registry.updateMorphNode({
    key,
    node,
    role: "source",
    meta: { count: 2 },
  });
  assert.equal(updated, true, "updateMorphNode must return true when entry matches");

  // Snapshot captures updated metadata
  const snap = registry.snapshotMorphNode(key, "source");
  assert.equal(snap.meta.count, 2);

  // Mismatched node or non-existent key returns false
  const differentNode = createMockNode();
  assert.equal(registry.updateMorphNode({ key, node: differentNode, role: "source", meta: { count: 3 } }), false);
  assert.equal(registry.updateMorphNode({ key: "missing-key", node, role: "source", meta: { count: 3 } }), false);
});
