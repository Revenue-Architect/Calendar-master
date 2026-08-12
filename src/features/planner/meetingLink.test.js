import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMeetingLink } from "./meetingLink.js";

test("accepts http(s) and promotes a bare domain", () => {
  assert.equal(normalizeMeetingLink("https://meet.example.com/abc"), "https://meet.example.com/abc");
  assert.equal(normalizeMeetingLink("meet.example.com/abc"), "https://meet.example.com/abc");
});

test("rejects schemes and shapes a Join button must never wrap", () => {
  assert.equal(normalizeMeetingLink("javascript:alert(1)"), "");
  assert.equal(normalizeMeetingLink("not a link"), "");
  assert.equal(normalizeMeetingLink("ftp://files.example.com/x"), "");
  assert.equal(normalizeMeetingLink(""), "");
});
