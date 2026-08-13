import assert from "node:assert/strict";
import test from "node:test";

import {
  readHostNotebook,
  readLocalNotebook,
  readRecoverableNotebook,
  recoveryDisplayState,
} from "./notebookRecovery.js";

test("localStorage probe returns the newest present key", () => {
  const store = {
    "nbmp:state:v5": "{\"schemaVersion\":5}",
    "nbmp:state:v8": "{\"schemaVersion\":8}",
    getItem(key) { return this[key] ?? null; },
  };
  assert.deepEqual(readLocalNotebook(store), {
    key: "nbmp:state:v8",
    raw: "{\"schemaVersion\":8}",
  });
});

test("host storage is preferred over an empty localStorage", async () => {
  const host = {
    async get(key) {
      if (key === "nbmp:state:v8") return { value: "{\"schemaVersion\":8,\"title\":\"host\"}" };
      return { value: null };
    },
  };
  const local = { getItem() { return null; } };
  const found = await readRecoverableNotebook({ host, localStorageLike: local });
  assert.equal(found.key, "nbmp:state:v8");
  assert.match(found.raw, /host/);
});

test("a missing host still falls back to localStorage", async () => {
  const local = {
    getItem(key) { return key === "nbmp:state:v7" ? "{\"schemaVersion\":7}" : null; },
  };
  const found = await readRecoverableNotebook({ host: null, localStorageLike: local });
  assert.equal(found.key, "nbmp:state:v7");
});

test("host get throwing does not hide a local copy", async () => {
  const host = { async get() { throw new Error("host down"); } };
  const local = {
    getItem(key) { return key === "nbmp:state:v8" ? "{\"ok\":true}" : null; },
  };
  const found = await readRecoverableNotebook({ host, localStorageLike: local });
  assert.equal(found.raw, "{\"ok\":true}");
  assert.equal(await readHostNotebook(host), null);
});

test("default recovery probes survive blocked browser storage getters", async () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperties({}, {
      localStorage: { configurable: true, get() { throw new Error("local storage blocked"); } },
      storage: { configurable: true, get() { throw new Error("host storage blocked"); } },
    }),
  });

  try {
    assert.equal(readLocalNotebook(), null);
    assert.equal(await readHostNotebook(), null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("the crash screen waits for host storage before offering a local copy", () => {
  const localFound = { key: "nbmp:state:v8", raw: "{\"source\":\"local\"}" };
  assert.deepEqual(recoveryDisplayState({
    hasHost: true,
    hostChecked: false,
    hostFound: null,
    localFound,
  }), { found: null, stillLooking: true });

  assert.deepEqual(recoveryDisplayState({
    hasHost: true,
    hostChecked: true,
    hostFound: null,
    localFound,
  }), { found: localFound, stillLooking: false });
});
