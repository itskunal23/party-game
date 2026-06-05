/** Detect GFY deadlocks and inject recovery events server-side */

import { drawFromDeck, getPlayerPowers, rankCounts } from './game-powers.js';
import { getDrawBias, maybeAdjustPacing, recordPacingEvent } from './pacing.js';

export const RECOVERY_EVENTS = [
  { id: 'pond_surge', title: 'Pond Surge', text: 'Everyone draws 2 cards.', emoji: '🌊' },
  { id: 'rank_reveal', title: 'Rank Reveal', text: 'A shared rank is exposed to both players.', emoji: '👁️' },
  { id: 'free_ask', title: 'Wild Ask', text: 'Both players gain a Wild Ask token.', emoji: '🚪' },
  { id: 'card_swap', title: 'Card Swap', text: 'Swap one random card each.', emoji: '🔀' },
  { id: 'chaos_draw', title: 'Chaos Draw', text: 'Both draw up to 7 cards.', emoji: '🌀' }
];

export const THRESHOLDS = {
  gfyStreak: 4,
  turnsWithoutTransfer: 6,
  turnsWithoutBook: 14,
  recoveryCooldown: 4
};

export function initStalemateTrackers(state) {
  state.gfyStreak = 0;
  state.turnsWithoutBook = 0;
  state.turnsWithoutTransfer = 0;
  state.lastRecoveryAt = 0;
  state.rankReveal = null;
  state.heatLevel = 0;
  state._lastHeatChaosAt = 0;
  state._thirstyFiredAt = 0;
}

// Progressive heat escalation — rises on dead turns, resets on successful action
export function updateHeat(state, outcomeKind) {
  if (outcomeKind === 'transfer' || outcomeKind === 'book') {
    state.heatLevel = 0;
    state._lastHeatChaosAt = 0;
    state._thirstyFiredAt = 0;
  } else if (outcomeKind === 'gfy_miss') {
    state.heatLevel = Math.min(7, (state.heatLevel ?? 0) + 1);
  } else if (outcomeKind === 'gfy_lucky') {
    state.heatLevel = Math.max(0, (state.heatLevel ?? 0) - 1);
  }
  return state.heatLevel ?? 0;
}

function _fireHeatMiniChaos(room) {
  const state = room.gameState;
  if (state._lastHeatChaosAt >= (state.heatLevel ?? 0)) return;
  state._lastHeatChaosAt = state.heatLevel;

  const options = ['pond_surge', 'free_ask', 'card_swap'];
  const eventId = options[Math.floor(Math.random() * options.length)];
  const meta = RECOVERY_EVENTS.find(e => e.id === eventId) ?? RECOVERY_EVENTS[0];
  const players = [...room.players.values()];

  if (eventId === 'pond_surge') {
    for (const p of players) drawFromDeck(state, p, 1);
  } else if (eventId === 'free_ask') {
    for (const powers of state.playerPowers.values()) {
      powers.wildAskToken = (powers.wildAskToken ?? 0) + 1;
    }
  } else if (eventId === 'card_swap') {
    if (players.length >= 2 && players[0].hand.length && players[1].hand.length) {
      const ac = players[0].hand.splice(Math.floor(Math.random() * players[0].hand.length), 1)[0];
      const bc = players[1].hand.splice(Math.floor(Math.random() * players[1].hand.length), 1)[0];
      players[0].hand.push(bc);
      players[1].hand.push(ac);
    }
  }

  state.lastChaos = { ...meta, heat: true, at: Date.now() };
  state.lastAction = { type: 'recovery', title: `🔥 Heat ${state.heatLevel}`, text: meta.text, eventId: meta.id, emoji: '🔥', heatTriggered: true };
}

export function recordTurnOutcome(room, kind) {
  const state = room.gameState;
  state.turnCount = (state.turnCount ?? 0) + 1;

  if (kind === 'transfer') {
    state.gfyStreak = 0;
    state.turnsWithoutTransfer = 0;
  } else if (kind === 'gfy_miss') {
    state.gfyStreak = (state.gfyStreak ?? 0) + 1;
    state.turnsWithoutTransfer = (state.turnsWithoutTransfer ?? 0) + 1;
    state.turnsWithoutBook = (state.turnsWithoutBook ?? 0) + 1;
    return;
  } else if (kind === 'gfy_lucky') {
    state.gfyStreak = 0;
    state.turnsWithoutTransfer = (state.turnsWithoutTransfer ?? 0) + 1;
    state.turnsWithoutBook = (state.turnsWithoutBook ?? 0) + 1;
    return;
  }

  if (kind !== 'book') {
    state.turnsWithoutBook = (state.turnsWithoutBook ?? 0) + 1;
  }
}

