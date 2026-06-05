/**
 * Match pacing telemetry + automatic draw/deal tuning.
 * Targets: book 45–90s, chaos 60–120s, bartender 20–40s, bluff 2–4 asks, bullshit 3–5 asks.
 */

export const PACING_TARGETS = {
  bookMinSec: 45,
  bookMaxSec: 90,
  chaosMinSec: 60,
  chaosMaxSec: 120,
  bartenderMinSec: 20,
  bartenderMaxSec: 40,
  bluffEveryAsks: [2, 4],
  bullshitEveryAsks: [3, 5]
};

const DEFAULTS = {
  drawBias: 0.38,
  dealOverlap: 0.75,
  heatBoost: 0
};

export function initPacing(state) {
  const now = Date.now();
  state.pacing = {
    startedAt: now,
    lastBookAt: now,
    lastChaosAt: now,
    lastBartenderAt: 0,
    asks: 0,
    bluffs: 0,
    bullshits: 0,
    books: 0,
    gfyCount: 0,
    drawBias: DEFAULTS.drawBias,
    dealOverlap: DEFAULTS.dealOverlap,
    heatBoost: DEFAULTS.heatBoost
  };
}

export function recordPacingEvent(state, kind) {
  const p = state.pacing;
  if (!p) return;
  const now = Date.now();

  switch (kind) {
    case 'ask':
      p.asks = (p.asks ?? 0) + 1;
      break;
    case 'bluff':
      p.bluffs = (p.bluffs ?? 0) + 1;
      break;
    case 'bullshit':
      p.bullshits = (p.bullshits ?? 0) + 1;
      break;
    case 'gfy':
      p.gfyCount = (p.gfyCount ?? 0) + 1;
      break;
    case 'book':
      p.books = (p.books ?? 0) + 1;
      p.lastBookAt = now;
      break;
    case 'chaos':
    case 'recovery':
      p.lastChaosAt = now;
      break;
    case 'bartender':
      p.lastBartenderAt = now;
      break;
    default:
      break;
  }
}

function _secSince(ts) {
  if (!ts) return Infinity;
  return (Date.now() - ts) / 1000;
}

/** Tune draw bias / deal overlap when match pacing drifts off targets. */
export function maybeAdjustPacing(room) {
  const state = room.gameState;
  const p = state.pacing;
  if (!p) return null;

  const heat = state.heatLevel ?? 0;
  const sinceBook = _secSince(p.lastBookAt);
  const sinceChaos = _secSince(p.lastChaosAt);
  const adjustments = [];

  if (sinceBook > PACING_TARGETS.bookMaxSec) {
    p.drawBias = Math.min(0.58, (p.drawBias ?? 0.38) + 0.04);
    p.heatBoost = Math.min(0.12, (p.heatBoost ?? 0) + 0.02);
    adjustments.push('book_slow');
  } else if (sinceBook < PACING_TARGETS.bookMinSec && p.books >= 2) {
    p.drawBias = Math.max(0.32, (p.drawBias ?? 0.38) - 0.02);
  }

  if (sinceChaos > PACING_TARGETS.chaosMaxSec && heat < 3) {
    state.heatLevel = Math.min(7, heat + 1);
    adjustments.push('chaos_slow');
  }

  if (heat >= 3) {
    p.drawBias = Math.max(p.drawBias ?? 0.38, 0.44 + (p.heatBoost ?? 0));
  }

  const askCount = p.asks ?? 0;
  const bluffRate = askCount > 0 ? (p.bluffs ?? 0) / askCount : 0;
  const bullRate = askCount > 0 ? (p.bullshits ?? 0) / askCount : 0;

  if (askCount >= 6 && bluffRate < 0.2) {
    p.dealOverlap = Math.min(0.82, (p.dealOverlap ?? 0.75) + 0.03);
    adjustments.push('bluff_low');
  }
  if (askCount >= 8 && bullRate < 0.18) {
    p.drawBias = Math.min(0.55, (p.drawBias ?? 0.38) + 0.03);
    adjustments.push('bullshit_low');
  }

  return adjustments.length ? adjustments : null;
}

export function getDealOverlap(state) {
  return state.pacing?.dealOverlap ?? DEFAULTS.dealOverlap;
}

export function getDrawBias(state) {
  let bias = state.pacing?.drawBias ?? DEFAULTS.drawBias;
  if ((state.heatLevel ?? 0) >= 3) {
    bias = Math.max(bias, 0.44 + (state.pacing?.heatBoost ?? 0));
  }
  return Math.min(0.6, bias);
}

export function buildPacingSnapshot(state) {
  const p = state.pacing;
  if (!p) return null;
  return {
    sinceBookSec: Math.round(_secSince(p.lastBookAt)),
    sinceChaosSec: Math.round(_secSince(p.lastChaosAt)),
    asks: p.asks,
    bluffs: p.bluffs,
    bullshits: p.bullshits,
    books: p.books,
    drawBias: Number((p.drawBias ?? 0.38).toFixed(2)),
    dealOverlap: Number((p.dealOverlap ?? 0.75).toFixed(2))
  };
}
