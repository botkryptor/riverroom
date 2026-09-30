function cloneCards(cards = []) {
  return cards.map((card) => ({ ...card }));
}

export function initializeHandLog(room) {
  if (!room.hand) return;
  room.hand.actionLog = room.players
    .filter((player) => player.cards?.length === 2 && player.lastAction)
    .map((player) => ({
      playerId: player.id,
      name: player.name,
      street: "preflop",
      action: player.lastAction,
      at: room.hand.startedAt,
    }));
}

export function recordHandAction(room, player, street) {
  if (!room.hand) return;
  room.hand.actionLog ??= [];
  room.hand.actionLog.push({
    playerId: player.id,
    name: player.name,
    street,
    action: player.lastAction,
    at: new Date().toISOString(),
  });
}

export function archiveCompletedHand(room) {
  const hand = room.hand;
  if (!hand?.result) return false;
  room.handHistory ??= [];
  if (room.handHistory.some((entry) => entry.number === hand.number)) return false;

  room.handHistory.push({
    number: hand.number,
    startedAt: hand.startedAt,
    completedAt: hand.completedAt,
    pot: hand.pot ?? room.players.reduce((sum, player) => sum + player.totalBet, 0),
    result: hand.result.message,
    board: cloneCards(hand.board),
    actions: (hand.actionLog ?? []).map((action) => ({ ...action })),
    players: room.players
      .filter((player) => player.cards?.length === 2)
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        cards: cloneCards(player.cards),
      })),
  });
  room.handHistory = room.handHistory.slice(-100);
  return true;
}

export function handHistoryForViewer(room, viewerPlayerId) {
  return (room.handHistory ?? [])
    .slice(-100)
    .reverse()
    .flatMap((entry) => {
      const viewer = (entry.players ?? []).find(
        (player) => player.playerId === viewerPlayerId,
      );
      if (!viewer) return [];
      return [
        {
          number: entry.number,
          startedAt: entry.startedAt,
          completedAt: entry.completedAt,
          pot: entry.pot,
          result: entry.result,
          board: cloneCards(entry.board ?? []),
          holeCards: cloneCards(viewer.cards),
          actions: (entry.actions ?? []).map((action) => ({ ...action })),
        },
      ];
    });
}
