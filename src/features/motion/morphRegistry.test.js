import test from "node:test";
import assert from "node:assert/strict";
import { createMorphRegistry } from "./morphRegistry.js";

// Mock DOM Node helper for pure Node.js test environment
function createMockNode({ x = 10, y = 20, width = 120, height = 48 } = {}) {
  return {
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
  };
}

test("MorphRegistry registers nodes and captures geometry snapshots", () => {
  const registry = createMorphRegistry();
  const node = createMockNode({ x: 50, y: 100, width: 200, height: 60 });

  const cleanup = registry.registerMorphNode({
    key: "morph:event:occ-1:v:day:l:timeline",
    node,
    kind: "event",
    meta: { title: "Team Sync", color: "#3b82f6" },
  });

  const snapshot = registry.getMorphSnapshot("morph:event:occ-1:v:day:l:timeline");
  assert.ok(snapshot);
  assert.equal(snapshot.key, "morph:event:occ-1:v:day:l:timeline");
  assert.equal(snapshot.kind, "event");
  assert.equal(snapshot.meta.title, "Team Sync");
  assert.deepEqual(snapshot.rect, {
    x: 50,
    y: 100,
    top: 100,
    left: 50,
    right: 250,
    bottom: 160,
    width: 200,
    height: 60,
  });

  cleanup();
  assert.equal(registry.getMorphSnapshot("morph:event:occ-1:v:day:l:timeline"), null);
});

test("MorphRegistry protects against stale unregister races (StrictMode resilience)", () => {
  const registry = createMorphRegistry();
  const nodeA = createMockNode({ x: 10, y: 10, width: 100, height: 40 });
  const nodeB = createMockNode({ x: 20, y: 20, width: 150, height: 50 });

  // Node A registers
  const cleanupA = registry.registerMorphNode({ key: "test-key", node: nodeA });

  // Node B replaces Node A on the same key (e.g. fast re-mount / update)
  const cleanupB = registry.registerMorphNode({ key: "test-key", node: nodeB, meta: { version: "B" } });

  // Stale Node A unregisters late
  cleanupA();

  // Active Node B MUST NOT be deleted by stale Node A's cleanup
  const snapshot = registry.getMorphSnapshot("test-key");
  assert.ok(snapshot, "Node B must remain registered");
  assert.equal(snapshot.meta.version, "B");
  assert.equal(snapshot.rect.width, 150);

  // When Node B unregisters, key is cleared
  cleanupB();
  assert.equal(registry.getMorphSnapshot("test-key"), null);
});

test("MorphRegistry custom snapshot extractor override", () => {
  const registry = createMorphRegistry();
  const node = createMockNode();

  registry.registerMorphNode({
    key: "custom-extractor-key",
    node,
    getSnapshot: (n, meta) => ({
      custom: true,
      customWidth: 999,
      tag: meta.tag,
    }),
    meta: { tag: "special" },
  });

  const snapshot = registry.getMorphSnapshot("custom-extractor-key");
  assert.equal(snapshot.custom, true);
  assert.equal(snapshot.customWidth, 999);
  assert.equal(snapshot.tag, "special");
});

test("negative control: invalid registration parameters throw immediately", () => {
  const registry = createMorphRegistry();
  assert.throws(() => registry.registerMorphNode({ key: "", node: createMockNode() }), /non-empty string key/);
  assert.throws(() => registry.registerMorphNode({ key: "valid-key", node: null }), /valid DOM node/);
  assert.equal(registry.getMorphSnapshot("non-existent-key"), null);
});
