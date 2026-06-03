import * as API from './api.js';
import { initMobile, acquireWakeLock, releaseWakeLock, haptic } from './mobile.js';
import { initBac } from './bac.js';
import { SCENARIOS, TOTAL_SETS } from './game.js';
import { apiPost } from './api.js';
import {
  hasProfile, getProfile, initProfile, clearProfile, buildProfileContext
} from './profile.js';
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
  playerStats: {}
};

let _lastCommentedActionSig = null;
let _aiCooldownUntil = 0;
let _drag = null;
let _dealingLocked = false;

// ─── Fan layout math — curved arc from center ─────────────────────────────────
function fanPosition(i, n) {
  if (n <= 1) return { x: 0, y: 0, rot: 0, z: 1 };
  const center = (n - 1) / 2;
  const offset = i - center;
  // Wider spread for smaller hands, tighter for large — feels physically natural
  const maxSpread = Math.min(56, 280 / (n - 1));
  const maxRot = Math.min(11, 50 / n);
  const arcDepth = 4; // parabolic depth — center card sits highest
  return {
    x:   offset * maxSpread,
    y:   offset * offset * arcDepth,
    rot: offset * maxRot,
    z:   n - Math.round(Math.abs(offset))
  };
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
function playGFY()  { [220, 196, 165].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.15), i * 70)); }
function playBook() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.28), i * 90)); }

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

// ─── Hand rendering (fan layout) ─────────────────────────────────────────────
function renderHand() {
  const zone = $('hand-zone');
  if (!zone) return;
  zone.innerHTML = '';

  const byScenario = {};
  for (const c of state.myHand) {
    if (!byScenario[c.scenario]) byScenario[c.scenario] = [];
    byScenario[c.scenario].push(c);
  }

  const groups = Object.entries(byScenario);
  const n = groups.length;
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;

  groups.forEach(([, cards], i) => {
    const card = cards[0];
    const isSelected = state.selectedCard?.rank === card.rank;
    const pos = fanPosition(i, n);

    const wrapper = document.createElement('div');
    wrapper.className = 'hand-card-wrapper' + (isSelected ? ' is-selected' : '');
    wrapper.dataset.rank = card.rank;
    wrapper.dataset.scenario = card.scenario;
    wrapper._fan = pos;
    wrapper.style.zIndex = isSelected ? 50 : pos.z;

    const el = renderCard(card, isMyTurn);
    if (cards.length > 1) {
      const badge = document.createElement('span');
      badge.className = 'card-count-badge';
      badge.textContent = cards.length;
      el.appendChild(badge);
    }
    wrapper.appendChild(el);
    zone.appendChild(wrapper);

    if (!gsapReady()) return;

    const gsapY = isSelected ? -40 : pos.y;
    const gsapScale = isSelected ? 1.08 : 1;
    gsap.set(wrapper, { x: pos.x, y: gsapY, rotation: pos.rot, scale: gsapScale });

    if (!isSelected) {
      // Staggered entrance — cards deal from bottom with spring
      gsap.from(wrapper, {
        y: pos.y + 130,
        opacity: 0,
        scale: 0.88,
        duration: 0.52,
        delay: i * 0.055,
        ease: 'back.out(1.5)',
        overwrite: true
      });
    }

    wrapper.addEventListener('touchstart', e => _onCardTouchStart(e, wrapper, card), { passive: true });
    wrapper.addEventListener('click', e => { e.stopPropagation(); _onCardTap(wrapper, card); });
  });

  updateActionZone();
  if (n > 0) playDeal();
}

// ─── Card tap — select / deselect with spring ─────────────────────────────────
function _onCardTap(wrapper, card) {
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  if (!isMyTurn) return;

  haptic('light');

  if (state.selectedCard?.rank === card.rank) {
    state.selectedCard = null;
    wrapper.classList.remove('is-selected');
    wrapper.style.zIndex = wrapper._fan.z;
    if (gsapReady()) {
      gsap.to(wrapper, { y: wrapper._fan.y, scale: 1, duration: 0.45, ease: 'back.out(1.6)', overwrite: true });
    }
  } else {
    if (state.selectedCard) {
      const prev = document.querySelector(`.hand-card-wrapper[data-rank="${state.selectedCard.rank}"]`);
      if (prev) {
        prev.classList.remove('is-selected');
        prev.style.zIndex = prev._fan?.z ?? 1;
        if (gsapReady()) {
          gsap.to(prev, { y: prev._fan?.y ?? 0, scale: 1, duration: 0.32, ease: 'back.out(1.5)', overwrite: true });
        }
      }
    }
    state.selectedCard = card;
    state.selectedTarget = null;
    wrapper.classList.add('is-selected');
    wrapper.style.zIndex = 50;
    if (gsapReady()) {
      gsap.to(wrapper, { y: -40, scale: 1.08, duration: 0.5, ease: 'elastic.out(1, 0.5)', overwrite: true });
    } else {
      wrapper.style.transform = 'translateY(-40px) scale(1.08)';
    }
  }

  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  updateActionZone();
  updatePartnerHints();
}

