import assert from "node:assert/strict";
import test from "node:test";
import { computeBalances, computeSettlements } from "../src/ledger.js";

test("computes live net positions from buy-ins and stacks", () => {
  const players = [
    { id: "a", name: "A", stack: 600 },
    { id: "b", name: "B", stack: 1400 },
  ];
  const ledger = [
    { playerId: "a", type: "buy-in", amount: 1000 },
    { playerId: "b", type: "buy-in", amount: 1000 },
  ];

  assert.deepEqual(computeBalances(players, ledger), [
    { playerId: "a", name: "A", buyIn: 1000, cashOut: 600, net: -400 },
    { playerId: "b", name: "B", buyIn: 1000, cashOut: 1400, net: 400 },
  ]);
});

test("minimizes settlement transfers across several players", () => {
  const settlement = computeSettlements([
    { playerId: "a", name: "A", net: -700 },
    { playerId: "b", name: "B", net: -300 },
    { playerId: "c", name: "C", net: 400 },
    { playerId: "d", name: "D", net: 600 },
  ]);

  assert.equal(settlement.balanced, true);
  assert.deepEqual(settlement.transfers, [
    { fromPlayerId: "a", from: "A", toPlayerId: "d", to: "D", amount: 600 },
    { fromPlayerId: "a", from: "A", toPlayerId: "c", to: "C", amount: 100 },
    { fromPlayerId: "b", from: "B", toPlayerId: "c", to: "C", amount: 300 },
  ]);
});

test("flags an unbalanced ledger", () => {
  assert.deepEqual(
    computeSettlements([
      { playerId: "a", name: "A", net: -100 },
      { playerId: "b", name: "B", net: 90 },
    ]),
    { balanced: false, difference: -10, transfers: [] },
  );
});
