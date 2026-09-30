export function chooseSeat(players, requestedSeat, maxPlayers = 9) {
  const occupiedSeats = new Set(players.map((player) => player.seat));
  if (occupiedSeats.size >= maxPlayers) throw new Error("The table is full");

  if (requestedSeat === null || requestedSeat === undefined || requestedSeat === "") {
    return Array.from({ length: maxPlayers }, (_, index) => index).find(
      (seat) => !occupiedSeats.has(seat),
    );
  }

  const seat = Number(requestedSeat);
  if (!Number.isInteger(seat) || seat < 0 || seat >= maxPlayers) {
    throw new Error("Choose a valid seat");
  }
  if (occupiedSeats.has(seat)) throw new Error("That seat is already taken");
  return seat;
}
