import * as API from './api.js';
import { initMobile, acquireWakeLock, releaseWakeLock, haptic } from './mobile.js';
import { initBac } from './bac.js';
import { SCENARIOS, TOTAL_SETS } from './game.js';
import { apiPost } from './api.js';
import {
  hasProfile, getProfile, initProfile, clearProfile, buildProfileContext
} from './profile.js';
import {
  createSessionState, recordEvent, updateStatsFromAction, onBookComplete,
  formatSessionMemory
} from './session-memory.js';
import { clearExpiredChaos } from './chaos-events.js';
import { initLandingMotion, wireLandingJoin } from './landing.js';

let _pendingRoomCode = null;

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  screen: 'landing',
  myId: null,
  myHand: [],
  players: [],
  gameState: null,
  pendingDrinks: [],
  selectedCard: null,
  selectedTarget: null,
  roomCode: null,
  profile: null,
  playerStats: {},
  session: null,
  pendingDrinkChoice: null,
  pendingAsk: null,
  myPowers: null,
  _shownPendingDrinkKeys: new Set()
};

let _lastCommentedActionSig = null;
let _lastProcessedActionSig = null;
let _aiCooldownUntil = 0;
let _drag = null;
let _dealingLocked = false;

const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function rankSortKey(rank) {
  const i = RANK_ORDER.indexOf(rank);
  return i === -1 ? 99 : i;
}

function _clearHandTransform(wrapper) {
  if (!wrapper) return;
  if (gsapReady()) gsap.killTweensOf(wrapper);
  wrapper.style.transform = '';
  wrapper.style.zIndex = '';
}

function _syncHandSelectionClass(wrapper) {
  if (!wrapper) return;
  const selected = state.selectedCard?.rank === wrapper.dataset.rank;
  wrapper.classList.toggle('is-selected', selected);
  wrapper.style.zIndex = selected ? '50' : '';
}

// ─── Screen helpers ───────────────────────────────────────────────────────────
const SCREENS = ['landing', 'profile', 'home', 'lobby', 'game', 'toast', 'results'];

function showScreen(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  state.screen = name;
}

function $(id) { return document.getElementById(id); }

function showPhaseBanner(text, duration = 1800) {
  return new Promise(resolve => {
    const el = $('phase-banner');
    if (!el) { resolve(); return; }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      resolve();
    }, duration);
  });
}

async function runSetupSequence(msg) {
  _dealingLocked = true;
  $('hand-zone')?.classList.add('hand-zone--locked');
  $('center-zone')?.classList.add('center-zone--locked');
  $('my-books-row')?.classList.add('my-books-row--locked');

  await showPhaseBanner('🔀 Shuffling the deck…', 1500);
  await showPhaseBanner(`🃏 Dealing ${msg.cardsDealt} cards to each player`, 1600);
  await showPhaseBanner(`🌊 ${msg.deckCount} cards in the pond`, 1400);
  await showPhaseBanner(`${msg.firstPlayerName ?? 'Player'} goes first`, 1800);

  _dealingLocked = false;
  $('hand-zone')?.classList.remove('hand-zone--locked');
  $('center-zone')?.classList.remove('center-zone--locked');
  $('my-books-row')?.classList.remove('my-books-row--locked');

  renderHand();
  renderPartnerZone();
  renderMyBooks();
  updateGameHud();
  updateActionZone();
}

function updateGameHud() {
  const me = state.players.find(p => p.id === state.myId);
  const gs = state.gameState;
  if ($('my-score')) $('my-score').textContent = `📚 ${me?.books?.length ?? 0}`;
  if ($('deck-count')) $('deck-count').textContent = `🌊 ${gs?.deckCount ?? '—'}`;
  if ($('sets-progress')) {
    const done = gs?.completedSets ?? 0;
    const total = gs?.totalSets ?? TOTAL_SETS;
    $('sets-progress').textContent = `📦 ${done}/${total}`;
  }
  const pondCount = $('pond-count');
  if (pondCount) pondCount.textContent = gs?.deckCount > 0 ? String(gs.deckCount) : '';

  const hint = $('turn-hint');
  const partner = state.players.find(p => p.id !== state.myId);
  if (hint && gs?.phase === 'playing') {
    const cur = state.players.find(p => p.id === gs.currentTurnPlayerId);
    const isMe = gs.currentTurnPlayerId === state.myId;
    hint.classList.remove('hidden');
    hint.textContent = isMe
      ? `Your turn — swipe a card ↑ to ${partner?.name ?? 'them'} or tap card → tap their name`
      : `${cur?.name ?? '…'} is asking for a set…`;
  } else if (hint) {
    hint.classList.add('hidden');
  }
}

function renderMyBooks() {
  const row = $('my-books-row');
  if (!row) return;
  const me = state.players.find(p => p.id === state.myId);
  const books = me?.books ?? [];
  if (!books.length) {
    row.innerHTML = '<p class="books-empty">Completed sets appear here (4 of a kind)</p>';
    return;
  }
  row.innerHTML = books.map(scenario => {
    const meta = scenarioMeta(scenario);
    return `<div class="book-set"><span class="book-set-emoji">${meta.emoji}</span><span class="book-set-name">${scenario}</span></div>`;
  }).join('');
}

function flashLuckyDraw(action) {
  const drawn = action.drawnCard;
  if (!drawn) return;
  const banner = $('action-banner');
  if (!banner) return;
  const fromP = state.players.find(p => p.id === action.fromId);
  const s = scenarioMeta(drawn.scenario);
  banner.innerHTML = `
    <div class="lucky-draw-flash">
      <div class="lucky-draw-label">🍀 Lucky draw from the pond!</div>
      <div class="lucky-draw-card">${s.emoji} ${drawn.scenario}</div>
      <div class="lucky-draw-sub">${fromP?.name ?? 'Player'} shows the group — turn continues</div>
    </div>`;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4200);
}

// ─── Audio (Web Audio API) ────────────────────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playTone(freq, type, duration, vol = 0.22) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.value = vol;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch { /* AudioContext unavailable */ }
}

function playDeal() { playTone(440, 'sine', 0.08, 0.15); }

/** Subtle swoosh + soft tap — card thrown to partner / pond */
function playCardSlide() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const swooshDur = 0.11;
    const samples = Math.floor(ctx.sampleRate * swooshDur);
    const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      ch[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.7;
    const swooshGain = ctx.createGain();
    const t0 = ctx.currentTime;
    swooshGain.gain.setValueAtTime(0.035, t0);
    swooshGain.gain.exponentialRampToValueAtTime(0.001, t0 + swooshDur);
    noise.connect(bp);
    bp.connect(swooshGain);
    swooshGain.connect(ctx.destination);
    noise.start(t0);

    const tap = ctx.createOscillator();
    const tapGain = ctx.createGain();
    tap.type = 'sine';
    tap.frequency.setValueAtTime(220, t0 + 0.07);
    tap.frequency.exponentialRampToValueAtTime(110, t0 + 0.13);
    tapGain.gain.setValueAtTime(0.055, t0 + 0.07);
    tapGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    tap.connect(tapGain);
    tapGain.connect(ctx.destination);
    tap.start(t0 + 0.07);
    tap.stop(t0 + 0.15);
  } catch { /* AudioContext unavailable */ }
}

function playGFY()  { [220, 196, 165].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.15), i * 70)); }
function playBook() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.28), i * 90)); }
function playBookSlam() {
  [180, 220, 280, 440].forEach((f, i) => setTimeout(() => playTone(f, 'square', 0.12, 0.28), i * 55));
  setTimeout(playBook, 400);
}

function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function showAchievementToast(ach) {
  const el = $('achievement-toast');
  if (!el || !ach) return;
  el.textContent = `${ach.emoji} ${ach.label} unlocked!`;
  el.classList.add('is-visible');
  haptic('heavy');
  setTimeout(() => el.classList.remove('is-visible'), 3200);
}

