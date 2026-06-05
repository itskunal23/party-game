import { haptic } from './mobile.js';
import { prewarmAvatar, refreshAvatarForProfile } from './avatar.js';

export const PROFILE_KEY = 'gfy_profile';

const KINKS = [
  'Public Fucking', 'CNC / RPE Play', 'Death Kink', 'Family Taboo',
  'Drunk Fucking', 'Animal / Pet Roleplay', 'Bondage', 'Humiliation',
  'Exhibitionism', 'Voyeurism', 'Power Exchange', 'Impact Play',
  'Orgasm Denial', 'Breeding Kink', 'Choking', 'Rough Sex',
  'Roleplay', 'Filming / Recording', 'Threesome+', 'Degradation',
  'Watersports', 'Edging', 'Sensory Deprivation', 'Free Use'
];

const LIMITS = [
  'No CNC / RPE', 'No Death Play', 'No Public Sex', 'No Recording',
  'No Pain / Impact', 'No Strangers', 'No Blood', 'No Humiliation',
  'No Family Taboo', 'No Drunk Sex', 'No Degradation', 'No Choking',
  'No Filming', 'No Animal Content', 'No Non-Consent Themes',
  'No Watersports', 'No Breeding Talk', 'No Free Use', 'No Rough Sex'
];

const QUESTIONS = [
  {
    id: 'name',
    type: 'pick-one-other',
    tier: 'core',
    question: "What's your\nfucking name?",
    hint: 'Pick one — or type it under Other.',
    openers: ['Bartender needs a name to roast you.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'type your name',
    otherMaxLength: 20,
    options: [
      { label: 'Kunal', sub: '', value: 'Kunal' },
      { label: 'Nandini', sub: '', value: 'Nandini' },
      { label: 'No fixed name', sub: 'chaos player', value: 'Chaos goblin' },
      { label: 'Anonymous', sub: 'mystery guest', value: 'Anonymous' }
    ]
  },
  {
    id: 'weight',
    type: 'pick-one',
    tier: 'core',
    question: 'How much do\nyou weigh?',
    hint: 'For the drunk meter. Pick the closest range.',
    openers: ['Rough guess is fine.'],
    required: false,
    autoAdvance: true,
    options: [
      { label: 'Under 130 lbs', sub: 'drinks hit fast', value: 120 },
      { label: '130 – 170 lbs', sub: 'average', value: 150 },
      { label: '171 – 210 lbs', sub: 'holds liquor well', value: 190 },
      { label: '211+ lbs', sub: 'heavyweight', value: 230 }
    ]
  },
  {
    id: 'grandparentGrief',
    type: 'pick-one-other',
    tier: 'core',
    question: 'Death or funerals\n— ever turn you on?',
    hint: 'Think grandparents dying. Be honest.',
    openers: ['Awkward question. Still answer it.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'say it in your own words',
    otherMaxLength: 80,
    options: [
      { label: 'Yes', sub: 'loss can turn me on', value: 'grief_yes' },
      { label: 'Sometimes', sub: 'only when drunk or broken', value: 'grief_sometimes' },
      { label: 'No', sub: 'hard limit for me', value: 'grief_never' },
      { label: 'Fantasy only', sub: 'thought, not action', value: 'grief_fantasy_only' }
    ]
  },
  {
    id: 'shittyDriver',
    type: 'pick-one-other',
    tier: 'core',
    question: 'Are you a bad\ndriver?',
    hint: 'How you really drive — not how you wish you drove.',
    openers: ['Your friends already have an opinion.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'worst thing you did driving',
    otherMaxLength: 60,
    options: [
      { label: 'No — I\'m good', sub: 'safe driver', value: 'driver_elite' },
      { label: 'So-so', sub: 'speeding, honking', value: 'driver_avg' },
      { label: 'Yes — I\'m bad', sub: 'shouldn\'t have a license', value: 'driver_shitty' },
      { label: 'Dangerous', sub: 'road rage, curbs', value: 'driver_weapon' }
    ]
  },
  {
    id: 'fucksPerDay',
    type: 'pick-one',
    tier: 'core',
    question: 'How often do you\nsay "fuck" out loud?',
    hint: 'Today. Count what other people heard.',
    openers: ['Be real — we all swear.'],
    required: false,
    autoAdvance: true,
    options: [
      { label: 'Under 10 times', sub: 'pretty quiet', value: 'fuck_rare' },
      { label: '11 – 30 times', sub: 'normal', value: 'fuck_normal' },
      { label: '31 – 60 times', sub: 'a lot', value: 'fuck_heavy' },
      { label: '61 – 100 times', sub: 'constant', value: 'fuck_machine' },
      { label: '100+ times', sub: 'nonstop', value: 'fuck_god' }
    ]
  },
  {
    id: 'happyTrigger',
    type: 'pick-one-other',
    tier: 'core',
    question: 'What makes you\nreally fucking happy?',
    hint: 'The thing that actually lights you up.',
    openers: ['Pick what fits — or write your own.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'what makes you happy',
    otherMaxLength: 80,
    options: [
      { label: 'Partner gives in', sub: 'power, praise', value: 'happy_power' },
      { label: 'Almost getting caught', sub: 'risk, adrenaline', value: 'happy_risk' },
      { label: 'Winning', sub: 'game, argument, sex', value: 'happy_win' },
      { label: 'Being teased or roasted', sub: 'humiliation', value: 'happy_degrade' },
      { label: 'Drinking with people', sub: 'party, loud, drunk', value: 'happy_drunk' }
    ]
  },
  {
    id: 'angryTrigger',
    type: 'pick-one-other',
    tier: 'core',
    question: 'What pisses you off\nfast?',
    hint: 'Bartender will use this in roasts.',
    openers: ['What makes you snap? Pick one.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'what makes you angry',
    otherMaxLength: 80,
    options: [
      { label: 'Being lied to', sub: 'cheating, bluffing', value: 'angry_lied' },
      { label: 'Being disrespected', sub: 'tone, attitude', value: 'angry_disrespect' },
      { label: 'Losing control', sub: 'game or relationship', value: 'angry_control' },
      { label: 'Being ignored sexually', sub: 'cold shoulder', value: 'angry_ignored' },
      { label: 'Bad drivers', sub: 'traffic, slow cars', value: 'angry_drivers' }
    ]
  },
  {
    id: 'tabooRisk',
    type: 'pick-one-other',
    tier: 'core',
    question: 'What risky shit\nactually works on you?',
    hint: 'The turn-on you would not post online.',
    openers: ['Real answer — not the polite one.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'what actually works for you',
    otherMaxLength: 80,
    options: [
      { label: 'Almost getting caught', sub: 'parents, roommates nearby', value: 'caught_rush' },
      { label: 'Taboo / wrong person', sub: 'forbidden attraction', value: 'family_taboo' },
      { label: 'Public or strangers', sub: 'eyes on you', value: 'public_stranger' },
      { label: 'Fear or pain', sub: 'scared, hurt, turned on', value: 'pain_fear' },
      { label: 'Force fantasy (CNC)', sub: 'taken, not asked', value: 'cnc_risk' }
    ]
  },
  {
    id: 'quickKinks',
    type: 'quick-picks',
    tier: 'core',
    question: 'Pick 3 things\nyou\'re into',
    hint: 'Tap up to three. Bartender saves them.',
    openers: ['Three picks — then hit Next.'],
    max: 3,
    options: KINKS.slice(0, 18),
    required: false
  },
  {
    id: '_gate',
    type: 'gate',
    question: 'Basics done.\nWhat now?',
    hint: 'Start the game — or answer more questions.',
    openers: ['You can play now or add more details.']
  },
  {
    id: 'age',
    type: 'pick-one',
    tier: 'extended',
    question: 'How old\nare you?',
    hint: '18+ only.',
    openers: ['Pick your age range.'],
    required: false,
    autoAdvance: true,
    options: [
      { label: '18 – 21', sub: 'young adult', value: 20 },
      { label: '22 – 28', sub: '', value: 26 },
      { label: '29 – 35', sub: '', value: 32 },
      { label: '36+', sub: '', value: 40 }
    ]
  },
  {
    id: '_kinksLimits',
    type: 'kinks-limits',
    tier: 'extended',
    question: 'Into it\nor never?',
    hint: 'Green chips = yes. Red chips = hard no.',
    openers: ['Mark what you want and what is off limits.'],
    kinkOptions: KINKS,
    limitOptions: LIMITS,
    required: false
  },
  {
    id: 'fantasyPick',
    type: 'pick-one-other',
    tier: 'extended',
    question: 'Fantasy you\'d\nactually try?',
    hint: 'Drunk-you would really do this.',
    openers: ['Pick a scene — or describe your own.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'describe the fantasy',
    otherMaxLength: 100,
    options: [
      { label: 'Force at a funeral', sub: 'grief + CNC', value: 'fantasy_funeral_cnc' },
      { label: 'Sex with door unlocked', sub: 'could get caught', value: 'fantasy_public' },
      { label: 'Free use weekend', sub: 'no asking, just use', value: 'fantasy_freeuse' },
      { label: 'Humiliated in front of people', sub: 'room watches', value: 'fantasy_humiliation' },
      { label: 'Drunk sex, no memory', sub: 'blackout night', value: 'fantasy_drunk' }
    ]
  },
  {
    id: 'favDrink',
    type: 'pick-one-other',
    tier: 'extended',
    question: "What's your\ngo-to drink?",
    hint: 'What you drink on a night out.',
    openers: ['Pick your usual — scan the bottle later in-game.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'name your drink',
    otherMaxLength: 40,
    options: [
      { label: 'Beer', sub: '', value: 'Beer' },
      { label: 'Wine', sub: '', value: 'Wine' },
      { label: 'Whiskey', sub: 'shots or neat', value: 'Whiskey' },
      { label: 'Cocktail', sub: '', value: 'Cocktail' },
      { label: 'Tequila', sub: '', value: 'Tequila' },
      { label: 'Hard seltzer', sub: 'light drinker', value: 'Seltzer' }
    ]
  },
  {
    id: 'swearPick',
    type: 'pick-one-other',
    tier: 'extended',
    question: 'Main swear word\nyou use?',
    hint: 'Stubbed toe, bad card, orgasm — what comes out?',
    openers: ['The curse you say without thinking.'],
    required: false,
    autoAdvance: true,
    otherPlaceholder: 'your curse word',
    otherMaxLength: 30,
    options: [
      { label: 'Fuck', sub: '', value: 'fuck' },
      { label: 'Bhenchod', sub: '', value: 'bhenchod' },
      { label: 'Madarchod', sub: '', value: 'madarchod' },
      { label: 'Cunt', sub: '', value: 'cunt' },
      { label: 'Shit + fuck', sub: 'stacked', value: 'shit_fuck' }
    ]
  }
];

/** Live roast when user taps an answer (value → line). */
const PICK_REACT = {
  name: {
    Kunal: 'Kunal. Got it — prepare to get roasted.',
    Nandini: 'Nandini. Nice.',
    'Chaos goblin': 'No real name. Fine by us.',
    Anonymous: 'Anonymous. Mystery player.',
    __other__: 'Name saved. Bartender\'s watching.'
  },
  weight: {
    120: 'Light — drinks will hit you hard.',
    150: 'Middle weight. Normal night.',
    190: 'Heavier — you can take more.',
    230: 'Big frame. Pace yourself anyway.'
  },
  grandparentGrief: {
    grief_yes: 'Okay. Funeral jokes unlocked.',
    grief_sometimes: 'Sometimes. We hear you.',
    grief_never: 'Hard no. Respect.',
    grief_fantasy_only: 'Fantasy only. Noted.',
    __other__: 'You wrote that. Bold.'
  },
  shittyDriver: {
    driver_elite: 'Good driver? We\'ll see.',
    driver_avg: 'Average — horn optional.',
    driver_shitty: 'Honest. Stay off the road drunk.',
    driver_weapon: 'Dangerous. Got it.',
    __other__: 'Driving story filed.'
  },
  fucksPerDay: {
    fuck_rare: 'Under ten? Sure you do.',
    fuck_normal: 'Normal swearer.',
    fuck_heavy: 'You swear a lot. Good.',
    fuck_machine: 'Constant. Love it.',
    fuck_god: '100+. You are the main character.'
  },
  happyTrigger: {
    happy_power: 'Happy when partner gives in.',
    happy_risk: 'Thrill of almost caught.',
    happy_win: 'Winner\'s high.',
    happy_degrade: 'Likes being roasted.',
    happy_drunk: 'Party drunk = happy.',
    __other__: 'Custom happy trigger. Saved.'
  },
  angryTrigger: {
    angry_lied: 'Hates liars. Noted.',
    angry_disrespect: 'Don\'t disrespect them.',
    angry_control: 'Hates losing control.',
    angry_ignored: 'Hates being ignored in bed.',
    angry_drivers: 'Road rage. Classic.',
    __other__: 'That sets them off. Filed.'
  },
  tabooRisk: {
    caught_rush: 'Almost caught — works for you.',
    family_taboo: 'Taboo turn-on. Saved.',
    public_stranger: 'Public / strangers. Bold.',
    pain_fear: 'Fear or pain — works.',
    cnc_risk: 'CNC fantasy. Handle with care.',
    __other__: 'Custom risk. On file.'
  },
  age: {
    20: '18–21. Young crew.',
    26: '22–28.',
    32: '29–35.',
    40: '36+. Veteran.'
  },
  fantasyPick: {
    fantasy_funeral_cnc: 'Dark fantasy. Noted.',
    fantasy_public: 'Could-get-caught fantasy.',
    fantasy_freeuse: 'Free use weekend.',
    fantasy_humiliation: 'Public humiliation.',
    fantasy_drunk: 'Blackout drunk sex.',
    __other__: 'Custom fantasy. Jesus.'
  },
  favDrink: {
    Beer: 'Beer drinker.',
    Wine: 'Wine.',
    Whiskey: 'Whiskey. Respect.',
    Cocktail: 'Cocktails.',
    Tequila: 'Tequila — dangerous.',
    Seltzer: 'Light drinker.',
    __other__: 'Custom drink. Saved.'
  },
  swearPick: {
    fuck: 'Fuck. Classic.',
    bhenchod: 'Bhenchod. Loud and clear.',
    madarchod: 'Madarchod. Nuclear.',
    cunt: 'Cunt. Sharp.',
    shit_fuck: 'Shit and fuck combo.',
    __other__: 'Curse word locked in.'
  }
};

const KINK_CHIP_REACT = [
  'One down. Pick two more.',
  'Two. One more to go.',
  'Three — hit Next when ready.',
  'All three picked. Continue.',
  'That\'s three max. Stop there.',
  'Three max. Pick Next.'
];

/** Human-readable lines for bartender (preset values + raw other text). */
const PROFILE_LABELS = {
  grandparentGrief: {
    grief_yes: 'Admits grief/death (grandparents dying) is a turn-on',
    grief_sometimes: 'Sometimes horny around grief / funerals',
    grief_never: 'Grief/death is a hard limit',
    grief_fantasy_only: 'Grief kink — fantasy only'
  },
  shittyDriver: {
    driver_elite: 'Claims elite driver',
    driver_avg: 'Average chaotic driver',
    driver_shitty: 'Admits shitty fucking driver',
    driver_weapon: 'Car is a weapon — road rage'
  },
  fucksPerDay: {
    fuck_rare: 'Says fuck 0–10×/day (suspicious)',
    fuck_normal: 'Says fuck 11–30×/day',
    fuck_heavy: 'Says fuck 31–60×/day',
    fuck_machine: 'Says fuck 61–100×/day',
    fuck_god: 'Says fuck 100+×/day'
  },
  happyTrigger: {
    happy_power: 'Happy when partner submits',
    happy_risk: 'Happy when almost caught',
    happy_win: 'Happy when winning / dominating',
    happy_degrade: 'Happy when degraded',
    happy_drunk: 'Happy when drunk & loud'
  },
  angryTrigger: {
    angry_lied: 'Rage when lied to / bluffed',
    angry_disrespect: 'Rage when disrespected',
    angry_control: 'Rage when losing control',
    angry_ignored: 'Rage when ignored sexually',
    angry_drivers: 'Rage at shitty drivers'
  },
  tabooRisk: {
    caught_rush: 'Turned on by almost-caught risk',
    family_taboo: 'Family taboo risk',
    public_stranger: 'Public / stranger risk',
    pain_fear: 'Pain & fear kink',
    cnc_risk: 'CNC / force fantasy risk'
  },
  fantasyPick: {
    fantasy_funeral_cnc: 'Fantasy: CNC at a funeral',
    fantasy_public: 'Fantasy: public almost-caught',
    fantasy_freeuse: 'Fantasy: free use weekend',
    fantasy_humiliation: 'Fantasy: humiliation in front of room',
    fantasy_drunk: 'Fantasy: drunk raw chaos'
  },
  swearPick: {
    fuck: 'Swears: fuck',
    bhenchod: 'Swears: bhenchod',
    madarchod: 'Swears: madarchod',
    cunt: 'Swears: cunt/bitch',
    shit_fuck: 'Swears: shit+fuck stacked'
  }
};

function _profileLine(id, val) {
  if (!val) return null;
  const map = PROFILE_LABELS[id];
  if (map?.[val]) return map[val];
  return String(val);
}

/** Legacy movie-search step (not in QUESTIONS; kept for old profile edits). */
const MEDIA_QUICK = [];

// ─── Module state ─────────────────────────────────────────────────────────────
let _idx = 0;
let _answers = {};
let _el = null;
let _onComplete = null;
let _movieDebounce = null;
let _movieSelected = [];
let _advancing = false;

// ─── Public API ───────────────────────────────────────────────────────────────
export function hasProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    return !!(p?.name && p?.completedAt);
  } catch { return false; }
}

export function getProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null'); }
  catch { return null; }
}

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

export function initProfile(el, onComplete) {
  if (_el?._navAbort) _el._navAbort.abort();
  if (_el?._swipeHandler) {
    _el.removeEventListener('touchstart', _el._swipeStart);
    _el.removeEventListener('touchend', _el._swipeHandler);
  }

  _el = el;
  _onComplete = onComplete;
  _idx = 0;
  _answers = { ...(getProfile() ?? {}) };
  delete _answers.completedAt;
  _movieSelected = Array.isArray(_answers.mediaFaves) ? [..._answers.mediaFaves] : [];
  _advancing = false;

  el.innerHTML = `
    <div class="pf-top">
      <button type="button" class="pf-back" id="pf-back" aria-label="Go back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div class="pf-progress-track">
        <div class="pf-progress-fill" id="pf-progress"></div>
      </div>
      <div class="pf-step-num" id="pf-step-num">1 / 5</div>
    </div>
    <nav class="pf-steps" id="pf-steps" aria-label="Question steps"></nav>
    <div class="pf-intro">
      <div class="pf-intro-label">Before the game</div>
      <div class="pf-intro-sub">Quick questions · tap an answer · skip any you hate</div>
    </div>
    <div class="pf-area" id="pf-area"></div>
    <div class="pf-bottom" id="pf-bottom">
      <button type="button" class="pf-skip" id="pf-skip">skip this one</button>
      <button type="button" class="pf-continue" id="pf-continue">continue</button>
    </div>`;

  _wireNavButtons();
  _wireSwipe(el);

  _render(0, 'init');
}

function _bindTap(el, fn) {
  if (!el) return;
  let last = 0;
  const handler = (e) => {
    if (e.type === 'pointerup' && e.pointerType === 'mouse' && e.button !== 0) return;
    const now = performance.now();
    if (now - last < 450) return;
    last = now;
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
  if ('PointerEvent' in window) el.addEventListener('pointerup', handler);
  else el.addEventListener('click', handler);
  return handler;
}

function _wireNavButtons() {
  _el?._navAbort?.abort();
  const ac = new AbortController();
  _el._navAbort = ac;
  const { signal } = ac;

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    let last = 0;
    const handler = (e) => {
      if (e.type === 'pointerup' && e.pointerType === 'mouse' && e.button !== 0) return;
      const now = performance.now();
      if (now - last < 450) return;
      last = now;
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    if ('PointerEvent' in window) el.addEventListener('pointerup', handler, { signal });
    else el.addEventListener('click', handler, { signal });
  };

  bind('pf-continue', _continue);
  bind('pf-skip', _skip);
  bind('pf-back', _back);
}

function _wireSwipe(el) {
  let startX = null;
  let startY = null;
  let swipeArmed = false;

  const onStart = e => {
    if (e.target.closest('#pf-bottom, .pf-pick-row, .pf-chip, .pf-step-dot, .pf-back')) return;
    const t = e.changedTouches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    swipeArmed = true;
  };
  const onEnd = e => {
    if (!swipeArmed || startX == null) return;
    swipeArmed = false;
    const t = e.changedTouches[0];
    if (!t) { startX = null; return; }
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    startX = null;
    startY = null;
    if (Math.abs(dx) < 72 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && _idx < QUESTIONS.length - 1) {
      _save(QUESTIONS[_idx]);
      _idx++;
      _render(_idx, 'fwd');
      haptic('light');
    } else if (dx > 0 && _idx > 0) {
      _save(QUESTIONS[_idx]);
      _idx--;
      _render(_idx, 'back');
      haptic('light');
    }
  };
  el._swipeStart = onStart;
  el._swipeHandler = onEnd;
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchend', onEnd, { passive: true });
}

// ─── Build roast context ──────────────────────────────────────────────────────
export function buildProfileContext(profile) {
  if (!profile?.name) return '';
  const lines = [
    `Name: ${profile.name}`,
    profile.age                                  ? `Age: ${profile.age}`                                                        : null,
    profile.describe5?.filter(Boolean).length    ? `Describes self as: ${profile.describe5.filter(Boolean).join(', ')}`        : null,
    profile.kinks?.length                        ? `Kinks: ${profile.kinks.join(', ')}`                                        : null,
    _profileLine('grandparentGrief', profile.grandparentGrief ?? profile.tabooGrief)
      ? `Grief/grandparents: ${_profileLine('grandparentGrief', profile.grandparentGrief ?? profile.tabooGrief)}` : null,
    _profileLine('shittyDriver', profile.shittyDriver)
      ? `Driving: ${_profileLine('shittyDriver', profile.shittyDriver)}` : null,
    _profileLine('fucksPerDay', profile.fucksPerDay)
      ? `Profanity: ${_profileLine('fucksPerDay', profile.fucksPerDay)}` : null,
    _profileLine('happyTrigger', profile.happyTrigger)
      ? `Happy when: ${_profileLine('happyTrigger', profile.happyTrigger)}` : null,
    _profileLine('angryTrigger', profile.angryTrigger)
      ? `Angry when: ${_profileLine('angryTrigger', profile.angryTrigger)}` : null,
    _profileLine('tabooRisk', profile.tabooRisk)
      ? `Risk kink: ${_profileLine('tabooRisk', profile.tabooRisk)}` : null,
    _profileLine('fantasyPick', profile.fantasyPick ?? profile.fantasyConfess)
      ? `Fantasy: ${_profileLine('fantasyPick', profile.fantasyPick ?? profile.fantasyConfess)}` : null,
    profile.favDrink                             ? `Drink: ${profile.favDrink}`                                                : null,
    _profileLine('swearPick', profile.swearPick ?? profile.swearWord)
      ? `Swears: ${_profileLine('swearPick', profile.swearPick ?? profile.swearWord)}` : null,
    profile.partnerRoast                         ? `Roast ammo: ${profile.partnerRoast}`                                       : null,
    profile.filthAdmit                           ? `Filth admit: ${profile.filthAdmit}`                                        : null,
    profile.mediaFaves?.length                   ? `Legacy media: ${profile.mediaFaves.join(', ')}`                            : null,
    profile.drinkWhy                             ? `Why they drink: ${profile.drinkWhy}`                                       : null,
    profile.limits?.length                       ? `OFF LIMITS — never reference: ${profile.limits.join(', ')}`                : null,
    // backward-compat
    profile.traits?.length                       ? `Traits: ${profile.traits.join(', ')}`                                      : null,
    profile.roastMaterial                        ? `Gets roasted for: ${profile.roastMaterial}`                               : null,
    profile.favoriteMovie                        ? `Fav movie: ${profile.favoriteMovie}`                                       : null,
    profile.offLimits                            ? `DO NOT MENTION: ${profile.offLimits}`                                      : null,
  ];
  return lines.filter(Boolean).join('\n');
}

// ─── DOM helpers (avoid duplicate IDs while cards animate out) ────────────────
function _activeCard() {
  const cards = document.querySelectorAll('#pf-area .pf-card');
  return cards.length ? cards[cards.length - 1] : null;
}

function _q(sel, root = _activeCard()) {
  return root?.querySelector(sel) ?? null;
}

function _chipsHTML(options, selected, onClass = 'pf-chip--on') {
  const sel = Array.isArray(selected) ? selected : [];
  const predefined = options.map(o =>
    `<button type="button" class="pf-chip${sel.includes(o) ? ` ${onClass}` : ''}" data-val="${_ea(o)}">${o}</button>`
  ).join('');
  const custom = sel.filter(s => !options.includes(s)).map(o =>
    `<button type="button" class="pf-chip ${onClass} pf-chip--custom" data-val="${_ea(o)}">${_e(o)} ×</button>`
  ).join('');
  return `${predefined}${custom}`;
}

function _optionsWithOther(q) {
  const opts = [...(q.options ?? [])];
  if (q.type === 'pick-one-other' && !opts.some(o => o.value === '__other__')) {
    opts.push({ label: 'Other…', value: '__other__', sub: q.otherSub ?? 'type your own' });
  }
  return opts;
}

function _resolvePickOne(q) {
  let stored;
  if (q.id === 'height') stored = _answers.height?.value;
  else if (q.id === 'weight') stored = _answers.weight?.value;
  else stored = _answers[q.id];

  if (stored == null || stored === '') return { selected: null, otherText: '' };

  const opts = _optionsWithOther(q);
  const hit = opts.find(o => o.value !== '__other__' && String(o.value) === String(stored));
  if (hit) return { selected: hit.value, otherText: '' };

  return { selected: '__other__', otherText: String(stored) };
}

function _pickOneSelected(q) {
  return _resolvePickOne(q).selected;
}

function _pickListHTML(q) {
  const { selected, otherText } = _resolvePickOne(q);
  const opts = _optionsWithOther(q);
  const rows = opts.map(o => {
    const on = selected != null && String(o.value) === String(selected);
    return `<button type="button" class="pf-pick-row${on ? ' pf-pick-row--on' : ''}" data-val="${_ea(String(o.value))}" role="option" aria-selected="${on}">
      <span class="pf-pick-copy">
        <span class="pf-pick-label">${o.label}</span>
        ${o.sub ? `<span class="pf-pick-sub">${o.sub}</span>` : ''}
      </span>
      <span class="pf-pick-check" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
    </button>`;
  }).join('');

  const otherOpen = selected === '__other__';
  const otherBlock = q.type === 'pick-one-other' ? `
    <div class="pf-other-wrap${otherOpen ? ' pf-other-wrap--open' : ''}" id="pf-other-wrap">
      <input class="pf-text-input pf-other-input" id="pf-other-input" type="text"
        placeholder="${_ea(q.otherPlaceholder ?? 'Type your answer…')}"
        maxlength="${q.otherMaxLength ?? 80}"
        autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"
        value="${_ea(otherText)}">
      <p class="pf-other-hint">tap <strong>Next</strong> when you're done</p>
    </div>` : '';

  return `<div class="pf-pick-list" role="listbox">${rows}</div>${otherBlock}`;
}

// ─── Input HTML ───────────────────────────────────────────────────────────────
function _inputHTML(q) {
  const val = _answers[q.id];

  if (q.type === 'pick-one' || q.type === 'pick-one-other') {
    return _pickListHTML(q);
  }

  if (q.type === 'text') {
    return `<input class="pf-text-input" id="pf-input" type="text"
      placeholder="${_ea(q.placeholder ?? '')}" maxlength="${q.maxLength ?? 100}"
      autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"
      value="${_ea(val ?? '')}">`;
  }

  if (q.type === 'number') {
    return `
      <div class="pf-numunit pf-numunit--solo">
        <button type="button" class="pf-stepper" data-d="-1">−</button>
        <input class="pf-num-input" id="pf-input" type="number"
          inputmode="numeric" pattern="[0-9]*"
          min="${q.min}" max="${q.max}" step="1"
          value="${val ?? ''}" placeholder="${q.placeholder ?? ''}">
        <button type="button" class="pf-stepper" data-d="1">+</button>
      </div>`;
  }

  if (q.type === 'body-stats') {
    const h = _answers.height ?? {};
    const w = _answers.weight ?? {};
    return `
      <div class="pf-body-stats">
        <div class="pf-body-stat">
          <label class="pf-body-label">HEIGHT</label>
          <div class="pf-numunit">
            <button type="button" class="pf-stepper" data-field="height" data-d="-1">−</button>
            <input class="pf-num-input pf-num-input--sm" id="pf-height-val" type="number"
              min="4.0" max="7.5" step="0.1" value="${h.value ?? ''}" placeholder="5.8">
            <button type="button" class="pf-stepper" data-field="height" data-d="1">+</button>
          </div>
          <div class="pf-body-unit">ft</div>
        </div>
        <div class="pf-body-stat">
          <label class="pf-body-label">WEIGHT</label>
          <div class="pf-numunit">
            <button type="button" class="pf-stepper" data-field="weight" data-d="-1">−</button>
            <input class="pf-num-input pf-num-input--sm" id="pf-weight-val" type="number"
              min="66" max="440" step="1" value="${w.value ?? ''}" placeholder="154">
            <button type="button" class="pf-stepper" data-field="weight" data-d="1">+</button>
          </div>
          <div class="pf-body-unit">lbs</div>
        </div>
      </div>`;
  }

  if (q.type === 'words5') {
    const stored = Array.isArray(val) ? val : ['', '', '', '', ''];
    const inputs = [0,1,2,3,4].map(i => `
      <input class="pf-word-input" id="pf-word-${i}" type="text"
        placeholder="Word ${i+1}" maxlength="20"
        autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"
        value="${_ea(stored[i] ?? '')}">`).join('');
    return `<div class="pf-words5">${inputs}</div>`;
  }

  if (q.type === 'chips-add') {
    const sel = Array.isArray(val) ? val : [];
    return `
      <div class="pf-chips" id="pf-chips-multi">${_chipsHTML(q.options, sel)}</div>
      <div class="pf-add-row">
        <input class="pf-add-input" id="pf-add-input" type="text"
          placeholder="Type your own fuck..." maxlength="40"
          autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
        <button type="button" class="pf-add-btn" id="pf-add-btn">Add</button>
      </div>`;
  }

  if (q.type === 'kinks-limits') {
    const kinks = Array.isArray(_answers.kinks) ? _answers.kinks : [];
    const limits = Array.isArray(_answers.limits) ? _answers.limits : [];
    return `
      <div class="pf-dual-section">
        <section class="pf-section-block pf-section-block--kinks">
          <div class="pf-section-head">
            <span class="pf-section-tag pf-section-tag--kink">🔥 INTO</span>
            <span class="pf-chips-count" id="pf-kinks-count">${kinks.length} picked</span>
          </div>
          <div class="pf-chips" id="pf-chips-kinks">${_chipsHTML(q.kinkOptions, kinks)}</div>
          <div class="pf-add-row">
            <input class="pf-add-input" id="pf-add-kinks" type="text"
              placeholder="Add a kink..." maxlength="40"
              autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
            <button type="button" class="pf-add-btn" id="pf-add-kinks-btn">Add</button>
          </div>
        </section>
        <section class="pf-section-block pf-section-block--limits">
          <div class="pf-section-head">
            <span class="pf-section-tag pf-section-tag--limit">🛑 OFF LIMITS</span>
            <span class="pf-chips-count" id="pf-limits-count">${limits.length} picked</span>
          </div>
          <div class="pf-chips pf-chips--limits" id="pf-chips-limits">${_chipsHTML(q.limitOptions, limits, 'pf-chip--on pf-chip--limit')}</div>
          <div class="pf-add-row">
            <input class="pf-add-input" id="pf-add-limits" type="text"
              placeholder="Add a limit..." maxlength="40"
              autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
            <button type="button" class="pf-add-btn pf-add-btn--limit" id="pf-add-limits-btn">Add</button>
          </div>
        </section>
      </div>`;
  }

  if (q.type === 'movie-search') {
    const selChips = _movieSelected.map(m =>
      `<button type="button" class="pf-chip pf-chip--on pf-chip--movie" data-val="${_ea(m)}">${_e(m)} ×</button>`
    ).join('');
    const quickChips = MEDIA_QUICK
      .filter(t => !_movieSelected.includes(t))
      .map(t => `<button type="button" class="pf-chip pf-chip--quick" data-val="${_ea(t)}">${_e(t)}</button>`)
      .join('');
    return `
      <div class="pf-movie-wrap">
        <div class="pf-chips pf-movie-quick" id="pf-movie-quick">${quickChips}</div>
        <div class="pf-movie-selected" id="pf-movie-selected">
          ${selChips || '<span class="pf-movie-empty">Nothing selected yet</span>'}
        </div>
        <input class="pf-text-input pf-text-input--sm" id="pf-movie-input" type="text"
          placeholder="Or search for a title…"
          autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
        <div class="pf-chips pf-movie-suggestions" id="pf-movie-suggestions"></div>
      </div>`;
  }

  if (q.type === 'drink-why') {
    return `
      <input class="pf-text-input" id="pf-drink-input" type="text"
        placeholder="e.g. tequila, whiskey, beer..." maxlength="50"
        autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"
        value="${_ea(_answers.favDrink ?? '')}">
      <textarea class="pf-textarea pf-textarea--sm" id="pf-why-input"
        placeholder="Why the fuck though..." maxlength="150">${_e(_answers.drinkWhy ?? '')}</textarea>`;
  }

  if (q.type === 'quick-picks') {
    const sel = Array.isArray(_answers.kinks) ? _answers.kinks : [];
    return `
      <p class="pf-quick-count" id="pf-quick-count">${_quickPickLabel(sel.length, q.max ?? 3)}</p>
      <div class="pf-chips" id="pf-chips-quick">${_chipsHTML(q.options, sel)}</div>`;
  }

  if (q.type === 'gate') {
    return `
      <div class="pf-gate">
        <button type="button" class="pf-gate-btn pf-gate-btn--play" id="pf-gate-play">🔥 Play now</button>
        <button type="button" class="pf-gate-btn pf-gate-btn--more" id="pf-gate-more">More questions</button>
      </div>`;
  }

  return '';
}

function _cardHTML(q) {
  const qLines = q.question.split('\n').map(l => `<span class="pf-q-line">${l}</span>`).join('');
  return `
    <div class="pf-card-inner">
      <h2 class="pf-q-text">${qLines}</h2>
      ${q.hint ? `<p class="pf-hint">${q.hint}</p>` : ''}
      <div class="pf-react" id="pf-react" role="status" aria-live="polite"></div>
      <div class="pf-input-wrap" id="pf-input-wrap">${_inputHTML(q)}</div>
    </div>`;
}

function _stepLabel(q) {
  return q.question.split('\n')[0].slice(0, 12);
}

function _renderStepDots() {
  const nav = document.getElementById('pf-steps');
  if (!nav) return;

  const GATE_IDX = QUESTIONS.findIndex(q => q.type === 'gate');
  const inCore = _idx <= GATE_IDX;

  // Only show the 5 dots for the current tier (core or extended)
  const visibleIdxs = inCore
    ? QUESTIONS.slice(0, GATE_IDX).map((_, i) => i)
    : QUESTIONS.slice(GATE_IDX + 1).map((_, i) => GATE_IDX + 1 + i);

  nav.innerHTML = visibleIdxs.map(i => {
    const q = QUESTIONS[i];
    const isOn = i === _idx;
    const isDone = i < _idx;
    return `<button type="button" class="pf-step-dot${isOn ? ' pf-step-dot--on' : ''}${isDone ? ' pf-step-dot--done' : ''}"
      data-idx="${i}" aria-label="${_ea(_stepLabel(q))}"
      aria-current="${isOn ? 'step' : 'false'}"></button>`;
  }).join('');

  nav.querySelectorAll('.pf-step-dot').forEach(btn => {
    btn.addEventListener('click', () => _goToStep(parseInt(btn.dataset.idx, 10)));
  });
}

function _goToStep(target) {
  if (target < 0 || target >= QUESTIONS.length || target === _idx) return;
  _save(QUESTIONS[_idx]);
  haptic('light');
  const dir = target > _idx ? 'fwd' : 'back';
  _idx = target;
  _render(_idx, dir);
}

function _render(idx, dir) {
  const q = QUESTIONS[idx];
  if (q.type === 'movie-search') {
    _movieSelected = Array.isArray(_answers.mediaFaves) ? [..._answers.mediaFaves] : _movieSelected;
  }

  const GATE_IDX = QUESTIONS.findIndex(q => q.type === 'gate');
  const CORE_COUNT = GATE_IDX; // questions before the gate
  const isCore = idx < GATE_IDX;
  const isGateQ = idx === GATE_IDX;
  const pct = isCore
    ? ((idx) / CORE_COUNT) * 100
    : isGateQ
      ? 100
      : 100;
  const bar = document.getElementById('pf-progress');
  if (bar) {
    if (dir === 'init') bar.style.transition = 'none';
    else bar.style.transition = 'width 0.45s cubic-bezier(0.4,0,0.2,1)';
    requestAnimationFrame(() => { if (bar) bar.style.width = `${pct}%`; });
  }

  const stepNum = document.getElementById('pf-step-num');
  if (stepNum) {
    if (isGateQ || idx > GATE_IDX) {
      const extIdx = idx - GATE_IDX;
      const extTotal = QUESTIONS.length - GATE_IDX - 1;
      stepNum.textContent = extIdx === 0 ? 'Core done' : `Bonus ${extIdx}/${extTotal}`;
    } else {
      stepNum.textContent = `${idx + 1} / ${CORE_COUNT}`;
    }
  }

  const back = document.getElementById('pf-back');
  if (back) back.style.visibility = idx > 0 ? 'visible' : 'hidden';

  const skip = document.getElementById('pf-skip');
  const cont = document.getElementById('pf-continue');
  const { selected: pickSel } = (q.type === 'pick-one' || q.type === 'pick-one-other')
    ? _resolvePickOne(q) : { selected: null };
  const hideContinue = q.type === 'gate'
    || (q.autoAdvance && pickSel && pickSel !== '__other__');
  const isGate = q.type === 'gate';
  if (skip) {
    skip.style.display = isGate ? 'none' : '';
    skip.classList.toggle('pf-skip--solo', hideContinue);
  }
  if (cont) {
    cont.textContent = idx >= QUESTIONS.length - 1 ? 'done — let\'s play' : 'next';
    cont.style.display = hideContinue ? 'none' : '';
    cont.disabled = false;
    cont.classList.remove('pf-continue--busy');
  }

  _renderStepDots();

  const card = document.createElement('div');
  card.className = 'pf-card';
  card.innerHTML = _cardHTML(q);

  const area = document.getElementById('pf-area');
  if (!area) return;
  area.querySelectorAll('.pf-card').forEach(c => c.remove());
  area.appendChild(card);

  if (typeof gsap !== 'undefined') {
    const fromY = dir === 'back' ? -40 : dir === 'init' ? 28 : 44;
    gsap.from(card, { y: fromY, opacity: 0, duration: 0.26, ease: 'power2.out' });
    const lines = card.querySelectorAll('.pf-q-line');
    if (lines.length) {
      gsap.from(lines, { y: 14, opacity: 0, duration: 0.32, stagger: 0.06, ease: 'power2.out', delay: 0.05 });
    }
  }

  setTimeout(() => {
    _wire(q);
    _showQuestionOpener(card, q);
  }, 60);

  if (q.type === 'text' || q.type === 'number') {
    setTimeout(() => _q('#pf-input', _activeCard())?.focus(), 120);
  }
}

function _updateChipCount(root, chipsSel, countSel) {
  const n = root?.querySelectorAll(`${chipsSel} .pf-chip--on`)?.length ?? 0;
  const el = _q(countSel, root);
  if (el) el.textContent = `${n} picked`;
}

function _wireChipsAdd(root, { chipsSel, inputSel, btnSel, options, onClass = 'pf-chip--on', onChange }) {
  root.querySelectorAll(`${chipsSel} .pf-chip`).forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('pf-chip--custom')) { btn.remove(); onChange?.(); haptic('light'); return; }
      btn.classList.toggle('pf-chip--on');
      if (onClass.includes('pf-chip--limit') && btn.classList.contains('pf-chip--on')) {
        btn.classList.add('pf-chip--limit');
      } else {
        btn.classList.remove('pf-chip--limit');
      }
      haptic('light');
      if (btn.classList.contains('pf-chip--on')) _chipPop(btn);
      onChange?.();
    });
  });

  const addInput = _q(inputSel, root);
  const doAdd = () => {
    const val = addInput?.value?.trim();
    if (!val) return;
    const chips = _q(chipsSel, root);
    const existing = [...(chips?.querySelectorAll('.pf-chip') ?? [])].find(b => b.dataset.val === val);
    if (existing) {
      existing.classList.add('pf-chip--on');
      if (onClass.includes('limit')) existing.classList.add('pf-chip--limit');
      _chipPop(existing);
      addInput.value = '';
      onChange?.();
      return;
    }
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `pf-chip ${onClass} pf-chip--custom`;
    chip.dataset.val = val;
    chip.textContent = `${val} ×`;
    chip.addEventListener('click', () => { chip.remove(); onChange?.(); haptic('light'); });
    chips?.appendChild(chip);
    _chipPop(chip);
    addInput.value = '';
    haptic('medium');
    onChange?.();
  };
  _q(btnSel, root)?.addEventListener('click', doAdd);
  addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
function _wire(q) {
  const root = _activeCard();
  if (!root) return;

  if (q.type === 'pick-one' || q.type === 'pick-one-other') {
    const opts = _optionsWithOther(q);
    root.querySelectorAll('.pf-pick-row').forEach(btn => {
      _bindTap(btn, () => {
        if (_advancing) return;
        const raw = btn.dataset.val;
        const option = opts.find(o => String(o.value) === raw);
        if (!option) return;
        root.querySelectorAll('.pf-pick-row').forEach(b => b.classList.remove('pf-pick-row--on'));
        btn.classList.add('pf-pick-row--on');

        if (option.value === '__other__') {
          _answers[q.id] = '__other__';
          const wrap = _q('#pf-other-wrap', root);
          wrap?.classList.add('pf-other-wrap--open');
          _pfReact(root, _pickReact(q.id, '__other__'));
          setTimeout(() => _q('#pf-other-input', root)?.focus(), 80);
          haptic('light');
          return;
        }

        if (q.id === 'height') _answers.height = { value: option.value, unit: 'ft' };
        else if (q.id === 'weight') _answers.weight = { value: option.value, unit: 'lb' };
        else _answers[q.id] = option.value;
        if (q.id === 'name') localStorage.setItem('gfy_player_name', String(option.value));

        _pfFlashPick(btn);
        _pfReact(root, _pickReact(q.id, option.value));
        haptic('medium');
        if (q.autoAdvance && option.value !== '__other__') {
          setTimeout(() => _continue(), 580);
        }
      });
    });
    const otherIn = _q('#pf-other-input', root);
    otherIn?.addEventListener('input', () => {
      const t = otherIn.value.trim();
      if (t.length > 2) _pfReact(root, 'Good — keep typing if you need to.');
    });
    otherIn?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _continue(); }
    });
  }

  if (q.type === 'text') {
    _q('#pf-input', root)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _continue(); }
    });
  }

  if (q.type === 'number') {
    root.querySelectorAll('.pf-stepper').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = _q('#pf-input', root);
        if (!input) return;
        const cur = parseInt(input.value, 10);
        const base = Number.isNaN(cur) ? q.min : cur;
        const next = Math.min(q.max, Math.max(q.min, base + parseInt(btn.dataset.d, 10)));
        input.value = next;
        haptic('light');
      });
    });
    _q('#pf-input', root)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _continue(); }
    });
  }

  if (q.type === 'body-stats') {
    root.querySelectorAll('.pf-stepper').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const input = _q(field === 'height' ? '#pf-height-val' : '#pf-weight-val', root);
        if (!input) return;
        const isH = field === 'height';
        const [min, max, step] = isH ? [4.0, 7.5, 0.1] : [66, 440, 1];
        const cur = parseFloat(input.value);
        const base = Number.isNaN(cur) ? (isH ? parseFloat(input.placeholder) : parseInt(input.placeholder, 10)) : cur;
        const delta = parseInt(btn.dataset.d, 10) * step;
        const next = Math.min(max, Math.max(min, base + delta));
        input.value = isH ? next.toFixed(1) : String(Math.round(next));
        haptic('light');
      });
    });
  }

  if (q.type === 'words5') {
    for (let i = 0; i < 5; i++) {
      _q(`#pf-word-${i}`, root)?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const next = _q(`#pf-word-${i + 1}`, root);
          if (next) next.focus(); else _continue();
        }
      });
    }
  }

  if (q.type === 'chips-add') {
    _wireChipsAdd(root, {
      chipsSel: '#pf-chips-multi',
      inputSel: '#pf-add-input',
      btnSel: '#pf-add-btn',
      options: q.options
    });
  }

  if (q.type === 'kinks-limits') {
    _wireChipsAdd(root, {
      chipsSel: '#pf-chips-kinks',
      inputSel: '#pf-add-kinks',
      btnSel: '#pf-add-kinks-btn',
      options: q.kinkOptions,
      onChange: () => _updateChipCount(root, '#pf-chips-kinks', '#pf-kinks-count')
    });
    _wireChipsAdd(root, {
      chipsSel: '#pf-chips-limits',
      inputSel: '#pf-add-limits',
      btnSel: '#pf-add-limits-btn',
      options: q.limitOptions,
      onClass: 'pf-chip--on pf-chip--limit',
      onChange: () => _updateChipCount(root, '#pf-chips-limits', '#pf-limits-count')
    });
  }

  if (q.type === 'quick-picks') {
    const max = q.max ?? 3;
    root.querySelectorAll('#pf-chips-quick .pf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const on = btn.classList.contains('pf-chip--on');
        const count = root.querySelectorAll('#pf-chips-quick .pf-chip--on').length;
        if (!on && count >= max) {
          haptic('heavy');
          _shake(root.querySelector('#pf-quick-count'));
          _pfReact(root, KINK_CHIP_REACT[5] ?? 'Three max. That\'s enough.');
          return;
        }
        btn.classList.toggle('pf-chip--on');
        haptic('light');
        if (btn.classList.contains('pf-chip--on')) _chipPop(btn);
        const n = root.querySelectorAll('#pf-chips-quick .pf-chip--on').length;
        const el = _q('#pf-quick-count', root);
        if (el) el.textContent = _quickPickLabel(n, max);
        _pfReact(root, KINK_CHIP_REACT[Math.min(n, KINK_CHIP_REACT.length - 1)] ?? 'Saved.');
      });
    });
  }

  if (q.type === 'gate') {
    _q('#pf-gate-play', root)?.addEventListener('click', () => {
      _pfReact(root, 'Let\'s fucking play.');
      haptic('heavy');
      _complete();
    });
    _q('#pf-gate-more', root)?.addEventListener('click', () => {
      _pfReact(root, 'More questions. Go ahead.');
      haptic('medium');
      if (_idx < QUESTIONS.length - 1) { _idx++; _render(_idx, 'fwd'); }
    });
  }

  if (q.type === 'movie-search') {
    const movieInput = _q('#pf-movie-input', root);
    movieInput?.addEventListener('input', () => {
      clearTimeout(_movieDebounce);
      const query = movieInput.value.trim();
      const suggestEl = _q('#pf-movie-suggestions', root);
      if (!query) { if (suggestEl) suggestEl.innerHTML = ''; return; }
      _movieDebounce = setTimeout(() => _fetchMovieSuggestions(query, root), 600);
    });
    movieInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = movieInput.value.trim();
        const suggestEl = _q('#pf-movie-suggestions', root);
        if (val) { _addMovie(val, root); movieInput.value = ''; if (suggestEl) suggestEl.innerHTML = ''; }
      }
    });
    root.querySelectorAll('.pf-chip--movie').forEach(btn => {
      btn.addEventListener('click', () => {
        _movieSelected = _movieSelected.filter(m => m !== btn.dataset.val);
        btn.remove(); haptic('light'); _updateMovieEmpty();
      });
    });
    root.querySelectorAll('.pf-chip--quick').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_movieSelected.length >= 3) { haptic('heavy'); return; }
        _addMovie(btn.dataset.val, root);
        btn.style.opacity = '0.28';
        btn.style.pointerEvents = 'none';
        haptic('light');
      });
    });
  }
}

