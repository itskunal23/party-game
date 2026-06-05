/**
 * Iconic dialogue per franchise + trigger — woven into roasts in context.
 * Short famous lines / tight paraphrases the bartender MUST use when assigned.
 */

/** @typedef {Record<string, string>} ModeLines */

/** @type {Record<string, ModeLines>} */
export const FRANCHISE_ICONIC_LINES = {
  'brooklyn-nine-nine': {
    default: 'Cool cool cool cool cool cool cool…',
    gfy: 'Cool cool cool cool cool cool cool… no doubt no doubt no doubt.',
    close_call: 'Bingpot! — wait, no. Pond said Go Fuck Yourself.',
    bluff_landed: 'Full Jake Peralta victory dance — case still open.',
    bullshit_correct: 'Detective work. The liar folds.',
    bullshit_wrong: 'Boyle-level passion. Holt-level disappointment.',
    heat: 'This precinct has more action than your table.',
    slow_turn: 'Even the paperwork moves faster than you.',
    chaos: 'The vending machine broke — same energy.',
  },
  spartacus: {
    default: 'I am Spartacus!',
    gfy: 'I am Spartacus! — Rome still said Go Fuck Yourself.',
    close_call: 'Blood and sand — one card short of glory.',
    bluff_landed: 'A gladiator\'s deception — strike from the sand.',
    bullshit_correct: 'The hidden blade finds the liar.',
    book: 'The arena bows. Set complete.',
    game_over: 'I am Spartacus! — and the table is yours.',
  },
  'dhurandhar-p1': {
    default: 'Dhurandhar Part 1 — operation already written.',
    book: 'Season one mastermind — set locked before you blinked.',
    game_over: 'Part 1 finale — dom hour sealed.',
    roast: 'Confession tape energy — filth on record.',
  },
  'dhurandhar-p2': {
    default: 'Part 2 — stakes doubled, ego louder.',
    gfy: 'Sequel pain — swagger met Go Fuck Yourself.',
    chaos: 'Mid-season twist — table on fire.',
    lucky: 'Plot armor activated.',
  },
  'paatal-lok': {
    default: 'Swagat hai Paatal Lok mein.',
    gfy: 'Swagat hai Paatal Lok mein — underworld paperwork.',
    heat: 'Hathiram still waiting for one honest answer.',
    slow_turn: 'Interrogation moves faster than your turn.',
    bullshit_correct: 'False alibi exposed — case file updated.',
    chaos: 'Upar normal, andar system chud gaya.',
  },
  'night-manager': {
    default: 'The quietest ops make the loudest mess.',
    bluff_landed: 'Handler chess — lie clean, partner folds.',
    bluff_win: 'Jonathan Pine energy — background scam.',
    heat: 'Cairo stakeout — table frozen longer than this.',
    slow_turn: 'Even Pine would have played a card.',
    game_over: 'Op complete. Handler never flinched.',
  },
  'kuch-kuch-hota-hai': {
    default: 'Kuch kuch hota hai…',
    gfy: 'Pyaar dosti hai — tum kya leke aaye? Pond ne Go Fuck Yourself.',
    lucky: 'Kuch kuch hota hai — pond sympathy after heartbreak.',
    close_call: 'Tujhe yaad hai woh din? Ek card chahiye tha.',
    book: 'Happy ending — four cards, bar tab still due.',
    bullshit_correct: 'Dil toh pagal hai — truth finally dropped.',
    bluff_landed: 'SRK smile — Go Fuck Yourself face, cards hidden.',
    drink: 'College farewell — shot time. Kuch kuch hota hai.',
  },
  'agent-sai': {
    default: 'Wrong suspect. Wrong evidence. Full confidence.',
    gfy: 'Five turns investigating — wrong case file. Go Fuck Yourself.',
    bullshit_wrong: 'Detective cosplay — amateur hour.',
    heat: 'Case colder than this table.',
  },
  'hardcore-henry': {
    default: 'POV chaos — no cut, no pause.',
    chaos: 'First-person violence injected into Go Fish.',
    lucky: 'Grabbed a weapon mid-sprint — messy survival.',
    game_over: 'Survived the runtime. Absolute violence.',
  },
  'ip-man': {
    default: 'Don\'t look at me — look at my fist.',
    book: 'Wing Chun — four hits, set complete.',
    bluff_landed: 'Calm master — strike you never saw.',
    bullshit_correct: 'Economic precision — liar exposed.',
  },
  sanju: {
    default: 'Main theek hoon — decisions still trash.',
    lucky: 'Biopic sympathy after Go Fuck Yourself.',
    gfy: 'Bad decisions montage — ego still alive.',
    roast: 'Confession tape — Sanju energy.',
  },
  'ferris-bueller': {
    default: 'Life moves pretty fast. If you don\'t stop and look around once in a while, you could miss it.',
    lucky: 'Ferris Bueller luck — zero consequences.',
    bluff_landed: 'Skipped school, scammed partner, no homework.',
    slow_turn: 'Ferris would have GFY\'d and stolen a car by now.',
  },
  'gully-boy': {
    default: 'Apna time aayega.',
    book: 'Apna time aayega — mic drop on four cards.',
    lucky: 'Underground third act — pond matched.',
    game_over: 'Gully Boy finale — street poetry wins.',
  },
  'scary-movie': {
    default: 'What\'s your favorite scary movie?',
    chaos: 'Rules stopped making sense six turns ago.',
    bluff_landed: 'Bluff so stupid it\'s Scary Movie logic.',
    bullshit_wrong: 'Detective cosplay — case file is a joke.',
  },
  'naked-gun': {
    default: 'Surely you can\'t be serious.',
    bullshit_correct: 'I am serious — and don\'t call me Shirley. Liar caught.',
    chaos: 'Serious faces, nonsense table.',
    heat: 'Surely you can transfer a card. Table: no.',
  },
  undisputed: {
    default: 'Respect is taken — not given.',
    book: 'Undisputed KO — opponent on the mat.',
    gfy: 'Ate a yard shot — Go Fuck Yourself pain.',
    bluff_landed: 'Prison-yard feint — cards hidden.',
    game_over: 'I am the most complete fighter in the world.',
    bullshit_correct: 'Knocked the lie out cold.',
    drink: 'Lost the round — bar tab is the penalty.',
  },
};

/**
 * @param {{ iconicLine?: string, franchise: string }} ref
 * @param {string} mode
 */
export function resolveIconicLine(ref, mode) {
  if (!ref) return null;
  if (ref.iconicLine) return ref.iconicLine;
  const bank = FRANCHISE_ICONIC_LINES[ref.franchise];
  if (!bank) return null;
  return bank[mode] ?? bank.default ?? null;
}

/** Weave quote into roast if not already present. */
export function weaveIconicIntoRoast(iconicLine, roast) {
  if (!iconicLine || !roast) return roast ?? '';
  const needle = iconicLine.slice(0, Math.min(18, iconicLine.length)).toLowerCase();
  if (roast.toLowerCase().includes(needle)) return roast;
  return `"${iconicLine}" — ${roast}`;
}
