function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function wagerLimits({
  action,
  bigBlind,
  currentBet,
  minRaise,
  pot,
  stack,
  streetBet,
}) {
  const maximum = streetBet + stack;
  if (action === "bet") {
    return {
      minimum: Math.min(bigBlind, maximum),
      maximum,
      potAfterCall: pot,
    };
  }

  const callAmount = Math.max(0, currentBet - streetBet);
  return {
    minimum: Math.min(currentBet + minRaise, maximum),
    maximum,
    potAfterCall: pot + Math.min(callAmount, stack),
  };
}

export function presetWagerAmount(context, fraction) {
  const limits = wagerLimits(context);
  const target =
    context.action === "bet"
      ? Math.ceil(limits.potAfterCall * fraction)
      : context.currentBet + Math.ceil(limits.potAfterCall * fraction);
  return clamp(target, limits.minimum, limits.maximum);
}
