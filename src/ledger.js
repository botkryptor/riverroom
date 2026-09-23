export function computeBalances(players, ledgerEntries) {
  const totals = new Map(
    players.map((player) => [
      player.id,
      {
        playerId: player.id,
        name: player.name,
        buyIn: 0,
        cashOut: player.stack,
        net: player.stack,
      },
    ]),
  );

  for (const entry of ledgerEntries) {
    const total = totals.get(entry.playerId);
    if (!total) continue;
    if (entry.type === "buy-in") {
      total.buyIn += entry.amount;
      total.net -= entry.amount;
    }
  }

  return [...totals.values()];
}

export function computeSettlements(balances) {
  const rounded = balances.map((balance) => ({
    ...balance,
    net: Math.round(balance.net),
  }));
  const total = rounded.reduce((sum, balance) => sum + balance.net, 0);

  if (total !== 0) {
    return {
      balanced: false,
      difference: total,
      transfers: [],
    };
  }

  const debtors = rounded
    .filter((balance) => balance.net < 0)
    .map((balance) => ({ ...balance, remaining: -balance.net }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = rounded
    .filter((balance) => balance.net > 0)
    .map((balance) => ({ ...balance, remaining: balance.net }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.remaining, creditor.remaining);

    transfers.push({
      fromPlayerId: debtor.playerId,
      from: debtor.name,
      toPlayerId: creditor.playerId,
      to: creditor.name,
      amount,
    });

    debtor.remaining -= amount;
    creditor.remaining -= amount;
    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  return { balanced: true, difference: 0, transfers };
}
