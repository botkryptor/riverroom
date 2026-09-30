const suitSymbols = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function displayRank(rank) {
  return rank === "T" ? "10" : String(rank);
}

export function cardMarkup(card) {
  if (!card) return '<span class="card back"></span>';
  const red = card.suit === "h" || card.suit === "d";
  return `<span class="card${red ? " red" : ""}"><span class="card-rank">${displayRank(card.rank)}</span><span class="card-suit">${suitSymbols[card.suit]}</span></span>`;
}