// ─── Drag — physical card lift ────────────────────────────────────────────────
function _onCardTouchStart(e, wrapper, card) {
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  if (!isMyTurn) return;
  const t = e.touches[0];
  _drag = { wrapper, card, startX: t.clientX, startY: t.clientY, dx: 0, dy: 0, active: false, dropTarget: null };
  haptic('light');
  if (gsapReady()) {
    gsap.to(wrapper, { scale: 1.07, duration: 0.14, ease: 'power2.out', overwrite: true });
  }
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
    state.selectedCard = _drag.card;
  }

  if (_drag.active) {
    e.preventDefault();
    const { x, y } = _drag.wrapper._fan ?? { x: 0, y: 0 };
    if (gsapReady()) {
      gsap.set(_drag.wrapper, {
        x: x + _drag.dx,
        y: y + _drag.dy,
        rotation: _drag.dx * 0.1,
        scale: 1.12,
        zIndex: 300
      });
    } else {
      _drag.wrapper.style.transform = `translate(${x + _drag.dx}px, ${y + _drag.dy}px) rotate(${_drag.dx * 0.1}deg) scale(1.12)`;
      _drag.wrapper.style.zIndex = '300';
    }
    _updateDropHover(t.clientX, t.clientY);
  }
}

function _onDragEnd(e) {
  if (!_drag) return;
  const drag = _drag;
  _drag = null;
  _setDragMode(false);
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
  if (!wrapper?._fan) return;
  const { x, y, rot } = wrapper._fan;
  const selected = state.selectedCard?.rank === wrapper.dataset.rank;
  const targetY = selected ? -40 : y;
  const targetScale = selected ? 1.08 : 1;
  if (gsapReady()) {
    gsap.to(wrapper, {
      x, y: targetY, rotation: rot, scale: targetScale,
      duration: 0.55,
      ease: 'elastic.out(1, 0.52)',
      overwrite: true
    });
  } else {
    wrapper.style.transform = '';
    wrapper.style.zIndex = selected ? '50' : String(wrapper._fan.z);
  }
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
  updateActionZone();
  updatePartnerHints();
}

// ─── Action zone ──────────────────────────────────────────────────────────────
function updateActionZone() {
  const zone = $('action-zone');
  if (!zone) return;
  const isMyTurn = state.gameState?.currentTurnPlayerId === state.myId;
  const partner = state.players.find(p => p.id !== state.myId);

  if (!isMyTurn) {
    const current = state.players.find(p => p.id === state.gameState?.currentTurnPlayerId);
    zone.innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">⏳</span> ${current?.name ?? 'Partner'} is picking a card to ask for…</p>`;
    return;
  }
  if (!state.selectedCard) {
    zone.innerHTML = `<p class="action-guide"><span class="action-guide-icon">①</span> Pick a card from your hand below</p>
      <p class="action-guide action-guide--sub"><span class="action-guide-icon">②</span> Swipe it ↑ to <strong>${partner?.name ?? 'them'}</strong> or the pond</p>`;
    return;
  }
  if (!state.selectedTarget) {
    const short = state.selectedCard.scenario.length > 36
      ? `${state.selectedCard.scenario.slice(0, 36)}…`
      : state.selectedCard.scenario;
    zone.innerHTML = `<p class="action-guide action-guide--on"><span class="action-guide-icon">✓</span> Asking for: <strong>${short}</strong></p>
      <p class="action-guide action-guide--sub"><span class="action-guide-icon">②</span> Swipe ↑ or tap <strong>${partner?.name ?? 'partner'}</strong> at the top</p>`;
    return;
  }

  zone.innerHTML = `
    <button type="button" class="btn-ask" id="btn-ask">
      Ask ${state.selectedTarget.name} for this set
    </button>`;
  $('btn-ask')?.addEventListener('click', sendAsk);
}

function sendAsk() {
  if (!state.selectedCard || !state.selectedTarget) return;
  haptic('medium');
  API.send({ type: 'ask', rank: state.selectedCard.rank, targetId: state.selectedTarget.id });
  state.selectedCard = null;
  state.selectedTarget = null;
  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  if ($('action-zone')) $('action-zone').innerHTML = `<p class="action-guide action-guide--wait"><span class="action-guide-icon">📨</span> Asked — waiting for their answer…</p>`;
  updatePartnerHints();
  renderHand();
}

