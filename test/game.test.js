import assert from "node:assert/strict";
import test from "node:test";
import { performAction, startHand } from "../src/game.js";

function player(id, name, seat) {
  return {
    id,
    name,
    seat,
    stack: 1000,
    connected: true,
    cards: [],
    folded: false,
    allIn: false,
    streetBet: 0,
    totalBet: 0,
    lastAction: "",
  };
}

test("runs a heads-up all-in through showdown without losing chips", () => {
  const room = {
    settings: { smallBlind: 5, bigBlind: 10 },
    players: [player("a", "A", 0), player("b", "B", 1)],
    hand: null,
    handNumber: 0,
  };

  startHand(room);
  const first = room.players.find((candidate) => candidate.seat === room.hand.actingSeat);
  performAction(room, first.id, "all-in");
  const second = room.players.find((candidate) => candidate.seat === room.hand.actingSeat);
  performAction(room, second.id, "all-in");

  assert.ok(room.hand.result);
  assert.equal(room.hand.board.length, 5);
  assert.equal(room.players.reduce((sum, candidate) => sum + candidate.stack, 0), 2000);
});
