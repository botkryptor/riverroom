import assert from "node:assert/strict";
import test from "node:test";
import { cardMarkup, displayRank } from "../public/cards.js";

test("displays a ten with two characters", () => {
  assert.equal(displayRank("T"), "10");
  assert.match(cardMarkup({ rank: "T", suit: "h" }), />10<\/span>/);
});

test("renders rank and suit separately", () => {
  const markup = cardMarkup({ rank: "A", suit: "s" });

  assert.match(markup, /class="card-rank">A<\/span>/);
  assert.match(markup, /class="card-suit">♠<\/span>/);
});

test("keeps hidden cards face down", () => {
  assert.equal(cardMarkup(null), '<span class="card back"></span>');
});
