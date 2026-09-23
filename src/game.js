import { randomInt } from "node:crypto";
import { distributePots } from "./poker.js";

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

function createDeck() {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function nextSeatFrom(room, startingSeat, predicate) {
  for (let distance = 1; distance <= 9; distance += 1) {
    const seat = (startingSeat + distance) % 9;
    const player = room.players.find((candidate) => candidate.seat === seat);
    if (player && predicate(player)) return player;
  }
  return null;
}

function contribute(player, amount) {
  const actualAmount = Math.min(player.stack, Math.max(0, amount));
  player.stack -= actualAmount;
  player.streetBet += actualAmount;
  player.totalBet += actualAmount;
  if (player.stack === 0) player.allIn = true;
  return actualAmount;
}

function potSize(room) {
  return room.players.reduce((sum, player) => sum + (player.totalBet ?? 0), 0);
}

function activeInHand(player) {
  return player.cards?.length === 2 && !player.folded;
}

function canAct(player) {
  return activeInHand(player) && !player.allIn;
}

function publicResult(room, message, result = {}) {
  room.hand.result = { message, ...result };
  room.hand.actingSeat = null;
  room.hand.revealed = true;
  room.hand.pot = potSize(room);
  room.hand.completedAt = new Date().toISOString();
}

function finishByFold(room) {
  const winner = room.players.find(activeInHand);
  const amount = potSize(room);
  winner.stack += amount;
  publicResult(room, `${winner.name} wins ${amount} — everyone else folded.`, {
    payouts: [{ playerId: winner.id, amount }],
  });
}

function showdown(room) {
  while (room.hand.board.length < 5) {
    room.hand.deck.pop();
    room.hand.board.push(room.hand.deck.pop());
  }

  const contributors = room.players.filter((player) => player.totalBet > 0);
  const contenders = contributors.filter(activeInHand);
  const { payouts, potResults, evaluations } = distributePots(contributors, room.hand.board);
  for (const player of contenders) player.stack += payouts.get(player.id) ?? 0;

  const winners = contenders
    .filter((player) => (payouts.get(player.id) ?? 0) > 0)
    .map((player) => `${player.name} (${evaluations.get(player.id).label})`);
  publicResult(room, `${winners.join(", ")} won at showdown.`, {
    payouts: [...payouts].map(([playerId, amount]) => ({ playerId, amount })),
    pots: potResults,
  });
}

function dealStreet(room) {
  const hand = room.hand;
  hand.deck.pop();
  if (hand.street === "preflop") {
    hand.board.push(hand.deck.pop(), hand.deck.pop(), hand.deck.pop());
    hand.street = "flop";
  } else if (hand.street === "flop") {
    hand.board.push(hand.deck.pop());
    hand.street = "turn";
  } else if (hand.street === "turn") {
    hand.board.push(hand.deck.pop());
    hand.street = "river";
  } else {
    showdown(room);
    return;
  }

  for (const player of room.players) player.streetBet = 0;
  hand.currentBet = 0;
  hand.minRaise = room.settings.bigBlind;
  hand.actedSeats = [];

  const eligible = room.players.filter(canAct);
  if (eligible.length <= 1) {
    if (hand.street === "river") showdown(room);
    else dealStreet(room);
    return;
  }

  hand.actingSeat = nextSeatFrom(room, hand.dealerSeat, canAct)?.seat ?? null;
}

function bettingRoundComplete(room) {
  const eligible = room.players.filter(canAct);
  return eligible.every(
    (player) =>
      room.hand.actedSeats.includes(player.seat) &&
      player.streetBet === room.hand.currentBet,
  );
}

function continueHand(room, previousSeat) {
  const remaining = room.players.filter(activeInHand);
  if (remaining.length === 1) {
    finishByFold(room);
    return;
  }
  if (bettingRoundComplete(room)) {
    dealStreet(room);
    return;
  }

  const next = nextSeatFrom(room, previousSeat, canAct);
  if (!next) dealStreet(room);
  else room.hand.actingSeat = next.seat;
}

export function startHand(room) {
  if (room.hand && !room.hand.result) throw new Error("A hand is already in progress");
  const players = room.players
    .filter((player) => player.connected && player.stack > 0)
    .sort((left, right) => left.seat - right.seat);
  if (players.length < 2) throw new Error("At least two funded players are required");

  for (const player of room.players) {
    player.cards = [];
    player.folded = false;
    player.allIn = false;
    player.streetBet = 0;
    player.totalBet = 0;
    player.lastAction = "";
  }

  const previousDealer = room.hand?.dealerSeat ?? players[players.length - 1].seat;
  const dealer = nextSeatFrom(room, previousDealer, (player) => players.includes(player));
  const smallBlind =
    players.length === 2 ? dealer : nextSeatFrom(room, dealer.seat, (player) => players.includes(player));
  const bigBlind = nextSeatFrom(room, smallBlind.seat, (player) => players.includes(player));
  const deck = createDeck();

  room.handNumber = (room.handNumber ?? 0) + 1;
  room.hand = {
    number: room.handNumber,
    deck,
    board: [],
    street: "preflop",
    dealerSeat: dealer.seat,
    smallBlindSeat: smallBlind.seat,
    bigBlindSeat: bigBlind.seat,
    currentBet: 0,
    minRaise: room.settings.bigBlind,
    actedSeats: [],
    actingSeat: null,
    result: null,
    revealed: false,
    startedAt: new Date().toISOString(),
  };

  for (let round = 0; round < 2; round += 1) {
    let cursor = dealer.seat;
    for (let dealt = 0; dealt < players.length; dealt += 1) {
      const player = nextSeatFrom(room, cursor, (candidate) => players.includes(candidate));
      player.cards.push(deck.pop());
      cursor = player.seat;
    }
  }

  contribute(smallBlind, room.settings.smallBlind);
  smallBlind.lastAction = `Small blind ${smallBlind.streetBet}`;
  contribute(bigBlind, room.settings.bigBlind);
  bigBlind.lastAction = `Big blind ${bigBlind.streetBet}`;
  room.hand.currentBet = Math.max(smallBlind.streetBet, bigBlind.streetBet);
  room.hand.actingSeat =
    players.length === 2
      ? smallBlind.seat
      : nextSeatFrom(room, bigBlind.seat, canAct)?.seat ?? null;

  if (room.players.filter(canAct).length <= 1) continueHand(room, bigBlind.seat);
  return room.hand;
}

export function performAction(room, playerId, action, requestedAmount = 0) {
  const hand = room.hand;
  if (!hand || hand.result) throw new Error("No hand is currently in progress");
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player || player.seat !== hand.actingSeat) throw new Error("It is not your turn");

  const amount = Math.floor(Number(requestedAmount));
  const callAmount = Math.max(0, hand.currentBet - player.streetBet);

  if (action === "fold") {
    player.folded = true;
    player.lastAction = "Fold";
    hand.actedSeats.push(player.seat);
  } else if (action === "check") {
    if (callAmount !== 0) throw new Error("You cannot check while facing a bet");
    player.lastAction = "Check";
    hand.actedSeats.push(player.seat);
  } else if (action === "call") {
    const paid = contribute(player, callAmount);
    player.lastAction = `Call ${paid}`;
    hand.actedSeats.push(player.seat);
  } else if (action === "bet") {
    if (hand.currentBet !== 0) throw new Error("Use raise while facing a bet");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid bet");
    if (amount < room.settings.bigBlind && amount < player.stack) {
      throw new Error(`Minimum bet is ${room.settings.bigBlind}`);
    }
    const paid = contribute(player, amount);
    hand.currentBet = player.streetBet;
    hand.minRaise = paid;
    hand.actedSeats = [player.seat];
    player.lastAction = `Bet ${paid}`;
  } else if (action === "raise") {
    if (!Number.isFinite(amount) || amount <= hand.currentBet) {
      throw new Error("Raise must exceed the current bet");
    }
    const previousBet = hand.currentBet;
    const required = amount - player.streetBet;
    if (required > player.stack) throw new Error("You do not have enough chips");
    const raiseSize = amount - previousBet;
    const isAllIn = required === player.stack;
    if (raiseSize < hand.minRaise && !isAllIn) {
      throw new Error(`Minimum raise is to ${previousBet + hand.minRaise}`);
    }
    contribute(player, required);
    hand.currentBet = player.streetBet;
    if (raiseSize >= hand.minRaise) {
      hand.minRaise = raiseSize;
      hand.actedSeats = [player.seat];
    } else {
      hand.actedSeats.push(player.seat);
    }
    player.lastAction = `Raise to ${player.streetBet}`;
  } else if (action === "all-in") {
    const previousBet = hand.currentBet;
    const target = player.streetBet + player.stack;
    const raiseSize = target - previousBet;
    const paid = contribute(player, player.stack);
    if (target > previousBet) {
      hand.currentBet = target;
      if (raiseSize >= hand.minRaise) {
        hand.minRaise = raiseSize;
        hand.actedSeats = [player.seat];
      } else {
        hand.actedSeats.push(player.seat);
      }
    } else {
      hand.actedSeats.push(player.seat);
    }
    player.lastAction = `All-in ${paid}`;
  } else {
    throw new Error("Unsupported action");
  }

  hand.actedSeats = [...new Set(hand.actedSeats)];
  hand.pot = potSize(room);
  continueHand(room, player.seat);
  return hand;
}
