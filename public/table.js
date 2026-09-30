export function relativeSeat(seat, viewerSeat, maxPlayers = 9) {
  return ((seat - viewerSeat) % maxPlayers + maxPlayers) % maxPlayers;
}