function _fetchMovieSuggestions(query, root = _activeCard()) {
  const suggestEl = _q('#pf-movie-suggestions', root);
  if (!suggestEl) return;
  suggestEl.innerHTML = `<span class="pf-loading">🎬 Finding filth...</span>`;
  fetch('/api/movie-suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  .then(r => r.json())
  .then(data => {
    const sug = (data.suggestions ?? []).filter(s => !_movieSelected.includes(s));
    suggestEl.innerHTML = sug.map(s =>
      `<button type="button" class="pf-chip pf-chip--suggest" data-val="${_ea(s)}">${_e(s)}</button>`
    ).join('');
    suggestEl.querySelectorAll('.pf-chip--suggest').forEach(btn => {
      btn.addEventListener('click', () => {
        _addMovie(btn.dataset.val, root);
        btn.remove();
        haptic('light');
      });
    });
  })
  .catch(() => { suggestEl.innerHTML = ''; });
}

function _addMovie(title, root = _activeCard()) {
  if (_movieSelected.includes(title)) return;
  if (_movieSelected.length >= 3) {
    haptic('heavy');
    return;
  }
  _movieSelected.push(title);
  const selectedEl = _q('#pf-movie-selected', root);
  if (!selectedEl) return;
  selectedEl.querySelector('.pf-movie-empty')?.remove();
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'pf-chip pf-chip--on pf-chip--movie';
  chip.dataset.val = title;
  chip.textContent = `${title} ×`;
  chip.addEventListener('click', () => {
    _movieSelected = _movieSelected.filter(m => m !== title);
    chip.remove(); haptic('light'); _updateMovieEmpty(root);
  });
  selectedEl.appendChild(chip);
  _chipPop(chip);
}

function _updateMovieEmpty(root = _activeCard()) {
  const el = _q('#pf-movie-selected', root);
  if (el && !el.querySelector('.pf-chip')) {
    el.innerHTML = '<span class="pf-movie-empty">Nothing selected yet</span>';
  }
}

// ─── Read / Save / Navigate ───────────────────────────────────────────────────
function _readValue(q) {
  const root = _activeCard();
  switch (q.type) {
    case 'pick-one':
      return _pickOneSelected(q) ?? null;
    case 'pick-one-other': {
      const sel = _resolvePickOne(q);
      if (sel.selected === '__other__') {
        const text = _q('#pf-other-input', root)?.value?.trim() ?? sel.otherText;
        return text || null;
      }
      if (q.id === 'weight') return sel.selected;
      return sel.selected;
    }
    case 'text':
      return _q('#pf-input', root)?.value?.trim() ?? '';
    case 'number': {
      const input = _q('#pf-input', root);
      const raw = input?.value?.trim() ?? '';
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? null : n;
    }
    case 'body-stats': {
      const hv = _q('#pf-height-val', root)?.value;
      const wv = _q('#pf-weight-val', root)?.value;
      return {
        height: hv ? { value: parseFloat(hv), unit: 'ft' } : null,
        weight: wv ? { value: parseFloat(wv), unit: 'lb' } : null
      };
    }
    case 'words5': {
      const words = [];
      for (let i = 0; i < 5; i++) words.push(_q(`#pf-word-${i}`, root)?.value?.trim() ?? '');
      return words.filter(Boolean);
    }
    case 'chips-add':
      return [...(root?.querySelectorAll('#pf-chips-multi .pf-chip--on') ?? [])].map(c => c.dataset.val);
    case 'kinks-limits':
      return {
        kinks: [...(root?.querySelectorAll('#pf-chips-kinks .pf-chip--on') ?? [])].map(c => c.dataset.val),
        limits: [...(root?.querySelectorAll('#pf-chips-limits .pf-chip--on') ?? [])].map(c => c.dataset.val)
      };
    case 'movie-search':
      return [..._movieSelected];
    case 'quick-picks':
      return [...(root?.querySelectorAll('#pf-chips-quick .pf-chip--on') ?? [])].map(c => c.dataset.val);
    case 'drink-why':
      return {
        favDrink: _q('#pf-drink-input', root)?.value?.trim() ?? '',
        drinkWhy: _q('#pf-why-input', root)?.value?.trim() ?? ''
      };
    default: return null;
  }
}

function _isValid(q, val) {
  if (!q.required) return true;
  if (q.type === 'number') {
    if (val === null || val === undefined || Number.isNaN(val)) return false;
    if (q.min != null && val < q.min) return false;
    if (q.max != null && val > q.max) return false;
    return true;
  }
  if (val === null || val === undefined || val === '') return false;
  if (Array.isArray(val) && !val.length) return false;
  return true;
}

function _save(q) {
  const val = _readValue(q);
  if (q.type === 'body-stats') {
    const { height, weight } = val || {};
    if (height) _answers.height = height;
    if (weight) _answers.weight = weight;
  } else if (q.type === 'kinks-limits') {
    const { kinks, limits } = val || {};
    if (kinks?.length) _answers.kinks = kinks;
    else delete _answers.kinks;
    if (limits?.length) _answers.limits = limits;
    else delete _answers.limits;
  } else if (q.type === 'drink-why') {
    const { favDrink, drinkWhy } = val || {};
    if (favDrink) _answers.favDrink = favDrink;
    if (drinkWhy) _answers.drinkWhy = drinkWhy;
  } else if (q.type === 'pick-one-other') {
    const text = typeof val === 'string' ? val.trim() : '';
    if (text) {
      _answers[q.id] = text;
      if (q.id === 'name') localStorage.setItem('gfy_player_name', text);
      if (q.id === 'favDrink') _answers.favDrink = text;
      if (q.id === 'swearPick') _answers.swearWord = text;
      if (q.id === 'fantasyPick') _answers.fantasyConfess = text;
    }
  } else if (q.type === 'quick-picks') {
    if (val?.length) _answers.kinks = val;
    else delete _answers.kinks;
  } else if (q.type === 'gate') {
    /* gate actions call _complete or advance directly */
  } else {
    const empty = val === null || val === '' || (Array.isArray(val) && !val.length);
    if (!empty) {
      if (q.id === 'weight' && typeof val === 'number') {
        _answers.weight = { value: val, unit: 'lb' };
      } else {
        _answers[q.id] = val;
      }
      if (q.id === 'name') localStorage.setItem('gfy_player_name', String(val));
    }
  }
  _persistAnswers();
}

function _persistAnswers() {
  const snapshot = { ..._answers };
  queueMicrotask(() => {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(snapshot)); } catch { /* quota */ }
  });
}