function showChaosBanner(event) {
  const el = $('chaos-banner');
  if (!el || !event) return;
  el.innerHTML = `
    <div class="chaos-banner-title">${event.emoji} ${event.title}</div>
    <div class="chaos-banner-tag">${event.tagline}</div>`;
  el.classList.remove('hidden');
  el.classList.add('is-visible');
  haptic('heavy');
  recordEvent(state.session, {
    type: 'chaos',
    playerName: 'Room',
    summary: `Chaos: ${event.title}`
  });
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.classList.add('hidden'), 500);
  }, 4500);
}

// ─── GSAP guard ───────────────────────────────────────────────────────────────
function gsapReady() { return typeof gsap !== 'undefined'; }

// ─── Card rendering ───────────────────────────────────────────────────────────
function scenarioMeta(scenario) {
  return SCENARIOS.find(s => s.name === scenario) ?? { emoji: '🃏', dare: '' };
}

function renderCard(card, interactive = false) {
  const s = scenarioMeta(card.scenario);
  const div = document.createElement('div');
  div.className = 'card card--face';
  div.dataset.rank = card.rank;
  div.dataset.scenario = card.scenario;
  div.innerHTML = `
    <div class="card-rank">${card.rank}</div>
    <div class="card-emoji">${s.emoji}</div>
    <div class="card-name">${card.scenario}</div>
    <div class="card-dare">${s.dare}</div>`;
  if (interactive) { div.tabIndex = 0; div.setAttribute('role', 'button'); div.setAttribute('aria-label', card.scenario); }
  return div;
}

function renderCardBack() {
  const div = document.createElement('div');
  div.className = 'card card--back';
  div.innerHTML = `<div class="card-back-logo">GFY</div>`;
  return div;
}

function buildHandCardStack(card, count, interactive) {
  const stack = document.createElement('div');
  stack.className = 'hand-card-stack';

  if (count >= 3) {
    const layer2 = document.createElement('div');
    layer2.className = 'hand-card-stack__layer hand-card-stack__layer--2';
    layer2.setAttribute('aria-hidden', 'true');
    stack.appendChild(layer2);
  }
  if (count >= 2) {
    const layer1 = document.createElement('div');
    layer1.className = 'hand-card-stack__layer hand-card-stack__layer--1';
    layer1.setAttribute('aria-hidden', 'true');
    stack.appendChild(layer1);
  }

  stack.appendChild(renderCard(card, interactive));

  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'card-count-badge';
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count} cards of rank ${card.rank}`);
    stack.appendChild(badge);
  }

  return stack;
}

// ─── Hand rendering — horizontal row; duplicates stacked in one slot ─────────
function renderHand() {
  const zone = $('hand-zone');
  if (!zone) return;
  zone.innerHTML = '';

  const byRank = {};
  for (const c of state.myHand) {
    if (!byRank[c.rank]) byRank[c.rank] = [];
    byRank[c.rank].push(c);
  }

  const groups = Object.entries(byRank).sort(
    (a, b) => rankSortKey(a[0]) - rankSortKey(b[0])
  );
  const n = groups.length;
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;

  zone.classList.toggle('hand-zone--centered', n > 0 && n <= 3);

  groups.forEach(([rank, cards], i) => {
    const card = cards[0];
    const count = cards.length;
    const isSelected = state.selectedCard?.rank === rank;

    const wrapper = document.createElement('div');
    wrapper.className = 'hand-card-wrapper'
      + (isSelected ? ' is-selected' : '')
      + (count > 1 ? ' hand-card-wrapper--stacked' : '');
    wrapper.dataset.rank = rank;
    wrapper.dataset.scenario = card.scenario;
    wrapper.style.setProperty('--deal-i', i);
    if (isSelected) wrapper.style.zIndex = '50';

    wrapper.appendChild(buildHandCardStack(card, count, isMyTurn));
    zone.appendChild(wrapper);

    wrapper.addEventListener('touchstart', e => _onCardTouchStart(e, wrapper, card), { passive: true });
    wrapper.addEventListener('click', e => { e.stopPropagation(); _onCardTap(wrapper, card); });
  });

  updateActionZone();
  if (n > 0) playDeal();
}

// ─── Card tap — select / deselect with spring ─────────────────────────────────
function _onCardTap(wrapper, card) {
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  if (!isMyTurn || _askFlowBlocksPlay()) return;

  haptic('light');

  if (state.selectedCard?.rank === card.rank) {
    state.selectedCard = null;
    wrapper.classList.remove('is-selected');
    _clearHandTransform(wrapper);
  } else {
    if (state.selectedCard) {
      const prev = document.querySelector(`.hand-card-wrapper[data-rank="${state.selectedCard.rank}"]`);
      if (prev) {
        prev.classList.remove('is-selected');
        _clearHandTransform(prev);
      }
    }
    state.selectedCard = card;
    state.selectedTarget = null;
    wrapper.classList.add('is-selected');
    wrapper.style.zIndex = '50';
    _clearHandTransform(wrapper);
  }

  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  updateActionZone();
  updatePartnerHints();
}

// ─── Drag — physical card lift ────────────────────────────────────────────────
function _onCardTouchStart(e, wrapper, card) {
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  if (!isMyTurn || _askFlowBlocksPlay()) return;
  const t = e.touches[0];
  _drag = { wrapper, card, startX: t.clientX, startY: t.clientY, dx: 0, dy: 0, active: false, dropTarget: null };
  haptic('light');
}

function _setDragMode(on) {
  $('screen-game')?.classList.toggle('game--dragging', on);
}

function _hitDropZone(cx, cy) {
  const partners = document.querySelectorAll('.partner-drop');
  for (const el of partners) {
    const r = el.getBoundingClientRect();
    if (cx >= r.left - 12 && cx <= r.right + 12 && cy >= r.top - 12 && cy <= r.bottom + 16) {
      return { type: 'partner', playerId: el.dataset.pid, name: el.dataset.name, el };
    }
  }
  const pond = $('draw-pile-el');
  if (pond) {
    const r = pond.getBoundingClientRect();
    if (cx >= r.left - 16 && cx <= r.right + 16 && cy >= r.top - 16 && cy <= r.bottom + 16) {
      const opp = state.players.find(p => p.id !== state.myId);
      if (opp) return { type: 'pond', playerId: opp.id, name: opp.name, el: pond };
    }
  }
  return null;
}

function _updateDropHover(cx, cy) {
  document.querySelectorAll('.partner-drop, .draw-pile--drop').forEach(el => {
    el.classList.remove('drop-hot');
  });
  const hit = _hitDropZone(cx, cy);
  if (_drag) _drag.dropTarget = hit;
  hit?.el?.classList.add('drop-hot');
}

function _onDragMove(e) {
  if (!_drag) return;
  const t = e.touches ? e.touches[0] : e;
  _drag.dx = t.clientX - _drag.startX;
  _drag.dy = t.clientY - _drag.startY;

  if (!_drag.active && _drag.dy < -18) {
    _drag.active = true;
    e.preventDefault();
    _setDragMode(true);
    _drag.wrapper.classList.add('is-dragging');
    state.selectedCard = _drag.card;
    _drag.wrapper.classList.add('is-selected');
    _drag.wrapper.style.zIndex = '300';
  }

  if (_drag.active) {
    e.preventDefault();
    const baseY = -40;
    _drag.wrapper.style.transform =
      `translate(${_drag.dx}px, ${baseY + _drag.dy}px) rotate(${_drag.dx * 0.08}deg) scale(1.1)`;
    _updateDropHover(t.clientX, t.clientY);
  }
}

function _onDragEnd(e) {
  if (!_drag) return;
  const drag = _drag;
  _drag = null;
  _setDragMode(false);
  drag.wrapper?.classList.remove('is-dragging');
  document.querySelectorAll('.partner-drop, .draw-pile--drop').forEach(el => el.classList.remove('drop-hot'));

  const t = e.changedTouches?.[0];
  const drop = t ? _hitDropZone(t.clientX, t.clientY) : drag.dropTarget;

  if (drag.active && drop) {
    haptic('medium');
    state.selectedCard = drag.card;
    state.selectedTarget = { id: drop.playerId, name: drop.name };
    sendAsk();
    _springCardHome(drag.wrapper);
    return;
  }

  _springCardHome(drag.wrapper);
}

function _springCardHome(wrapper) {
  if (!wrapper) return;
  wrapper.classList.remove('is-dragging');
  _clearHandTransform(wrapper);
  _syncHandSelectionClass(wrapper);
}

// ─── GFY overlay — premium dramatic moment ────────────────────────────────────
function showGFYOverlay(askerName, targetName) {
  const overlay = $('gfy-overlay');
  const sub = $('gfy-sub');
  if (!overlay || !sub) return;

  sub.textContent = `${targetName} didn't have it.`;
  overlay.classList.remove('hidden');
  playGFY();
  haptic('heavy');

  if (gsapReady()) {
    // Screen flash + shake — physical rejection
    gsap.fromTo('#screen-game',
      { x: -16, filter: 'brightness(2)' },
      {
        x: 16,
        filter: 'brightness(1)',
        duration: 0.055,
        ease: 'power2.inOut',
        yoyo: true,
        repeat: 10,
        onComplete: () => gsap.set('#screen-game', { x: 0, filter: 'none' })
      }
    );
  }

  setTimeout(() => overlay.classList.add('hidden'), 2400);
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti(container) {
  if (!gsapReady() || !container) return;
  const COLORS = ['#0033A0', '#5B8DEF', '#FF3B30', '#30D158', '#0A84FF', '#A8D4FF', '#ffffff'];
  for (let i = 0; i < 56; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const size = 6 + Math.random() * 7;
    el.style.cssText = `background:${COLORS[i % COLORS.length]};left:${Math.random() * 100}%;width:${size}px;height:${size}px;border-radius:${Math.random() > 0.5 ? '50%' : '3px'}`;
    container.appendChild(el);
    gsap.fromTo(el,
      { y: -10, x: 0, rotation: Math.random() * 360, opacity: 1 },
      {
        y: `${55 + Math.random() * 85}vh`,
        x: `${(Math.random() - 0.5) * 140}px`,
        rotation: `+=${Math.random() * 720 - 360}`,
        opacity: 0,
        duration: 1.8 + Math.random() * 1.2,
        ease: 'power1.in',
        delay: Math.random() * 0.45,
        onComplete: () => el.remove()
      }
    );
  }
}

