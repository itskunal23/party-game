import { createDeck, shuffle, dealHands, checkForBook } from '../frontend/js/game.js';
import { createBot, scheduleBotTurn } from './bot.js';
import { estimateBAC } from './bac.js';

const ROOM_CHARS = 'ACDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_EXPIRY_MS = 6 * 60 * 60 * 1000;

const rooms = new Map();

function genRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function genToken() {
  return [genId(), genId(), genId(), genId()].join('-');
}

function broadcast(room, msg, excludeId = null) {
  for (const [id, player] of room.players) {
    if (id === excludeId) continue;
    if (player.isBot) continue;
    if (player.socket?.readyState === 1) {
      player.socket.send(JSON.stringify(msg));
    }
  }
}

function sendTo(player, msg) {
  if (!player.isBot && player.socket?.readyState === 1) {
    player.socket.send(JSON.stringify(msg));
  }
}

function buildSnapshot(room, forPlayerId) {
  const state = room.gameState;
  const me = room.players.get(forPlayerId);

  const players = [...room.players.values()].map(p => ({
    id: p.id,
    name: p.name,
    cardCount: p.hand.length,
    books: state.books.get(p.id) ?? [],
    bacLevel: p.bacLevel ?? 0,
    isCurrentTurn: state.currentTurnPlayerId === p.id,
    isBot: p.isBot,
    profile: p.profile ? _safeProfile(p.profile) : null
  }));

  return {
    type: 'snapshot',
    myHand: me ? me.hand : [],
    players,
    gameState: {
      phase: state.phase,
      currentTurnPlayerId: state.currentTurnPlayerId,
      deckCount: state.deck.length,
      lastAction: state.lastAction
    },
    pendingDrinks: state.pendingDrinks.get(forPlayerId) ?? [],
    hostMessage: null
  };
}

function broadcastSnapshots(room) {
  for (const [id, player] of room.players) {
    if (player.isBot) continue;
    sendTo(player, buildSnapshot(room, id));
  }
}

function checkGameOver(room) {
  const state = room.gameState;
  if (state.deck.length > 0) return false;
  const anyCards = [...room.players.values()].some(p => p.hand.length > 0);
  return !anyCards;
}

function finalizeGame(room) {
  const state = room.gameState;
  state.phase = 'gameOver';

  let maxBooks = -1;
  let winner = null;
  const scores = [];

  for (const [id, player] of room.players) {
    const books = (state.books.get(id) ?? []).length;
    scores.push({ id, name: player.name, books });
    if (books > maxBooks) { maxBooks = books; winner = player; }
  }

  broadcast(room, { type: 'gameOver', winner: { id: winner.id, name: winner.name }, scores });
}

function resolveBooks(room, playerId) {
  const player = room.players.get(playerId);
  if (!player) return [];
  const state = room.gameState;

  const completed = checkForBook(player.hand);
  const newBooks = [];

  for (const scenario of completed) {
    player.hand = player.hand.filter(c => c.scenario !== scenario);
    if (!state.books.has(playerId)) state.books.set(playerId, []);
    state.books.get(playerId).push(scenario);
    newBooks.push(scenario);

    // Ask winner to choose what the loser drinks (2-player: exactly 1 loser)
    const losers = [];
    for (const [otherId, otherPlayer] of room.players) {
      if (otherId === playerId || otherPlayer.isBot) continue;
      losers.push({ id: otherId, name: otherPlayer.name });
    }

    // For bot opponents, assign a drink immediately
    for (const [otherId, otherPlayer] of room.players) {
      if (otherId === playerId || !otherPlayer.isBot) continue;
      if (!state.pendingDrinks.has(otherId)) state.pendingDrinks.set(otherId, []);
      state.pendingDrinks.get(otherId).push({ scenario, toastFor: player.name, drinkLabel: 'whatever the bot drinks' });
    }

    if (losers.length > 0) {
      // Store pending choice so winner can assign
      if (!state.pendingDrinkChoices) state.pendingDrinkChoices = new Map();
      state.pendingDrinkChoices.set(playerId, { scenario, losers, timestamp: Date.now() });
      // Notify winner to choose
      sendTo(player, { type: 'chooseLoserDrink', scenario, losers });
    }

    broadcast(room, {
      type: 'bookComplete',
      playerId,
      playerName: player.name,
      scenario
    });
  }
  return newBooks;
}