export function recordBookComplete(state) {
  state.turnsWithoutBook = 0;
  state.gfyStreak = 0;
  state.heatLevel = 0;
  state._lastHeatChaosAt = 0;
  state._thirstyFiredAt = 0;
}

export function ranksInBothHands(room) {
  const players = [...room.players.values()];
  if (players.length < 2) return [];
  const [a, b] = players;
  const br = new Set(b.hand.map(c => c.rank));
  return [...new Set(a.hand.map(c => c.rank))].filter(r => br.has(r));
}

export function shouldTriggerRecovery(state) {
  const turns = state.turnCount ?? 0;
  if (turns - (state.lastRecoveryAt ?? 0) < THRESHOLDS.recoveryCooldown) return false;
  if ((state.gfyStreak ?? 0) >= THRESHOLDS.gfyStreak) return true;
  if ((state.turnsWithoutTransfer ?? 0) >= THRESHOLDS.turnsWithoutTransfer) return true;
  if ((state.turnsWithoutBook ?? 0) >= THRESHOLDS.turnsWithoutBook) return true;
  return false;
}

export function pickRecoveryEvent(room) {
  const state = room.gameState;
  const overlap = ranksInBothHands(room);

  if (overlap.length && (state.gfyStreak ?? 0) >= THRESHOLDS.gfyStreak) return 'rank_reveal';
  if ((state.turnsWithoutBook ?? 0) >= THRESHOLDS.turnsWithoutBook) return 'chaos_draw';
  if ((state.turnsWithoutTransfer ?? 0) >= THRESHOLDS.turnsWithoutTransfer) {
    return overlap.length ? 'rank_reveal' : 'free_ask';
  }

  const pool = overlap.length
    ? RECOVERY_EVENTS
    : RECOVERY_EVENTS.filter(e => e.id !== 'rank_reveal');
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function applyRecoveryEvent(room, eventId) {
  const state = room.gameState;
  let meta = RECOVERY_EVENTS.find(e => e.id === eventId) ?? RECOVERY_EVENTS[0];
  const players = [...room.players.values()];

  switch (meta.id) {
    case 'pond_surge':
      for (const p of players) drawFromDeck(state, p, 2);
      break;
    case 'rank_reveal': {
      const overlap = ranksInBothHands(room);
      if (overlap.length) {
        const rank = overlap[Math.floor(Math.random() * overlap.length)];
        state.rankReveal = { rank, at: Date.now() };
      } else {
        meta = RECOVERY_EVENTS.find(e => e.id === 'free_ask');
        for (const powers of state.playerPowers.values()) {
          powers.wildAskToken = (powers.wildAskToken ?? 0) + 1;
        }
      }
      break;
    }
    case 'free_ask':
      for (const powers of state.playerPowers.values()) {
        powers.wildAskToken = (powers.wildAskToken ?? 0) + 1;
      }
      break;
    case 'card_swap':
      if (players.length >= 2) {
        const [a, b] = players;
        if (a.hand.length && b.hand.length) {
          const ac = a.hand.splice(Math.floor(Math.random() * a.hand.length), 1)[0];
          const bc = b.hand.splice(Math.floor(Math.random() * b.hand.length), 1)[0];
          a.hand.push(bc);
          b.hand.push(ac);
        }
      }
      break;
    case 'chaos_draw':
      for (const p of players) {
        while (p.hand.length < 7 && state.deck.length > 0) drawFromDeck(state, p, 1);
      }
      break;
    default:
      break;
  }

  state.gfyStreak = 0;
  state.turnsWithoutTransfer = 0;
  state.lastRecoveryAt = state.turnCount ?? 0;
  state.heatLevel = 0;
  state._lastHeatChaosAt = 0;
  state._thirstyFiredAt = 0;
  state.lastChaos = { ...meta, recovery: true, at: Date.now() };
  state.lastAction = {
    type: 'recovery',
    title: meta.title,
    text: meta.text,
    eventId: meta.id,
    emoji: meta.emoji
  };
  return meta;
}

export function checkAndApplyRecovery(room) {
  if (!shouldTriggerRecovery(room.gameState)) return null;
  return applyRecoveryEvent(room, pickRecoveryEvent(room));
}

export function getNearBookRank(hand) {
  const counts = rankCounts(hand);
  for (const [rank, n] of Object.entries(counts)) {
    if (n === 3) return rank;
  }
  return null;
}

export function getPairRank(hand) {
  const counts = rankCounts(hand);
  let best = null;
  let bestN = 0;
  for (const [rank, n] of Object.entries(counts)) {
    if (n >= 2 && n > bestN) {
      best = rank;
      bestN = n;
    }
  }
  return best;
}

/** Best rank to bias toward when table is stuck (heat >= 3). */
export function getAcceleratedBookRank(room, player) {
  const state = room.gameState;
  const heat = state.heatLevel ?? 0;
  if (heat < 3) return getNearBookRank(player.hand) ?? getPairRank(player.hand);

  const near = getNearBookRank(player.hand);
  if (near) return near;

  const pair = getPairRank(player.hand);
  if (pair) return pair;

  const overlap = ranksInBothHands(room);
  if (overlap.length) {
    const counts = rankCounts(player.hand);
    for (const r of overlap) {
      if ((counts[r] ?? 0) >= 2) return r;
    }
    return overlap[0];
  }

  return getPairRank(player.hand);
}

export function drawFromDeckWeighted(state, player, count, preferredRank, biasOverride) {
  const drawn = [];
  const bias = biasOverride ?? getDrawBias(state);
  for (let i = 0; i < count && state.deck.length > 0; i++) {
    if (preferredRank && Math.random() < bias) {
      const idx = state.deck.findIndex(c => c.rank === preferredRank);
      if (idx >= 0) {
        drawn.push(state.deck.splice(idx, 1)[0]);
        continue;
      }
    }
    drawn.push(state.deck.pop());
  }
  if (drawn.length) player.hand.push(...drawn);
  return drawn;
}

/** Pond draw with pacing + heat-aware book acceleration. */
export function smartDrawFromPond(room, player, count) {
  const state = room.gameState;
  const preferred = getAcceleratedBookRank(room, player);
  return drawFromDeckWeighted(state, player, count, preferred, getDrawBias(state));
}

export function updateComebackTokens(room) {
  const state = room.gameState;
  const ids = [...room.players.keys()];
  if (ids.length < 2) return;

  const scored = ids.map(id => ({
    id,
    books: (state.books.get(id) ?? []).length
  }));
  scored.sort((a, b) => b.books - a.books);
  const leaderBooks = scored[0].books;

  for (const { id, books } of scored) {
    const powers = getPlayerPowers(state, id);
    if (!powers || powers.comebackGranted) continue;
    if (leaderBooks - books >= 2) {
      powers.comebackToken = (powers.comebackToken ?? 0) + 1;
      powers.comebackGranted = true;
    }
  }
}

export function postTurnHooks(room, outcomeKind) {
  recordTurnOutcome(room, outcomeKind);
  const heat = updateHeat(room.gameState, outcomeKind);
  updateComebackTokens(room);

  // ── "Table Gets Thirsty" at heat 3 — early mild injection ─────────────────
  // Fires once per heat cycle when 3 consecutive dead turns happen.
  // Both players draw 1 card — cheaper than the heat-5 major event.
  const state = room.gameState;
  if (heat === 3 && state._thirstyFiredAt !== 3) {
    state._thirstyFiredAt = 3;
    for (const p of room.players.values()) drawFromDeck(state, p, 1);
    state.lastChaos = {
      id: 'table_thirsty',
      title: 'Table Gets Thirsty',
      text: 'Everyone draws 1 card.',
      emoji: '🥵',
      recovery: true,
      at: Date.now()
    };
  }

  // At heat 5 — fire a mild chaos event to shake things up
  if (heat === 5) _fireHeatMiniChaos(room);

  const recovery = checkAndApplyRecovery(room);
  if (recovery) {
    recordPacingEvent(room.gameState, 'recovery');
    room.gameState.heatLevel = 0;
    room.gameState._lastHeatChaosAt = 0;
  }

  maybeAdjustPacing(room);
  return recovery;
}