// ─── Partner zone (other player at top) ───────────────────────────────────────
function renderPartnerZone() {
  const zone = $('partner-zone');
  if (!zone) return;
  zone.innerHTML = '';

  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  const opponents = state.players.filter(p => p.id !== state.myId);

  if (!opponents.length) {
    zone.innerHTML = '<p class="partner-empty">Waiting for your partner…</p>';
    return;
  }

  opponents.forEach(p => {
    const isActive = p.isCurrentTurn;
    const isTargeted = state.selectedTarget?.id === p.id;
    const hasCardSelected = !!state.selectedCard;

    const div = document.createElement('div');
    div.className = `partner-drop${isActive ? ' partner-drop--active' : ''}${isTargeted ? ' targeted' : ''}${hasCardSelected && isMyTurn ? ' partner-drop--ready' : ''}`;
    div.dataset.pid = p.id;
    div.dataset.name = p.name;
    div.setAttribute('role', 'button');
    div.tabIndex = isMyTurn ? 0 : -1;

    const stack = document.createElement('div');
    stack.className = 'partner-stack';
    const show = Math.min(p.cardCount, 5);
    for (let i = 0; i < show; i++) {
      const b = renderCardBack();
      b.classList.add('partner-card-mini');
      stack.appendChild(b);
    }
    if (p.cardCount === 0) {
      stack.innerHTML = '<span class="partner-no-cards">No cards left</span>';
    }

    div.innerHTML = `
      <span class="partner-drop-badge">${isMyTurn ? 'DROP CARD TO ASK' : 'THEIR TURN'}</span>
      <div class="partner-drop-main">
        <div class="partner-stack-slot"></div>
        <div class="partner-meta">
          <span class="partner-name">${p.name}</span>
          <span class="partner-stats">🃏 ${p.cardCount} cards · 📚 ${p.books.length} sets</span>
          <span class="partner-hint">${isMyTurn ? '↑ Swipe a card here · or tap card then tap me' : 'Waiting for their ask…'}</span>
        </div>
      </div>`;
    div.querySelector('.partner-stack-slot')?.appendChild(stack);

    if (!isMyTurn) div.classList.add('partner-drop--disabled');
    if (isMyTurn) {
      div.addEventListener('click', () => selectPartner(p, div));
    }
    zone.appendChild(div);
  });
}

function updatePartnerHints() {
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  document.querySelectorAll('.partner-drop').forEach(el => {
    const hint = el.querySelector('.partner-hint');
    if (!hint) return;
    if (!isMyTurn) {
      hint.textContent = 'Waiting for their ask…';
      return;
    }
    if (state.selectedCard) {
      hint.textContent = `Tap to ask for "${state.selectedCard.scenario.slice(0, 32)}${state.selectedCard.scenario.length > 32 ? '…' : ''}"`;
      el.classList.add('partner-drop--ready');
    } else {
      hint.textContent = '↑ Swipe a card here · or tap card then tap me';
      el.classList.remove('partner-drop--ready');
    }
  });
}

function selectPartner(player, el) {
  if (state.gameState?.currentTurnPlayerId !== state.myId) return;
  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  if (state.selectedTarget?.id === player.id) {
    state.selectedTarget = null;
    updateActionZone();
    updatePartnerHints();
    return;
  }
  state.selectedTarget = player;
  el.classList.add('targeted');
  haptic('light');
  if (state.selectedCard) {
    sendAsk();
    return;
  }
  if (state.myPowers?.activeKickDoor && !state.myPowers.kickDoorUsed) {
    showKickDoorRankPicker(player);
    return;
  }
  updateActionZone();
  updatePartnerHints();
}

const ALL_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function showKickDoorRankPicker(partner) {
  const panel = $('reward-panel');
  const title = $('reward-panel-title');
  const actions = $('reward-panel-actions');
  if (!panel || !title || !actions) return;

  const held = new Set(state.myHand.map(c => c.rank));
  const ranks = ALL_RANKS.filter(r => !held.has(r));
  if (!ranks.length) {
    showBanner('You already hold every rank.');
    return;
  }

  title.textContent = `Kick Door — ask ${partner.name} for:`;
  actions.innerHTML = ranks.map(r =>
    `<button type="button" class="ask-response-btn ask-response-btn--bluff" data-rank="${r}">${r}</button>`
  ).join('');

  actions.querySelectorAll('[data-rank]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.classList.add('hidden');
      playCardSlide();
      haptic('medium');
      API.send({ type: 'ask', rank: btn.dataset.rank, targetId: partner.id });
      state.selectedTarget = null;
      document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
      if ($('action-zone')) $('action-zone').innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">⏳</span> Waiting…</p>`;
    }, { once: true });
  });
  panel.classList.remove('hidden');
}

// ─── Ask flow UI (bluff + bullshit) ───────────────────────────────────────────
function _rankLabel(rank) {
  return SCENARIOS.find(s => s.rank === rank)?.name ?? rank;
}

function _askFlowBlocksPlay() {
  const p = state.pendingAsk;
  if (!p) return false;
  return ['respond', 'resolve', 'waiting_target', 'waiting_bullshit'].includes(p.phase);
}

function sendRespondAsk(response) {
  haptic('medium');
  API.send({ type: 'respondAsk', response });
  $('ask-response-panel')?.classList.add('hidden');
}

function sendResolveAsk(action) {
  haptic(action === 'bullshit' ? 'heavy' : 'medium');
  API.send({ type: 'resolveAsk', action });
  $('bullshit-bar')?.classList.add('hidden');
}

