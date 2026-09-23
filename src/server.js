import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { startHand, performAction } from "./game.js";
import { computeBalances, computeSettlements } from "./ledger.js";
import { loadRooms, saveRooms } from "./store.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../public");
const port = Number(process.env.PORT ?? 3000);
const rooms = new Map();
const voiceMembers = new Map();

function roomCode() {
  return randomBytes(4).toString("base64url").toLowerCase();
}

function addActivity(room, message) {
  room.activity.push({
    id: randomUUID(),
    message,
    at: new Date().toISOString(),
  });
  room.activity = room.activity.slice(-100);
}

function hydrateRoom(saved) {
  return {
    ...saved,
    hand: null,
    ledger: saved.ledger ?? [],
    activity: saved.activity ?? [],
    settings: {
      smallBlind: 5,
      bigBlind: 10,
      startingStack: 1000,
      maxPlayers: 9,
      ...saved.settings,
    },
    players: (saved.players ?? []).map((player) => ({
      ...player,
      connected: false,
      socketId: null,
      cards: [],
      folded: false,
      allIn: false,
      streetBet: 0,
      totalBet: 0,
      lastAction: "",
    })),
  };
}

for (const savedRoom of await loadRooms()) rooms.set(savedRoom.id, hydrateRoom(savedRoom));

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(publicDirectory));

app.post("/api/rooms", async (request, response) => {
  let id;
  do {
    id = roomCode();
  } while (rooms.has(id));
  const name = String(request.body?.name ?? "Friday Night Poker").trim().slice(0, 50);
  const room = hydrateRoom({
    id,
    name: name || "Friday Night Poker",
    hostClientId: null,
    createdAt: new Date().toISOString(),
    handNumber: 0,
    settings: {
      smallBlind: 5,
      bigBlind: 10,
      startingStack: 1000,
      maxPlayers: 9,
    },
    players: [],
    ledger: [],
    activity: [],
  });
  rooms.set(id, room);
  addActivity(room, "Room created.");
  await saveRooms(rooms);
  response.status(201).json({ roomId: id, path: `/room/${id}` });
});

app.get("/api/rooms/:roomId", (request, response) => {
  const room = rooms.get(request.params.roomId);
  if (!room) return response.status(404).json({ error: "Room not found" });
  return response.json({ id: room.id, name: room.name, players: room.players.length });
});

app.get("/room/:roomId", (_request, response) => {
  response.sendFile(path.join(publicDirectory, "index.html"));
});

function publicState(room, viewerPlayerId) {
  const balances = computeBalances(
    room.players.map((player) => ({
      ...player,
      stack:
        player.stack +
        (room.hand && !room.hand.result ? (player.totalBet ?? 0) : 0),
    })),
    room.ledger,
  );
  const settlement = computeSettlements(balances);
  return {
    id: room.id,
    name: room.name,
    settings: room.settings,
    hostPlayerId:
      room.players.find((player) => player.clientId === room.hostClientId)?.id ?? null,
    viewerPlayerId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      stack: player.stack,
      connected: player.connected,
      folded: player.folded,
      allIn: player.allIn,
      streetBet: player.streetBet,
      totalBet: player.totalBet,
      lastAction: player.lastAction,
      cards:
        player.id === viewerPlayerId || room.hand?.revealed
          ? player.cards
          : player.cards?.map(() => null) ?? [],
    })),
    hand: room.hand
      ? {
          number: room.hand.number,
          board: room.hand.board,
          street: room.hand.street,
          dealerSeat: room.hand.dealerSeat,
          smallBlindSeat: room.hand.smallBlindSeat,
          bigBlindSeat: room.hand.bigBlindSeat,
          currentBet: room.hand.currentBet,
          minRaise: room.hand.minRaise,
          actingSeat: room.hand.actingSeat,
          pot: room.players.reduce((sum, player) => sum + (player.totalBet ?? 0), 0),
          result: room.hand.result,
        }
      : null,
    ledger: balances,
    settlement,
    activity: room.activity.slice(-50),
  };
}

