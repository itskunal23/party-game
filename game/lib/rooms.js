import { createDeck, shuffle, dealHands, checkForBook, TOTAL_SETS } from '../frontend/js/game.js';
import { createBot, scheduleBotTurn, scheduleBotAskResponse, scheduleBotBullshitResolve } from './bot.js';
import { estimateBAC } from './bac.js';
import {
  initPlayerPowers, getPlayerPowers, drawFromDeck, clearPendingAsk,
  buildPendingAskView, buildBookPowerupView, buildLuckyRewardView,
  BULLSHIT_PENALTY, maybeServerChaos, checkMissionProgress, rankCounts
} from './game-powers.js';
import {
  initStalemateTrackers, postTurnHooks, recordBookComplete, updateComebackTokens,
  getNearBookRank, drawFromDeckWeighted
} from './stalemate.js';

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
      totalSets: TOTAL_SETS,
      completedSets: _countCompletedSets(state),
      lastAction: state.lastAction,
      pendingAsk: buildPendingAskView(state.pendingAsk, forPlayerId, room),
      myPowers: getPlayerPowers(state, forPlayerId),
      pendingBookPowerup: buildBookPowerupView(state, forPlayerId),
      luckyReward: buildLuckyRewardView(getPlayerPowers(state, forPlayerId)),
      peekReveal: state.peekReveal?.get(forPlayerId) ?? null,
      lastChaos: state.lastChaos ?? null,
      cardTax: !!state.cardTax,
      rankReveal: state.rankReveal ?? null,
      stalemate: {
        gfyStreak: state.gfyStreak ?? 0,
        turnsWithoutTransfer: state.turnsWithoutTransfer ?? 0,
        turnsWithoutBook: state.turnsWithoutBook ?? 0,
        heatLevel: state.heatLevel ?? 0
      }
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

function _countCompletedSets(state) {
  let n = 0;
  for (const books of state.books.values()) n += books.length;
  return n;
}

function checkGameOver(room) {
  const state = room.gameState;
  if (_countCompletedSets(state) >= TOTAL_SETS) return true;
  if (state.deck.length > 0) return false;
  return ![...room.players.values()].some(p => p.hand.length > 0);
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

    if (!state.firstBookWinner) {
      state.firstBookWinner = playerId;
      const mp = getPlayerPowers(state, playerId);
      if (mp?.mission?.id === 'first_book') checkMissionProgress(mp, 'first_book');
    }

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
      if (!state.pendingBookPowerup) state.pendingBookPowerup = new Map();
      state.pendingBookPowerup.set(playerId, { scenario, losers });
    }

    recordBookComplete(state);
    updateComebackTokens(room);

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
  const currentId = state.currentTurnPlayerId;
  if (state.pendingExtraTurn === currentId) {
    state.pendingExtraTurn = null;
    broadcastSnapshots(room);
    const keeper = room.players.get(currentId);
    if (keeper?.isBot) scheduleBotTurn(room, keeper, i => handleIntent(room, i));
    return;
  }

  const playerIds = [...room.players.keys()];
  const idx = playerIds.indexOf(currentId);
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

function _sendChooseLoserDrink(room, winnerId, scenario, losers) {
  const winner = room.players.get(winnerId);
  if (!winner || winner.isBot) return;
  const state = room.gameState;
  if (!state.pendingDrinkChoices) state.pendingDrinkChoices = new Map();
  state.pendingDrinkChoices.set(winnerId, { scenario, losers, timestamp: Date.now() });
  sendTo(winner, { type: 'chooseLoserDrink', scenario, losers });
}

function _gfyDrawCount(state, pendingAsk, powers) {
  let n = 1;
  if (pendingAsk?.wildAsk || pendingAsk?.kickDoor || powers?.activeKickDoor) n = 2;
  if (pendingAsk?.doubleOrNothing || powers?.activeDouble) n = 2;
  if (state.cardTax) {
    n = Math.max(n, 2);
    state.cardTax = false;
  }
  return n;
}