function renderSpecialMovesBar() {
  const bar = $('special-moves-bar');
  if (!bar) return;
  const powers = state.myPowers;
  const isPlaying = state.gameState?.phase === 'playing';
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  const blocked = state.pendingAsk || state.pendingBookPowerup || state.luckyReward;

  if (!isPlaying || !isMyTurn || !powers || blocked) {
    bar.classList.add('hidden');
    return;
  }

  const parts = [];
  if (powers.stealToken > 0) {
    parts.push(`<button type="button" class="move-pill move-pill--steal" data-move="steal">Steal</button>`);
  }
  if (!powers.kickDoorUsed) {
    parts.push(`<button type="button" class="move-pill${powers.activeKickDoor ? ' move-pill--on' : ''}" data-move="kick_door">Kick Door</button>`);
  }
  if (!powers.doubleUsed) {
    parts.push(`<button type="button" class="move-pill${powers.activeDouble ? ' move-pill--on' : ''}" data-move="double">2×</button>`);
  }
  if (powers.luckyStacks > 0) {
    parts.push(`<span class="move-pill move-pill--disabled">${powers.luckyStacks}🍀</span>`);
  }

  if (!parts.length) {
    bar.classList.add('hidden');
    return;
  }

  bar.innerHTML = parts.join('');
  bar.querySelectorAll('[data-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      const move = btn.dataset.move;
      if (move === 'steal') {
        const opp = state.players.find(p => p.id !== state.myId);
        if (opp) API.send({ type: 'useMove', move: 'steal', targetId: opp.id });
      } else {
        API.send({ type: 'activateMove', move });
      }
      haptic('light');
    });
  });
  bar.classList.remove('hidden');
}

function renderRewardPanels() {
  const panel = $('reward-panel');
  const title = $('reward-panel-title');
  const actions = $('reward-panel-actions');
  if (!panel || !title || !actions) return;

  const book = state.pendingBookPowerup;
  const lucky = state.luckyReward;

  if (book?.choices?.length) {
    title.textContent = 'Book bonus — pick one:';
    actions.innerHTML = book.choices.map(c =>
      `<button type="button" class="ask-response-btn ask-response-btn--give" data-choice="${c.id}">${c.label}</button>`
    ).join('');
    actions.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        API.send({ type: 'bookPowerup', choice: btn.dataset.choice });
        panel.classList.add('hidden');
        haptic('medium');
      }, { once: true });
    });
    panel.classList.remove('hidden');
    return;
  }

  if (lucky?.choices?.length) {
    title.textContent = '3 lucky draws — pick one:';
    actions.innerHTML = lucky.choices.map(c =>
      `<button type="button" class="ask-response-btn ask-response-btn--bluff" data-choice="${c.id}">${c.label}</button>`
    ).join('');
    actions.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        API.send({ type: 'luckyReward', choice: btn.dataset.choice });
        panel.classList.add('hidden');
        haptic('medium');
      }, { once: true });
    });
    panel.classList.remove('hidden');
    return;
  }

  panel.classList.add('hidden');
}

function renderPeekBanner() {
  const peek = state.peekReveal;
  if (!peek || typeof peek !== 'object') return;
  const bits = Object.entries(peek).map(([r, n]) => `${r}: ${n}`).join(' · ');
  if (bits) showBanner(`👀 Peek — their ranks: ${bits}`);
  state.peekReveal = null;
}

function showMissionIntro() {
  const m = state.myPowers?.mission;
  if (!m || state._missionShown) return;
  state._missionShown = true;
  showBanner(`🎯 Your secret mission: ${m.text}`);
}

function checkMissionComplete() {
  const m = state.myPowers?.mission;
  if (!m?.done || state._missionDoneShown) return;
  state._missionDoneShown = true;
  showAchievementToast({ label: 'Mission complete', emoji: '🎯' });
  haptic('heavy');
}

function renderAskFlowUI() {
  const pending = state.pendingAsk;
  const panel = $('ask-response-panel');
  const bullBar = $('bullshit-bar');
  const title = $('ask-response-title');
  const actions = $('ask-response-actions');

  renderSpecialMovesBar();
  renderRewardPanels();

  if (!pending || state.gameState?.phase !== 'playing') {
    panel?.classList.add('hidden');
    bullBar?.classList.add('hidden');
    return;
  }

  if (pending.phase === 'respond') {
    bullBar?.classList.add('hidden');
    if (!title || !actions || !panel) return;
    title.textContent = `${pending.askerName} wants ${_rankLabel(pending.rank)}. You have:`;
    actions.innerHTML = '';
    if (pending.canGive) {
      const give = document.createElement('button');
      give.type = 'button';
      give.className = 'ask-response-btn ask-response-btn--give';
      give.textContent = 'Give cards';
      give.addEventListener('click', () => sendRespondAsk('give'), { once: true });
      actions.appendChild(give);
    }
    if (pending.canBluff) {
      const bluff = document.createElement('button');
      bluff.type = 'button';
      bluff.className = 'ask-response-btn ask-response-btn--bluff';
      bluff.textContent = 'Bluff (say GFY, keep cards)';
      bluff.addEventListener('click', () => sendRespondAsk('bluff'), { once: true });
      actions.appendChild(bluff);
    }
    if (pending.canGfy) {
      const gfy = document.createElement('button');
      gfy.type = 'button';
      gfy.className = 'ask-response-btn ask-response-btn--gfy';
      gfy.textContent = 'GFY — I don\'t have it';
      gfy.addEventListener('click', () => sendRespondAsk('gfy'), { once: true });
      actions.appendChild(gfy);
    }
    panel.classList.remove('hidden');
    return;
  }

  panel?.classList.add('hidden');

  if (pending.phase === 'resolve') {
    const label = $('bullshit-bar-label');
    if (label) {
      label.textContent = `They said GFY on ${_rankLabel(pending.rank)}. Trust it?`;
    }
    bullBar?.classList.remove('hidden');
    return;
  }

  bullBar?.classList.add('hidden');
}

function showBullshitOverlay(action) {
  const overlay = $('bullshit-overlay');
  const title = $('bullshit-overlay-title');
  const sub = $('bullshit-overlay-sub');
  const emoji = $('bullshit-overlay-emoji');
  if (!overlay || !title || !sub) return;

  const caller = state.players.find(p => p.id === action.fromId);
  const loser = state.players.find(p => p.id === action.targetId);
  const caught = action.type === 'bullshit_caught';

  if (emoji) emoji.textContent = caught ? '🐂' : '🤡';
  title.textContent = caught ? 'BULLSHIT!' : 'WRONG CALL';
  sub.textContent = caught
    ? `${loser?.name ?? 'They'} got caught lying — draws ${action.count ?? 4} cards. ${caller?.name ?? 'You'} keep the turn.`
    : `${caller?.name ?? 'You'} called bullshit on an honest GFY — draws ${action.count ?? 4}. Turn over.`;

  overlay.classList.remove('hidden');
  haptic('heavy');
  playGFY();

  setTimeout(() => overlay.classList.add('hidden'), 2800);
}

// ─── Action zone ──────────────────────────────────────────────────────────────
function updateActionZone() {
  const zone = $('action-zone');
  if (!zone) return;
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  const partner = state.players.find(p => p.id !== state.myId);
  const pending = state.pendingAsk;

  if (pending?.phase === 'respond') {
    zone.innerHTML = `<p class="action-guide action-guide--on"><span class="action-guide-icon">🎭</span> Pick <strong>Give</strong>, <strong>GFY</strong>, or <strong>Bluff</strong></p>`;
    return;
  }
  if (pending?.phase === 'waiting_bullshit') {
    zone.innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">🐂</span> They decide: accept or bullshit…</p>`;
    return;
  }
  if (pending?.phase === 'resolve') {
    zone.innerHTML = `<p class="action-guide action-guide--on"><span class="action-guide-icon">🐂</span> <strong>Accept</strong> = draw from pond · <strong>Bullshit</strong> = call the lie (wrong = you draw 4)</p>`;
    return;
  }
  if (pending?.phase === 'waiting_target') {
    zone.innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">⏳</span> Waiting for their answer…</p>`;
    return;
  }
  if (state.pendingBookPowerup) {
    zone.innerHTML = `<p class="action-guide action-guide--on"><span class="action-guide-icon">📚</span> Pick your book bonus below</p>`;
    return;
  }
  if (state.luckyReward) {
    zone.innerHTML = `<p class="action-guide action-guide--on"><span class="action-guide-icon">🍀</span> Pick your lucky reward below</p>`;
    return;
  }

  if (!isMyTurn) {
    const current = state.players.find(p => p.id === state.gameState?.currentTurnPlayerId);
    zone.innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">⏳</span> ${current?.name ?? 'Partner'} is picking a card to ask for…</p>`;
    return;
  }
  if (_askFlowBlocksPlay()) return;
  if (!state.selectedCard) {
    zone.innerHTML = `<p class="action-guide"><span class="action-guide-icon">①</span> Pick a card · swipe ↑ to ask</p>
      <p class="action-guide action-guide--sub"><span class="action-guide-icon">②</span> Use pills above for Steal / Kick Door / 2× (once each)</p>`;
    return;
  }
  if (!state.selectedTarget) {
    const short = state.selectedCard.scenario.length > 36
      ? `${state.selectedCard.scenario.slice(0, 36)}…`
      : state.selectedCard.scenario;
    zone.innerHTML = `<p class="action-guide action-guide--on"><span class="action-guide-icon">✓</span> <strong>${short}</strong></p>
      <p class="action-guide action-guide--sub"><span class="action-guide-icon">↑</span> Throw it at <strong>${partner?.name ?? 'partner'}</strong> — swipe or tap them</p>`;
    return;
  }

  zone.innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">📨</span> Releasing…</p>`;
}

