import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChatMessage } from "../src/chat.js";

test("trims a valid chat message", () => {
  assert.equal(normalizeChatMessage("  nice hand  "), "nice hand");
});

test("rejects empty and oversized chat messages", () => {
  assert.throws(() => normalizeChatMessage("   "), /Enter a message/);
  assert.throws(() => normalizeChatMessage("x".repeat(501)), /up to 500/);
});
