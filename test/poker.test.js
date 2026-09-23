import assert from "node:assert/strict";
import test from "node:test";
import { buildSidePots, distributePots, evaluateBest } from "../src/poker.js";

const cards = (text) =>
  text.split(" ").map((card) => ({ rank: card[0], suit: card[1].toLowerCase() }));

test("detects a wheel straight", () => {
  const result = evaluateBest(cards("As 2h 3d 4c 5s Kd Qc"));
  assert.equal(result.label, "Straight");
  assert.deepEqual(result.score, [4, 5]);
});

test("selects a full house over a flush", () => {
  const result = evaluateBest(cards("Ah Ad Ac Ks Kd 2h 3h"));
  assert.equal(result.label, "Full house");
  assert.deepEqual(result.score, [6, 14, 13]);
});

test("builds main and side pots from unequal all-ins", () => {
  const pots = buildSidePots([
    { id: "a", totalBet: 100, folded: false },
    { id: "b", totalBet: 300, folded: false },
    { id: "c", totalBet: 300, folded: false },
  ]);
  assert.deepEqual(pots, [
    { amount: 300, eligiblePlayerIds: ["a", "b", "c"] },
    { amount: 400, eligiblePlayerIds: ["b", "c"] },
  ]);
});

test("distributes main and side pots to different winners", () => {
  const board = cards("2s 3h 4d 9c Kd");
  const players = [
    { id: "a", totalBet: 100, folded: false, cards: cards("5s 6s") },
    { id: "b", totalBet: 300, folded: false, cards: cards("Kh Qh") },
    { id: "c", totalBet: 300, folded: false, cards: cards("9h 9d") },
  ];

  const { payouts } = distributePots(players, board);
  assert.deepEqual([...payouts], [
    ["a", 300],
    ["b", 0],
    ["c", 400],
  ]);
});

test("splits tied pots without losing chips", () => {
  const board = cards("As Ks Qs Js Ts");
  const players = [
    { id: "a", totalBet: 101, folded: false, cards: cards("2h 3h") },
    { id: "b", totalBet: 101, folded: false, cards: cards("4h 5h") },
  ];

  const { payouts } = distributePots(players, board);
  assert.equal((payouts.get("a") ?? 0) + (payouts.get("b") ?? 0), 202);
  assert.deepEqual([...payouts], [
    ["a", 101],
    ["b", 101],
  ]);
});

test("includes a folded player's chips while excluding them from winning", () => {
  const board = cards("2s 3h 4d 9c Kd");
  const players = [
    { id: "a", totalBet: 100, folded: false, cards: cards("Kh Qh") },
    { id: "b", totalBet: 100, folded: false, cards: cards("9h 9d") },
    { id: "c", totalBet: 100, folded: true, cards: cards("As Ad") },
  ];

  const { payouts } = distributePots(players, board);
  assert.deepEqual([...payouts], [
    ["a", 0],
    ["b", 300],
    ["c", 0],
  ]);
});