function sendAsk() {
  if (!state.selectedCard || !state.selectedTarget || _askFlowBlocksPlay()) return;
  playCardSlide();
  haptic('medium');
  API.send({ type: 'ask', rank: state.selectedCard.rank, targetId: state.selectedTarget.id });
  state.selectedCard = null;
  state.selectedTarget = null;
  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  if ($('action-zone')) $('action-zone').innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">📨</span> Asked — waiting for their answer…</p>`;
  updatePartnerHints();
  renderHand();
}

// ─── Multi-stage book celebration ───────────────────────────────────────────
async function showBookCelebration(playerName, scenario, playerId) {
  const meta = scenarioMeta(scenario);
  const toastScreen = $('screen-toast');
  const el = $('toast-content');
  if (!el) return;

  showScreen('toast');
  haptic('heavy');

  // Stage 1 — cards slam together
  el.innerHTML = `
    <div class="book-stage book-stage--slam">
      <div class="book-slam-cards">
        <div class="book-slam-card">${meta.emoji}</div>
        <div class="book-slam-card">${meta.emoji}</div>
        <div class="book-slam-card">${meta.emoji}</div>
        <div class="book-slam-card">${meta.emoji}</div>
      </div>
      <div class="book-stage-label">SET LOCKED</div>
    </div>`;
  playBookSlam();
  await _wait(900);

  // Stage 2 — screen shake
  toastScreen?.classList.add('screen-shake');
  haptic('heavy');
  await _wait(550);
  toastScreen?.classList.remove('screen-shake');

  // Stage 3 — official book phrase
  el.innerHTML = `Sweet I officially have<br><span class="toast-card">${scenario}</span><br><span class="toast-name">— ${playerName}</span>`;
  if (gsapReady()) {
    gsap.from('#toast-content', { scale: 0.5, opacity: 0, duration: 0.5, ease: 'elastic.out(1, 0.45)' });
    launchConfetti($('screen-toast'));
  }
  await _wait(1400);

  // Stage 4 — dare chip (short, not a paragraph wall)
  const dareShort = meta.dare?.length > 120 ? `${meta.dare.slice(0, 117)}…` : meta.dare;
  el.innerHTML += `
    <div class="book-dare-chip">
      <strong>Dare</strong>
      ${dareShort ?? 'Do the filth.'}
    </div>`;
  if (gsapReady()) {
    gsap.from('.book-dare-chip', { y: 24, opacity: 0, duration: 0.4, ease: 'power2.out' });
  }
  await _wait(2200);

  if (state.screen === 'toast') showScreen('game');
}

// ─── Drink assignment UI ──────────────────────────────────────────────────────
const DRINK_PRESET_LABELS = [
  { label: 'Beer 🍺', drinkLabel: 'Beer' },
  { label: 'Wine 🍷', drinkLabel: 'Wine' },
  { label: 'Shot 🥃', drinkLabel: 'Shot' },
  { label: 'Cocktail 🍹', drinkLabel: 'Cocktail' }
];

function showChooseLoserDrink(msg) {
  const panel = $('drink-choice-panel');
  const content = $('drink-choice-content');
  if (!panel || !content || !msg.losers?.length) return;

  state.pendingDrinkChoice = msg;
  const loser = msg.losers[0];
  let selected = DRINK_PRESET_LABELS[0].drinkLabel;

  content.innerHTML = `
    <div class="drink-choice-sheet">
      <h2>Assign the drink</h2>
      <p>${loser.name} takes it for completing your set — <em>${msg.scenario.slice(0, 48)}${msg.scenario.length > 48 ? '…' : ''}</em></p>
      <div class="drink-choice-grid" id="drink-choice-grid">
        ${DRINK_PRESET_LABELS.map((d, i) =>
          `<button type="button" class="drink-choice-btn${i === 0 ? ' drink-choice-btn--selected' : ''}" data-drink="${d.drinkLabel}">${d.label}</button>`
        ).join('')}
      </div>
      <input class="drink-choice-custom" id="drink-choice-custom" type="text" placeholder="Or name their poison…" maxlength="40" autocomplete="off">
      <div class="drink-choice-actions">
        <button type="button" class="drink-choice-assign" id="drink-choice-assign">Assign drink</button>
      </div>
    </div>`;

  panel.classList.remove('hidden');
  haptic('medium');

  content.querySelectorAll('.drink-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.drink-choice-btn').forEach(b => b.classList.remove('drink-choice-btn--selected'));
      btn.classList.add('drink-choice-btn--selected');
      selected = btn.dataset.drink;
      haptic('light');
    });
  });

  $('drink-choice-assign')?.addEventListener('click', () => {
    const custom = $('drink-choice-custom')?.value?.trim();
    const drinkLabel = custom || selected;
    API.send({
      type: 'chooseDrink',
      loserId: loser.id,
      drinkLabel,
      scenario: msg.scenario
    });
    panel.classList.add('hidden');
    state.pendingDrinkChoice = null;
    haptic('heavy');
  }, { once: true });
}