function advanceTurn(room) {
  const state = room.gameState;
  const playerIds = [...room.players.keys()];
  const idx = playerIds.indexOf(state.currentTurnPlayerId);
  state.currentTurnPlayerId = playerIds[(idx + 1) % playerIds.length];

  if (checkGameOver(room)) {
    finalizeGame(room);
    return;
  }

  broadcastSnapshots(room);

  const next = room.players.get(state.currentTurnPlayerId);
  if (next?.isBot) {
    scheduleBotTurn(room, next, intent => handleIntent(room, intent));
  }
}

export function handleIntent(room, intent) {
  const state = room.gameState;
  const { type, fromId } = intent;
  room.lastActivity = new Date();

  if (type === 'ask') {
    const { targetId, rank } = intent;
    if (state.currentTurnPlayerId !== fromId) return;

    const asker = room.players.get(fromId);
    const target = room.players.get(targetId);
    if (!asker || !target) return;

    const askerHasRank = asker.hand.some(c => c.rank === rank);
    if (!askerHasRank) return;

    const matching = target.hand.filter(c => c.rank === rank);

    if (matching.length > 0) {
      // Transfer cards
      target.hand = target.hand.filter(c => c.rank !== rank);
      asker.hand.push(...matching);
      state.lastAction = { type: 'got', fromId, targetId, rank, count: matching.length };
      resolveBooks(room, fromId);

      if (checkGameOver(room)) { finalizeGame(room); return; }
      broadcastSnapshots(room);

      // Bot's turn continues
      if (asker.isBot) {
        scheduleBotTurn(room, asker, i => handleIntent(room, i));
      }
    } else {
      // Go Fuck Yourself — draw a card
      let drawnCard = null;
      let continueTurn = false;

      if (state.deck.length > 0) {
        drawnCard = state.deck.pop();
        asker.hand.push(drawnCard);
        continueTurn = drawnCard.rank === rank;
      }

      state.lastAction = { type: 'gfy', fromId, targetId, rank, drawnCard, continueTurn };
      resolveBooks(room, fromId);

      if (checkGameOver(room)) { finalizeGame(room); return; }

      if (continueTurn) {
        broadcastSnapshots(room);
        if (asker.isBot) scheduleBotTurn(room, asker, i => handleIntent(room, i));
      } else {
        advanceTurn(room);
      }
    }
  }
}

export function createRoom(hostSocket, hostName, playerProfile = {}) {
  const code = genRoomCode();
  const hostId = genId();
  const hostToken = genToken();

  const weightKg = _resolveWeightKg(playerProfile);

  const host = {
    id: hostId,
    name: hostName,
    socket: hostSocket,
    hand: [],
    sessionToken: hostToken,
    isBot: false,
    bacLevel: 0,
    drinks: [],
    profile: { weight: weightKg, gender: 'neutral', ...playerProfile }
  };

  const room = {
    id: code,
    hostId,
    players: new Map([[hostId, host]]),
    gameState: {
      phase: 'lobby',
      deck: [],
      discardPile: [],
      currentTurnPlayerId: null,
      pendingDrinks: new Map(),
      books: new Map(),
      turnCount: 0,
      lastAction: null
    },
    createdAt: new Date(),
    lastActivity: new Date()
  };

  rooms.set(code, room);

  sendTo(host, { type: 'roomCreated', roomCode: code, playerId: hostId, sessionToken: hostToken });
  return room;
}

export function joinRoom(socket, roomCode, playerName, playerProfile = {}) {
  const room = rooms.get(roomCode);
  if (!room) { socket.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return; }
  if (room.gameState.phase !== 'lobby') { socket.send(JSON.stringify({ type: 'error', message: 'Game already started' })); return; }
  if (room.players.size >= 2) { socket.send(JSON.stringify({ type: 'error', message: 'Room full — max 2 players' })); return; }

  const weightKg = _resolveWeightKg(playerProfile);
  const playerId = genId();
  const token = genToken();
  const player = {
    id: playerId, name: playerName, socket,
    hand: [], sessionToken: token, isBot: false,
    bacLevel: 0, drinks: [],
    profile: { weight: weightKg, gender: 'neutral', ...playerProfile }
  };

  room.players.set(playerId, player);
  room.lastActivity = new Date();

  sendTo(player, { type: 'joined', roomCode, playerId, sessionToken: token });
  broadcast(room, { type: 'playerJoined', playerId, playerName }, playerId);

  const playerList = [...room.players.values()].map(p => ({ id: p.id, name: p.name, isHost: p.id === room.hostId }));
  broadcast(room, { type: 'playerList', players: playerList });
  sendTo(player, { type: 'playerList', players: playerList });
}

