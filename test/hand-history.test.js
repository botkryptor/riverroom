import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveCompletedHand,
  handHistoryForViewer,
  initializeHandLog,
  recordHandAction,
} from "../src/hand-history.js";

function completedRoom() {
  return {
    handHistory: [],
    hand: {
      number: 3,
      startedAt: "2026-09-30T10:00:00.000Z",
      completedAt: "2026-09-30T10:01:00.000Z",
      street: "river",
      pot: 200,
      board: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "h" },
        { rank: "Q", suit: "d" },
        { rank: "J", suit: "c" },
        { rank: "T", suit: "s" },
      ],
      result: { message: "Alice won at showdown." },
    },
    players: [
      {
        id: "alice",
        name: "Alice",
        cards: [{ rank: "2", suit: "s" }, { rank: "3", suit: "s" }],
        lastAction: "Big blind 10",
        totalBet: 100,
      },
      {
        id: "bob",
        name: "Bob",
        cards: [{ rank: "4", suit: "h" }, { rank: "5", suit: "h" }],
        lastAction: "Small blind 5",
        totalBet: 100,
      },
    ],
  };
}

test("archives a completed hand once with its action log", () => {
  const room = completedRoom();
  initializeHandLog(room);
  room.players[0].lastAction = "Check";
  recordHandAction(room, room.players[0], "river");

  assert.equal(archiveCompletedHand(room), true);
  assert.equal(archiveCompletedHand(room), false);
  assert.equal(room.handHistory.length, 1);
  assert.equal(room.handHistory[0].actions.at(-1).action, "Check");
});

test("returns only the viewer's private cards", () => {
  const room = completedRoom();
  initializeHandLog(room);
  archiveCompletedHand(room);

  const [history] = handHistoryForViewer(room, "alice");
  assert.deepEqual(history.holeCards, room.players[0].cards);
  assert.equal(JSON.stringify(history).includes('"rank":"4"'), false);
  assert.equal(handHistoryForViewer(room, "observer").length, 0);
});
