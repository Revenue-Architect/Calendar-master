import assert from "node:assert/strict";
import test from "node:test";

import { startCloseWithLatestSource } from "./closeActiveMorph.js";
import { createMorphRegistry } from "./morphRegistry.js";
import { createMorphTransaction } from "./morphTransaction.js";

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
