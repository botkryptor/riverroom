import assert from "node:assert/strict";
import test from "node:test";
import { presetWagerAmount, wagerLimits } from "../public/wager.js";

const base = {
  bigBlind: 10,
  currentBet: 20,
  minRaise: 20,
  pot: 70,
  stack: 980,
  streetBet: 10,
};

test("calculates legal raise-to limits", () => {
  assert.deepEqual(wagerLimits({ ...base, action: "raise" }), {
    minimum: 40,
    maximum: 990,
    potAfterCall: 80,
  });
});

test("calculates pot-based raise targets after the call", () => {
  assert.equal(presetWagerAmount({ ...base, action: "raise" }, 0.5), 60);
  assert.equal(presetWagerAmount({ ...base, action: "raise" }, 0.75), 80);
  assert.equal(presetWagerAmount({ ...base, action: "raise" }, 1), 100);
});

test("clamps bet presets to the legal minimum and stack", () => {
  const context = {
    action: "bet",
    bigBlind: 10,
    currentBet: 0,
    minRaise: 10,
    pot: 8,
    stack: 35,
    streetBet: 0,
  };
  assert.equal(presetWagerAmount(context, 0.5), 10);
  assert.equal(presetWagerAmount({ ...context, pot: 100 }, 1), 35);
});