export function rejoinRoom(socket, roomCode, sessionToken) {
  const room = rooms.get(roomCode);
  if (!room) { socket.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return; }

  let found = null;
  for (const [id, player] of room.players) {
    if (player.sessionToken === sessionToken) { found = player; break; }
  }

  if (!found) { socket.send(JSON.stringify({ type: 'error', message: 'Session not found' })); return; }

  found.socket = socket;
  room.lastActivity = new Date();

  sendTo(found, { type: 'rejoined', roomCode, playerId: found.id });
  sendTo(found, buildSnapshot(room, found.id));
}

export function startGame(roomCode, requesterId) {
  const room = rooms.get(roomCode);
  if (!room || room.hostId !== requesterId) return;
  if (room.gameState.phase !== 'lobby') return;

  // Add bot if solo
  if (room.players.size === 1) {
    const bot = createBot('Bhenchod Bot');
    room.players.set(bot.id, bot);
    broadcast(room, { type: 'playerJoined', playerId: bot.id, playerName: bot.name });
    broadcast(room, { type: 'botJoined', message: 'Bhenchod Bot has entered the game. Good fucking luck.' });
  }

  const playerCount = room.players.size;
  const cardsEach = playerCount >= 5 ? 4 : 5;
  const deck = shuffle(createDeck());
  const hands = dealHands(deck, cardsEach, playerCount);

  const playerIds = [...room.players.keys()];
  playerIds.forEach((id, i) => {
    room.players.get(id).hand = hands[i];
  });

  room.gameState.deck = deck;
  room.gameState.phase = 'playing';
  room.gameState.currentTurnPlayerId = playerIds[0];
  room.gameState.turnCount = 0;

  broadcast(room, { type: 'gameStarted', firstPlayerId: playerIds[0] });
  broadcastSnapshots(room);

  const first = room.players.get(playerIds[0]);
  if (first?.isBot) {
    scheduleBotTurn(room, first, i => handleIntent(room, i));
  }
}

export function logDrink(roomCode, playerId, drink) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;

  player.drinks = player.drinks ?? [];
  player.drinks.push({ ...drink, timestamp: Date.now() });

  const result = estimateBAC({
    weight: player.profile.weight ?? 70,
    gender: player.profile.gender ?? 'male',
    drinks: player.drinks
  });
  player.bacLevel = result.level;

  broadcast(room, { type: 'bacUpdate', playerId, level: result.level, bac: result.bac, interventionRequired: result.interventionRequired });
  broadcastSnapshots(room);
}

export function skipDrink(roomCode, playerId, scenario) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const pending = room.gameState.pendingDrinks.get(playerId) ?? [];
  room.gameState.pendingDrinks.set(playerId, pending.filter(d => d.scenario !== scenario));
}

export function removePlayer(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.players.delete(playerId);
  broadcast(room, { type: 'playerLeft', playerId });
  if (room.players.size === 0) rooms.delete(roomCode);
}

export function assignDrink(roomCode, winnerId, { loserId, drinkLabel, scenario }) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const loser = room.players.get(loserId);
  const winner = room.players.get(winnerId);
  if (!loser) return;

  const state = room.gameState;
  if (!state.pendingDrinks.has(loserId)) state.pendingDrinks.set(loserId, []);
  state.pendingDrinks.get(loserId).push({
    scenario,
    toastFor: winner?.name ?? 'Your opponent',
    drinkLabel,
    assignedBy: winner?.name ?? 'Your opponent'
  });

  state.pendingDrinkChoices?.delete(winnerId);
  broadcastSnapshots(room);
}

export function getRoom(code) { return rooms.get(code); }
export function getRoomCount() { return rooms.size; }

// Convert stored weight to kg regardless of unit
// Strip sensitive fields before sending profile to other clients
function _safeProfile(p) {
  const { weight, gender, completedAt, offLimits, ...pub } = p;
  return pub;
}

function _resolveWeightKg(profile) {
  const w = profile?.weight;
  if (!w) return 70;
  if (typeof w === 'object') {
    return w.unit === 'lb' ? Math.round(w.value * 0.453592) : (w.value ?? 70);
  }
  return w;
}

export function cleanupExpiredRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity.getTime() > ROOM_EXPIRY_MS) rooms.delete(code);
  }
}
