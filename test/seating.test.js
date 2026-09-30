import assert from "node:assert/strict";
import test from "node:test";
import { chooseSeat } from "../src/seating.js";

test("selects the first open seat when auto seating is requested", () => {
  assert.equal(chooseSeat([{ seat: 0 }, { seat: 2 }], null), 1);
});

test("honors an available requested seat", () => {
  assert.equal(chooseSeat([{ seat: 0 }], 6), 6);
});

test("rejects occupied and invalid seats", () => {
  assert.throws(() => chooseSeat([{ seat: 4 }], 4), /already taken/);
  assert.throws(() => chooseSeat([], 9), /valid seat/);
});

test("rejects joins when the table is full", () => {
  const players = Array.from({ length: 9 }, (_, seat) => ({ seat }));
  assert.throws(() => chooseSeat(players, null), /table is full/);
});
