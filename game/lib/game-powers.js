/** Simple once-per-game moves, missions, chaos, lucky reward */

export const BULLSHIT_CAUGHT_PENALTY = 4;  // Caught bluffing → draw 4
export const BULLSHIT_WRONG_PENALTY   = 2;  // Wrong bullshit call → draw 2

export const SECRET_MISSIONS = [
  { id: 'first_book', text: 'Finish a book before your partner', check: 'first_book' },
  { id: 'bluff_twice', text: 'Bluff twice without getting caught', check: 'bluff_twice', target: 2 },
  { id: 'call_bullshit', text: 'Catch one lie with Bullshit', check: 'call_bullshit' },
  { id: 'lucky_three', text: 'Hit 3 lucky pond draws', check: 'lucky_three', target: 3 }
];

export const CHAOS_POOL = [
  { id: 'pond_flood',    title: 'Pond Flood',    text: 'Everyone draws 1 card from the pond.' },
  { id: 'card_tax',      title: 'Card Tax',      text: 'Next GFY miss draws 2 instead of 1.' },
  { id: 'steal_refresh', title: 'Steal Back',    text: 'Everyone gets 1 steal token restored.' },
  { id: 'hand_reveal',   title: 'Hand Reveal',   text: 'Both players announce how many cards they hold.' },
  { id: 'skip_penalty',  title: 'Double Down',   text: 'Next successful ask wins 2 cards instead of 1.' },
  { id: 'pond_drought',  title: 'Pond Drought',  text: 'The pond is frozen — no pond draws this turn.' },
  { id: 'wild_refresh',  title: 'Wild Surge',    text: 'Everyone gets 1 Wild Ask token.' },
  { id: 'swap_fates',    title: 'Swap Fates',    text: 'Each player discards 1 card and draws 1 from the pond.' }
];

export function initPlayerPowers(playerIds) {
  const shuffled = [...SECRET_MISSIONS].sort(() => Math.random() - 0.5);
  const map = new Map();
  playerIds.forEach((id, i) => {
    const mission = shuffled[i % shuffled.length];
    map.set(id, {
      stealToken: 0,
      wildAskToken: 1,
      comebackToken: 0,
      comebackGranted: false,
      doubleUsed: true,
      luckyStacks: 0,
      luckyRewardPending: false,
      mission: { id: mission.id, text: mission.text, done: false, progress: 0, target: mission.target ?? 1 },
      activeKickDoor: false,
      activeDouble: false,
      bluffsAttempted: 0,
      bluffsCaught: 0,
      bullshitCalls: 0,
      bullshitWrong: 0
    });
  });
  return map;
}

export function getPlayerPowers(state, playerId) {
  return state.playerPowers?.get(playerId) ?? null;
}

export function drawFromDeck(state, player, count) {
  const drawn = [];
  for (let i = 0; i < count && state.deck.length > 0; i++) {
    drawn.push(state.deck.pop());
  }
  if (drawn.length) player.hand.push(...drawn);
  return drawn;
}

export function clearPendingAsk(state) {
  state.pendingAsk = null;
}

export function rankCounts(hand) {
  const counts = {};
  for (const c of hand) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
  return counts;
}

