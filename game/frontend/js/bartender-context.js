/** Client-side bartender anchoring — every line must tie to a real table event. */

const LAST_EVENT_KEY = 'gfy_last_bartender_event';

export function saveLastBartenderEvent({ mode, scenario, summary }) {
  if (!scenario && !summary) return;
  try {
    localStorage.setItem(LAST_EVENT_KEY, JSON.stringify({
      mode: mode ?? 'event',
      scenario: scenario ?? summary,
      summary: summary ?? scenario,
      at: Date.now()
    }));
  } catch { /* quota */ }
}

export function getLastBartenderEvent() {
  try {
    const raw = localStorage.getItem(LAST_EVENT_KEY);
    if (!raw) return null;
    const ev = JSON.parse(raw);
    if (!ev?.at || Date.now() - ev.at > 14 * 24 * 60 * 60 * 1000) return null;
    return ev;
  } catch {
    return null;
  }
}

/** Home bubble — never random cinema quotes. */
export function homeBartenderLine(profile, lifetime = {}) {
  const last = getLastBartenderEvent();
  if (last?.scenario) {
    const who = profile?.name ? `${profile.name}, ` : '';
    return `${who}last table: ${last.scenario}`;
  }
  const games = lifetime.totalGames ?? 0;
  if (games >= 1) {
    return 'I only speak when you complete a set, miss Go Fuck Yourself, bluff, steal, drink, or stall on a turn — start a room.';
  }
  return 'Start Chaos — I roast real moves on the table, not random quotes.';
}

const TABLE_MODES = new Set([
  'book', 'gfy', 'lucky', 'close_call', 'steal', 'bullshit', 'bluff_win', 'bluff_landed',
  'heat', 'chaos', 'house_refill', 'slow_turn', 'drink', 'drink_assign', 'game_over'
]);

export function canTriggerBartender(mode, opts = {}) {
  const scenario = (opts.scenario ?? '').trim();
  if (TABLE_MODES.has(mode)) return scenario.length > 2;

  if (mode === 'roast') {
    const mem = (opts.sessionMemory ?? '').trim();
    const hasArc = mem.includes("Tonight's arc:") || mem.includes('CALLBACK AMMO');
    return scenario.length > 2 && scenario !== 'general chaos' && (hasArc || (opts.streakInfo ?? '').length > 2);
  }

  return false;
}

export function buildLiveGameContext(state, opts = {}) {
  const gs = state?.gameState;
  const me = state?.players?.find(p => p.id === state.myId);
  const opp = state?.players?.find(p => p.id !== state.myId);
  const parts = [];

  if (gs?.phase) parts.push(`phase ${gs.phase}`);
  if (gs?.currentTurnPlayerId) {
    const turnName = state.players.find(p => p.id === gs.currentTurnPlayerId)?.name;
    if (turnName) parts.push(`turn: ${turnName}`);
  }
  if (state?.myHand) parts.push(`your hand ${state.myHand.length} cards`);
  if (me) parts.push(`your sets ${me.books?.length ?? 0}/13`);
  if (opp) parts.push(`partner sets ${opp.books?.length ?? 0}/13`);
  if (gs?.stalemate?.heatLevel != null && gs.stalemate.heatLevel >= 2) {
    parts.push(`table heat ${gs.stalemate.heatLevel}`);
  }
  if (opts.scenario) parts.push(`event: ${opts.scenario}`);
  if (opts.streakInfo) parts.push(`pattern: ${opts.streakInfo}`);

  return parts.join(' · ');
}

/** Manual Roast — only when this match already has a logged beat. */
export function roastAnchorFromGame(state, playerName) {
  const session = state?.session;
  const hl = session?.highlights?.slice(-1)[0];
  if (hl?.summary) {
    return { scenario: hl.summary, streakInfo: hl.type ? `callback: ${hl.type}` : null };
  }
  const log = session?.log?.slice(-1)[0];
  if (log?.summary) {
    return { scenario: log.summary, streakInfo: log.type ?? null };
  }

  const stats = state?.playerStats?.[state.myId] ?? {};
  const streakParts = [];
  if ((stats.consecutiveMisses ?? 0) > 1) streakParts.push(`${stats.consecutiveMisses} GFY misses in a row`);
  if ((stats.luckyDraws ?? 0) > 1) streakParts.push(`${stats.luckyDraws} lucky pond draws`);
  if ((stats.books ?? 0) > 0) streakParts.push(`${stats.books} set(s) tonight`);
  if ((stats.bullshitCalls ?? 0) > 0) streakParts.push(`${stats.bullshitCalls} bullshit catches`);
  if ((stats.bluffsSurvived ?? 0) > 0) streakParts.push(`${stats.bluffsSurvived} bluffs landed`);

  if (!streakParts.length) return null;
  return {
    scenario: `${playerName} — ${streakParts.join(', ')}`,
    streakInfo: streakParts.join('; ')
  };
}

export function gfyModeFromAction(action, stats) {
  if (action.continueTurn) return 'lucky';
  if (action.closeToPond) return 'close_call';
  if (action.bluffSucceeded) return 'bluff_win';
  return 'gfy';
}

export function gfyStreakInfo(action, stats) {
  if (!action.continueTurn && !action.closeToPond && (stats.consecutiveMisses ?? 0) > 1) {
    return `${stats.consecutiveMisses} misses in a row tonight`;
  }
  if (action.continueTurn && (stats.luckyDraws ?? 0) > 1) {
    return `lucky draw #${stats.luckyDraws} tonight`;
  }
  return null;
}
