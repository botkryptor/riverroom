import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDirectory = path.resolve(currentDirectory, "../data");

export function resolveDataDirectory(environment = process.env) {
  return path.resolve(environment.DATA_DIR || defaultDataDirectory);
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

async function readJsonRooms(dataFile) {
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function createStore({
  databaseUrl = process.env.DATABASE_URL,
  dataDirectory = resolveDataDirectory(),
  pool,
} = {}) {
  const dataFile = path.join(dataDirectory, "rooms.json");
  const temporaryFile = path.join(dataDirectory, "rooms.tmp.json");
  const databasePool =
    pool ??
    (databaseUrl
      ? new pg.Pool({
          connectionString: databaseUrl,
        })
      : null);
  let saveQueue = Promise.resolve();

  async function initialize() {
    if (!databasePool) return;
    await databasePool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        client_id TEXT PRIMARY KEY,
        display_name VARCHAR(24) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS poker_rooms (
        id TEXT PRIMARY KEY,
        room_name VARCHAR(50) NOT NULL,
        snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows } = await databasePool.query("SELECT COUNT(*)::int AS count FROM poker_rooms");
    if (rows[0].count === 0) {
      const legacyRooms = await readJsonRooms(dataFile);
      if (legacyRooms.length > 0) {
        await saveRooms(new Map(legacyRooms.map((room) => [room.id, room])));
      }
    }
  }

  async function loadRooms() {
    if (!databasePool) return readJsonRooms(dataFile);
    const { rows } = await databasePool.query(
      "SELECT snapshot FROM poker_rooms ORDER BY created_at",
    );
    return rows.map(({ snapshot }) => snapshot);
  }

  function saveRooms(rooms) {
    const snapshots = [...rooms.values()].map(serializeRoom);
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      if (!databasePool) {
        await mkdir(dataDirectory, { recursive: true });
        await writeFile(temporaryFile, JSON.stringify(snapshots, null, 2));
        await rename(temporaryFile, dataFile);
        return;
      }

      const client = await databasePool.connect();
      try {
        await client.query("BEGIN");
        for (const snapshot of snapshots) {
          for (const player of snapshot.players) {
            await client.query(
              `INSERT INTO app_users (client_id, display_name)
               VALUES ($1, $2)
               ON CONFLICT (client_id) DO UPDATE
               SET display_name = EXCLUDED.display_name,
                   updated_at = NOW()`,
              [player.clientId, player.name],
            );
          }
          await client.query(
            `INSERT INTO poker_rooms (id, room_name, snapshot, created_at, updated_at)
             VALUES ($1, $2, $3::jsonb, $4, NOW())
             ON CONFLICT (id) DO UPDATE
             SET room_name = EXCLUDED.room_name,
                 snapshot = EXCLUDED.snapshot,
                 updated_at = NOW()`,
            [snapshot.id, snapshot.name, JSON.stringify(snapshot), snapshot.createdAt],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
    return saveQueue;
  }

  async function upsertUser(clientId, displayName) {
    if (!databasePool) return;
    await databasePool.query(
      `INSERT INTO app_users (client_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (client_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           updated_at = NOW()`,
      [clientId, displayName],
    );
  }

  async function close() {
    await saveQueue.catch(() => {});
    if (databasePool && !pool) await databasePool.end();
  }

  return {
    kind: databasePool ? "postgres" : "json",
    initialize,
    loadRooms,
    saveRooms,
    upsertUser,
    close,
  };
}

const defaultStore = createStore();
await defaultStore.initialize();

export const loadRooms = () => defaultStore.loadRooms();
export const saveRooms = (rooms) => defaultStore.saveRooms(rooms);
export const upsertUser = (clientId, displayName) =>
  defaultStore.upsertUser(clientId, displayName);
export const closeStore = () => defaultStore.close();
export const storageKind = defaultStore.kind;