function showDrinkAssignedModal(pending) {
  if (!pending?.length) return;
  const latest = pending[pending.length - 1];
  const key = `${latest.scenario}-${latest.drinkLabel}-${latest.assignedBy}`;
  if (state._shownPendingDrinkKeys.has(key)) return;
  state._shownPendingDrinkKeys.add(key);

  const modal = $('drink-assigned-modal');
  if (!modal) return;

  modal.innerHTML = `
    <div class="drink-assigned-box">
      <h2>Drink assigned</h2>
      <p>${latest.assignedBy ?? latest.toastFor ?? 'Partner'} says you drink:</p>
      <div class="drink-assigned-drink">${latest.drinkLabel}</div>
      <p style="font-size:13px;color:var(--text-secondary)">For set: ${latest.scenario.slice(0, 40)}…</p>
      <div class="drink-assigned-actions">
        <button type="button" class="drink-choice-assign" id="drink-log-now">🍺 Log it now</button>
        <button type="button" style="background:rgba(255,255,255,0.1);color:white" id="drink-skip">Skip</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  haptic('heavy');

  $('drink-log-now')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    $('bac-panel-container')?.classList.remove('hidden');
    haptic('light');
  }, { once: true });

  $('drink-skip')?.addEventListener('click', () => {
    API.send({ type: 'skipDrink', scenario: latest.scenario });
    modal.classList.add('hidden');
    haptic('light');
  }, { once: true });
}

// ─── Action banner ────────────────────────────────────────────────────────────
function showActionBanner(action) {
  const banner = $('action-banner');
  if (!banner) return;
  const fromP = state.players.find(p => p.id === action.fromId);
  const toP   = state.players.find(p => p.id === action.targetId);
  const sName = SCENARIOS.find(s => s.rank === action.rank)?.name ?? action.rank;
  let text = '';

  if (action.type === 'got') {
    text = `${fromP?.name ?? '?'} got ${action.count} "${sName}" from ${toP?.name ?? '?'} — turn continues!`;
  } else if (action.type === 'ask_pending') {
    text = `${fromP?.name ?? '?'} asked ${toP?.name ?? '?'} for "${sName}"…`;
  } else if (action.type === 'gfy_claim') {
    text = `${fromP?.name ?? '?'}: "Go Fuck Yourself!" on "${sName}" — ${toP?.name ?? '?'} can accept or call bullshit.`;
    playGFY();
  } else if (action.type === 'bullshit_caught' || action.type === 'bullshit_wrong') {
    showBullshitOverlay(action);
    return;
  } else if (action.type === 'steal') {
    text = `${fromP?.name ?? '?'} stole a card from ${toP?.name ?? '?'}.`;
    if (action.targetId === state.myId) showBanner('🃏 A card was stolen from your hand.');
  } else if (action.type === 'chaos') {
    text = `⚡ ${action.title} — ${action.text}`;
  } else if (action.type === 'gfy') {
    const lucky = action.continueTurn;
    text = lucky
      ? `🍀 ${fromP?.name ?? '?'} drew a match from the pond!`
      : `${toP?.name ?? '?'}: "Go Fuck Yourself!" — ${fromP?.name ?? '?'} draws from the pond.`;

    if (lucky) {
      playBook();
      flashLuckyDraw(action);
      return;
    }

    playGFY();
    if (action.fromId === state.myId) {
      showGFYOverlay(fromP?.name ?? 'You', toP?.name ?? '?');
    } else if (gsapReady()) {
      gsap.fromTo('#screen-game',
        { x: -8 },
        { x: 8, duration: 0.05, ease: 'power1.inOut', yoyo: true, repeat: 7,
          onComplete: () => gsap.set('#screen-game', { x: 0 }) });
    }
  }

  banner.innerHTML = text;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 3500);
}

// ─── Results screen ───────────────────────────────────────────────────────────
function showResults(data) {
  releaseWakeLock();
  const el = $('results-content');
  if (!el) return;
  const sorted = [...data.scores].sort((a, b) => b.books - a.books);
  el.innerHTML = `
    <div class="winner-announce">🏆 ${data.winner.name} wins!</div>
    <ul class="score-list">
      ${sorted.map((s, i) => `<li class="score-item">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${s.name} — ${s.books} set${s.books !== 1 ? 's' : ''}</li>`).join('')}
    </ul>`;
  if (gsapReady()) {
    gsap.from('.winner-announce', { scale: 0, rotation: -12, duration: 0.85, ease: 'elastic.out(1, 0.45)' });
    launchConfetti($('screen-results'));
  }
  showScreen('results');

  const winner = data.winner;
  const loser = sorted.find(s => s.name !== winner.name);
  setTimeout(() => triggerBartender('game_over', {
    playerName: winner.name,
    scenario:   `won with ${winner.books} set${winner.books !== 1 ? 's' : ''}${loser ? ` — ${loser.name} got cooked` : ''}`,
    profile:    getProfile(),
    otherPlayer: loser?.name ?? _partnerName(state.myId)
  }), 1200);
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  const list = $('lobby-player-list');
  if (!list) return;
  list.innerHTML = players.map(p =>
    `<li class="lobby-player${p.isHost ? ' is-host' : ''}">${p.name}${p.isHost ? ' (host)' : ''}</li>`
  ).join('');

  const wait = $('lobby-waiting');
  if (wait) {
    if (players.length >= 2) {
      wait.textContent = `${players.map(p => p.name).join(' & ')} — host can start`;
    } else if (players.length === 1) {
      wait.textContent = 'Waiting for your partner… (share the room code)';
    } else {
      wait.textContent = 'Waiting for players…';
    }
  }
}

function _sessionContextLabel() {
  const names = state.players?.map(p => p.name).filter(Boolean) ?? [];
  if (names.length >= 2) return names.join(' & ');
  if (names.length === 1) return `${names[0]} + partner`;
  return `${state.players?.length ?? 0} players`;
}

// ─── Home screen profile display ─────────────────────────────────────────────
const BARTENDER_PREVIEW_LINES = [
  "Bhenchod — dom/sub energy loaded. Paatal Lok writers could never.",
  "Dhurandhar-level filth on your questionnaire. Same team, zero mercy.",
  "Farzi chaos on the cards. Absolute cinema.",
  "Dhootha twist energy tonight. Dom in charge, sub taking it.",
  "Bad Boy of Bollywood roast loaded. Limits sacred. Kinks weaponized.",
  "The Night Manager of this room — bartender just narrates.",
  "Hathiram in Paatal Lok read your filth file. Case closed.",
  "Samay Raina meets Mirzapur — dom/sub, not couple warfare.",
];

function updateHomeForProfile(profile) {
  const greeting    = $('home-greeting');
  const nameForm    = $('home-name-form');
  const preview     = $('bartender-preview');
  const previewLine = $('bartender-preview-line');
  const nameEl      = $('home-greeting-name');
  const traitsEl    = $('home-greeting-traits');

  if (profile?.name) {
    greeting?.classList.remove('hidden');
    nameForm?.classList.add('hidden');
    if (nameEl) nameEl.textContent = `Hey, ${profile.name}`;
    if (traitsEl) {
      const bits = [];
      if (profile.kinks?.length) bits.push(profile.kinks.slice(0, 2).join(' · '));
      if (profile.limits?.length) bits.push(`${profile.limits.length} hard limit${profile.limits.length !== 1 ? 's' : ''}`);
      traitsEl.textContent = bits.join(' · ') || 'Filth file ready';
    }
    if (preview) preview.classList.remove('hidden');
    if (previewLine) {
      previewLine.textContent = BARTENDER_PREVIEW_LINES[Math.floor(Math.random() * BARTENDER_PREVIEW_LINES.length)];
    }
  } else {
    greeting?.classList.add('hidden');
    nameForm?.classList.remove('hidden');
    preview?.classList.add('hidden');
  }
}

// ─── Landing ──────────────────────────────────────────────────────────────────
function toggleLandingJoin() {
  haptic('light');
  const panel = $('landing-join-panel');
  const opening = !panel?.classList.contains('is-open');
  panel?.classList.toggle('is-open', opening);
  if (opening) {
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => $('input-landing-code')?.focus(), 350);
  }
}

function startFromLanding() {
  haptic('medium');
  _pendingRoomCode = null;
  if (hasProfile()) {
    state.profile = getProfile();
    updateHomeForProfile(state.profile);
    showScreen('home');
    if (gsapReady()) {
      gsap.from('#screen-home', { opacity: 0, y: 16, duration: 0.4, ease: 'power2.out' });
    }
  } else {
    startProfileFlow();
  }
}

function joinFromLanding(code) {
  const roomCode = code.trim().toUpperCase();
  if (!roomCode) {
    toggleLandingJoin();
    return;
  }
  haptic('medium');
  _pendingRoomCode = roomCode;

  const doJoin = () => {
    const profile = getProfile();
    const name = profile?.name ?? 'Player';
    API.send({
      type: 'join',
      roomCode,
      playerName: name,
      profile: profile ?? { name }
    });
    _pendingRoomCode = null;
  };

  if (hasProfile()) doJoin();
  else startProfileFlow(doJoin);
}

function wireLandingPage() {
  wireLandingJoin({
    onStart: startFromLanding,
    onJoinToggle: toggleLandingJoin,
    onJoinSubmit: joinFromLanding
  });
}

// ─── Profile → Home flow ──────────────────────────────────────────────────────
function startProfileFlow(afterComplete) {
  const wizard = $('profile-wizard');
  if (!wizard) return;
  initProfile(wizard, profile => {
    state.profile = profile;
    updateHomeForProfile(profile);
    if (afterComplete) {
      afterComplete();
      return;
    }
    showScreen('home');
    if (gsapReady()) {
      gsap.from('#screen-home', { opacity: 0, duration: 0.45, ease: 'power2.out' });
    }
  });
  showScreen('profile');
}

// ─── Bartender auto-trigger ───────────────────────────────────────────────────
function _buildPlayersContext() {
  return state.players
    .filter(p => p.profile)
    .map(p => buildProfileContext(p.profile))
    .filter(Boolean)
    .join('\n---\n');
}

function _partnerName(forPlayerId) {
  return state.players.find(p => p.id !== forPlayerId)?.name ?? null;
}

function dismissBartenderTranscript() {
  $('bartender-transcript')?.classList.add('hidden');
}

function showBartenderTranscript(line) {
  const overlay = $('bartender-transcript');
  const textEl = $('bartender-transcript-line');
  if (!overlay || !textEl) return;
  const one = (line ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  textEl.textContent = one.length > 140 ? `${one.slice(0, 137)}…` : one;
  overlay.classList.remove('hidden');
  haptic('light');
  if (gsapReady()) {
    gsap.from('.bartender-transcript-inner', {
      scale: 0.88,
      opacity: 0,
      duration: 0.35,
      ease: 'back.out(1.4)'
    });
  }
}

function _bartenderSessionContext(playerName) {
  const stats = state.playerStats[state.players.find(p => p.name === playerName)?.id ?? state.myId] ?? {};
  return formatSessionMemory(state.session, stats, playerName);
}

async function triggerBartender(mode, opts = {}) {
  const now = Date.now();
  if (now < _aiCooldownUntil) return;
  _aiCooldownUntil = now + 5000;

  const playersContext = opts.playersContext ?? _buildPlayersContext();
  const playerName = opts.playerName ?? 'Player';
  const sessionMemory = opts.sessionMemory ?? _bartenderSessionContext(playerName);

  const result = await apiPost('/api/host', {
    mode,
    playerName,
    scenario:   opts.scenario   ?? null,
    profile:    opts.profile    ?? null,
    playersContext,
    streakInfo: opts.streakInfo ?? null,
    otherPlayer: opts.otherPlayer ?? null,
    sessionMemory,
    gameContext: opts.gameContext ?? `${_sessionContextLabel()} session`
  }).catch(() => null);

  if (result?.line) showBartenderTranscript(result.line);
}

function _ensureStats(playerId) {
  if (!state.playerStats[playerId]) {
    state.playerStats[playerId] = {
      gfyMisses: 0, luckyDraws: 0, steals: 0, books: 0,
      consecutiveMisses: 0, successfulAsks: 0, consecutiveBooks: 0,
      _achievements: new Set()
    };
  }
  return state.playerStats[playerId];
}

function updatePlayerStats(action, players) {
  _ensureStats(action.fromId);
  _processAction(state.session, action, players);
  if (players) {
    players.forEach(p => { _ensureStats(p.id).books = p.books?.length ?? 0; });
  }
}

function _processAction(session, action, players) {
  if (!session) return;
  clearExpiredChaos(session);

  const earned = updateStatsFromAction(state.playerStats[action.fromId] ?? _ensureStats(action.fromId), action);
  earned.forEach(a => showAchievementToast(a));

  const fromP = players?.find(p => p.id === action.fromId);
  if (action.type === 'got') {
    recordEvent(session, {
      type: 'got',
      playerName: fromP?.name,
      summary: `${fromP?.name ?? '?'} stole ${action.count} cards`
    });
  } else if (action.type === 'gfy') {
    recordEvent(session, {
      type: action.continueTurn ? 'lucky' : 'gfy',
      playerName: fromP?.name,
      summary: action.continueTurn
        ? `${fromP?.name ?? '?'} lucky pond draw`
        : action.bluffSucceeded
          ? `${fromP?.name ?? '?'} ate a bluff GFY`
          : `${fromP?.name ?? '?'} GFY miss`
    });
    if (!action.continueTurn && session.pondTax && action.fromId === state.myId) {
      showDrinkAssignedModal([{
        scenario: 'Pond Tax',
        drinkLabel: 'One drink — Pond Tax',
        assignedBy: 'Chaos Event',
        toastFor: 'Bartender'
      }]);
    }
  } else if (action.type === 'bullshit_caught') {
    recordEvent(session, {
      type: 'bullshit',
      playerName: fromP?.name,
      summary: `${fromP?.name ?? '?'} caught ${players?.find(p => p.id === action.targetId)?.name ?? 'them'} lying`
    });
  } else if (action.type === 'bullshit_wrong') {
    recordEvent(session, {
      type: 'bullshit',
      playerName: fromP?.name,
      summary: `${fromP?.name ?? '?'} wrong bullshit call — draws 4`
    });
  }

  // Chaos events run on the server
}

// ─── WebSocket event routing ──────────────────────────────────────────────────
function wireHandlers() {
  API.onMessage('connected', () => $('connection-toast')?.classList.add('hidden'));
  API.onMessage('disconnected', () => $('connection-toast')?.classList.remove('hidden'));

  API.onMessage('roomCreated', msg => {
    state.myId = msg.playerId;
    state.roomCode = msg.roomCode;
    $('lobby-code').textContent = msg.roomCode;
    $('btn-start').classList.remove('hidden');
    $('room-code-display').textContent = msg.roomCode;
    showScreen('lobby');
  });

  API.onMessage('joined', msg => {
    state.myId = msg.playerId;
    state.roomCode = msg.roomCode;
    $('lobby-code').textContent = msg.roomCode;
    $('btn-start').classList.add('hidden');
    $('room-code-display').textContent = msg.roomCode;
    showScreen('lobby');
  });

  API.onMessage('rejoined', msg => {
    state.myId = msg.playerId;
    state.roomCode = msg.roomCode;
    $('room-code-display').textContent = msg.roomCode;
  });

  API.onMessage('playerList', msg => renderLobbyPlayers(msg.players));
  API.onMessage('playerJoined', () => { /* playerList follows */ });
  API.onMessage('botJoined', msg => showBanner(msg.message));

  API.onMessage('gameStarted', msg => {
    acquireWakeLock();
    state.playerStats = {};
    state.session = createSessionState();
    state._shownPendingDrinkKeys = new Set();
    state._missionShown = false;
    state._missionDoneShown = false;
    state._lastChaosSig = null;
    state._cardTaxShown = false;
    state.pendingBookPowerup = null;
    state.luckyReward = null;
    _lastCommentedActionSig = null;
    _lastProcessedActionSig = null;
    _aiCooldownUntil = 0;
    showScreen('game');
    runSetupSequence(msg);
  });

  API.onMessage('snapshot', msg => {
    state.myHand = msg.myHand;
    state.players = msg.players;
    state.gameState = msg.gameState;
    state.pendingDrinks = msg.pendingDrinks;
    state.pendingAsk = msg.gameState.pendingAsk ?? null;
    state.myPowers = msg.gameState.myPowers ?? null;
    state.pendingBookPowerup = msg.gameState.pendingBookPowerup ?? null;
    state.luckyReward = msg.gameState.luckyReward ?? null;
    if (msg.gameState.peekReveal) state.peekReveal = msg.gameState.peekReveal;
    if (msg.pendingDrinks?.length) showDrinkAssignedModal(msg.pendingDrinks);

    updateGameHud();

    if (!_dealingLocked) {
      renderHand();
      renderPartnerZone();
      renderMyBooks();
      renderAskFlowUI();
      renderRewardPanels();
      renderPeekBanner();
      showMissionIntro();
      checkMissionComplete();
      updateActionZone();
      updatePartnerHints();
    }

    if (msg.gameState.lastChaos) {
      const cs = JSON.stringify(msg.gameState.lastChaos);
      if (cs !== state._lastChaosSig) {
        state._lastChaosSig = cs;
        showBanner(`⚡ ${msg.gameState.lastChaos.title} — ${msg.gameState.lastChaos.text}`);
      }
    }

    if (msg.gameState.cardTax && !state._cardTaxShown) {
      state._cardTaxShown = true;
      showBanner('💸 Card Tax — next GFY miss draws 2');
    }

    if (msg.gameState.lastAction) {
      const action = msg.gameState.lastAction;
      const sig = JSON.stringify(action);

      if (sig !== _lastProcessedActionSig) {
        _lastProcessedActionSig = sig;
        updatePlayerStats(action, msg.players);
        showActionBanner(action);
      }

      if (sig !== _lastCommentedActionSig) {
        if (action.type === 'gfy' && action.fromId === state.myId) {
          _lastCommentedActionSig = sig;
          const mode = action.continueTurn ? 'lucky' : (action.bluffSucceeded ? 'bluff_win' : 'gfy');
          const stats = state.playerStats[state.myId] ?? {};
          const myName = state.players.find(p => p.id === state.myId)?.name ?? 'You';
          const streakInfo = !action.continueTurn && (stats.consecutiveMisses ?? 0) > 1
            ? `${stats.consecutiveMisses} misses in a row tonight`
            : action.continueTurn && (stats.luckyDraws ?? 0) > 1
              ? `Lucky draw number ${stats.luckyDraws} tonight`
              : null;
          setTimeout(() => triggerBartender(mode, {
            playerName: myName,
            scenario:   SCENARIOS.find(s => s.rank === action.rank)?.name,
            profile:    getProfile(),
            streakInfo,
            otherPlayer: state.players.find(p => p.id === action.targetId)?.name ?? _partnerName(state.myId)
          }), 3700);
        } else if (
          (action.type === 'bullshit_caught' || action.type === 'bullshit_wrong')
          && (action.fromId === state.myId || action.targetId === state.myId)
        ) {
          _lastCommentedActionSig = sig;
          const myName = state.players.find(p => p.id === state.myId)?.name ?? 'You';
          setTimeout(() => triggerBartender('bullshit', {
            playerName: myName,
            scenario: _rankLabel(action.rank),
            profile: getProfile(),
            streakInfo: action.type === 'bullshit_caught' ? 'caught a liar' : 'wrong bullshit call',
            otherPlayer: state.players.find(p => p.id === (action.fromId === state.myId ? action.targetId : action.fromId))?.name
          }), 3200);
        }
      }
    }
  });

  API.onMessage('bookComplete', msg => {
    onBookComplete(state.playerStats, msg.playerId);
    _ensureStats(msg.playerId).books++;
    recordEvent(state.session, {
      type: 'book',
      playerName: msg.playerName,
      summary: `${msg.playerName} completed book "${msg.scenario.slice(0, 30)}…"`
    });

    showBookCelebration(msg.playerName, msg.scenario, msg.playerId);

    const isMe = msg.playerId === state.myId;
    const profile = isMe
      ? getProfile()
      : state.players.find(p => p.id === msg.playerId)?.profile ?? null;
    const stats = state.playerStats[msg.playerId] ?? {};
    const streakInfo = stats.books > 1 ? `${stats.books} books completed tonight` : null;
    setTimeout(() => triggerBartender('book', {
      playerName: msg.playerName,
      scenario:   msg.scenario,
      profile,
      streakInfo,
      otherPlayer: _partnerName(msg.playerId)
    }), 4800);
  });

  API.onMessage('chooseLoserDrink', msg => showChooseLoserDrink(msg));

  API.onMessage('gameOver', msg => showResults(msg));
  API.onMessage('error', msg => showBanner(msg.message, true));
}

// ─── UI event wiring ──────────────────────────────────────────────────────────
function wireUI() {
  document.addEventListener('touchmove', _onDragMove, { passive: false });
  document.addEventListener('touchend', _onDragEnd, { passive: true });
  document.addEventListener('mousemove', _onDragMove);
  document.addEventListener('mouseup', _onDragEnd);

  $('btn-create')?.addEventListener('click', () => {
    const profile = getProfile();
    const name = profile?.name ?? $('input-name')?.value.trim();
    if (!name) { showBanner('Enter your name first!', true); return; }
    haptic('medium');
    API.send({ type: 'create', playerName: name, profile: profile ?? { name } });
  });

  $('btn-join')?.addEventListener('click', () => {
    const profile = getProfile();
    const name = profile?.name ?? $('input-name')?.value.trim();
    const code = $('input-code')?.value.trim().toUpperCase();
    if (!name || !code) { showBanner('Enter your name and a room code!', true); return; }
    haptic('medium');
    API.send({ type: 'join', roomCode: code, playerName: name, profile: profile ?? { name } });
  });

  $('btn-start')?.addEventListener('click', () => { haptic('heavy'); API.send({ type: 'start' }); });

  $('btn-copy-code')?.addEventListener('click', () => {
    const code = $('lobby-code')?.textContent;
    if (code) navigator.clipboard?.writeText(code).catch(() => {});
    haptic('light');
    const btn = $('btn-copy-code');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Code'; }, 1500); }
  });

  $('btn-play-again')?.addEventListener('click', () => {
    haptic('medium');
    API.send({ type: 'playAgain' });
  });

  $('btn-edit-profile')?.addEventListener('click', () => {
    clearProfile();
    startProfileFlow();
  });

  $('btn-ai-host')?.addEventListener('click', async () => {
    haptic('light');
    const me = state.players.find(p => p.id === state.myId);
    if (!me) return;

    const myBooks = me.books ?? [];
    const scenario = myBooks[myBooks.length - 1] ?? 'general chaos';
    const myProfile = getProfile();
    const stats = state.playerStats[state.myId] ?? {};

    const playersContext = _buildPlayersContext();

    const streakParts = [];
    if ((stats.consecutiveMisses ?? 0) > 1) streakParts.push(`${stats.consecutiveMisses} consecutive misses`);
    if ((stats.luckyDraws ?? 0) > 2) streakParts.push(`${stats.luckyDraws} lucky draws tonight`);
    if ((stats.books ?? 0) > 1) streakParts.push(`${stats.books} books collected`);

    _aiCooldownUntil = 0;
    const result = await apiPost('/api/host', {
      mode: 'roast',
      playerName: me.name,
      scenario,
      profile: myProfile,
      playersContext,
      streakInfo: streakParts.length ? streakParts.join(', ') : null,
      otherPlayer: _partnerName(state.myId),
      gameContext: `${_sessionContextLabel()}, books: ${myBooks.length}`
    }).catch(() => null);
    if (result?.line) showBartenderTranscript(result.line);
  });

  $('bartender-transcript')?.addEventListener('click', () => {
    haptic('light');
    dismissBartenderTranscript();
  });
  $('bartender-transcript')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dismissBartenderTranscript();
    }
  });

  $('btn-drink-log')?.addEventListener('click', () => {
    $('bac-panel-container')?.classList.toggle('hidden');
  });

  $('btn-accept-gfy')?.addEventListener('click', () => sendResolveAsk('accept'));
  $('btn-call-bullshit')?.addEventListener('click', () => sendResolveAsk('bullshit'));

  $('screen-toast')?.addEventListener('click', () => { if (state.screen === 'toast') showScreen('game'); });

  $('btn-side-games')?.addEventListener('click', async () => {
    const panel = $('sidegame-panel');
    const content = $('sidegame-content');
    if (!panel || !content) return;
    haptic('light');
    panel.classList.remove('hidden');
    const { renderHub } = await import('./sidegames/hub.js');
    const names = state.players.map(p => p.name);
    renderHub(content, names.length ? names : ['Player 1', 'Player 2']);
    content.querySelector('#hub-close-btn')?.addEventListener('click', () => panel.classList.add('hidden'), { once: true });
  });

  $('input-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join')?.click(); });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function showBanner(text, isError = false) {
  const banner = $('action-banner');
  if (!banner) return;
  banner.innerHTML = text;
  banner.classList.toggle('banner--error', isError);
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 3200);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function init() {
  initMobile();
  API.init();
  wireHandlers();
  wireUI();

  const bacContainer = $('bac-panel-container');
  if (bacContainer) {
    initBac(bacContainer, drink => {
      const payload = state.session?.powerHour
        ? { ...drink, oz: (drink.oz ?? 12) * 2, label: `${drink.label} (Power Hour)` }
        : drink;
      API.send({ type: 'logDrink', drink: payload });
    });
  }

  state.profile = getProfile();
  wireLandingPage();
  showScreen('landing');
  initLandingMotion();
  const hero = document.querySelector('.lp-hero-inner');
  if (hero) hero.classList.add('lp-in-view');
  if (gsapReady()) {
    gsap.fromTo('.lp-logo-lockup',
      { opacity: 0, y: 24, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power2.out' }
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
