const socket = io();
const roomMatch = window.location.pathname.match(/^\/room\/([^/]+)/);
const roomId = roomMatch?.[1];
const clientIdKey = "riverroom-client-id";
const playerNameKey = `riverroom-name-${roomId}`;
let clientId = localStorage.getItem(clientIdKey);
let state = null;
let voiceStream = null;
let muted = false;
const peers = new Map();

if (!clientId) {
  clientId = crypto.randomUUID();
  localStorage.setItem(clientIdKey, clientId);
}

const element = (id) => document.getElementById(id);
const landing = element("landing");
const roomApp = element("room-app");
const joinModal = element("join-modal");
const joinForm = element("join-form");
const playerNameInput = element("player-name");
const actionButtons = [...document.querySelectorAll("[data-action]")];

function toast(message, error = false) {
  const toastElement = element("toast");
  toastElement.textContent = message;
  toastElement.classList.toggle("error", error);
  toastElement.classList.remove("hidden");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => toastElement.classList.add("hidden"), 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emitWithResult(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (result) => {
      if (result?.ok) resolve(result);
      else reject(new Error(result?.error ?? "Something went wrong"));
    });
  });
}

if (!roomId) {
  landing.classList.remove("hidden");
  element("create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: element("room-name").value }),
      });
      const room = await response.json();
      window.location.assign(room.path);
    } catch {
      toast("Could not create the room", true);
      button.disabled = false;
    }
  });
} else {
  roomApp.classList.remove("hidden");
  const savedName = localStorage.getItem(playerNameKey);
  if (savedName) joinRoom(savedName);
  else joinModal.classList.remove("hidden");
}

async function joinRoom(name) {
  try {
    await emitWithResult("join-room", { roomId, name, clientId });
    localStorage.setItem(playerNameKey, name);
    joinModal.classList.add("hidden");
  } catch (error) {
    joinModal.classList.remove("hidden");
    toast(error.message, true);
  }
}

joinForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(playerNameInput.value.trim());
});

socket.on("connect", () => {
  element("connection-status")?.classList.remove("offline");
  const savedName = roomId && localStorage.getItem(playerNameKey);
  if (savedName && !state) joinRoom(savedName);
});

socket.on("disconnect", () => {
  if (element("connection-status")) element("connection-status").textContent = "Reconnecting";
});

socket.on("room-state", (nextState) => {
  state = nextState;
  render();
});