function _clearAskModifiers(powers) {
  if (!powers) return;
  powers.activeKickDoor = false;
  powers.activeDouble = false;
}

function _postTurnEffects(room, outcomeKind) {
  const recovery = postTurnHooks(room, outcomeKind);
  if (!recovery) maybeServerChaos(room);
  return recovery;
}

function _afterAskOutcome(room, askerId, continueTurn) {
  if (checkGameOver(room)) { finalizeGame(room); return; }

  const asker = room.players.get(askerId);
  if (continueTurn) {
    broadcastSnapshots(room);
    if (asker?.isBot) scheduleBotTurn(room, asker, i => handleIntent(room, i));
  } else {
    advanceTurn(room);
  }
}

function _completeGot(room, askerId, targetId, rank, count) {
  const state = room.gameState;
  const pending = state.pendingAsk;
  const powers = getPlayerPowers(state, askerId);
  _clearAskModifiers(powers);
  clearPendingAsk(state);

  // Double transfer chaos event
  let actualCount = count;
  if (state.doubleTransfer) {
    state.doubleTransfer = false;
    const target = room.players.get(targetId);
    const asker = room.players.get(askerId);
    if (target && asker) {
      const extra = target.hand.filter(c => c.rank === rank);
      if (extra.length) {
        target.hand = target.hand.filter(c => c.rank !== rank);
        asker.hand.push(...extra);
        actualCount = extra.length;
      }
    }
  }

  state.lastAction = { type: 'got', fromId: askerId, targetId, rank, count: actualCount };
  resolveBooks(room, askerId);
  if (checkGameOver(room)) { finalizeGame(room); return; }
  _postTurnEffects(room, 'transfer');
  _afterAskOutcome(room, askerId, true);
}

function _executeGfyDraw(room, askerId, targetId, rank, extra = {}) {
  const state = room.gameState;
  const asker = room.players.get(askerId);
  if (!asker) return;

  const pending = state.pendingAsk;
  const powers = getPlayerPowers(state, askerId);
  const drawCount = extra.drawCount ?? _gfyDrawCount(state, pending, powers);
  const isDouble = pending?.doubleOrNothing || powers?.activeDouble || extra.doubleOrNothing;

  _clearAskModifiers(powers);
  clearPendingAsk(state);

  // Detect "had 3, needed 1" before drawing
  const hadThreeBeforeDraw = asker.hand.filter(c => c.rank === rank).length === 3;

  let drawnCard = null;
  let continueTurn = false;

  const droughtActive = !!state.pondDrought;
  if (droughtActive) state.pondDrought = false;

  if (state.deck.length > 0 && !droughtActive) {
    const nearRank = getNearBookRank(asker.hand);
    const drawn = drawFromDeckWeighted(state, asker, drawCount, nearRank);
    drawnCard = drawn[0] ?? null;
    continueTurn = !isDouble && drawn.some(c => c.rank === rank);
  }

  if (continueTurn) {
    if (powers) {
      powers.luckyStacks = (powers.luckyStacks ?? 0) + 1;
      checkMissionProgress(powers, 'lucky');
      if (powers.luckyStacks >= 3 && !powers.luckyRewardPending) {
        powers.luckyRewardPending = true;
      }
    }
  }

  if (extra.bluffSucceeded) {
    const targetPowers = getPlayerPowers(state, targetId);
    if (targetPowers) checkMissionProgress(targetPowers, 'bluff_ok');
  }

  state.lastAction = {
    type: 'gfy',
    fromId: askerId,
    targetId,
    rank,
    drawnCard,
    continueTurn,
    drawCount,
    closeToPond: hadThreeBeforeDraw && !continueTurn && !isDouble,
    ...extra
  };
  resolveBooks(room, askerId);
  _postTurnEffects(room, continueTurn ? 'gfy_lucky' : 'gfy_miss');
  _afterAskOutcome(room, askerId, continueTurn);
}

