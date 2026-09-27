import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { newDb } from "pg-mem";
import { createStore, resolveDataDirectory } from "../src/store.js";

test("uses the configured persistent data directory", () => {
  assert.equal(
    resolveDataDirectory({ DATA_DIR: "/app/data" }),
    path.resolve("/app/data"),
  );
});

test("falls back to the repository data directory", () => {
  assert.match(resolveDataDirectory({}), /poker-room-app\/data$/);
});

test("stores rooms and users in PostgreSQL", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "riverroom-database-"));
  const database = newDb();
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();
  const store = createStore({ dataDirectory, pool });
  const room = {
    id: "room-1",
    name: "Database game",
    hostClientId: "client-1",
    createdAt: new Date().toISOString(),
    handNumber: 0,
    settings: { smallBlind: 5, bigBlind: 10, startingStack: 1000 },
    ledger: [],
    activity: [],
    players: [
      {
        id: "player-1",
        clientId: "client-1",
        name: "Alice",
        seat: 0,
        stack: 1000,
      },
    ],
  };

  try {
    await store.initialize();
    await store.saveRooms(new Map([[room.id, room]]));

    assert.equal(store.kind, "postgres");
    assert.deepEqual(await store.loadRooms(), [room]);
    const { rows } = await pool.query("SELECT client_id, display_name FROM app_users");
    assert.deepEqual(rows, [{ client_id: "client-1", display_name: "Alice" }]);
  } finally {
    await pool.end();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("imports legacy JSON rooms into an empty PostgreSQL database", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "riverroom-migration-"));
  const database = newDb();
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();
  const fallback = createStore({ dataDirectory });
  const room = {
    id: "legacy-room",
    name: "Legacy game",
    hostClientId: null,
    createdAt: new Date().toISOString(),
    handNumber: 0,
    settings: {},
    ledger: [],
    activity: [],
    players: [],
  };

  try {
    await fallback.saveRooms(new Map([[room.id, room]]));
    const store = createStore({ dataDirectory, pool });
    await store.initialize();
    assert.deepEqual(await store.loadRooms(), [room]);
  } finally {
    await pool.end();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