export function maybeServerChaos(room) {
  const state = room.gameState;
  state.actionCount = (state.actionCount ?? 0) + 1;
  if (state.actionCount < 8) return null;
  if (state.actionCount - (state.lastChaosAt ?? 0) < 10) return null;
  if (Math.random() > 0.28) return null;

  const event = CHAOS_POOL[Math.floor(Math.random() * CHAOS_POOL.length)];
  state.lastChaosAt = state.actionCount;

  if (event.id === 'pond_flood') {
    for (const p of room.players.values()) drawFromDeck(state, p, 1);
  } else if (event.id === 'card_tax') {
    state.cardTax = true;
  } else if (event.id === 'steal_refresh') {
    for (const powers of state.playerPowers.values()) {
      powers.stealToken = (powers.stealToken ?? 0) + 1;
    }
  } else if (event.id === 'wild_refresh') {
    for (const powers of state.playerPowers.values()) {
      powers.wildAskToken = (powers.wildAskToken ?? 0) + 1;
    }
  } else if (event.id === 'pond_drought') {
    state.pondDrought = true;
  } else if (event.id === 'swap_fates') {
    for (const p of room.players.values()) {
      if (p.hand.length > 0 && state.deck.length > 0) {
        const discard = p.hand.splice(Math.floor(Math.random() * p.hand.length), 1)[0];
        state.deck.unshift(discard);
        drawFromDeck(state, p, 1);
      }
    }
  } else if (event.id === 'hand_reveal') {
    // Client shows hand sizes via snapshot — handled client-side
  } else if (event.id === 'skip_penalty') {
    state.doubleTransfer = true;
  }

  state.lastChaos = { ...event, at: Date.now() };
  state.lastAction = { type: 'chaos', title: event.title, text: event.text };
  return event;
}

export function checkMissionProgress(powers, event) {
  if (!powers?.mission || powers.mission.done) return false;
  const m = powers.mission;
  let hit = false;

  if (m.id === 'bluff_twice' && event === 'bluff_ok') {
    m.progress = (m.progress ?? 0) + 1;
    if (m.progress >= (m.target ?? 2)) hit = true;
  } else if (m.id === 'call_bullshit' && event === 'bullshit_ok') {
    hit = true;
  } else if (m.id === 'lucky_three' && event === 'lucky') {
    m.progress = (m.progress ?? 0) + 1;
    if (m.progress >= 3) hit = true;
  } else if (m.id === 'first_book' && event === 'first_book') {
    hit = true;
  }

  if (hit) {
    m.done = true;
    return true;
  }
  return false;
}

export function buildPendingAskView(pendingAsk, forPlayerId, room) {
  if (!pendingAsk) return null;

  const asker = room.players.get(pendingAsk.askerId);
  const target = room.players.get(pendingAsk.targetId);
  const rank = pendingAsk.rank;

  if (pendingAsk.phase === 'awaiting_response' && forPlayerId === pendingAsk.targetId) {
    const hasCards = target.hand.some(c => c.rank === rank);
    return {
      phase: 'respond',
      rank,
      askerName: asker?.name ?? 'Them',
      canGive: hasCards,
      canGfy: !hasCards,
      canBluff: hasCards
    };
  }

  if (pendingAsk.phase === 'awaiting_resolution' && forPlayerId === pendingAsk.askerId) {
    return {
      phase: 'resolve',
      rank,
      targetName: target?.name ?? 'Them',
      canAccept: true,
      canBullshit: true
    };
  }

  if (forPlayerId === pendingAsk.askerId && pendingAsk.phase === 'awaiting_response') {
    return { phase: 'waiting_target', rank, targetName: target?.name ?? 'Them' };
  }

  if (forPlayerId === pendingAsk.targetId && pendingAsk.phase === 'awaiting_resolution') {
    return { phase: 'waiting_bullshit', rank, askerName: asker?.name ?? 'Them' };
  }

  return { phase: 'spectating', rank };
}

export function buildBookPowerupView(state, forPlayerId) {
  const pending = state.pendingBookPowerup?.get(forPlayerId);
  if (!pending) return null;
  return {
    scenario: pending.scenario,
    choices: [
      { id: 'draw1', label: 'Draw 1 card' },
      { id: 'opp_draw1', label: 'They draw 1' }
    ]
  };
}

export function buildLuckyRewardView(powers) {
  if (!powers?.luckyRewardPending) return null;
  return {
    choices: [
      { id: 'draw2', label: 'Draw 2 cards' },
      { id: 'peek', label: 'Peek their hand (by rank)' }
    ]
  };
}