function _applyBullshitPenalty(room, loserId, winnerId, rank, caughtBluffer) {
  const state = room.gameState;
  const loser = room.players.get(loserId);
  const winner = room.players.get(winnerId);
  if (!loser) return;

  clearPendingAsk(state);
  const drawn = drawFromDeck(state, loser, BULLSHIT_PENALTY);

  const loserPowers = getPlayerPowers(state, loserId);
  const winnerPowers = getPlayerPowers(state, winnerId);
  if (caughtBluffer) {
    if (loserPowers) loserPowers.bluffsCaught = (loserPowers.bluffsCaught ?? 0) + 1;
    if (winnerPowers) {
      winnerPowers.bullshitCalls = (winnerPowers.bullshitCalls ?? 0) + 1;
      checkMissionProgress(winnerPowers, 'bullshit_ok');
    }
  } else if (loserPowers) {
    loserPowers.bullshitWrong = (loserPowers.bullshitWrong ?? 0) + 1;
  }

  _clearAskModifiers(getPlayerPowers(state, winnerId));
  _clearAskModifiers(loserPowers);

  state.lastAction = {
    type: caughtBluffer ? 'bullshit_caught' : 'bullshit_wrong',
    fromId: winnerId,
    targetId: loserId,
    rank,
    count: drawn.length,
    turnContinues: caughtBluffer
  };

  resolveBooks(room, winnerId);
  if (checkGameOver(room)) { finalizeGame(room); return; }
  _postTurnEffects(room, 'transfer');
  broadcastSnapshots(room);

  if (caughtBluffer) {
    const asker = room.players.get(winnerId);
    if (asker?.isBot) scheduleBotTurn(room, asker, i => handleIntent(room, i));
  } else {
    advanceTurn(room);
  }
}