function broadcastRoom(room) {
  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("room-state", publicState(room, player.id));
    }
  }
}

function roomForSocket(socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room) throw new Error("Join a room first");
  return room;
}

function requireHost(socket, room) {
  if (socket.data.clientId !== room.hostClientId) throw new Error("Only the host can do that");
}

function callbackResult(callback, error = null, result = {}) {
  if (typeof callback === "function") {
    callback(error ? { ok: false, error: error.message } : { ok: true, ...result });
  }
}

io.on("connection", (socket) => {
  socket.on("join-room", async ({ roomId, name, clientId }, callback) => {
    try {
      const room = rooms.get(String(roomId));
      if (!room) throw new Error("Room not found");
      const cleanName = String(name ?? "").trim().slice(0, 24);
      const cleanClientId = String(clientId ?? "").trim();
      if (!cleanName) throw new Error("Enter your name");
      if (!cleanClientId) throw new Error("Browser identity is missing");

      let player = room.players.find((candidate) => candidate.clientId === cleanClientId);
      if (!player) {
        if (room.players.length >= room.settings.maxPlayers) throw new Error("The table is full");
        if (room.players.some((candidate) => candidate.name.toLowerCase() === cleanName.toLowerCase())) {
          throw new Error("That name is already seated");
        }
        const occupiedSeats = new Set(room.players.map((candidate) => candidate.seat));
        const seat = Array.from({ length: 9 }, (_, index) => index).find(
          (candidate) => !occupiedSeats.has(candidate),
        );
        player = {
          id: randomUUID(),
          clientId: cleanClientId,
          name: cleanName,
          seat,
          stack: room.settings.startingStack,
          connected: true,
          socketId: socket.id,
          cards: [],
          folded: false,
          allIn: false,
          streetBet: 0,
          totalBet: 0,
          lastAction: "",
        };
        room.players.push(player);
        room.ledger.push({
          id: randomUUID(),
          playerId: player.id,
          type: "buy-in",
          amount: room.settings.startingStack,
          at: new Date().toISOString(),
        });
        if (!room.hostClientId) room.hostClientId = cleanClientId;
        addActivity(room, `${player.name} joined with ${player.stack} chips.`);
      } else {
        player.name = cleanName;
        player.connected = true;
        player.socketId = socket.id;
        addActivity(room, `${player.name} reconnected.`);
      }

      socket.data.roomId = room.id;
      socket.data.clientId = cleanClientId;
      socket.data.playerId = player.id;
      socket.join(room.id);
      await saveRooms(rooms);
      broadcastRoom(room);
      callbackResult(callback, null, { playerId: player.id });
    } catch (error) {
      callbackResult(callback, error);
    }
  });

  socket.on("start-hand", async (_payload, callback) => {
    try {
      const room = roomForSocket(socket);
      requireHost(socket, room);
      startHand(room);
      addActivity(room, `Hand #${room.hand.number} started.`);
      await saveRooms(rooms);
      broadcastRoom(room);
      callbackResult(callback);
    } catch (error) {
      callbackResult(callback, error);
    }
  });

  socket.on("player-action", async ({ action, amount }, callback) => {
    try {
      const room = roomForSocket(socket);
      const player = room.players.find((candidate) => candidate.id === socket.data.playerId);
      performAction(room, player.id, action, amount);
      addActivity(room, `${player.name}: ${player.lastAction}.`);
      if (room.hand?.result) addActivity(room, room.hand.result.message);
      await saveRooms(rooms);
      broadcastRoom(room);
      callbackResult(callback);
    } catch (error) {
      callbackResult(callback, error);
    }
  });

  socket.on("add-buy-in", async ({ playerId, amount }, callback) => {
    try {
      const room = roomForSocket(socket);
      requireHost(socket, room);
      if (room.hand && !room.hand.result) throw new Error("Add chips between hands");
      const player = room.players.find((candidate) => candidate.id === playerId);
      const chips = Math.floor(Number(amount));
      if (!player) throw new Error("Player not found");
      if (!Number.isFinite(chips) || chips <= 0 || chips > 1_000_000) {
        throw new Error("Enter a valid chip amount");
      }
      player.stack += chips;
      room.ledger.push({
        id: randomUUID(),
        playerId,
        type: "buy-in",
        amount: chips,
        at: new Date().toISOString(),
      });
      addActivity(room, `${player.name} added ${chips} chips.`);
      await saveRooms(rooms);
      broadcastRoom(room);
      callbackResult(callback);
    } catch (error) {
      callbackResult(callback, error);
    }
  });

  socket.on("update-settings", async (settings, callback) => {
    try {
      const room = roomForSocket(socket);
      requireHost(socket, room);
      if (room.hand && !room.hand.result) throw new Error("Change settings between hands");
      const smallBlind = Math.floor(Number(settings.smallBlind));
      const bigBlind = Math.floor(Number(settings.bigBlind));
      const startingStack = Math.floor(Number(settings.startingStack));
      if (smallBlind <= 0 || bigBlind < smallBlind || startingStack < bigBlind * 10) {
        throw new Error("Use valid blinds and a stack of at least 10 big blinds");
      }
      room.settings = { ...room.settings, smallBlind, bigBlind, startingStack };
      addActivity(room, `Blinds updated to ${smallBlind}/${bigBlind}.`);
      await saveRooms(rooms);
      broadcastRoom(room);
      callbackResult(callback);
    } catch (error) {
      callbackResult(callback, error);
    }
  });

  socket.on("voice-ready", (_payload, callback) => {
    try {
      const room = roomForSocket(socket);
      if (!voiceMembers.has(room.id)) voiceMembers.set(room.id, new Set());
      const members = voiceMembers.get(room.id);
      const peers = [...members].filter((socketId) => socketId !== socket.id);
      members.add(socket.id);
      socket.data.voiceRoomId = room.id;
      callbackResult(callback, null, { peers });
      socket.to(room.id).emit("voice-presence", { socketId: socket.id, joined: true });
    } catch (error) {
      callbackResult(callback, error);
    }
  });

  socket.on("voice-leave", () => {
    const roomId = socket.data.voiceRoomId;
    if (!roomId) return;
    voiceMembers.get(roomId)?.delete(socket.id);
    socket.to(roomId).emit("voice-presence", { socketId: socket.id, joined: false });
    socket.data.voiceRoomId = null;
  });

  socket.on("rtc-signal", ({ target, signal }) => {
    const targetSocket = io.sockets.sockets.get(target);
    if (socket.data.roomId && targetSocket?.data.roomId === socket.data.roomId) {
      io.to(target).emit("rtc-signal", { from: socket.id, signal });
    }
  });

  socket.on("disconnect", async () => {
    const room = rooms.get(socket.data.roomId);
    if (room) {
      const player = room.players.find((candidate) => candidate.socketId === socket.id);
      if (player) {
        player.connected = false;
        player.socketId = null;
        addActivity(room, `${player.name} disconnected.`);
      }
      if (socket.data.clientId === room.hostClientId) {
        const nextHost = room.players.find((candidate) => candidate.connected);
        if (nextHost) {
          room.hostClientId = nextHost.clientId;
          addActivity(room, `${nextHost.name} is now the host.`);
        }
      }
      voiceMembers.get(room.id)?.delete(socket.id);
      socket.to(room.id).emit("voice-presence", { socketId: socket.id, joined: false });
      await saveRooms(rooms);
      broadcastRoom(room);
    }
  });
});

server.listen(port, () => {
  console.log(`Riverroom is running at http://localhost:${port}`);
});
