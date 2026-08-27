import assert from "node:assert/strict";
import test from "node:test";

import { createMorphCloseSnapshotRelease, startCloseWithLatestSource } from "./closeActiveMorph.js";
import { createMorphRegistry } from "./morphRegistry.js";
import { MORPH_STATES, createMorphTransaction } from "./morphTransaction.js";

function createNode({ x = 0, y = 0, width = 160, height = 52 } = {}) {
  return {
    isConnected: true,
    getBoundingClientRect() {
      return {
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
      };
    },
    querySelector() {
      return null;
    },
  };
}

function openMorph({ registry, key, node }) {
  const unregister = registry.registerMorphNode({ key, node, role: "source" });
  const source = registry.getMorphSnapshot(key, "source");
  const transaction = createMorphTransaction();
  const runId = transaction.startOpen({ key, source });
  transaction.settleOpen(runId);
  return { transaction, source, unregister };
}

test("close resolves a remounted live semantic source and ignores document.activeElement", (t) => {
  const registry = createMorphRegistry();
  const key = "event:close-target";
  const sourceA = createNode({ x: 24, y: 120 });
  const { transaction, source, unregister } = openMorph({ registry, key, node: sourceA });
  unregister();

  const sourceB = createNode({ x: 24, y: 216 });
  registry.registerMorphNode({ key, node: sourceB, role: "source" });
  const decoy = createNode({ x: 900, y: 8 });
  const previousDocument = globalThis.document;
  globalThis.document = { activeElement: decoy };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  assert.equal(startCloseWithLatestSource({ transaction, snapshot: transaction.getSnapshot(), registry }), true);

  const target = transaction.getSnapshot().targetSnapshot;
  assert.equal(target.rect.y, 216);
  assert.notEqual(target.rect.y, source.rect.y);
  assert.notEqual(target.rect.y, decoy.getBoundingClientRect().y);
});

test("close falls back to the retained latest semantic source after it unmounts", () => {
  const registry = createMorphRegistry();
  const key = "event:last-valid-close-target";
  const sourceA = createNode({ x: 24, y: 120 });
  const { transaction, source, unregister } = openMorph({ registry, key, node: sourceA });
  unregister();

  const sourceB = createNode({ x: 24, y: 216 });
  const unregisterB = registry.registerMorphNode({ key, node: sourceB, role: "source" });
  unregisterB();

  const retainedSourceB = registry.getLastMorphSnapshot(key, "source");
  assert.equal(retainedSourceB.rect.y, 216);

  assert.equal(startCloseWithLatestSource({ transaction, snapshot: transaction.getSnapshot(), registry }), true);

  const target = transaction.getSnapshot().targetSnapshot;
  assert.equal(target.rect.y, 216);
  assert.notEqual(target.rect.y, source.rect.y);
  assert.equal(target, retainedSourceB);
});

test("a settled close releases history without unregistering a live semantic source", () => {
  const registry = createMorphRegistry();
  const closeRelease = createMorphCloseSnapshotRelease({ registry });
  const transaction = createMorphTransaction({
    onStateChange: closeRelease.onTransactionStateChange,
  });
  const key = "event:release-after-close";
  const source = createNode({ y: 216 });
  registry.registerMorphNode({ key, node: source, role: "source" });
  const sourceSnapshot = registry.getMorphSnapshot(key, "source");
  const runId = transaction.startOpen({ key, source: sourceSnapshot });

  transaction.settleOpen(runId);
  transaction.startClose({ target: sourceSnapshot, runId });
  closeRelease.trackClose({ key, runId });
  transaction.settleClose(runId);

  assert.equal(registry.getLastMorphSnapshot(key, "source"), null);
  assert.equal(registry.resolveMorphNode(key, "source"), source);
  assert.deepEqual(registry.getRegisteredKeys(), [key]);
});

test("a newer open run prevents an old close notification from releasing its history", () => {
  const registry = createMorphRegistry();
  const closeRelease = createMorphCloseSnapshotRelease({ registry });
  const key = "event:rapid-reopen";
  const sourceA = createNode({ y: 120 });
  const unregisterA = registry.registerMorphNode({ key, node: sourceA, role: "source" });
  registry.snapshotMorphNode(key, "source");
  unregisterA();

  const sourceB = createNode({ y: 216 });
  registry.registerMorphNode({ key, node: sourceB, role: "source" });
  registry.snapshotMorphNode(key, "source");

  closeRelease.trackClose({ key, runId: 4 });
  closeRelease.onTransactionStateChange({ state: MORPH_STATES.OPENING, runId: 5 });

  assert.equal(
    closeRelease.onTransactionStateChange({ state: MORPH_STATES.IDLE, runId: 4 }),
    false,
  );
  assert.equal(registry.getLastMorphSnapshot(key, "source").rect.y, 216);
});
