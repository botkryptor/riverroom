const RANK_VALUE = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const CATEGORY_NAMES = [
  "High card",
  "One pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

function compareScores(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function straightHigh(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) return unique[index];
  }
  return 0;
}

export function evaluateFive(cards) {
  if (cards.length !== 5) throw new Error("Exactly five cards are required");

  const values = cards.map((card) => RANK_VALUE[card.rank]).sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(values);
  const counts = new Map();

  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || rightValue - leftValue,
  );

  let score;
  if (flush && straight) {
    score = [8, straight];
  } else if (groups[0][1] === 4) {
    score = [7, groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    score = [6, groups[0][0], groups[1][0]];
  } else if (flush) {
    score = [5, ...values];
  } else if (straight) {
    score = [4, straight];
  } else if (groups[0][1] === 3) {
    score = [3, groups[0][0], ...groups.slice(1).map(([value]) => value)];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    score = [2, ...pairs, groups[2][0]];
  } else if (groups[0][1] === 2) {
    score = [1, groups[0][0], ...groups.slice(1).map(([value]) => value)];
  } else {
    score = [0, ...values];
  }

  return { score, label: CATEGORY_NAMES[score[0]] };
}

function combinations(items, choose) {
  const result = [];
  const walk = (start, selected) => {
    if (selected.length === choose) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= items.length - (choose - selected.length); index += 1) {
      walk(index + 1, [...selected, items[index]]);
    }
  };
  walk(0, []);
  return result;
}

export function evaluateBest(cards) {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error("Five to seven cards are required");
  }

  let best = null;
  for (const selection of combinations(cards, 5)) {
    const evaluated = evaluateFive(selection);
    if (!best || compareScores(evaluated.score, best.score) > 0) {
      best = { ...evaluated, cards: selection };
    }
  }
  return best;
}

export function compareHands(left, right) {
  return compareScores(left.score, right.score);
}

export function buildSidePots(players) {
  const contributionLevels = [
    ...new Set(players.map((player) => player.totalBet).filter((amount) => amount > 0)),
  ].sort((a, b) => a - b);
  const pots = [];
  let previousLevel = 0;

  for (const level of contributionLevels) {
    const contributors = players.filter((player) => player.totalBet >= level);
    const amount = (level - previousLevel) * contributors.length;
    const eligiblePlayerIds = contributors
      .filter((player) => !player.folded)
      .map((player) => player.id);

    if (amount > 0) pots.push({ amount, eligiblePlayerIds });
    previousLevel = level;
  }

  return pots;
}

export function distributePots(players, board) {
  const evaluations = new Map(
    players
      .filter((player) => !player.folded)
      .map((player) => [player.id, evaluateBest([...player.cards, ...board])]),
  );
  const payouts = new Map(players.map((player) => [player.id, 0]));
  const potResults = [];

  for (const pot of buildSidePots(players)) {
    const eligible = pot.eligiblePlayerIds
      .map((playerId) => ({
        playerId,
        evaluation: evaluations.get(playerId),
      }))
      .filter(({ evaluation }) => evaluation);
    let winners = [];

    for (const candidate of eligible) {
      if (winners.length === 0) {
        winners = [candidate];
        continue;
      }
      const comparison = compareHands(candidate.evaluation, winners[0].evaluation);
      if (comparison > 0) winners = [candidate];
      else if (comparison === 0) winners.push(candidate);
    }

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;
    for (const winner of winners) {
      const payout = share + (remainder > 0 ? 1 : 0);
      payouts.set(winner.playerId, payouts.get(winner.playerId) + payout);
      if (remainder > 0) remainder -= 1;
    }

    potResults.push({
      amount: pot.amount,
      winners: winners.map(({ playerId, evaluation }) => ({
        playerId,
        hand: evaluation.label,
      })),
    });
  }

  return { payouts, potResults, evaluations };
}