function _continue() {
  if (_advancing) return;
  _advancing = true;
  const q = QUESTIONS[_idx];
  const root = _activeCard();
  if (q.type === 'pick-one-other' && _resolvePickOne(q).selected === '__other__') {
    const text = _q('#pf-other-input', root)?.value?.trim();
    if (text) _pfReact(root, _pickReact(q.id, '__other__'));
  }
  if (q.type === 'quick-picks') {
    const n = root?.querySelectorAll('#pf-chips-quick .pf-chip--on')?.length ?? 0;
    if (n < (q.max ?? 3)) {
      _pfReact(root, `Pick ${q.max ?? 3} before you continue.`);
      _shake(_q('#pf-quick-count', root));
      haptic('heavy');
      _advancing = false;
      return;
    }
  }
  const cont = document.getElementById('pf-continue');
  cont?.classList.add('pf-continue--busy');
  document.activeElement?.blur?.();
  _save(q);
  haptic('medium');
  if (_idx < QUESTIONS.length - 1) { _idx++; _render(_idx, 'fwd'); }
  else _complete();
  requestAnimationFrame(() => { _advancing = false; });
}

function _skip() {
  if (_advancing) return;
  _advancing = true;
  const root = _activeCard();
  _pfReact(root, 'Skipped. Bartender will wing it.');
  document.activeElement?.blur?.();
  haptic('light');
  if (_idx < QUESTIONS.length - 1) { _idx++; _render(_idx, 'fwd'); }
  else _complete();
  requestAnimationFrame(() => { _advancing = false; });
}

