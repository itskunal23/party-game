import {
  ALL_REFERENCES,
  FRANCHISE_ALIASES,
  NANDINI_REFERENCES,
  KUNAL_REFERENCES,
  PRIMARY_BARTENDER_FRANCHISES,
} from './bartender-refs.js';
import { resolveIconicLine } from './bartender-iconic-lines.js';

const ANTI_REPEAT_WINDOW = 5;

/** @param {string} mode @param {string} [streakInfo] @param {string} [referenceMode] */
export function normalizeBartenderMode(mode, streakInfo, referenceMode) {
  if (referenceMode) return referenceMode;
  if (mode === 'bullshit') {
    if (streakInfo?.toLowerCase().includes('wrong')) return 'bullshit_wrong';
    if (streakInfo?.toLowerCase().includes('caught')) return 'bullshit_correct';
    return 'bullshit_correct';
  }
  if (mode === 'bluff_win') return 'bluff_landed';
  return mode;
}

function _speakerAffinity(name) {
  const n = (name ?? '').toLowerCase();
  if (n === 'nandini') return 'nandini';
  if (n === 'kunal') return 'kunal';
  return null;
}

function _franchisesFromProfile(profile) {
  const out = new Set();
  for (const raw of profile?.mediaFaves ?? []) {
    const key = String(raw).toLowerCase().trim();
    if (FRANCHISE_ALIASES[key]) out.add(FRANCHISE_ALIASES[key]);
    for (const [alias, id] of Object.entries(FRANCHISE_ALIASES)) {
      if (key.includes(alias)) out.add(id);
    }
  }
  return out;
}

function _refMatchesTrigger(ref, mode) {
  return ref.triggers.includes(mode) || ref.triggers.includes('*');
}

function _exampleForRef(ref, mode, playerName) {
  const tpl =
    ref.usageExamples?.[mode]
    ?? ref.usageExamples?.[ref.triggers.find(t => ref.usageExamples?.[t]) ?? '']
    ?? null;
  if (!tpl) return null;
  const name = playerName ?? 'bhai';
  return tpl.replace(/\{name\}/g, name);
}

/**
 * Pick one contextual reference for this roast.
 * @param {object} opts
 * @param {string} opts.playerName
 * @param {string} opts.mode
 * @param {object} [opts.profile]
 * @param {string[]} [opts.recentFranchises] last N franchise ids
 * @param {string} [opts.streakInfo]
 * @param {string} [opts.referenceMode] override e.g. comeback
 */
export function pickReference(opts) {
  const {
    playerName,
    mode,
    profile,
    recentFranchises = [],
    streakInfo,
    referenceMode,
  } = opts;

  const normalizedMode = normalizeBartenderMode(mode, streakInfo, referenceMode);
  const affinity = _speakerAffinity(playerName);
  const favFranchises = _franchisesFromProfile(profile);
  const blocked = new Set((recentFranchises ?? []).slice(-ANTI_REPEAT_WINDOW));

  let pool = ALL_REFERENCES.filter(ref => {
    if (!_refMatchesTrigger(ref, normalizedMode)) return false;
    if (affinity && ref.playerAffinity !== affinity && ref.playerAffinity !== 'any') return false;
    if (!affinity && ref.playerAffinity !== 'any') return false;
    return true;
  });

  const primaryPool = pool.filter(ref => PRIMARY_BARTENDER_FRANCHISES.has(ref.franchise));
  if (primaryPool.length) pool = primaryPool;

  const scoreRef = (ref) => {
    let score = 0;
    if (!blocked.has(ref.franchise)) score += 10;
    if (favFranchises.has(ref.franchise)) score += 8;
    if (ref.usageExamples?.[normalizedMode]) score += 5;
    if (affinity && ref.playerAffinity === affinity) score += 3;
    return score;
  };

  let candidates = pool
    .filter(ref => !blocked.has(ref.franchise))
    .sort((a, b) => scoreRef(b) - scoreRef(a));

  if (!candidates.length) {
    candidates = [...pool].sort((a, b) => scoreRef(b) - scoreRef(a));
  }

  if (!candidates.length && affinity === 'nandini') {
    candidates = NANDINI_REFERENCES.filter(r => _refMatchesTrigger(r, normalizedMode));
  } else if (!candidates.length && affinity === 'kunal') {
    candidates = KUNAL_REFERENCES.filter(r => _refMatchesTrigger(r, normalizedMode));
  }

  if (!candidates.length) return null;

  const topScore = scoreRef(candidates[0]);
  const tier = candidates.filter(r => scoreRef(r) >= topScore - 2);
  const ref = tier[Math.floor(Math.random() * tier.length)];
  const exampleLine = _exampleForRef(ref, normalizedMode, playerName);
  const iconicLine = resolveIconicLine(ref, normalizedMode);

  return {
    ref,
    mode: normalizedMode,
    franchise: ref.franchise,
    title: ref.title,
    type: ref.type,
    iconicLine,
    exampleLine,
    score: topScore,
  };
}

/** Prompt block: forces LLM to use assigned reference only. */
export function formatReferenceBlock(picked) {
  if (!picked?.ref) return '';
  const r = picked.ref;
  const iconic = picked.iconicLine ?? resolveIconicLine(r, picked.mode);
  return `
ASSIGNED REFERENCE (MANDATORY — use THIS title/beat):
- Title: ${r.title} (${r.type})
- Franchise: ${r.franchise}
- Famous moment / character beat: ${r.famousMoment}
- Tone: ${r.tone}
- WHY it's funny here: tie "${picked.mode}" game event to this specific beat.
${iconic ? `- ICONIC LINE (MUST weave into roast in correct context — quote or tight paraphrase): "${iconic}"` : `- Vibe: ${r.quoteEnergy}`}
${picked.exampleLine ? `- Shape the roast like: ${picked.exampleLine}` : ''}
- Tie the iconic line to what JUST happened on the table — not random name-drop.
- Anti-repeat: this franchise was chosen because others were used recently.`;
}

export function formatReferenceBlockForOffline(picked) {
  return formatReferenceBlock(picked);
}
