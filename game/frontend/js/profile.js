import { haptic } from './mobile.js';

export const PROFILE_KEY = 'gfy_profile';

const URL_NAME_KEYS = { kunal: 'Kunal', nandini: 'Nandini' };

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
    type: 'text',
    question: 'What the fuck\nshould we call you?',
    placeholder: 'Your name',
    required: true,
    maxLength: 20
  },
  {
    id: 'age',
    type: 'number',
    question: 'How old are\nyou, fucker?',
    hint: '18+ only, obviously',
    required: true,
    min: 18, max: 99,
    placeholder: '25'
  },
  {
    id: '_body',
    type: 'body-stats',
    question: 'Height &\nWeight',
    hint: 'US system — calibrates your drunk meter',
    required: false
  },
  {
    id: 'kinks',
    type: 'chips-add',
    question: 'What gets you\nhard / wet?',
    hint: 'Public, CNC, taboo, drunk — pick or add your own filth',
    options: KINKS,
    required: false
  },
  {
    id: 'limits',
    type: 'chips-add',
    question: 'Hard fucking limits?',
    hint: 'Sacred lines. Bartender will NOT cross these.',
    options: LIMITS,
    required: false
  },
  {
    id: 'fantasyConfess',
    type: 'text',
    question: "Dirtiest fantasy\nyou'll actually admit?",
    placeholder: 'The one that would end you on roast night...',
    required: false,
    maxLength: 120
  },
  {
    id: 'partnerRoast',
    type: 'text',
    question: 'What should the bartender\nroast you for tonight?',
    placeholder: 'Kinks, habits, things Kunal/Nandini knows too well...',
    hint: 'This goes straight to Bhenchod Bartender. No mercy.',
    required: false,
    maxLength: 150
  },
  {
    id: 'mediaFaves',
    type: 'movie-search',
    question: 'Dark cinema\nthat owns you?',
    placeholder: 'Dhurandhar, Paatal Lok, Sacred Games...',
    hint: 'AI suggests more filth — tap to add',
    required: false
  },
  {
    id: '_drink',
    type: 'drink-why',
    question: "What's your\nfucking poison?",
    hint: 'Drink + why the fuck you drink it',
    required: false
  },
  {
    id: 'swearWord',
    type: 'text',
    question: "Fav fucking\nswear word?",
    placeholder: 'e.g. bhenchod, fuck, cunt...',
    required: false,
    maxLength: 30
  }
];

// ─── Module state ─────────────────────────────────────────────────────────────
let _idx = 0;
let _answers = {};
let _el = null;
let _onComplete = null;
let _movieDebounce = null;
let _movieSelected = [];

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
  _el = el;
  _onComplete = onComplete;
  _idx = 0;
  _answers = { ...(getProfile() ?? {}) };
  delete _answers.completedAt;
  _prefillFromUrl();
  _movieSelected = Array.isArray(_answers.mediaFaves) ? [..._answers.mediaFaves] : [];

  el.innerHTML = `
    <div class="pf-top">
      <button class="pf-back" id="pf-back" aria-label="Go back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div class="pf-progress-track">
        <div class="pf-progress-fill" id="pf-progress"></div>
      </div>
      <div class="pf-step-num" id="pf-step-num">1 / ${QUESTIONS.length}</div>
    </div>
    <div class="pf-intro">
      <div class="pf-intro-label">Kunal & Nandini's Filth File</div>
      <div class="pf-intro-sub">Kinks, limits, fantasies — everything Bhenchod Bartender needs to destroy you both.</div>
    </div>
    <div class="pf-area" id="pf-area"></div>
    <div class="pf-bottom" id="pf-bottom">
      <button class="pf-skip" id="pf-skip">Skip</button>
      <button class="pf-continue" id="pf-continue">Continue →</button>
    </div>`;

  document.getElementById('pf-back')?.addEventListener('click', _back);
  document.getElementById('pf-skip')?.addEventListener('click', _skip);
  document.getElementById('pf-continue')?.addEventListener('click', _continue);

  _render(0, 'init');
}