function _back() {
  if (_idx === 0) return;
  _save(QUESTIONS[_idx]);
  haptic('light');
  _idx--;
  _render(_idx, 'back');
}

function _complete() {
  if (!_answers.name?.trim()) {
    _answers.name = 'Player';
    localStorage.setItem('gfy_player_name', _answers.name);
  }
  _answers.completedAt = Date.now();
  localStorage.setItem(PROFILE_KEY, JSON.stringify(_answers));
  refreshAvatarForProfile(_answers);
  prewarmAvatar(_answers);

  const bar = document.getElementById('pf-progress');
  if (bar) { bar.style.transition = 'width 0.4s ease'; bar.style.width = '100%'; }
  document.getElementById('pf-bottom')?.classList.add('pf-bottom--hidden');

  const displayName = _e(_answers.name);
  const area = document.getElementById('pf-area');
  const old = area?.querySelector('.pf-card');
  const card = document.createElement('div');
  card.className = 'pf-card pf-card--complete';
  card.innerHTML = `
    <div class="pf-complete-icon">🔥</div>
    <h2 class="pf-complete-title">You're in, ${displayName}.</h2>
    <p class="pf-complete-sub">Profile saved. Bartender's ready.<br>Now go fuck up the game.</p>`;

  if (area) {
    if (old && typeof gsap !== 'undefined') {
      area.appendChild(card);
      gsap.set(card, { y: 60, opacity: 0 });
      gsap.to(old, { y: -60, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: () => old.remove() });
      gsap.to(card, { y: 0, opacity: 1, duration: 0.55, ease: 'back.out(1.5)', delay: 0.12,
        onComplete: () => gsap.to('.pf-complete-icon', { rotationZ: 15, duration: 0.15, yoyo: true, repeat: 3, ease: 'power1.inOut' })
      });
    } else { if (old) old.remove(); area.appendChild(card); }
  }
  setTimeout(() => _onComplete?.(_answers), 1900);
}