function cardMarkup(card) {
  if (!card) return '<span class="card back"></span>';
  const suitSymbols = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const red = card.suit === "h" || card.suit === "d";
  return `<span class="card ${red ? "red" : ""}">${card.rank}${suitSymbols[card.suit]}</span>`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function renderSeats() {
  const seats = element("seats");
  seats.innerHTML = "";
  for (const player of state.players) {
    const isActing = state.hand?.actingSeat === player.seat;
    const isDealer = state.hand?.dealerSeat === player.seat;
    const seat = document.createElement("div");
    seat.className = `seat seat-${player.seat} ${isActing ? "active" : ""} ${
      player.folded ? "folded" : ""
    } ${player.connected ? "" : "disconnected"}`;
    seat.innerHTML = `
      <div class="player-cards">${(player.cards ?? []).map(cardMarkup).join("")}</div>
      <div class="seat-box">
        ${player.streetBet ? `<span class="bet-chip">● ${player.streetBet}</span>` : ""}
        <div class="player-name">
          ${isDealer ? '<span class="dealer-button">D</span>' : ""}
          <span>${escapeHtml(player.name)}</span>
          ${player.id === state.viewerPlayerId ? "<small>(you)</small>" : ""}
        </div>
        <div class="player-stack">${player.stack.toLocaleString()} chips</div>
        <div class="player-action">${escapeHtml(player.lastAction || (player.connected ? "" : "Offline"))}</div>
      </div>`;
    seats.appendChild(seat);
  }
}

function renderLedger() {
  const isHost = state.viewerPlayerId === state.hostPlayerId;
  element("ledger-rows").innerHTML = state.ledger
    .map(
      (row) => `
      <div class="ledger-row">
        <strong>${escapeHtml(row.name)}</strong>
        <span class="ledger-net ${row.net < 0 ? "negative" : ""}">${row.net >= 0 ? "+" : ""}${row.net}</span>
        <small>In ${row.buyIn.toLocaleString()} · Stack ${row.cashOut.toLocaleString()}</small>
        ${
          isHost
            ? `<button class="buyin-button" data-buyin="${row.playerId}">+ Add buy-in</button>`
            : ""
        }
      </div>`,
    )
    .join("");

  document.querySelectorAll("[data-buyin]").forEach((button) => {
    button.addEventListener("click", async () => {
      const amount = window.prompt("How many chips should be added?");
      if (!amount) return;
      try {
        await emitWithResult("add-buy-in", { playerId: button.dataset.buyin, amount });
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  const badge = element("ledger-balance-badge");
  badge.textContent = state.settlement.balanced ? "Balanced" : "Check totals";
  const list = element("settlement-list");
  if (!state.settlement.balanced) {
    list.innerHTML = `<p class="all-square">Stacks differ from buy-ins by ${state.settlement.difference}.</p>`;
  } else if (state.settlement.transfers.length === 0) {
    list.innerHTML = '<p class="all-square">Everyone is square right now.</p>';
  } else {
    list.innerHTML = state.settlement.transfers
      .map(
        (transfer) => `
        <div class="settlement-line">
          <b>${escapeHtml(transfer.from)}</b><span>pays</span><b>${escapeHtml(transfer.to)}</b>
          <span class="settlement-amount">${transfer.amount}</span>
        </div>`,
      )
      .join("");
  }
}

function renderActivity() {
  element("activity-list").innerHTML = state.activity
    .map(
      (item) => `
      <div class="activity-item">
        ${escapeHtml(item.message)}
        <time>${new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      </div>`,
    )
    .join("");
}

function renderActions() {
  const viewer = state.players.find((player) => player.id === state.viewerPlayerId);
  const isHost = state.viewerPlayerId === state.hostPlayerId;
  const isTurn = viewer && state.hand?.actingSeat === viewer.seat;
  const currentBet = state.hand?.currentBet ?? 0;
  const callAmount = viewer ? Math.max(0, currentBet - viewer.streetBet) : 0;
  const handComplete = !state.hand || state.hand.result;

  actionButtons.forEach((button) => {
    button.disabled = !isTurn;
    const action = button.dataset.action;
    if (action === "check") button.classList.toggle("hidden", callAmount > 0);
    if (action === "call") {
      button.classList.toggle("hidden", callAmount === 0);
      button.textContent = `Call ${Math.min(callAmount, viewer?.stack ?? 0)}`;
    }
    if (action === "bet") button.classList.toggle("hidden", currentBet > 0);
    if (action === "raise") button.classList.toggle("hidden", currentBet === 0);
  });

  element("bet-amount").disabled = !isTurn;
  element("bet-amount").placeholder =
    currentBet > 0 ? `Raise to ${currentBet + (state.hand?.minRaise ?? 0)}` : "Bet amount";
  element("turn-label").textContent = isTurn
    ? "Your decision"
    : state.hand?.actingSeat != null
      ? `${state.players.find((player) => player.seat === state.hand.actingSeat)?.name}'s turn`
      : "Between hands";
  element("call-label").textContent = isTurn && callAmount ? `${callAmount} to call` : "";
  element("start-hand-button").classList.toggle("hidden", !(isHost && handComplete));
}

function render() {
  element("room-name-display").textContent = state.name;
  element("connection-status").textContent = "Live";
  element("pot-value").textContent = (state.hand?.pot ?? 0).toLocaleString();
  element("board").innerHTML = (state.hand?.board ?? []).map(cardMarkup).join("");
  element("hand-message").textContent =
    state.hand?.result?.message ??
    (state.hand ? `Hand #${state.hand.number} · ${state.hand.street}` : "Waiting for the first deal");
  element("small-blind").value = state.settings.smallBlind;
  element("big-blind").value = state.settings.bigBlind;
  element("starting-stack").value = state.settings.startingStack;
  const isHost = state.viewerPlayerId === state.hostPlayerId;
  [...element("settings-form").elements].forEach((control) => {
    control.disabled = !isHost;
  });
  renderSeats();
  renderLedger();
  renderActivity();
  renderActions();
}

actionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await emitWithResult("player-action", {
        action: button.dataset.action,
        amount: element("bet-amount").value,
      });
      element("bet-amount").value = "";
    } catch (error) {
      toast(error.message, true);
    }
  });
});

element("start-hand-button")?.addEventListener("click", async () => {
  try {
    await emitWithResult("start-hand");
  } catch (error) {
    toast(error.message, true);
  }
});

element("settings-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await emitWithResult("update-settings", {
      smallBlind: element("small-blind").value,
      bigBlind: element("big-blind").value,
      startingStack: element("starting-stack").value,
    });
    toast("Game settings saved");
  } catch (error) {
    toast(error.message, true);
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((candidate) => candidate.classList.remove("active"));
    document.querySelectorAll(".panel-content").forEach((panel) => panel.classList.remove("active"));
    tab.classList.add("active");
    element(`${tab.dataset.tab}-panel`).classList.add("active");
  });
});

