/** Session narrative + streak achievements for Bhenchod Bartender memory. */

export const ACHIEVEMENTS = {
  lucky_bastard: { stat: 'luckyDraws',      threshold: 3,  label: 'Lucky Bastard',   emoji: '🍀' },
  card_shark:    { stat: 'successfulAsks',  threshold: 5,  label: 'Card Shark',      emoji: '🦈' },
  pond_goblin:   { stat: 'gfyMisses',       threshold: 10, label: 'Pond Goblin',     emoji: '🐸' },
  chaos_lord:    { stat: 'consecutiveBooks',threshold: 3,  label: 'Chaos Lord',      emoji: '👑' },
  lie_detector:  { stat: 'bullshitCalls',   threshold: 2,  label: 'Lie Detector',    emoji: '🔍' }
};

export function createSessionState() {
  return {
    log: [],
    highlights: [],   // Dramatic moments stored for bartender callbacks (max 6)
    unlocked: new Set(),
    actionCount: 0,
    powerHour: false,
    pondTax: false,
    bollywoodTwistUntil: 0
  };
}

export function recordEvent(session, { type, playerName, summary }) {
  if (!session) return;
  session.log.push({ type, playerName, summary, t: Date.now() });
  if (session.log.length > 24) session.log.shift();
}

/**
 * Record a high-drama moment for bartender callbacks.
 * The bartender will be explicitly instructed to reference these later.
 */
export function recordHighlight(session, { summary, type, turn }) {
  if (!session) return;
  session.highlights.push({ summary, type, turn, t: Date.now() });
  if (session.highlights.length > 6) session.highlights.shift();
}

export function updateStatsFromAction(stats, action, playerName) {
  const s = stats;
  const earned = [];

  if (action.type === 'gfy') {
    if (action.continueTurn) {
      s.luckyDraws = (s.luckyDraws ?? 0) + 1;
      s.consecutiveMisses = 0;
    } else {
      s.gfyMisses = (s.gfyMisses ?? 0) + 1;
      s.consecutiveMisses = (s.consecutiveMisses ?? 0) + 1;
    }
    if (action.bluffSucceeded) s.bluffsSurvived = (s.bluffsSurvived ?? 0) + 1;
  } else if (action.type === 'bullshit_caught') {
    s.bullshitCalls = (s.bullshitCalls ?? 0) + 1;
    s.consecutiveMisses = 0;
  } else if (action.type === 'bullshit_wrong') {
    s.bullshitWrong = (s.bullshitWrong ?? 0) + 1;
    s.gfyMisses = (s.gfyMisses ?? 0) + 1;
  } else if (action.type === 'got') {
    s.successfulAsks = (s.successfulAsks ?? 0) + 1;
    s.steals = (s.steals ?? 0) + (action.count ?? 1);
    s.consecutiveMisses = 0;
  }

  for (const [id, def] of Object.entries(ACHIEVEMENTS)) {
    const val = s[def.stat] ?? 0;
    if (val >= def.threshold && !s._achievements?.has(id)) {
      if (!s._achievements) s._achievements = new Set();
      s._achievements.add(id);
      earned.push({ id, ...def });
    }
  }

  return earned;
}

export function onBookComplete(allStats, playerId) {
  for (const [id, s] of Object.entries(allStats)) {
    if (id === playerId) {
      s.consecutiveBooks = (s.consecutiveBooks ?? 0) + 1;
      s.books = (s.books ?? 0) + 1;
    } else {
      s.consecutiveBooks = 0;
    }
  }
}

export function formatSessionMemory(session, stats, playerName) {
  const parts = [];

  // Recent event arc
  const recent = session?.log?.slice(-8).map(e => e.summary).filter(Boolean);
  if (recent?.length) parts.push(`Tonight's arc: ${recent.join(' → ')}`);

  // Streak data
  const s = stats ?? {};
  const streakBits = [];
  if ((s.consecutiveMisses ?? 0) >= 3) streakBits.push(`${s.consecutiveMisses} GFY misses in a row`);
  if ((s.luckyDraws ?? 0) >= 2) streakBits.push(`${s.luckyDraws} lucky pond draws`);
  if ((s.bullshitCalls ?? 0) >= 1) streakBits.push(`${s.bullshitCalls} bullshit calls landed`);
  if ((s.bluffsSurvived ?? 0) >= 1) streakBits.push(`${s.bluffsSurvived} bluffs survived`);
  if ((s.bullshitWrong ?? 0) >= 1) streakBits.push(`${s.bullshitWrong} wrong bullshit calls`);
  if ((s.successfulAsks ?? 0) >= 3) streakBits.push(`${s.successfulAsks} successful asks`);
  if ((s.consecutiveBooks ?? 0) >= 2) streakBits.push(`${s.consecutiveBooks} books back-to-back`);
  if (streakBits.length) parts.push(`${playerName} streaks: ${streakBits.join(', ')}`);

  // Unlocked titles
  const ach = s._achievements ? [...s._achievements].map(id => ACHIEVEMENTS[id]?.label).filter(Boolean) : [];
  if (ach.length) parts.push(`Titles earned: ${ach.join(', ')}`);

  // Active chaos modifiers
  if (session?.powerHour) parts.push('CHAOS: Power Hour active — next drink counts double.');
  if (session?.pondTax) parts.push('CHAOS: Pond Tax active — GFY misses mean a drink.');
  if (session?.bollywoodTwistUntil > Date.now()) parts.push('CHAOS: Bollywood Twist — movie energy only.');

  // ── CALLBACK AMMO ─────────────────────────────────────────────────────────
  // These are the dramatic moments from earlier in the match.
  // Explicitly reference these to create callbacks — "remember when…" energy.
  const highlights = session?.highlights ?? [];
  if (highlights.length >= 2) {
    parts.push(`CALLBACK AMMO — weaponize these specific earlier moments:\n${highlights.map(h => `  • ${h.summary}`).join('\n')}`);
  }

  return parts.join('\n');
}