// ─── Micro-interactions ───────────────────────────────────────────────────────
function _pickReact(qId, value) {
  return PICK_REACT[qId]?.[value] ?? PICK_REACT[qId]?.[String(value)] ?? 'Saved.';
}

function _quickPickLabel(n, max) {
  const lines = [
    `0 / ${max} — pick three`,
    `1 / ${max} — one down`,
    `2 / ${max} — one more`,
    `${max} / ${max} — all set, hit Next`
  ];
  return lines[Math.min(n, lines.length - 1)] ?? `${n} / ${max}`;
}

function _showQuestionOpener(card, q) {
  const openers = q.openers;
  if (!openers?.length) return;
  const line = openers[Math.floor(Math.random() * openers.length)];
  _pfReact(card, line, { soft: true });
}

function _pfReact(root, text, { soft = false } = {}) {
  const el = _q('#pf-react', root);
  if (!el || !text) return;
  el.textContent = text;
  el.classList.remove('pf-react--pop', 'pf-react--soft');
  el.classList.add(soft ? 'pf-react--soft' : 'pf-react--pop');
  void el.offsetWidth;
  if (typeof gsap !== 'undefined') {
    gsap.killTweensOf(el);
    gsap.fromTo(el, { scale: soft ? 0.98 : 0.92, opacity: soft ? 0.5 : 0 }, {
      scale: 1, opacity: 1, duration: soft ? 0.28 : 0.35, ease: 'back.out(2)'
    });
  }
}

function _pfFlashPick(btn) {
  btn.classList.add('pf-pick-row--flash');
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(btn, { scale: 0.97 }, { scale: 1, duration: 0.22, ease: 'power2.out' });
  }
  setTimeout(() => btn.classList.remove('pf-pick-row--flash'), 320);
}

function _shake(el) {
  if (!el || typeof gsap === 'undefined') return;
  gsap.killTweensOf(el);
  gsap.fromTo(el, { x: -10 }, { x: 10, duration: 0.08, ease: 'power2.out', yoyo: true, repeat: 5,
    onComplete: () => gsap.set(el, { x: 0 }) });
}

function _chipPop(btn) {
  if (typeof gsap === 'undefined') return;
  gsap.fromTo(btn, { scale: 0.86 }, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' });
}


function _e(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _ea(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