// ─── Build roast context ──────────────────────────────────────────────────────
export function buildProfileContext(profile) {
  if (!profile?.name) return '';
  const lines = [
    `Name: ${profile.name}`,
    profile.age                                  ? `Age: ${profile.age}`                                                        : null,
    profile.describe5?.filter(Boolean).length    ? `Describes self as: ${profile.describe5.filter(Boolean).join(', ')}`        : null,
    profile.kinks?.length                        ? `Kinks: ${profile.kinks.join(', ')}`                                        : null,
    profile.fantasyConfess                       ? `Dirtiest admitted fantasy: ${profile.fantasyConfess}`                      : null,
    profile.partnerRoast                         ? `Roast them for: ${profile.partnerRoast}`                                   : null,
    profile.mediaFaves?.length                   ? `Dark cinema they love: ${profile.mediaFaves.join(', ')}`                   : null,
    profile.favDrink                             ? `Drink of choice: ${profile.favDrink}`                                      : null,
    profile.drinkWhy                             ? `Why they drink it: ${profile.drinkWhy}`                                    : null,
    profile.swearWord                            ? `Fav swear word: ${profile.swearWord}`                                      : null,
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

// ─── Input HTML ───────────────────────────────────────────────────────────────
function _inputHTML(q) {
  const val = _answers[q.id];

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
    const predefined = q.options.map(o =>
      `<button type="button" class="pf-chip${sel.includes(o) ? ' pf-chip--on' : ''}" data-val="${_ea(o)}">${o}</button>`
    ).join('');
    const custom = sel.filter(s => !q.options.includes(s)).map(o =>
      `<button type="button" class="pf-chip pf-chip--on pf-chip--custom" data-val="${_ea(o)}">${_e(o)} ×</button>`
    ).join('');
    return `
      <div class="pf-chips" id="pf-chips-multi">${predefined}${custom}</div>
      <div class="pf-add-row">
        <input class="pf-add-input" id="pf-add-input" type="text"
          placeholder="Type your own fuck..." maxlength="40"
          autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
        <button type="button" class="pf-add-btn" id="pf-add-btn">Add</button>
      </div>`;
  }

  if (q.type === 'movie-search') {
    const selChips = _movieSelected.map(m =>
      `<button type="button" class="pf-chip pf-chip--on pf-chip--movie" data-val="${_ea(m)}">${_e(m)} ×</button>`
    ).join('');
    return `
      <div class="pf-movie-wrap">
        <input class="pf-text-input" id="pf-movie-input" type="text"
          placeholder="${_ea(q.placeholder ?? 'Type a movie or show...')}"
          autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">
        <div class="pf-chips pf-movie-suggestions" id="pf-movie-suggestions"></div>
        <div class="pf-movie-selected" id="pf-movie-selected">
          ${selChips || '<span class="pf-movie-empty">Nothing selected yet</span>'}
        </div>
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

  return '';
}

function _cardHTML(q) {
  const qLines = q.question.split('\n').map(l => `<span class="pf-q-line">${l}</span>`).join('');
  return `
    <div class="pf-card-inner">
      <h2 class="pf-q-text">${qLines}</h2>
      ${q.hint ? `<p class="pf-hint">${q.hint}</p>` : ''}
      <div class="pf-input-wrap" id="pf-input-wrap">${_inputHTML(q)}</div>
    </div>`;
}

function _render(idx, dir) {
  const q = QUESTIONS[idx];
  if (q.type === 'movie-search') {
    _movieSelected = Array.isArray(_answers.mediaFaves) ? [..._answers.mediaFaves] : _movieSelected;
  }

  const pct = (idx / QUESTIONS.length) * 100;
  const bar = document.getElementById('pf-progress');
  if (bar) {
    if (dir === 'init') bar.style.transition = 'none';
    else bar.style.transition = 'width 0.45s cubic-bezier(0.4,0,0.2,1)';
    requestAnimationFrame(() => { if (bar) bar.style.width = `${pct}%`; });
  }

  const stepNum = document.getElementById('pf-step-num');
  if (stepNum) stepNum.textContent = `${idx + 1} / ${QUESTIONS.length}`;

  const back = document.getElementById('pf-back');
  if (back) back.style.visibility = idx > 0 ? 'visible' : 'hidden';

  const skip = document.getElementById('pf-skip');
  const cont = document.getElementById('pf-continue');
  if (skip) skip.style.display = q.required ? 'none' : '';
  if (cont) {
    cont.textContent = idx === QUESTIONS.length - 1 ? "LET'S FUCKING GO 🔥" : 'Continue →';
    cont.style.flex = '1';
  }

  const card = document.createElement('div');
  card.className = 'pf-card';
  card.innerHTML = _cardHTML(q);

  const area = document.getElementById('pf-area');
  if (!area) return;
  area.querySelector('.pf-card')?.remove();
  area.appendChild(card);

  if (typeof gsap !== 'undefined') {
    const fromY = dir === 'back' ? -56 : dir === 'init' ? 48 : 72;
    gsap.from(card, { y: fromY, opacity: 0, duration: 0.44, ease: 'back.out(1.5)' });
  }

  setTimeout(() => _wire(q), 60);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
function _wire(q) {
  const root = _activeCard();
  if (!root) return;

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
    root.querySelectorAll('#pf-chips-multi .pf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('pf-chip--custom')) { btn.remove(); haptic('light'); return; }
        btn.classList.toggle('pf-chip--on');
        haptic('light');
        if (btn.classList.contains('pf-chip--on')) _chipPop(btn);
      });
    });

    const addInput = _q('#pf-add-input', root);
    const doAdd = () => {
      const val = addInput?.value?.trim();
      if (!val) return;
      const chips = _q('#pf-chips-multi', root);
      const existing = [...(chips?.querySelectorAll('.pf-chip') ?? [])].find(b => b.dataset.val === val);
      if (existing) { existing.classList.add('pf-chip--on'); _chipPop(existing); addInput.value = ''; return; }
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pf-chip pf-chip--on pf-chip--custom';
      chip.dataset.val = val;
      chip.textContent = `${val} ×`;
      chip.addEventListener('click', () => { chip.remove(); haptic('light'); });
      chips?.appendChild(chip);
      _chipPop(chip);
      addInput.value = '';
      haptic('medium');
    };
    _q('#pf-add-btn', root)?.addEventListener('click', doAdd);
    addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
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
    case 'movie-search':
      return [..._movieSelected];
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
  } else if (q.type === 'drink-why') {
    const { favDrink, drinkWhy } = val || {};
    if (favDrink) _answers.favDrink = favDrink;
    if (drinkWhy) _answers.drinkWhy = drinkWhy;
  } else {
    const empty = val === null || val === '' || (Array.isArray(val) && !val.length);
    if (!empty) {
      _answers[q.id] = val;
      if (q.id === 'name') localStorage.setItem('gfy_player_name', String(val));
    }
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(_answers));
}

function _continue() {
  const q = QUESTIONS[_idx];
  const val = _readValue(q);
  if (!_isValid(q, val)) {
    _shake(_q('#pf-input-wrap', _activeCard()));
    haptic('medium');
    return;
  }
  _save(q);
  haptic('medium');
  if (_idx < QUESTIONS.length - 1) { _idx++; _render(_idx, 'fwd'); }
  else _complete();
}

function _skip() {
  _save(QUESTIONS[_idx]);
  haptic('light');
  if (_idx < QUESTIONS.length - 1) { _idx++; _render(_idx, 'fwd'); }
  else _complete();
}

function _back() {
  if (_idx === 0) return;
  _save(QUESTIONS[_idx]);
  haptic('light');
  _idx--;
  _render(_idx, 'back');
}

function _complete() {
  if (!_answers.name) return;
  _answers.completedAt = Date.now();
  localStorage.setItem(PROFILE_KEY, JSON.stringify(_answers));

  const bar = document.getElementById('pf-progress');
  if (bar) { bar.style.transition = 'width 0.4s ease'; bar.style.width = '100%'; }
  document.getElementById('pf-bottom')?.classList.add('pf-bottom--hidden');

  const area = document.getElementById('pf-area');
  const old = area?.querySelector('.pf-card');
  const card = document.createElement('div');
  card.className = 'pf-card pf-card--complete';
  card.innerHTML = `
    <div class="pf-complete-icon">🔥</div>
    <h2 class="pf-complete-title">Let's fucking go.</h2>
    <p class="pf-complete-sub">Bhenchod Bartender has your kinks,<br>limits, and filth. Kunal & Nandini — you're fucked.</p>`;

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

function _prefillFromUrl() {
  const who = new URLSearchParams(window.location.search).get('who')?.toLowerCase();
  if (who && URL_NAME_KEYS[who] && !_answers.name) {
    _answers.name = URL_NAME_KEYS[who];
  }
}

function _e(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _ea(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