// ─── Toast overlay — book completion ─────────────────────────────────────────
function showToast(playerName, scenario) {
  const el = $('toast-content');
  if (el) {
    el.innerHTML = `Sweet I officially have<br><span class="toast-card">${scenario}</span><br><span class="toast-name">— ${playerName}</span>`;
  }
  showScreen('toast');
  haptic('heavy');
  playBook();
  if (gsapReady()) {
    gsap.from('#toast-content', { scale: 0.45, opacity: 0, duration: 0.55, ease: 'elastic.out(1, 0.45)' });
    launchConfetti($('screen-toast'));
  }
  setTimeout(() => { if (state.screen === 'toast') showScreen('game'); }, 3200);
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
}

// ─── Home screen profile display ─────────────────────────────────────────────
const BARTENDER_PREVIEW_LINES = [
  "Bhenchod — I read your kinks. Kunal and Nandini, you're both fucked tonight.",
  "Public fucking on the profile? Paatal Lok writers wish they had your audacity.",
  "Your filth file is loaded. Samay Raina energy. Zero mercy.",
  "I know your limits AND your kinks. Guess which one I'm using.",
  "Dhurandhar-level roast incoming. You typed this shit yourself.",
  "Questionnaire complete. Absolute cinema of poor decisions.",
  "Arre yaar — your partner hasn't seen your answers yet. I have.",
  "Locked, loaded, and ready to weaponize every chip you selected.",
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
    if (nameEl) nameEl.textContent = profile.name;
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
  textEl.textContent = line;
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

async function triggerBartender(mode, opts = {}) {
  const now = Date.now();
  if (now < _aiCooldownUntil) return;
  _aiCooldownUntil = now + 5000;

  const playersContext = opts.playersContext ?? _buildPlayersContext();

  const result = await apiPost('/api/host', {
    mode,
    playerName: opts.playerName,
    scenario:   opts.scenario   ?? null,
    profile:    opts.profile    ?? null,
    playersContext,
    streakInfo: opts.streakInfo ?? null,
    otherPlayer: opts.otherPlayer ?? null,
    gameContext: `${state.players.length} players — Kunal & Nandini session`
  }).catch(() => null);

  if (result?.line) showBartenderTranscript(result.line);
}

function _ensureStats(playerId) {
  if (!state.playerStats[playerId]) {
    state.playerStats[playerId] = { gfyMisses: 0, luckyDraws: 0, steals: 0, books: 0, consecutiveMisses: 0 };
  }
  return state.playerStats[playerId];
}

function updatePlayerStats(action, players) {
  const s = _ensureStats(action.fromId);
  if (action.type === 'gfy') {
    if (action.continueTurn) { s.luckyDraws++; s.consecutiveMisses = 0; }
    else { s.gfyMisses++; s.consecutiveMisses++; }
  } else if (action.type === 'got') {
    s.steals += action.count ?? 1;
    s.consecutiveMisses = 0;
  }
  if (players) {
    players.forEach(p => { _ensureStats(p.id).books = p.books?.length ?? 0; });
  }
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
    _lastCommentedActionSig = null;
    _aiCooldownUntil = 0;
    showScreen('game');
    runSetupSequence(msg);
  });

  API.onMessage('snapshot', msg => {
    state.myHand = msg.myHand;
    state.players = msg.players;
    state.gameState = msg.gameState;
    state.pendingDrinks = msg.pendingDrinks;

    updateGameHud();

    if (!_dealingLocked) {
      renderHand();
      renderPartnerZone();
      renderMyBooks();
      updateActionZone();
      updatePartnerHints();
    }

    if (msg.gameState.lastAction) {
      const action = msg.gameState.lastAction;
      const sig = JSON.stringify(action);
      updatePlayerStats(action, msg.players);
      showActionBanner(action);

      if (sig !== _lastCommentedActionSig && action.type === 'gfy' && action.fromId === state.myId) {
        _lastCommentedActionSig = sig;
        const mode = action.continueTurn ? 'lucky' : 'gfy';
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
      }
    }
  });

  API.onMessage('bookComplete', msg => {
    showToast(msg.playerName, msg.scenario);
    _ensureStats(msg.playerId).books++;
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
    }), 3400);
  });

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
      gameContext: `${state.players.length} players — Kunal & Nandini session, books: ${myBooks.length}`
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
    initBac(bacContainer, drink => API.send({ type: 'logDrink', drink }));
  }

  state.profile = getProfile();
  wireLandingPage();
  showScreen('landing');
  initLandingMotion();
  if (gsapReady()) {
    gsap.from('.lp-hero-inner', { opacity: 0, y: 32, duration: 0.65, ease: 'power2.out' });
  }
}

document.addEventListener('DOMContentLoaded', init);