export function handleIntent(room, intent) {
  const state = room.gameState;
  const { type, fromId } = intent;
  room.lastActivity = new Date();

  if (type === 'ask') {
    if (state.pendingAsk) return;
    const { targetId, rank } = intent;
    if (state.currentTurnPlayerId !== fromId) return;

    const asker = room.players.get(fromId);
    const target = room.players.get(targetId);
    if (!asker || !target) return;

    const powers = getPlayerPowers(state, fromId);
    const useWild = powers?.activeKickDoor && (powers.wildAskToken ?? 0) > 0;
    const useDouble = powers?.activeDouble && !powers.doubleUsed;

    const hasRank = asker.hand.some(c => c.rank === rank);
    if (!hasRank) {
      if (!useWild) return;
      powers.wildAskToken--;
    }
    if (useDouble) powers.doubleUsed = true;

    state.pendingAsk = {
      askerId: fromId,
      targetId,
      rank,
      phase: 'awaiting_response',
      isBluff: false,
      wildAsk: useWild,
      kickDoor: useWild,
      doubleOrNothing: useDouble
    };
    state.lastAction = { type: 'ask_pending', fromId, targetId, rank, wildAsk: useWild, kickDoor: useWild, double: useDouble };
    broadcastSnapshots(room);

    if (target.isBot) scheduleBotAskResponse(room, target, i => handleIntent(room, i));
    return;
  }

  if (type === 'respondAsk') {
    const pending = state.pendingAsk;
    if (!pending || pending.targetId !== fromId || pending.phase !== 'awaiting_response') return;

    const { response } = intent;
    const target = room.players.get(fromId);
    const asker = room.players.get(pending.askerId);
    if (!target || !asker) return;

    const matching = target.hand.filter(c => c.rank === pending.rank);

    if (response === 'give') {
      if (!matching.length) return;
      target.hand = target.hand.filter(c => c.rank !== pending.rank);
      asker.hand.push(...matching);
      _completeGot(room, pending.askerId, fromId, pending.rank, matching.length);
      return;
    }

    if (response === 'gfy') {
      if (matching.length) return;
      pending.phase = 'awaiting_resolution';
      pending.isBluff = false;
      state.lastAction = {
        type: 'gfy_claim',
        fromId,
        targetId: pending.askerId,
        rank: pending.rank
      };
      broadcastSnapshots(room);
      if (asker.isBot) scheduleBotBullshitResolve(room, asker, i => handleIntent(room, i));
      return;
    }

    if (response === 'bluff') {
      if (!matching.length) return;
      pending.phase = 'awaiting_resolution';
      pending.isBluff = true;
      const powers = getPlayerPowers(state, fromId);
      if (powers) powers.bluffsAttempted = (powers.bluffsAttempted ?? 0) + 1;
      state.lastAction = {
        type: 'gfy_claim',
        fromId,
        targetId: pending.askerId,
        rank: pending.rank,
        bluff: true
      };
      broadcastSnapshots(room);
      if (asker.isBot) scheduleBotBullshitResolve(room, asker, i => handleIntent(room, i));
    }
    return;
  }

  if (type === 'resolveAsk') {
    const pending = state.pendingAsk;
    if (!pending || pending.askerId !== fromId || pending.phase !== 'awaiting_resolution') return;

    const { action } = intent;
    const target = room.players.get(pending.targetId);
    if (!target) return;

    if (action === 'accept') {
      _executeGfyDraw(room, fromId, pending.targetId, pending.rank, {
        bluffSucceeded: pending.isBluff
      });
      return;
    }

    if (action === 'bullshit') {
      if (pending.isBluff) {
        _applyBullshitPenalty(room, pending.targetId, fromId, pending.rank, true);
      } else {
        _applyBullshitPenalty(room, fromId, pending.targetId, pending.rank, false);
      }
    }
    return;
  }

  if (type === 'activateMove') {
    const powers = getPlayerPowers(state, fromId);
    if (!powers || state.currentTurnPlayerId !== fromId || state.pendingAsk) return;
    const { move } = intent;
    if (move === 'kick_door' && (powers.wildAskToken ?? 0) > 0) {
      powers.activeKickDoor = !powers.activeKickDoor;
      if (powers.activeKickDoor) powers.activeDouble = false;
    } else if (move === 'double' && !powers.doubleUsed) {
      powers.activeDouble = !powers.activeDouble;
      if (powers.activeDouble) powers.activeKickDoor = false;
    }
    broadcastSnapshots(room);
    return;
  }

  if (type === 'useMove') {
    if (state.pendingAsk || state.currentTurnPlayerId !== fromId) return;
    const powers = getPlayerPowers(state, fromId);
    const asker = room.players.get(fromId);
    const target = room.players.get(intent.targetId);
    if (!asker || !target || target.id === fromId) return;

    if (intent.move === 'steal') {
      if (!powers || powers.stealToken < 1 || !target.hand.length) return;
      powers.stealToken -= 1;
      const idx = Math.floor(Math.random() * target.hand.length);
      const stolen = target.hand.splice(idx, 1)[0];
      asker.hand.push(stolen);
      state.lastAction = { type: 'steal', fromId, targetId: target.id, rank: stolen.rank };
    } else if (intent.move === 'comeback') {
      if (!powers?.comebackToken) return;
      const { kind } = intent;
      powers.comebackToken -= 1;
      if (kind === 'steal') {
        if (!target.hand.length) return;
        const idx = Math.floor(Math.random() * target.hand.length);
        const stolen = target.hand.splice(idx, 1)[0];
        asker.hand.push(stolen);
        state.lastAction = { type: 'comeback', fromId, targetId: target.id, kind: 'steal', rank: stolen.rank };
      } else if (kind === 'reveal') {
        if (!target.hand.length) return;
        const card = target.hand[Math.floor(Math.random() * target.hand.length)];
        if (!state.peekReveal) state.peekReveal = new Map();
        state.peekReveal.set(fromId, { [card.rank]: 1 });
        state.lastAction = { type: 'comeback', fromId, targetId: target.id, kind: 'reveal', rank: card.rank };
      } else if (kind === 'extra_turn') {
        state.pendingExtraTurn = fromId;
        state.lastAction = { type: 'comeback', fromId, kind: 'extra_turn' };
      } else if (kind === 'wild_ask') {
        powers.wildAskToken = (powers.wildAskToken ?? 0) + 1;
        state.lastAction = { type: 'comeback', fromId, kind: 'wild_ask' };
      } else {
        powers.comebackToken += 1;
        return;
      }
    } else {
      return;
    }

    resolveBooks(room, fromId);
    if (checkGameOver(room)) { finalizeGame(room); return; }
    _postTurnEffects(room, 'transfer');
    broadcastSnapshots(room);
    return;
  }

  if (type === 'bookPowerup') {
    const pending = state.pendingBookPowerup?.get(fromId);
    if (!pending) return;
    const winner = room.players.get(fromId);
    if (!winner) return;
    const { choice } = intent;
    const powers = getPlayerPowers(state, fromId);

    if (choice === 'draw1') drawFromDeck(state, winner, 1);
    else if (choice === 'opp_draw1') {
      const opp = [...room.players.values()].find(p => p.id !== fromId && !p.isBot);
      if (opp) drawFromDeck(state, opp, 1);
    } else if (choice === 'steal_back' && powers) {
      powers.stealToken = (powers.stealToken ?? 0) + 1;
    }

    state.pendingBookPowerup.delete(fromId);
    resolveBooks(room, fromId);
    if (pending.losers?.length) _sendChooseLoserDrink(room, fromId, pending.scenario, pending.losers);
    broadcastSnapshots(room);
    return;
  }

  if (type === 'luckyReward') {
    const powers = getPlayerPowers(state, fromId);
    if (!powers?.luckyRewardPending) return;
    const player = room.players.get(fromId);
    if (!player) return;

    powers.luckyRewardPending = false;
    powers.luckyStacks = 0;

    if (intent.choice === 'draw2') {
      drawFromDeck(state, player, 2);
      state.lastAction = { type: 'lucky_reward', fromId, reward: 'draw2' };
    } else if (intent.choice === 'peek') {
      const opp = [...room.players.values()].find(p => p.id !== fromId);
      if (opp) {
        if (!state.peekReveal) state.peekReveal = new Map();
        state.peekReveal.set(fromId, rankCounts(opp.hand));
      }
      state.lastAction = { type: 'lucky_reward', fromId, reward: 'peek' };
    }

    resolveBooks(room, fromId);
    broadcastSnapshots(room);
    return;
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
      lastAction: null,
      pendingAsk: null,
      playerPowers: new Map(),
      pendingBookPowerup: new Map(),
      peekReveal: new Map(),
      actionCount: 0,
      lastChaosAt: 0,
      cardTax: false,
      firstBookWinner: null
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
  const phase = room.gameState.phase;
  if (phase !== 'lobby' && phase !== 'gameOver') return;

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
    const p = room.players.get(id);
    p.hand = hands[i];
  });

  room.gameState.deck = deck;
  room.gameState.phase = 'playing';
  room.gameState.currentTurnPlayerId = playerIds[0];
  room.gameState.turnCount = 0;
  room.gameState.books = new Map();
  room.gameState.pendingDrinks = new Map();
  room.gameState.pendingDrinkChoices = new Map();
  room.gameState.pendingAsk = null;
  room.gameState.playerPowers = initPlayerPowers(playerIds);
  room.gameState.pendingBookPowerup = new Map();
  room.gameState.peekReveal = new Map();
  room.gameState.actionCount = 0;
  room.gameState.lastChaosAt = 0;
  room.gameState.lastChaos = null;
  room.gameState.cardTax = false;
  room.gameState.pondDrought = false;
  room.gameState.doubleTransfer = false;
  room.gameState.heatLevel = 0;
  room.gameState._lastHeatChaosAt = 0;
  room.gameState.firstBookWinner = null;
  room.gameState.lastAction = null;
  room.gameState.discardPile = [];
  room.gameState.pendingExtraTurn = null;
  initStalemateTrackers(room.gameState);

  const first = room.players.get(playerIds[0]);

  broadcast(room, {
    type: 'gameStarted',
    firstPlayerId: playerIds[0],
    firstPlayerName: first?.name ?? 'Player',
    cardsDealt: cardsEach,
    deckCount: deck.length,
    totalSets: TOTAL_SETS,
    playerCount
  });
  broadcastSnapshots(room);

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
