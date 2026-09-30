import assert from "node:assert/strict";
import test from "node:test";
import { relativeSeat } from "../public/table.js";

test("places the viewer in the center position", () => {
  assert.equal(relativeSeat(6, 6), 0);
});

test("keeps other seats clockwise relative to the viewer", () => {
  assert.equal(relativeSeat(8, 6), 2);
  assert.equal(relativeSeat(1, 6), 4);
  assert.equal(relativeSeat(5, 6), 8);
});
