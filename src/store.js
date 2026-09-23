import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(currentDirectory, "../data");
const dataFile = path.join(dataDirectory, "rooms.json");
const temporaryFile = path.join(dataDirectory, "rooms.tmp.json");
let saveQueue = Promise.resolve();

export async function loadRooms() {
  try {
    const content = await readFile(dataFile, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function serializeRoom(room) {
  return {
    id: room.id,
    name: room.name,
    hostClientId: room.hostClientId,
    createdAt: room.createdAt,
    handNumber: room.handNumber,
    settings: room.settings,
    ledger: room.ledger,
    activity: room.activity.slice(-100),
    players: room.players.map((player) => ({
      id: player.id,
      clientId: player.clientId,
      name: player.name,
      seat: player.seat,
      stack:
        player.stack +
        (room.hand && !room.hand.result ? (player.totalBet ?? 0) : 0),
    })),
  };
}

export function saveRooms(rooms) {
  const content = JSON.stringify([...rooms.values()].map(serializeRoom), null, 2);
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      await writeFile(temporaryFile, content);
      await rename(temporaryFile, dataFile);
    });
  return saveQueue;
}