element("share-button")?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(window.location.href);
  toast("Invite link copied");
});

async function createPeer(peerId, initiator) {
  if (peers.has(peerId)) return peers.get(peerId);
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  peers.set(peerId, peer);
  voiceStream.getTracks().forEach((track) => peer.addTrack(track, voiceStream));
  peer.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit("rtc-signal", { target: peerId, signal: { candidate } });
  };
  peer.ontrack = ({ streams }) => {
    let audio = document.querySelector(`audio[data-peer="${peerId}"]`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.dataset.peer = peerId;
      element("remote-audio").appendChild(audio);
    }
    audio.srcObject = streams[0];
  };
  peer.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(peer.connectionState)) removePeer(peerId);
  };
  if (initiator) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("rtc-signal", { target: peerId, signal: { description: peer.localDescription } });
  }
  return peer;
}

function removePeer(peerId) {
  peers.get(peerId)?.close();
  peers.delete(peerId);
  document.querySelector(`audio[data-peer="${peerId}"]`)?.remove();
}

async function joinVoice() {
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const result = await emitWithResult("voice-ready");
    for (const peerId of result.peers) await createPeer(peerId, true);
    element("voice-button").textContent = "Leave voice";
    element("voice-button").dataset.joined = "true";
    element("mute-button").classList.remove("hidden");
    toast("Voice chat connected");
  } catch (error) {
    voiceStream?.getTracks().forEach((track) => track.stop());
    voiceStream = null;
    toast(error.message === "Permission denied" ? "Microphone access was denied" : error.message, true);
  }
}

function leaveVoice() {
  socket.emit("voice-leave");
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  for (const peerId of peers.keys()) removePeer(peerId);
  element("voice-button").textContent = "🎙 Join voice";
  element("voice-button").dataset.joined = "";
  element("mute-button").classList.add("hidden");
}

element("voice-button")?.addEventListener("click", () => {
  if (voiceStream) leaveVoice();
  else joinVoice();
});

element("mute-button")?.addEventListener("click", () => {
  muted = !muted;
  voiceStream?.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
  element("mute-button").textContent = muted ? "Unmute" : "Mute";
});

socket.on("voice-presence", ({ socketId, joined }) => {
  if (!joined) removePeer(socketId);
});

socket.on("rtc-signal", async ({ from, signal }) => {
  if (!voiceStream) return;
  const peer = await createPeer(from, false);
  if (signal.description) {
    await peer.setRemoteDescription(signal.description);
    if (signal.description.type === "offer") {
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("rtc-signal", { target: from, signal: { description: peer.localDescription } });
    }
  } else if (signal.candidate) {
    await peer.addIceCandidate(signal.candidate);
  }
});
