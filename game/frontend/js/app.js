import * as API from './api.js';
import { initMobile, acquireWakeLock, releaseWakeLock, haptic } from './mobile.js';
import * as Sfx from './audio.js';
import { initBac, openDrinkScan } from './bac.js';
import { SCENARIOS, TOTAL_SETS } from './game.js';
import { apiPost } from './api.js';
import {
  hasProfile, getProfile, initProfile, clearProfile, buildProfileContext
} from './profile.js';
import {
  createSessionState, recordEvent, updateStatsFromAction, onBookComplete,
  formatSessionMemory, recordHighlight
} from './session-memory.js';
import { clearExpiredChaos, maybeTriggerChaos } from './chaos-events.js';
import { initLandingMotion, wireLandingJoin } from './landing.js';
import { mountAvatar, prewarmAvatar } from './avatar.js';
import {
  homeBartenderLine,
  canTriggerBartender,
  buildLiveGameContext,
  roastAnchorFromGame,
  saveLastBartenderEvent,
  gfyModeFromAction,
  gfyStreakInfo
} from './bartender-context.js';

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
  pendingAsk: null,
  myPowers: null,
  _shownPendingDrinkKeys: new Set(),
  gameHeat: 0,
  _lastBonusDrawSig: null,
  _lastHouseRefillSig: null,
  _turnWatch: null
};

let _lastCommentedActionSig = null;
let _lastProcessedActionSig = null;
let _lastBartenderAtMove = 0;
let _aiCooldownUntil = 0;
const BARTENDER_MOVE_INTERVAL = 5;

function getTurnFocus() {
  return state.gameState?.turnFocus ?? null;
}

function isMyTurnToAsk() {
  const focus = getTurnFocus();
  return focus?.activePlayerId === state.myId && focus?.role === 'ask';
}

function isMyActiveTurn() {
  const focus = getTurnFocus();
  return focus?.activePlayerId === state.myId;
}

function isMyTurnToRespond() {
  const focus = getTurnFocus();
  return focus?.activePlayerId === state.myId && focus?.role === 'respond';
}
/** Last 5 bartender franchise ids — anti-repeat (Brooklyn ≠ Brooklyn every line). */
let _bartenderRecentFranchises = [];
let _drag = null;
let _skipNextCardClick = false;
let _dealingLocked = false;

const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function _profileForPlayer(player) {
  if (!player) return null;
  if (player.id === state.myId) {
    const mine = getProfile();
    if (mine?.name) return mine;
  }
  if (player.profile?.name) return player.profile;
  return player.name ? { name: player.name, mediaFaves: player.profile?.mediaFaves ?? [] } : null;
}

function _profileByName(name) {
  const p = state.players.find(pl => pl.name === name);
  return _profileForPlayer(p) ?? (name ? { name, mediaFaves: [] } : null);
}

function _opponentPlayer() {
  return state.players.find(p => p.id !== state.myId) ?? null;
}

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
  const prev = state.screen;
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  state.screen = name;
  if (name === 'game' && prev !== 'game') Sfx.startAmbient();
  if (prev === 'game' && name !== 'game' && name !== 'toast') Sfx.stopAmbient();
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

  const _shuffleLines = [
    '🔀 Shuffling bad decisions…',
    '🔀 Teaching the pond new ways to hurt you…',
    '🔀 Redistributing tonight\'s filth…',
    '🔀 Randomizing the chaos…',
  ];
  const _pondLines = [
    `🌊 ${msg.deckCount} cards drowning in the pond`,
    `🌊 Pond loaded — ${msg.deckCount} chances to embarrass yourself`,
    `🌊 ${msg.deckCount} cards. Pond doesn't care about your feelings.`,
  ];
  await showPhaseBanner(_shuffleLines[Math.floor(Math.random() * _shuffleLines.length)], 1500);
  await showPhaseBanner(`🃏 ${msg.cardsDealt} cards each — no refunds`, 1600);
  await showPhaseBanner(_pondLines[Math.floor(Math.random() * _pondLines.length)], 1400);
  await showPhaseBanner(`${msg.firstPlayerName ?? 'Player'} goes first — say a prayer`, 1800);

  _dealingLocked = false;
  $('hand-zone')?.classList.remove('hand-zone--locked');
  $('center-zone')?.classList.remove('center-zone--locked');
  $('my-books-row')?.classList.remove('my-books-row--locked');

  renderHand();
  renderPartnerZone();
  renderMyBooks();
  updateGameHud();
  updateGameChrome();
}

function updateGameHud() {
  const me = state.players.find(p => p.id === state.myId);
  const gs = state.gameState;
  if ($('my-score')) $('my-score').textContent = `Books ${me?.books?.length ?? 0}`;
  if ($('deck-count')) $('deck-count').textContent = `Deck ${gs?.deckCount ?? '—'}`;
  if ($('sets-progress')) {
    const done = gs?.completedSets ?? 0;
    const total = gs?.totalSets ?? TOTAL_SETS;
    $('sets-progress').textContent = `Sets ${done}/${total}`;
  }
  const sub = $('pond-sublabel');
  const pondHint = $('pond-ask-hint');
  const canAsk = isMyTurnToAsk();
  if (sub) {
    if (pendingDrawFromPond()) sub.textContent = 'Draw';
    else if (canAsk && state.selectedCard) sub.textContent = 'Ask';
    else sub.textContent = 'Pond';
  }
  if (pondHint) {
    const show = canAsk && !!state.selectedCard;
    pondHint.classList.toggle('hidden', !show);
    if (show) pondHint.textContent = 'Drop here';
  }
  updateTurnIndicator();
  updateGameChrome();
}

function updateTurnIndicator() {
  const el = $('turn-indicator');
  if (!el) return;
  const gs = state.gameState;
  const focus = getTurnFocus();
  if (!focus || gs?.phase !== 'playing') {
    el.textContent = '';
    el.className = 'turn-indicator-bar turn-indicator-bar--hidden';
    updateTurnVisuals();
    return;
  }

  const pending = state.pendingAsk;
  const isMe = focus.activePlayerId === state.myId;
  const activeName = state.players.find(p => p.id === focus.activePlayerId)?.name ?? 'Player';
  const roleText = { ask: 'Ask', respond: 'Respond', resolve: 'Call bluff' }[focus.role] ?? 'Play';

  let text;
  if (isMe) {
    text = `Your turn — ${roleText}`;
  } else if (focus.role === 'respond' && pending?.askerName) {
    text = `${pending.askerName} asked you — Respond`;
  } else {
    text = `${activeName}'s turn — ${roleText}`;
  }

  el.textContent = text;
  el.className = `turn-indicator-bar ${isMe ? 'turn-indicator-bar--you' : 'turn-indicator-bar--partner'}`;
  updateTurnVisuals();
}

function updateTurnVisuals() {
  const focus = getTurnFocus();
  const hand = $('hand-zone');
  const partnerZone = $('partner-zone');
  const playfield = document.querySelector('.game-playfield');

  hand?.classList.remove('hand-zone--your-turn');
  partnerZone?.classList.remove('partner-zone--active-turn');
  playfield?.classList.remove('game-playfield--waiting');

  if (!focus || state.gameState?.phase !== 'playing') return;

  if (focus.activePlayerId === state.myId) {
    hand?.classList.add('hand-zone--your-turn');
  } else {
    partnerZone?.classList.add('partner-zone--active-turn');
    playfield?.classList.add('game-playfield--waiting');
  }
}

function pendingDrawFromPond() {
  const focus = getTurnFocus();
  return focus?.role === 'resolve' && focus.activePlayerId === state.myId;
}

function renderMyBooks() {
  const row = $('my-books-row');
  if (!row) return;
  const me = state.players.find(p => p.id === state.myId);
  const books = me?.books ?? [];
  if (!books.length) {
    row.innerHTML = '';
    row.classList.add('my-books-row--empty');
    return;
  }
  row.classList.remove('my-books-row--empty');
  row.innerHTML = books.map(scenario => {
    const meta = scenarioMeta(scenario);
    const rank = SCENARIOS.find(s => s.name === scenario)?.rank ?? '?';
    return `<div class="book-set" title="${scenario.replace(/"/g, '&quot;')}"><span class="book-set-rank">${rank}</span><span class="book-set-name">${scenario}</span></div>`;
  }).join('');
}

function _nextPlayerName(afterPlayerId) {
  const ids = state.players.map(p => p.id);
  const idx = ids.indexOf(afterPlayerId);
  if (idx < 0) return 'partner';
  return state.players[(idx + 1) % ids.length]?.name ?? 'partner';
}

/** Plain-language what just happened + what it means. */
function buildMoveExplanation(action) {
  const fromP = state.players.find(p => p.id === action.fromId);
  const toP = state.players.find(p => p.id === action.targetId);
  const fromName = fromP?.name ?? 'Player';
  const toName = toP?.name ?? 'partner';
  const rank = _rankLabel(action.rank);
  const nextName = _nextPlayerName(action.fromId ?? action.targetId);

  switch (action.type) {
    case 'ask_pending':
      return {
        headline: `${fromName} asks for ${rank}`,
        detail: `${toName}: check your hand — Give if you have it, GFY if you don't, Bluff if you have it but want to lie.`
      };
    case 'got':
      return {
        headline: `${fromName} got ${action.count ?? 1}× ${rank}`,
        detail: `${toName} gave the card(s). Turn passes to ${nextName}.`
      };
    case 'gfy_claim':
      if (action.bluff) {
        return {
          headline: `${fromName} claims GFY on ${rank}`,
          detail: `They might be lying. ${toName}: Accept (you draw from pond) or Bullshit if they actually have ${rank}.`
        };
      }
      return {
        headline: `${fromName} said Go Fuck Yourself`,
        detail: `${fromName} says they don't have ${rank}. ${toName}: Accept — you draw from the pond. Bullshit only if you think they're lying.`
      };
    case 'gfy':
      if (action.bluffSucceeded) {
        return {
          headline: `${toName} bluffed on ${rank}`,
          detail: `${toName} had the card but lied. ${fromName} drew from the pond believing GFY. Turn passes to ${nextName}.`
        };
      }
      if (action.continueTurn) {
        return {
          headline: `🍀 Lucky pond draw for ${fromName}`,
          detail: `Drew a matching ${rank} from the pond — extra luck, but turn still passes to ${nextName}.`
        };
      }
      if (action.closeToPond) {
        return {
          headline: `${fromName} missed the pond`,
          detail: `Had 3 of ${rank}, needed 1 more — pond didn't have it. Drew ${action.drawCount ?? 1} card(s). Turn passes to ${nextName}.`
        };
      }
      return {
        headline: `${toName} refused with GFY`,
        detail: `${fromName} draws ${action.drawCount ?? 1} from the pond (no ${rank} match). Turn passes to ${nextName}.`
      };
    case 'bullshit_caught':
      return {
        headline: `Bullshit! ${toName} was lying`,
        detail: `${fromName} caught the bluff on ${rank}. ${toName} draws ${action.count ?? 4} from the pond. Turn passes to ${nextName}.`
      };
    case 'bullshit_wrong':
      return {
        headline: `Wrong bullshit call`,
        detail: `${toName} called bullshit, but ${fromName} was honest — no ${rank} in hand. ${toName} draws ${action.count ?? 2} from the pond. Turn passes to ${nextName}.`
      };
    default:
      return null;
  }
}

function showMoveExplainer(action, duration = 4800) {
  const copy = buildMoveExplanation(action);
  if (!copy) return false;
  const banner = $('action-banner');
  if (!banner) return false;
  banner.innerHTML =
    `<span class="move-explain-headline">${copy.headline}</span>` +
    `<span class="move-explain-detail">${copy.detail}</span>`;
  banner.classList.add('action-banner--explain');
  banner.classList.remove('hidden', 'banner--error', 'banner--recovery');
  setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('action-banner--explain');
  }, duration);
  return true;
}

function flashLuckyDraw(action) {
  const drawn = action.drawnCard;
  const banner = $('action-banner');
  if (!banner) return;
  const fromP = state.players.find(p => p.id === action.fromId);
  const s = drawn ? scenarioMeta(drawn.scenario) : { emoji: '🍀', scenario: '' };
  const nextName = _nextPlayerName(action.fromId);
  banner.innerHTML = `
    <div class="lucky-draw-flash">
      <div class="lucky-draw-label">🍀 Lucky draw from the pond!</div>
      ${drawn ? `<div class="lucky-draw-card">${s.emoji} ${drawn.scenario}</div>` : ''}
      <div class="lucky-draw-sub">${fromP?.name ?? 'Player'} — turn passes to ${nextName}</div>
    </div>`;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4200);

  // Pond pulse — physical reaction
  if (gsapReady()) {
    const pond = $('draw-pile-el');
    if (pond) {
      gsap.timeline()
        .to(pond, { scale: 1.22, duration: 0.12, ease: 'power2.out' })
        .to(pond, { scale: 1.0, duration: 0.32, ease: 'back.out(2.8)' });
    }
  }
  Sfx.playLuckyDraw();
}

function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function _bootAudioOnce() {
  Sfx.initAudio();
  document.removeEventListener('pointerdown', _bootAudioOnce);
  document.removeEventListener('click', _bootAudioOnce);
}

function showAchievementToast(ach) {
  const el = $('achievement-toast');
  if (!el || !ach) return;
  el.textContent = `${ach.emoji} ${ach.label} unlocked!`;
  el.classList.remove('achievement-toast--close-call', 'achievement-toast--bluff');
  el.classList.add('is-visible');
  Sfx.playAchievementSound();
  setTimeout(() => el.classList.remove('is-visible'), 3200);
}

function showCloseCallMoment() {
  const el = $('achievement-toast');
  if (!el) return;
  el.textContent = '💀 SO CLOSE — had 3, pond said no';
  el.classList.remove('achievement-toast--bluff');
  el.classList.add('is-visible', 'achievement-toast--close-call');
  Sfx.playCloseCall();
  if (gsapReady()) {
    gsap.fromTo(el, { x: -8 }, { x: 8, duration: 0.07, ease: 'power1.inOut', yoyo: true, repeat: 5,
      onComplete: () => gsap.set(el, { x: 0 }) });
  }
  setTimeout(() => el.classList.remove('is-visible', 'achievement-toast--close-call'), 3000);
}

function showBluffLandedToast() {
  const el = $('achievement-toast');
  if (!el) return;
  el.textContent = '🎭 Bluff landed — they took the bait';
  el.classList.remove('achievement-toast--close-call');
  el.classList.add('is-visible', 'achievement-toast--bluff');
  Sfx.playBluffLanded();
  setTimeout(() => el.classList.remove('is-visible', 'achievement-toast--bluff'), 3000);
}

function showBluffOverlay(liarName) {
  const overlay = $('bluff-overlay');
  const kicker = $('bluff-overlay-kicker');
  const title = $('bluff-overlay-title');
  const sub = $('bluff-overlay-sub');
  const avatarHost = $('bluff-overlay-avatar');
  if (!overlay) return;

  const profile = _profileByName(liarName);
  if (kicker) kicker.textContent = `${liarName} lied`;
  if (title) title.textContent = 'YOU GOT PLAYED';
  if (sub) sub.textContent = 'They had it all along. Absolute cinema.';
  mountAvatar(avatarHost, profile, { mood: 'smug', size: 'xl', ring: true, animate: true });

  overlay.classList.remove('hidden');
  Sfx.playBluffLanded();
  if (gsapReady()) {
    gsap.from('.bluff-overlay-inner', { scale: 0.85, opacity: 0, duration: 0.35, ease: 'back.out(1.5)' });
  }
  setTimeout(() => overlay.classList.add('hidden'), 2800);
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
  Sfx.playChaosEvent(event.id);
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

function _isDesktopPointer() {
  return window.matchMedia('(pointer: fine)').matches;
}

// ─── Card rendering ───────────────────────────────────────────────────────────
function scenarioMeta(scenario) {
  return SCENARIOS.find(s => s.name === scenario) ?? { emoji: '🃏', dare: '' };
}

/** Short title for hand faces — icon + ~3 words (Hearthstone-style). */
function cardDisplayTitle(scenario) {
  if (!scenario) return '';
  const name = String(scenario).trim();
  const words = name.split(/\s+/);
  const short = words.length > 3 ? words.slice(0, 3).join(' ') : name;
  return short.length > 24 ? `${short.slice(0, 22)}…` : short;
}

function renderCard(card, interactive = false, { compact = false } = {}) {
  const s = scenarioMeta(card.scenario);
  const label = compact ? cardDisplayTitle(card.scenario) : card.scenario;
  const div = document.createElement('div');
  div.className = 'card card--face';
  div.dataset.rank = card.rank;
  div.dataset.scenario = card.scenario;
  div.innerHTML = `
    <div class="card-rank">${card.rank}</div>
    <div class="card-emoji">${s.emoji}</div>
    <div class="card-name">${label}</div>
    <div class="card-dare">${s.dare}</div>`;
  if (interactive) {
    div.tabIndex = 0;
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', card.scenario);
  }
  return div;
}

function openCardDetailSheet(card) {
  const panel = $('card-detail-panel');
  if (!panel || !card) return;
  const s = scenarioMeta(card.scenario);
  if ($('card-detail-rank')) $('card-detail-rank').textContent = card.rank;
  if ($('card-detail-scenario')) $('card-detail-scenario').textContent = card.scenario;
  if ($('card-detail-dare')) $('card-detail-dare').textContent = s.dare || '—';
  if ($('card-detail-title')) $('card-detail-title').textContent = 'Card';
  panel.classList.remove('hidden');
  haptic('light');
}

function closeCardDetailSheet() {
  $('card-detail-panel')?.classList.add('hidden');
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

  stack.appendChild(renderCard(card, interactive, { compact: true }));

  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'card-count-badge';
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count} cards of rank ${card.rank}`);
    stack.appendChild(badge);
  }

  return stack;
}

let _prevHandRanks = new Set();

// ─── Hand rendering — horizontal row; duplicates stacked in one slot ─────────
function renderHand() {
  const zone = $('hand-zone');
  if (!zone) return;

  // Track which ranks are newly received (for deal-in highlight)
  const curRanks = new Set(state.myHand.map(c => c.rank));
  const newRanks = new Set([...curRanks].filter(r => !_prevHandRanks.has(r)));
  _prevHandRanks = curRanks;

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
  const canAsk = isMyTurnToAsk();
  const canPeek = isMyTurnToRespond();
  const requestedRank = canPeek ? state.pendingAsk?.rank : null;

  zone.classList.toggle('hand-zone--centered', n > 0 && n <= 3);
  zone.classList.toggle('hand-zone--respond-turn', canPeek);

  groups.forEach(([rank, cards], i) => {
    const card = cards[0];
    const count = cards.length;
    const isSelected = state.selectedCard?.rank === rank;

    const isNew = newRanks.has(rank) && !isSelected;
    const isRequested = requestedRank != null && rank === requestedRank;
    const wrapper = document.createElement('div');
    wrapper.className = 'hand-card-wrapper'
      + (isSelected ? ' is-selected' : '')
      + (count > 1 ? ' hand-card-wrapper--stacked' : '')
      + (isNew ? ' hand-card-wrapper--new' : '')
      + (isRequested ? ' hand-card-wrapper--requested' : '');
    wrapper.dataset.rank = rank;
    wrapper.dataset.scenario = card.scenario;
    wrapper.style.setProperty('--deal-i', i);
    if (isSelected) wrapper.style.zIndex = '50';

    wrapper.appendChild(buildHandCardStack(card, count, canAsk || canPeek));
    zone.appendChild(wrapper);

    wrapper.addEventListener('touchstart', e => _onCardPointerDown(e, wrapper, card), { passive: true });
    wrapper.addEventListener('mousedown', e => _onCardPointerDown(e, wrapper, card));
    wrapper.addEventListener('click', e => { e.stopPropagation(); _onCardTap(wrapper, card); });
    if (_isDesktopPointer()) {
      let hoverLast = 0;
      wrapper.addEventListener('pointerenter', () => {
        const now = performance.now();
        if (now - hoverLast < 120) return;
        hoverLast = now;
        Sfx.playCardHover();
      });
    }
  });

  // Hearthstone lean — apply lean classes to neighbors of selected card
  if (state.selectedCard) {
    const selIdx = groups.findIndex(([rank]) => rank === state.selectedCard.rank);
    if (selIdx >= 0) {
      groups.forEach(([rank], i) => {
        const w = zone.querySelector(`.hand-card-wrapper[data-rank="${rank}"]`);
        if (!w || i === selIdx) return;
        const offset = i - selIdx;
        if (offset === -1) w.classList.add('hand-card-wrapper--lean-left');
        else if (offset === 1) w.classList.add('hand-card-wrapper--lean-right');
        else w.classList.add('hand-card-wrapper--lean-far');
      });
    }
  }

  updateGameChrome();
  if (n > 0) Sfx.playDeal();
}

// ─── Card tap — select / deselect with spring ─────────────────────────────────
function _onCardTap(wrapper, card) {
  if (isMyTurnToRespond()) {
    openCardDetailSheet(card);
    return;
  }
  if (!isMyTurnToAsk() || _askFlowBlocksPlay()) return;
  if (_skipNextCardClick) {
    _skipNextCardClick = false;
    return;
  }

  if (state.selectedCard?.rank === card.rank) {
    openCardDetailSheet(card);
    return;
  }

  const opponents = state.players.filter(p => p.id !== state.myId);
  const partner = opponents[0];

  if (_isDesktopPointer() && opponents.length === 1 && partner) {
    if (state.myPowers?.activeKickDoor && (state.myPowers.wildAskToken ?? 0) > 0) {
      showKickDoorRankPicker(partner);
      return;
    }
    state.selectedCard = card;
    state.selectedTarget = { id: partner.id, name: partner.name };
    wrapper.classList.add('is-selected');
    wrapper.style.zIndex = '50';
    document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
    sendAsk();
    return;
  }

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
  Sfx.playCardSelect();
  if (gsapReady()) {
    gsap.fromTo(wrapper,
      { y: 0, scale: 1 },
      { y: -32, scale: 1.08, duration: 0.28, ease: 'back.out(1.7)' });
  }

  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  updateGameChrome();
  updatePartnerHints();
}

// ─── Drag — physical card lift (touch + mouse) ───────────────────────────────
function _onCardPointerDown(e, wrapper, card) {
  if (e.button !== undefined && e.button !== 0) return;
  if (!isMyTurnToAsk() || _askFlowBlocksPlay()) return;
  const t = e.touches ? e.touches[0] : e;
  _drag = { wrapper, card, startX: t.clientX, startY: t.clientY, dx: 0, dy: 0, active: false, dropTarget: null };
  haptic('light');
}

function _setDragMode(on) {
  $('screen-game')?.classList.toggle('game--dragging', on);
  $('drag-drop-lane')?.classList.toggle('hidden', !on);
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
    const baseY = -24;
    _drag.wrapper.style.transform =
      `translate(${_drag.dx}px, ${baseY + _drag.dy}px) rotate(${_drag.dx * 0.08}deg) scale(1.1)`;
    _updateDropHover(t.clientX, t.clientY);
  }
}

function _pointerFromEvent(e) {
  if (e.changedTouches?.[0]) return e.changedTouches[0];
  if (typeof e.clientX === 'number') return e;
  return null;
}

function _onDragEnd(e) {
  if (!_drag) return;
  const drag = _drag;
  _drag = null;
  _setDragMode(false);
  drag.wrapper?.classList.remove('is-dragging');
  document.querySelectorAll('.partner-drop, .draw-pile--drop').forEach(el => el.classList.remove('drop-hot'));

  const t = _pointerFromEvent(e);
  const drop = t ? _hitDropZone(t.clientX, t.clientY) : drag.dropTarget;

  if (drag.active && drop) {
    haptic('medium');
    state.selectedCard = drag.card;
    state.selectedTarget = { id: drop.playerId, name: drop.name };
    _skipNextCardClick = true;
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
function showGFYOverlay(askerName, targetName, wasBluffed = false, moodOverride = null) {
  const overlay = $('gfy-overlay');
  const sub = $('gfy-sub');
  const nameEl = $('gfy-overlay-name');
  const avatarHost = $('gfy-overlay-avatar');
  if (!overlay || !sub) return;

  const mood = moodOverride ?? (wasBluffed ? 'smug' : 'angry');
  const targetProfile = _profileByName(targetName);
  mountAvatar(avatarHost, targetProfile, {
    mood,
    size: 'xl',
    ring: true,
    animate: true
  });
  if (nameEl) nameEl.textContent = targetName;

  sub.textContent = wasBluffed
    ? `${targetName} lied. You got played.`
    : `${targetName} didn't have it.`;
  overlay.classList.remove('hidden');

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

  const canAsk = isMyTurnToAsk();
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
    div.className = `partner-drop${isActive ? ' partner-drop--active' : ''}${isTargeted ? ' targeted' : ''}${hasCardSelected && canAsk ? ' partner-drop--ready' : ''}`;
    div.dataset.pid = p.id;
    div.dataset.name = p.name;
    div.setAttribute('role', 'button');
    div.tabIndex = canAsk ? 0 : -1;

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
      <div class="partner-drop-main">
        <div class="partner-avatar-col"></div>
        <div class="partner-meta">
          <span class="partner-name">${p.name}${isActive ? ' <span class="partner-turn-badge">Active</span>' : ''}</span>
          <span class="partner-stats">${p.cardCount} cards · ${p.books.length} books</span>
        </div>
        <div class="partner-stack-slot"></div>
      </div>`;
    const avatarSlot = document.createElement('div');
    div.querySelector('.partner-avatar-col')?.appendChild(avatarSlot);
    const myBooks = state.players.find(pl => pl.id === state.myId)?.books?.length ?? 0;
    const oppBooks = p.books?.length ?? 0;
    let mood = 'neutral';
    if (oppBooks > myBooks + 1) mood = 'smug';
    else if (myBooks > oppBooks + 1) mood = 'angry';
    mountAvatar(avatarSlot, _profileForPlayer(p), { mood, size: 'sm', ring: true, animate: false });
    div.querySelector('.partner-stack-slot')?.appendChild(stack);

    if (!canAsk) div.classList.add('partner-drop--disabled');
    if (canAsk) {
      div.addEventListener('click', () => selectPartner(p, div));
    }
    zone.appendChild(div);
  });
  updateTurnVisuals();
}

function updatePartnerHints() {
  const canAsk = isMyTurnToAsk();
  document.querySelectorAll('.partner-drop').forEach(el => {
    if (!canAsk) {
      el.classList.remove('partner-drop--ready');
      return;
    }
    if (state.selectedCard) el.classList.add('partner-drop--ready');
    else el.classList.remove('partner-drop--ready');
  });
}

function selectPartner(player, el) {
  if (!isMyTurnToAsk()) return;
  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  if (state.selectedTarget?.id === player.id) {
    state.selectedTarget = null;
    updateGameChrome();
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
  if (state.myPowers?.activeKickDoor && (state.myPowers.wildAskToken ?? 0) > 0) {
    showKickDoorRankPicker(player);
    return;
  }
  updateGameChrome();
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

  title.textContent = `Wild Ask — ask ${partner.name} for:`;
  actions.innerHTML = ranks.map(r =>
    `<button type="button" class="ask-response-btn ask-response-btn--bluff" data-rank="${r}">${r}</button>`
  ).join('');

  actions.querySelectorAll('[data-rank]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.classList.add('hidden');
      Sfx.playCardThrow();
      haptic('medium');
      API.send({ type: 'ask', rank: btn.dataset.rank, targetId: partner.id });
      state.selectedTarget = null;
      document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
      updateGameChrome();
    }, { once: true });
  });
  panel.classList.remove('hidden');
}

function showComebackPicker(partner) {
  const panel = $('reward-panel');
  const title = $('reward-panel-title');
  const actions = $('reward-panel-actions');
  if (!panel || !title || !actions) return;

  title.textContent = 'Comeback — spend your token:';
  actions.innerHTML = [
    { kind: 'steal', label: 'Steal random card' },
    { kind: 'reveal', label: 'Reveal one of their ranks' },
    { kind: 'extra_turn', label: 'Ask again (keep turn)' },
    { kind: 'wild_ask', label: 'Gain a Wild Ask' }
  ].map(c =>
    `<button type="button" class="ask-response-btn ask-response-btn--give" data-kind="${c.kind}">${c.label}</button>`
  ).join('');

  actions.querySelectorAll('[data-kind]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.classList.add('hidden');
      haptic('medium');
      API.send({ type: 'useMove', move: 'comeback', kind: btn.dataset.kind, targetId: partner.id });
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
  if (response === 'gfy') Sfx.playGFY();
  else haptic('medium');
  API.send({ type: 'respondAsk', response });
  $('ask-response-panel')?.classList.add('hidden');
  $('ask-respond-bar')?.classList.add('hidden');
}

function sendResolveAsk(action) {
  if (action === 'bullshit') Sfx.playBullshitCalled();
  else haptic('medium');
  API.send({ type: 'resolveAsk', action });
  $('bullshit-bar')?.classList.add('hidden');
}

const WILD_ASK_HELP = {
  title: '⚡ Wild Ask',
  arm: '<strong>One use per game.</strong> Your next ask can be any rank — even one you don\'t hold. Tap your partner, then pick the rank.<br><br><strong>If they Go Fuck Yourself:</strong> pond miss costs <strong>2 cards</strong> (not 1).',
  disarm: 'Wild Ask off — only ask ranks you actually hold.',
  confirm: '⚡ Use Wild Ask'
};

function dismissMoveTipPanel() {
  $('move-tip-panel')?.classList.add('hidden');
}

function showMoveTipPanel({ title, body, confirmLabel, onConfirm }) {
  const panel = $('move-tip-panel');
  const titleEl = $('move-tip-title');
  const bodyEl = $('move-tip-body');
  const actions = $('move-tip-actions');
  if (!panel || !titleEl || !bodyEl || !actions) return;

  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  actions.innerHTML = `
    <button type="button" class="ask-response-btn ask-response-btn--give" id="move-tip-confirm">${confirmLabel}</button>
    <button type="button" class="ask-response-btn ask-response-btn--bluff" id="move-tip-cancel">Not now</button>`;

  $('move-tip-confirm')?.addEventListener('click', () => {
    dismissMoveTipPanel();
    onConfirm?.();
    haptic('medium');
  }, { once: true });
  $('move-tip-cancel')?.addEventListener('click', () => {
    dismissMoveTipPanel();
    haptic('light');
  }, { once: true });

  panel.classList.remove('hidden');
}

function _handleWildAskClick() {
  const powers = state.myPowers;
  if (!powers || (powers.wildAskToken ?? 0) < 1) return;

  if (powers.activeKickDoor) {
    API.send({ type: 'activateMove', move: 'kick_door' });
    showBanner(WILD_ASK_HELP.disarm);
    haptic('light');
    return;
  }

  showMoveTipPanel({
    title: WILD_ASK_HELP.title,
    body: WILD_ASK_HELP.arm,
    confirmLabel: WILD_ASK_HELP.confirm,
    onConfirm: () => {
      API.send({ type: 'activateMove', move: 'kick_door' });
      showBanner('⚡ Wild Ask armed — tap partner, pick any rank.');
      updateGameChrome();
    }
  });
}

function renderSpecialMovesBar() {
  const bar = $('special-moves-bar');
  if (!bar) return;
  const powers = state.myPowers;
  const isPlaying = state.gameState?.phase === 'playing';
  const canAsk = isMyTurnToAsk();
  const blocked = state.pendingAsk || state.pendingBookPowerup || state.luckyReward;

  if (!isPlaying || !canAsk || !powers || blocked) {
    bar.classList.add('hidden');
    return;
  }

  if ((powers.wildAskToken ?? 0) < 1 && !powers.activeKickDoor) {
    bar.classList.add('hidden');
    return;
  }

  const armed = powers.activeKickDoor;
  bar.innerHTML = `<button type="button" class="move-pill move-pill--wild${armed ? ' move-pill--on' : ''}" data-move="wild-ask" aria-label="Wild Ask — one use per game">⚡ Wild Ask</button>`;
  bar.querySelector('[data-move="wild-ask"]')?.addEventListener('click', () => _handleWildAskClick());
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
  /* Missions tracked server-side; revealed on results screen only. */
}

function checkMissionComplete() {
  const m = state.myPowers?.mission;
  if (!m?.done || state._missionDoneShown) return;
  state._missionDoneShown = true;
}

function _fillRespondActions(container, pending) {
  if (!container || !pending) return;
  container.innerHTML = '';
  if (pending.canGive) {
    const give = document.createElement('button');
    give.type = 'button';
    give.className = 'ask-response-btn ask-response-btn--give';
    give.textContent = '✅ Give it';
    give.addEventListener('click', () => sendRespondAsk('give'), { once: true });
    container.appendChild(give);
  }
  if (pending.canBluff) {
    const bluff = document.createElement('button');
    bluff.type = 'button';
    bluff.className = 'ask-response-btn ask-response-btn--bluff';
    bluff.textContent = '🎭 Lie (Bluff)';
    bluff.addEventListener('click', () => sendRespondAsk('bluff'), { once: true });
    container.appendChild(bluff);
  }
  if (pending.canGfy) {
    const gfy = document.createElement('button');
    gfy.type = 'button';
    gfy.className = 'ask-response-btn ask-response-btn--gfy';
    gfy.textContent = '👊 GFY';
    gfy.addEventListener('click', () => sendRespondAsk('gfy'), { once: true });
    container.appendChild(gfy);
  }
}

function renderAskFlowUI() {
  const pending = state.pendingAsk;
  const panel = $('ask-response-panel');
  const respondBar = $('ask-respond-bar');
  const bullBar = $('bullshit-bar');

  renderSpecialMovesBar();
  renderRewardPanels();

  if (!pending || state.gameState?.phase !== 'playing') {
    panel?.classList.add('hidden');
    respondBar?.classList.add('hidden');
    bullBar?.classList.add('hidden');
    return;
  }

  if (pending.phase === 'respond') {
    panel?.classList.add('hidden');
    bullBar?.classList.add('hidden');

    const label = $('ask-respond-bar-label');
    const hint = $('ask-respond-bar-hint');
    const actions = $('ask-respond-bar-actions');
    if (!label || !actions || !respondBar) return;

    const rankEmoji = SCENARIOS.find(s => s.rank === pending.rank)?.emoji ?? '🃏';
    const rankName = _rankLabel(pending.rank);
    label.innerHTML =
      `<span class="ask-acc-name">${pending.askerName}</span> wants your ` +
      `<span class="ask-acc-card">${rankEmoji} ${rankName}</span>`;

    if (hint) {
      hint.textContent = pending.canGive
        ? 'You have it — highlighted below. Tap any card to read it.'
        : 'Tap your cards below to double-check, then respond.';
    }

    _fillRespondActions(actions, pending);
    respondBar.classList.remove('hidden');
    renderHand();
    updateGameChrome();
    return;
  }

  respondBar?.classList.add('hidden');
  panel?.classList.add('hidden');

  if (pending.phase === 'resolve') {
    const label = $('bullshit-bar-label');
    if (label) {
      const rank = _rankLabel(pending.rank);
      label.textContent =
        `${pending.targetName ?? 'They'} said GFY on ${rank} — claims no ${rank}. ` +
        'Accept: you draw from pond. Bullshit: only if you think they\'re lying.';
    }
    bullBar?.classList.remove('hidden');
    updateGameChrome();
    return;
  }

  bullBar?.classList.add('hidden');
  updateGameChrome();
}

function showBullshitOverlay(action) {
  const overlay = $('bullshit-overlay');
  const title = $('bullshit-overlay-title');
  const sub = $('bullshit-overlay-sub');
  const kicker = $('bullshit-overlay-kicker');
  const avatarHost = $('bullshit-overlay-avatar');
  if (!overlay || !title || !sub) return;

  const caller = state.players.find(p => p.id === action.fromId);
  const loser = state.players.find(p => p.id === action.targetId);
  const caught = action.type === 'bullshit_caught';
  const facePlayer = loser;
  const copy = buildMoveExplanation(action);

  if (kicker) kicker.textContent = caught ? 'CAUGHT RED HANDED' : 'WRONG CALL';
  title.textContent = caught ? 'BULLSHIT!' : 'WRONG CALL';
  sub.textContent = copy?.detail ?? (caught
    ? `${loser?.name ?? 'They'} lied — draws ${action.count ?? 4}. Turn passes.`
    : `${loser?.name ?? 'They'} called bullshit wrong — draws ${action.count ?? 2}. ${caller?.name ?? 'Partner'} was honest. Turn passes.`);
  mountAvatar(avatarHost, _profileForPlayer(facePlayer), {
    mood: 'shocked',
    size: 'xl',
    ring: true,
    animate: true
  });

  overlay.classList.remove('hidden');
  Sfx.playBullshitCalled();
  setTimeout(() => {
    if (caught) Sfx.playBullshitSuccess();
    else Sfx.playBullshitFailed();
  }, 520);

  setTimeout(() => overlay.classList.add('hidden'), 2800);
}

// ─── Game chrome — status pill + primary CTA ─────────────────────────────────
function _setGameStatus(text, variant = 'neutral', { visible = true } = {}) {
  const el = $('game-status');
  if (!el) return;
  el.textContent = text;
  el.className = `game-status-float game-status--${variant}${visible ? '' : ' game-status--hidden'}`;
}

function _setActionCta(label, { disabled = true, onClick = null } = {}) {
  const btn = $('action-cta');
  if (!btn) return;
  btn.textContent = label;
  btn.disabled = disabled;
  btn.onclick = disabled ? null : onClick;
}

function updateGameChrome() {
  const focus = getTurnFocus();
  const partner = state.players.find(p => p.id !== state.myId);
  const pending = state.pendingAsk;
  if (pending?.phase === 'respond') {
    _setGameStatus('Check your hand — respond below', 'accent');
    _setActionCta('Tap cards or use buttons', { disabled: true });
    return;
  }
  if (pending?.phase === 'waiting_bullshit') {
    _setGameStatus(`${pending.askerName ?? 'Partner'} deciding bullshit…`, 'wait');
    _setActionCta('Waiting…', { disabled: true });
    return;
  }
  if (pending?.phase === 'resolve') {
    _setGameStatus('Your turn — Accept GFY or bullshit', 'accent');
    _setActionCta('Use bullshit bar', { disabled: true });
    return;
  }
  if (pending?.phase === 'waiting_target') {
    _setGameStatus(`Waiting — ${pending.targetName ?? 'partner'} responding`, 'wait');
    _setActionCta('Waiting…', { disabled: true });
    return;
  }
  if (state.pendingBookPowerup) {
    _setGameStatus('Choose your book bonus', 'accent');
    _setActionCta('Pick a bonus below', { disabled: true });
    return;
  }
  if (state.luckyReward) {
    _setGameStatus('Lucky draw — pick a reward', 'accent');
    _setActionCta('Pick reward below', { disabled: true });
    return;
  }

  if (!isMyTurnToAsk()) {
    const activeName = state.players.find(p => p.id === focus?.activePlayerId)?.name ?? 'Partner';
    const role = { ask: 'asking', respond: 'responding', resolve: 'calling bluff' }[focus?.role] ?? 'playing';
    _setGameStatus(`${activeName} — ${role}`, 'wait');
    _setActionCta('Waiting…', { disabled: true });
    return;
  }
  if (_askFlowBlocksPlay()) return;

  if (!state.selectedCard) {
    if (state.myPowers?.activeKickDoor && (state.myPowers.wildAskToken ?? 0) > 0) {
      _setGameStatus('Wild armed — tap partner to pick a rank', 'accent');
      _setActionCta('Pick a card or Wild Ask', { disabled: true });
      return;
    }
    _setGameStatus('', 'wait', { visible: false });
    _setActionCta('Pick a card', { disabled: true });
    return;
  }

  const partnerName = partner?.name ?? 'partner';
  const canAsk = !!partner;

  if (!state.selectedTarget && canAsk) {
    _setGameStatus(`Tap ${partnerName} or swipe ↑`, 'accent', { visible: false });
    _setActionCta(`Ask ${partnerName}`, {
      disabled: false,
      onClick: () => {
        state.selectedTarget = { id: partner.id, name: partner.name };
        document.querySelectorAll('.partner-drop').forEach(el => {
          el.classList.toggle('targeted', el.dataset.pid === partner.id);
        });
        sendAsk();
      }
    });
    return;
  }

  if (state.selectedTarget) {
    _setGameStatus('', 'accent', { visible: false });
    _setActionCta(`Ask ${state.selectedTarget.name}`, {
      disabled: false,
      onClick: () => sendAsk()
    });
    return;
  }

  _setGameStatus('Tap partner to ask', 'accent', { visible: true });
  _setActionCta('Choose target', { disabled: true });
}

/** @deprecated alias */
function updateActionZone() {
  updateGameChrome();
}

function sendAsk() {
  if (!state.selectedCard || !state.selectedTarget || _askFlowBlocksPlay()) return;

  const rank = state.selectedCard.rank;
  const targetId = state.selectedTarget.id;
  const wrapper = document.querySelector(`.hand-card-wrapper[data-rank="${rank}"]`);
  const partnerEl = document.querySelector(`.partner-drop[data-pid="${targetId}"]`);

  Sfx.playCardThrow();
  haptic('medium');
  API.send({ type: 'ask', rank, targetId });
  state.selectedCard = null;
  state.selectedTarget = null;
  document.querySelectorAll('.partner-drop.targeted').forEach(e => e.classList.remove('targeted'));
  _setGameStatus('Asked — waiting…', 'wait');
  _setActionCta('Waiting…', { disabled: true });
  updatePartnerHints();

  if (wrapper && gsapReady()) {
    gsap.killTweensOf(wrapper);
    if (partnerEl) {
      const srcR = wrapper.getBoundingClientRect();
      const dstR = partnerEl.getBoundingClientRect();
      const dx = (dstR.left + dstR.width / 2) - (srcR.left + srcR.width / 2);
      const dy = (dstR.top + dstR.height / 2) - (srcR.top + srcR.height / 2);
      gsap.to(wrapper, {
        x: dx * 0.68, y: dy * 0.62,
        rotation: (Math.random() - 0.5) * 22,
        scale: 0.44,
        opacity: 0,
        duration: 0.26,
        ease: 'power3.in',
        onComplete: renderHand
      });
      gsap.fromTo(partnerEl,
        { scale: 1 },
        { scale: 1.032, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, delay: 0.14 }
      );
    } else {
      gsap.to(wrapper, {
        y: -56, scale: 0.48, opacity: 0,
        rotation: (Math.random() - 0.5) * 18,
        duration: 0.22, ease: 'power2.in',
        onComplete: renderHand
      });
    }
  } else {
    renderHand();
  }
}

// ─── Social dare pool — quick interaction prompts after book celebrations ────
const SOCIAL_DARES = [
  { icon: '👁️', text: 'Maintain eye contact for 10 seconds. No breaking.' },
  { icon: '🎤', text: 'Roast partner in exactly 5 words. Go.' },
  { icon: '🤫', text: 'Whisper what rank you\'ll ask for next turn.' },
  { icon: '🎭', text: 'Tell one thing you lied about tonight.' },
  { icon: '🍹', text: 'Partner picks your next drink.' },
  { icon: '🎬', text: 'Act out your last GFY miss in mime.' },
  { icon: '📝', text: 'Describe this entire game in 3 words.' },
  { icon: '😈', text: 'Say "bhenchod" in your most seductive voice.' },
  { icon: '🐍', text: 'Confess the biggest advantage you pressed tonight.' },
  { icon: '🪞', text: 'Do your best impression of your partner.' },
  { icon: '⏪', text: 'Name one moment tonight you\'d replay.' },
  { icon: '🔮', text: 'Make a prediction for the next 3 turns.' },
  { icon: '💪', text: 'Partner assigns your next drink strength.' },
  { icon: '🍸', text: 'Tell the bartender (out loud) one thing about your partner.' },
  { icon: '💬', text: 'Say something genuine. No roasting for 10 seconds.' },
];

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
  Sfx.playBookCelebrationAudio();
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

  // Stage 4 — dare chip + social dare (appear together)
  const dareShort = meta.dare?.length > 120 ? `${meta.dare.slice(0, 117)}…` : meta.dare;
  const social = SOCIAL_DARES[Math.floor(Math.random() * SOCIAL_DARES.length)];
  el.innerHTML += `
    <div class="book-dare-chip">
      <strong>Dare</strong>
      ${dareShort ?? 'Do the filth.'}
    </div>
    <div class="book-social-dare">
      <span class="book-social-dare-icon">${social.icon}</span>
      <span class="book-social-dare-text">${social.text}</span>
    </div>`;
  if (gsapReady()) {
    gsap.from('.book-dare-chip', { y: 24, opacity: 0, duration: 0.4, ease: 'power2.out' });
    gsap.from('.book-social-dare', { y: 24, opacity: 0, duration: 0.4, ease: 'power2.out', delay: 0.18 });
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

  const loser = msg.losers[0];
  let selected = DRINK_PRESET_LABELS[0].drinkLabel;
  const scenarioShort = msg.scenario.length > 38 ? `${msg.scenario.slice(0, 38)}…` : msg.scenario;

  content.innerHTML = `
    <div class="drink-choice-sheet">
      <h2>🏆 ${loser.name} drinks</h2>
      <p>You completed <em>${scenarioShort}</em></p>
      <div class="drink-choice-grid" id="drink-choice-grid">
        ${DRINK_PRESET_LABELS.map((d, i) =>
          `<button type="button" class="drink-choice-btn${i === 0 ? ' drink-choice-btn--selected' : ''}" data-drink="${d.drinkLabel}">${d.label}</button>`
        ).join('')}
      </div>
      <input class="drink-choice-custom" id="drink-choice-custom" type="text" placeholder="Or name their poison…" maxlength="40" autocomplete="off">
      <div class="drink-choice-actions">
        <button type="button" class="drink-choice-scan" id="drink-choice-scan">📷 Scan their drink</button>
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

  $('drink-choice-scan')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    openDrinkScan(drink => {
      const drinkLabel = drink.label ?? 'Drink';
      API.send({
        type: 'chooseDrink',
        loserId: loser.id,
        drinkLabel,
        scenario: msg.scenario
      });
      haptic('heavy');
      _bartenderDrinkAssign(loser, drinkLabel, msg.scenario);
    });
  }, { once: true });

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
    haptic('heavy');
    _bartenderDrinkAssign(loser, drinkLabel, msg.scenario);
  }, { once: true });
}

function _bartenderDrinkAssign(loser, drinkLabel, scenario) {
  const winner = state.players.find(p => p.id === state.myId);
  if (!winner || !state.session) return;
  recordEvent(state.session, {
    type: 'drink',
    playerName: winner.name,
    summary: `${winner.name} assigned ${drinkLabel} to ${loser.name} after set`
  });
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
        <button type="button" class="drink-choice-assign" id="drink-log-now">📷 Scan & log drink</button>
        <button type="button" class="drink-assigned-skip" id="drink-skip">Skip for now</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  haptic('heavy');

  if (state.session) {
    const me = state.players.find(p => p.id === state.myId)?.name ?? 'You';
    recordEvent(state.session, {
      type: 'drink',
      playerName: me,
      summary: `${me} must drink ${latest.drinkLabel} (${latest.assignedBy ?? latest.toastFor ?? 'partner'})`
    });
  }

  $('drink-log-now')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    haptic('medium');
    openDrinkScan();
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
    if (action.fromId === state.myId && gsapReady()) {
      const hz = $('hand-zone');
      if (hz) gsap.fromTo(hz, { filter: 'brightness(1)' }, { filter: 'brightness(1.4)', duration: 0.14, yoyo: true, repeat: 1 });
    }
    Sfx.playCardReceive();
    showMoveExplainer(action);
    return;
  } else if (action.type === 'ask_pending') {
    showMoveExplainer(action, 4000);
    return;
  } else if (action.type === 'gfy_claim') {
    Sfx.playGFY();
    showMoveExplainer(action, 5000);
    return;
  } else if (action.type === 'bullshit_caught' || action.type === 'bullshit_wrong') {
    showBullshitOverlay(action);
    showMoveExplainer(action, 5200);
    return;
  } else if (action.type === 'steal') {
    if (action.targetId === state.myId) {
      showBanner('🃏 They stole a card from your hand!');
      haptic('heavy');
    } else {
      text = `${fromP?.name ?? '?'} stole a card from ${toP?.name ?? '?'}.`;
    }
  } else if (action.type === 'comeback') {
    const labels = { steal: 'stole a comeback card', reveal: `peeked a rank`, extra_turn: 'keeps the turn', wild_ask: 'earned Wild Ask' };
    text = `${fromP?.name ?? '?'} — ${labels[action.kind] ?? 'used Comeback'}.`;
  } else if (action.type === 'recovery') {
    return;
  } else if (action.type === 'chaos') {
    text = `⚡ ${action.title} — ${action.text}`;
  } else if (action.type === 'gfy') {
    const lucky = action.continueTurn;

    if (lucky) {
      flashLuckyDraw(action);
      return;
    }

    if (action.bluffSucceeded && action.fromId === state.myId) {
      showBluffOverlay(toP?.name ?? '?');
    }
    showMoveExplainer(action);

    if (action.fromId === state.myId) {
      const gfyMood = action.closeToPond ? 'shocked' : 'angry';
      Sfx.playGFY();
      showGFYOverlay(fromP?.name ?? 'You', toP?.name ?? '?', false, gfyMood);
    } else {
      Sfx.playGFY();
      if (gsapReady()) {
      gsap.fromTo('#screen-game',
        { x: -8 },
        { x: 8, duration: 0.05, ease: 'power1.inOut', yoyo: true, repeat: 7,
          onComplete: () => gsap.set('#screen-game', { x: 0 }) });
      }
    }
    return;
  }

  if (text) {
    banner.innerHTML = text;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 3500);
  }
}

// ─── Lifetime stats — persistent across sessions ────────────────────────────
const LIFETIME_KEY = 'gfy_lifetime';

function getLifetime() {
  try { return JSON.parse(localStorage.getItem(LIFETIME_KEY) ?? '{}'); }
  catch { return {}; }
}

function updateLifetimeStats(data, myId, playerStats) {
  try {
    const lt = getLifetime();
    const myS = playerStats[myId] ?? {};
    lt.totalGames = (lt.totalGames ?? 0) + 1;
    lt.wins       = (lt.wins ?? 0) + (data.winner.id === myId ? 1 : 0);
    lt.totalBluffs  = (lt.totalBluffs  ?? 0) + (myS.bluffsSurvived ?? 0);
    lt.totalMisses  = (lt.totalMisses  ?? 0) + (myS.gfyMisses ?? 0);
    lt.totalLucky   = (lt.totalLucky   ?? 0) + (myS.luckyDraws ?? 0);
    lt.totalBooks   = (lt.totalBooks   ?? 0) + (myS.books ?? 0);
    lt.lastPlayedAt = Date.now();
    localStorage.setItem(LIFETIME_KEY, JSON.stringify(lt));
  } catch { /* quota */ }
}

// ─── Results awards — per-category trophies ───────────────────────────────────
function _computeAwards(sorted, playerStats) {
  if (sorted.length < 2) return [];
  const [a, b] = sorted;
  const aS = playerStats[a.id] ?? {};
  const bS = playerStats[b.id] ?? {};
  const awards = [];

  const _pick = (aVal, bVal, min, emoji, title, fmt) => {
    const maxVal = Math.max(aVal, bVal);
    if (maxVal < min) return;
    const who = aVal >= bVal ? a : b;
    awards.push({ emoji, title, name: who.name, stat: fmt(maxVal) });
  };

  _pick(aS.luckyDraws ?? 0, bS.luckyDraws ?? 0, 2, '🍀', 'Lucky Draw King',
    n => `${n} draw${n > 1 ? 's' : ''}`);
  _pick(aS.bluffsSurvived ?? 0, bS.bluffsSurvived ?? 0, 1, '🎭', 'Smooth Criminal',
    n => `${n} bluff${n > 1 ? 's' : ''} landed`);
  _pick(aS.bullshitCalls ?? 0, bS.bullshitCalls ?? 0, 2, '🔍', 'Lie Detector',
    n => `caught ${n} lie${n > 1 ? 's' : ''}`);
  _pick(aS.gfyMisses ?? 0, bS.gfyMisses ?? 0, 5, '🐸', 'Pond Goblin',
    n => `${n} misses`);
  _pick(aS.successfulAsks ?? 0, bS.successfulAsks ?? 0, 5, '🦈', 'Card Shark',
    n => `${n} asks`);

  return awards;
}

// ─── Night Story generator ────────────────────────────────────────────────────
function _generateNightStory(sorted, myId, playerStats) {
  const winner = sorted[0];
  const loser = sorted[1];
  if (!winner || !loser) return null;

  const wS = playerStats[winner.id] ?? {};
  const lS = playerStats[loser.id] ?? {};
  const margin = winner.books - loser.books;

  const parts = [];

  // Opening
  if (margin >= 4) {
    parts.push(`${winner.name} dominated — ${winner.books} sets to ${loser.books}`);
  } else if (margin === 1) {
    parts.push(`${winner.name} scraped it — ${winner.books}–${loser.books} photo finish`);
  } else if (margin === 2) {
    parts.push(`${winner.name} pulled ahead — ${winner.books}–${loser.books}`);
  } else {
    parts.push(`${winner.name} won ${winner.books}–${loser.books}`);
  }

  // Winner's defining moment
  if ((wS.bluffsSurvived ?? 0) >= 2) {
    parts.push(`bluffed ${wS.bluffsSurvived} times clean`);
  } else if ((wS.luckyDraws ?? 0) >= 3) {
    parts.push(`rode ${wS.luckyDraws} lucky pond draws`);
  } else if ((wS.successfulAsks ?? 0) >= 6) {
    parts.push(`landed ${wS.successfulAsks} straight asks`);
  } else if ((wS.bullshitCalls ?? 0) >= 2) {
    parts.push(`caught ${wS.bullshitCalls} lies`);
  }

  // Loser's narrative
  if ((lS.gfyMisses ?? 0) >= 6) {
    parts.push(`${loser.name} missed the pond ${lS.gfyMisses} times`);
  } else if ((lS.bluffsSurvived ?? 0) >= 2) {
    parts.push(`${loser.name} was smooth but came up short`);
  } else if ((lS.bullshitWrong ?? 0) >= 1) {
    parts.push(`${loser.name} called bullshit wrong ${lS.bullshitWrong} time${lS.bullshitWrong > 1 ? 's' : ''}`);
  }

  return parts.join(' — ') + '. Absolute cinema.';
}

// ─── Results screen ───────────────────────────────────────────────────────────
function showResults(data) {
  releaseWakeLock();
  updateLifetimeStats(data, state.myId, state.playerStats);
  const el = $('results-content');
  if (!el) return;
  const sorted = [...data.scores].sort((a, b) => b.books - a.books);

  const me = sorted.find(s => s.id === state.myId);
  const them = sorted.find(s => s.id !== state.myId);
  const myS = state.playerStats[state.myId] ?? {};
  const thS = state.playerStats[them?.id ?? ''] ?? {};

  const statRows = [
    { emoji: '🍀', label: 'Lucky draws', a: myS.luckyDraws ?? 0, b: thS.luckyDraws ?? 0 },
    { emoji: '✅', label: 'Asks landed', a: myS.successfulAsks ?? 0, b: thS.successfulAsks ?? 0 },
    { emoji: '💀', label: 'GFY misses', a: myS.gfyMisses ?? 0, b: thS.gfyMisses ?? 0 },
    { emoji: '🎭', label: 'Bluffs survived', a: myS.bluffsSurvived ?? 0, b: thS.bluffsSurvived ?? 0 },
    { emoji: '🐂', label: 'Bullshit calls', a: myS.bullshitCalls ?? 0, b: thS.bullshitCalls ?? 0 },
  ].filter(r => r.a > 0 || r.b > 0);

  const statsHtml = statRows.length ? `
    <div class="results-night-stats">
      <div class="results-night-title">Night Stats</div>
      <div class="results-stats-header">
        <span></span>
        <span class="results-stats-name">${me?.name ?? 'You'}</span>
        <span class="results-stats-name results-stats-name--them">${them?.name ?? 'Them'}</span>
      </div>
      ${statRows.map(r => `
        <div class="results-stat-row">
          <span class="results-stat-label">${r.emoji} ${r.label}</span>
          <span class="results-stat-val results-stat-val--me">${r.a}</span>
          <span class="results-stat-val results-stat-val--them">${r.b}</span>
        </div>`).join('')}
    </div>` : '';

  const nightStory = _generateNightStory(sorted, state.myId, state.playerStats);
  const storyHtml = nightStory
    ? `<div class="results-night-story">${nightStory}</div>`
    : '';

  const mission = state.myPowers?.mission;
  const missionHtml = mission ? `
    <div class="results-mission${mission.done ? '' : ' results-mission--miss'}">
      🎯 ${mission.done ? 'Mission complete' : 'Mission missed'}: ${mission.text}
    </div>` : '';

  const awards = _computeAwards(sorted, state.playerStats);
  const awardsHtml = awards.length ? `
    <div class="results-awards">
      ${awards.map(a => `
        <div class="results-award">
          <span class="results-award-emoji">${a.emoji}</span>
          <div class="results-award-body">
            <span class="results-award-title">${a.title}</span>
            <span class="results-award-name">${a.name} · ${a.stat}</span>
          </div>
        </div>`).join('')}
    </div>` : '';

  const fightHtml = sorted.length >= 2 ? `
    <div class="results-fight">
      ${sorted.map((s, i) => {
        const pl = state.players.find(p => p.name === s.name);
        const isWinner = s.name === data.winner.name;
        return `
        <div class="results-fighter${isWinner ? ' results-fighter--winner' : ''}">
          <div class="results-fighter-avatar" data-fighter="${s.id}"></div>
          <span class="results-fighter-name">${s.name}</span>
          <span class="results-fighter-books">${s.books} book${s.books !== 1 ? 's' : ''}</span>
        </div>
        ${i === 0 && sorted.length > 1 ? '<span class="results-vs">VS</span>' : ''}`;
      }).join('')}
    </div>` : '';

  el.innerHTML = `
    <div class="winner-announce">🏆 ${data.winner.name} wins!</div>
    ${fightHtml}
    <ul class="score-list">
      ${sorted.map((s, i) => `<li class="score-item">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${s.name} — ${s.books} set${s.books !== 1 ? 's' : ''}</li>`).join('')}
    </ul>
    ${storyHtml}
    ${missionHtml}
    ${awardsHtml}
    ${statsHtml}`;

  sorted.forEach(s => {
    const host = el.querySelector(`[data-fighter="${s.id}"]`);
    const pl = state.players.find(p => p.id === s.id);
    const isWinner = s.name === data.winner.name;
    mountAvatar(host, _profileForPlayer(pl), {
      mood: isWinner ? 'champion' : 'angry',
      size: 'lg',
      ring: true,
      animate: isWinner
    });
  });

  if (gsapReady()) {
    gsap.from('.winner-announce', { scale: 0, rotation: -12, duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    gsap.from(
      ['.results-fight', '.score-item', '.results-night-story', '.results-award', '.results-night-stats'],
      { y: 16, opacity: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out', delay: 0.28 }
    );
    launchConfetti($('screen-results'));
  }
  showScreen('results');
  Sfx.stopAmbient();
  Sfx.playResultsAmbience();

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
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = `lobby-player${p.isHost ? ' is-host' : ''}`;
    const avatarSlot = document.createElement('div');
    const info = document.createElement('div');
    info.className = 'lobby-player-info';
    info.innerHTML = `
      <span class="lobby-player-name">${p.name}</span>
      <span class="lobby-player-role">${p.isHost ? 'Host' : 'Partner'}</span>`;
    li.appendChild(avatarSlot);
    li.appendChild(info);
    list.appendChild(li);
    const profile = p.id === state.myId
      ? getProfile()
      : (p.profile ?? { name: p.name, mediaFaves: [] });
    mountAvatar(avatarSlot, profile, { size: 'md', ring: true, mood: 'neutral', animate: true });
  });

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

function _homeTraitChips(profile) {
  const chips = [];
  for (const k of (profile.kinks ?? []).slice(0, 2)) {
    if (/public/i.test(k)) chips.push('Public risk');
    else if (/cnc|rpe/i.test(k)) chips.push('CNC chaos');
    else if (/drunk/i.test(k)) chips.push('Drunk chaos');
    else if (/humil/i.test(k)) chips.push('Humiliation play');
    else chips.push(k.split(/[\/·]/)[0].trim().slice(0, 18));
  }
  if (!chips.length) chips.push('Ready to play');
  return chips.map(t => `<span class="home-trait-chip">${t}</span>`).join('');
}

function updateHomeForProfile(profile) {
  const greeting    = $('home-greeting');
  const nameForm    = $('home-name-form');
  const preview     = $('bartender-preview');
  const previewLine = $('bartender-preview-line');
  const nameEl      = $('home-greeting-name');
  const traitsEl    = $('home-greeting-traits');
  const settingsBtn = $('btn-edit-profile');

  if (profile?.name) {
    greeting?.classList.remove('hidden');
    nameForm?.classList.add('hidden');
    settingsBtn?.classList.remove('hidden');
    mountAvatar($('home-avatar'), profile, { size: 'md', ring: true, mood: 'neutral', animate: false });
    if (nameEl) nameEl.textContent = profile.name;
    if (traitsEl) traitsEl.innerHTML = _homeTraitChips(profile);
    if (preview) preview.classList.remove('hidden');
    if (previewLine) {
      previewLine.textContent = homeBartenderLine(profile, getLifetime());
    }

    // Show lifetime stats if the player has history
    const ltEl = $('home-lifetime');
    if (ltEl) {
      const lt = getLifetime();
      if ((lt.totalGames ?? 0) >= 2) {
        const winPct = lt.totalGames > 0 ? Math.round((lt.wins / lt.totalGames) * 100) : 0;
        ltEl.textContent = `${lt.totalGames} matches · ${lt.wins ?? 0}W · ${winPct}% win rate`;
        ltEl.classList.remove('hidden');
      } else {
        ltEl.classList.add('hidden');
      }
    }
  } else {
    greeting?.classList.add('hidden');
    nameForm?.classList.remove('hidden');
    preview?.classList.add('hidden');
    settingsBtn?.classList.add('hidden');
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

function showBartenderTranscript(line, targetName = null, referenceTitle = null, referenceType = null) {
  const overlay = $('bartender-transcript');
  const textEl = $('bartender-transcript-line');
  const sourceEl = $('bartender-transcript-source');
  const row = $('bartender-transcript-avatar-row');
  const avatarHost = $('bartender-transcript-avatar');
  const targetEl = $('bartender-transcript-target');
  if (!overlay || !textEl) return;
  const flat = (line ?? '').replace(/\s+/g, ' ').trim();
  textEl.textContent = flat.length > 200 ? `${flat.slice(0, 197)}…` : flat;

  if (sourceEl) {
    if (referenceTitle) {
      const kind = referenceType === 'movie' ? 'Movie' : referenceType === 'show' ? 'Show' : 'Ref';
      sourceEl.textContent = `${kind} · ${referenceTitle}`;
      sourceEl.classList.remove('hidden');
    } else {
      sourceEl.textContent = '';
      sourceEl.classList.add('hidden');
    }
  }

  if (targetName && row && avatarHost) {
    row.classList.remove('hidden');
    if (targetEl) targetEl.textContent = `Roasting ${targetName}`;
    mountAvatar(avatarHost, _profileByName(targetName), {
      mood: 'smug',
      size: 'md',
      ring: true,
      animate: false
    });
  } else {
    row?.classList.add('hidden');
  }

  overlay.classList.remove('hidden');
  Sfx.playBartenderEnter();
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

function _recordBartenderFranchise(franchise) {
  if (!franchise) return;
  _bartenderRecentFranchises.push(franchise);
  if (_bartenderRecentFranchises.length > 5) {
    _bartenderRecentFranchises = _bartenderRecentFranchises.slice(-5);
  }
}

async function triggerBartender(mode, opts = {}) {
  const playersContext = opts.playersContext ?? _buildPlayersContext();
  const playerName = opts.playerName ?? 'Player';
  const sessionMemory = opts.sessionMemory ?? _bartenderSessionContext(playerName);
  const profile = opts.profile ?? getProfile();
  const gameContext = opts.gameContext ?? buildLiveGameContext(state, opts);

  if (!canTriggerBartender(mode, { ...opts, sessionMemory })) return;

  const now = Date.now();
  if (now < _aiCooldownUntil) return;
  _aiCooldownUntil = now + 5000;

  const result = await apiPost('/api/host', {
    mode,
    playerName,
    scenario:   opts.scenario   ?? null,
    profile,
    playersContext,
    streakInfo: opts.streakInfo ?? null,
    otherPlayer: opts.otherPlayer ?? null,
    sessionMemory,
    gameContext,
    recentFranchises: _bartenderRecentFranchises.slice(-5),
    referenceMode: opts.referenceMode ?? null,
  }).catch(() => null);

  if (result?.line) {
    _recordBartenderFranchise(result.franchise);
    saveLastBartenderEvent({
      mode,
      scenario: opts.scenario ?? null,
      summary: result.line.slice(0, 140)
    });
    showBartenderTranscript(
      result.line,
      playerName,
      result.referenceTitle ?? null,
      result.referenceType ?? null
    );
  }
}

function _scheduleBartender(delayMs, mode, opts) {
  setTimeout(() => triggerBartender(mode, opts), delayMs);
}

const COUNTABLE_MOVES = new Set(['got', 'gfy', 'bullshit_caught', 'bullshit_wrong']);

function _bartenderOptsFromAction(action) {
  const actor = state.players.find(p => p.id === action.fromId);
  const target = state.players.find(p => p.id === action.targetId);
  const actorName = actor?.name ?? '?';
  const myName = state.players.find(p => p.id === state.myId)?.name ?? 'You';
  const rankName = _rankLabel(action.rank);

  if (action.type === 'got') {
    const count = action.count ?? 1;
    return {
      mode: 'steal',
      playerName: actorName,
      scenario: `${actorName} took ${count} "${rankName}" from ${target?.name ?? 'partner'}`,
      profile: action.fromId === state.myId ? getProfile() : _profileForPlayer(actor),
      otherPlayer: target?.name ?? _partnerName(action.fromId)
    };
  }

  if (action.type === 'gfy') {
    const subjectId = action.fromId;
    const subjectName = subjectId === state.myId ? myName : actorName;
    const stats = state.playerStats[subjectId] ?? {};
    let mode;
    let scenario;

    if (action.bluffSucceeded) {
      mode = 'bluff_landed';
      scenario = `${actorName} bluffed "${rankName}" — GFY worked`;
    } else {
      mode = gfyModeFromAction(action, stats);
      if (action.continueTurn) scenario = `${subjectName} lucky pond — "${rankName}"`;
      else if (action.closeToPond) scenario = `${subjectName} had 3 "${rankName}", pond miss`;
      else scenario = `${subjectName} GFY miss — "${rankName}"`;
    }

    return {
      mode,
      playerName: subjectName,
      scenario,
      profile: subjectId === state.myId ? getProfile() : _profileForPlayer(state.players.find(p => p.id === subjectId)),
      streakInfo: gfyStreakInfo(action, stats),
      otherPlayer: target?.name ?? _partnerName(subjectId)
    };
  }

  if (action.type === 'bullshit_caught' || action.type === 'bullshit_wrong') {
    const subjectName = action.fromId === state.myId ? myName : actorName;
    const vibe = action.type === 'bullshit_caught' ? 'caught bluff' : 'wrong bullshit';
    return {
      mode: 'bullshit',
      playerName: subjectName,
      scenario: `${subjectName} ${vibe} on "${rankName}"`,
      profile: action.fromId === state.myId ? getProfile() : _profileForPlayer(actor),
      streakInfo: vibe,
      otherPlayer: (action.fromId === state.myId ? target : actor)?.name
    };
  }

  return null;
}

/** Bhenchod Bartender — every 5 completed table moves, tied to that move. */
function _maybeBartenderEveryFiveMoves(action, moveCount) {
  if (!action || _dealingLocked) return;
  if (!COUNTABLE_MOVES.has(action.type)) return;
  if (!moveCount || moveCount % BARTENDER_MOVE_INTERVAL !== 0) return;
  if (moveCount === _lastBartenderAtMove) return;

  const sig = JSON.stringify(action);
  if (sig === _lastCommentedActionSig) return;
  _lastCommentedActionSig = sig;
  _lastBartenderAtMove = moveCount;

  const opts = _bartenderOptsFromAction(action);
  if (!opts) return;

  _scheduleBartender(900, opts.mode, opts);
}

function _watchTurnStall(gameState) {
  if (_dealingLocked || state.screen !== 'game') return;
  const turnId = gameState?.currentTurnPlayerId;
  const phase = gameState?.phase;
  if (!turnId || phase !== 'play') {
    state._turnWatch = null;
    return;
  }

  const sig = `${turnId}-${gameState.pendingAsk ? 'ask' : 'play'}`;
  const now = Date.now();
  const stallName = state.players.find(p => p.id === turnId)?.name ?? 'Player';

  if (!state._turnWatch || state._turnWatch.sig !== sig) {
    state._turnWatch = { sig, playerId: turnId, since: now, fired: false };
    return;
  }

  if (state._turnWatch.fired || now - state._turnWatch.since < 32_000) return;
  state._turnWatch.fired = true;
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

  const fromStats = state.playerStats[action.fromId] ?? _ensureStats(action.fromId);
  updateStatsFromAction(fromStats, action);

  // Client-side chaos events (Power Hour, Pond Tax, Bollywood Twist, etc.)
  const clientChaos = maybeTriggerChaos(session);
  if (clientChaos) {
    showChaosBanner(clientChaos);
  }

  // ── Bartender callback highlights ───────────────────────────────────────────
  // Record dramatic moments so the bartender can reference them later in the match.
  const _turn = session.actionCount;
  const _nameOf = id => state.players.find(p => p.id === id)?.name ?? '?';
  const _rankName = rank => SCENARIOS.find(s => s.rank === rank)?.name ?? rank;

  if (action.type === 'gfy' && action.closeToPond && action.fromId === state.myId) {
    recordHighlight(session, {
      summary: `${_nameOf(action.fromId)} had 3 of "${_rankName(action.rank)}", missed the pond`,
      type: 'close_call', turn: _turn
    });
  }
  if (action.type === 'gfy' && !action.continueTurn && action.fromId === state.myId
      && fromStats.consecutiveMisses >= 4) {
    recordHighlight(session, {
      summary: `${_nameOf(action.fromId)} on a ${fromStats.consecutiveMisses}-miss cold streak`,
      type: 'streak', turn: _turn
    });
  }
  if (action.type === 'gfy' && action.bluffSucceeded && action.targetId === state.myId) {
    recordHighlight(session, {
      summary: `${_nameOf(action.targetId)} bluffed ${_nameOf(action.fromId)} clean on "${_rankName(action.rank)}"`,
      type: 'bluff', turn: _turn
    });
  }
  if (action.type === 'bullshit_caught' && action.fromId === state.myId) {
    recordHighlight(session, {
      summary: `${_nameOf(action.fromId)} caught ${_nameOf(action.targetId)} lying on "${_rankName(action.rank)}"`,
      type: 'bullshit', turn: _turn
    });
  }
  if (action.type === 'gfy' && action.continueTurn && action.fromId === state.myId
      && fromStats.luckyDraws >= 2) {
    recordHighlight(session, {
      summary: `${_nameOf(action.fromId)} got lucky draw #${fromStats.luckyDraws} on "${_rankName(action.rank)}"`,
      type: 'lucky', turn: _turn
    });
  }

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
    const wrongCaller = players?.find(p => p.id === action.targetId);
    recordEvent(session, {
      type: 'bullshit',
      playerName: wrongCaller?.name,
      summary: `${wrongCaller?.name ?? '?'} wrong bullshit call — draws 2`
    });
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
    _bartenderRecentFranchises = [];
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
    _lastBartenderAtMove = 0;
    _aiCooldownUntil = 0;
    _prevHandRanks = new Set();
    state.gameHeat = 0;
    state._lastBonusDrawSig = null;
    state._lastHouseRefillSig = null;
    state._turnWatch = null;
    showScreen('game');
    Sfx.startAmbient();
    runSetupSequence(msg);
  });

  API.onMessage('snapshot', msg => {
    state.myHand = msg.myHand;
    state.players = msg.players;
    msg.players?.forEach(p => { if (p.profile?.name) prewarmAvatar(p.profile); });
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
      updateGameChrome();
      updatePartnerHints();
    }

    const newHeat = msg.gameState.stalemate?.heatLevel ?? 0;
    Sfx.setHeatLevel(newHeat);
    if (newHeat >= 5 && (state.gameHeat ?? 0) < 5) Sfx.playHeatWarning();
    state.gameHeat = newHeat;

    // ── House refill (< 3 cards at turn end → draw to 5) ─────────────────────
    if (msg.gameState.houseRefill && !_dealingLocked) {
      const hr = msg.gameState.houseRefill;
      const hrSig = `${hr.playerId}-${hr.count}`;
      if (hrSig !== state._lastHouseRefillSig) {
        state._lastHouseRefillSig = hrSig;
        if (hr.playerId === state.myId) {
          showHouseRefillMoment(hr.count);
        } else {
          const who = state.players.find(p => p.id === hr.playerId)?.name ?? 'They';
          showBanner(`🍸 ${who} got a house refill (${hr.count} cards)`);
        }
      }
    }

    // ── Bonus draws (low hand / dead-hand rescue) ─────────────────────────────
    if (msg.gameState.bonusDraw && !_dealingLocked) {
      const bd = msg.gameState.bonusDraw;
      const bdSig = `${bd.playerId}-${bd.reason}-${bd.count}`;
      if (bdSig !== state._lastBonusDrawSig) {
        state._lastBonusDrawSig = bdSig;
        if (bd.playerId === state.myId) {
          if (bd.reason === 'dead_hand') {
            showBanner('⚡ Comeback draw — 2 cards from the pond');
            haptic('heavy');
          } else if (bd.reason === 'low_hand') {
            showBanner('🃏 Low hand — drew 1 card');
          }
        } else {
          const whoName = state.players.find(p => p.id === bd.playerId)?.name ?? 'They';
          if (bd.reason === 'dead_hand') showBanner(`⚡ ${whoName} drew 2 (comeback draw)`);
        }
      }
    }

    if (msg.gameState.lastChaos) {
      const cs = JSON.stringify(msg.gameState.lastChaos);
      if (cs !== state._lastChaosSig) {
        state._lastChaosSig = cs;
        if (msg.gameState.lastChaos.recovery) {
          showRecoveryBanner(msg.gameState.lastChaos);
        } else {
          showBanner(`⚡ ${msg.gameState.lastChaos.title} — ${msg.gameState.lastChaos.text}`);
        }
      }
    }

    if (msg.gameState.rankReveal) {
      const rr = msg.gameState.rankReveal;
      const rs = `${rr.rank}-${rr.at}`;
      if (rs !== state._lastRankRevealSig) {
        state._lastRankRevealSig = rs;
        const name = SCENARIOS.find(s => s.rank === rr.rank)?.name ?? rr.rank;
        showBanner(`👁️ Rank Reveal — you both hold <strong>${name}</strong> (${rr.rank})`);
        haptic('medium');
      }
    }

    if (msg.gameState.cardTax && !state._cardTaxShown) {
      state._cardTaxShown = true;
      showBanner('💸 Card Tax — next GFY miss draws 2');
    }

    _watchTurnStall(msg.gameState);

    if (msg.gameState.lastAction) {
      const action = msg.gameState.lastAction;
      const sig = JSON.stringify(action);

      if (sig !== _lastProcessedActionSig) {
        _lastProcessedActionSig = sig;
        updatePlayerStats(action, msg.players);
        showActionBanner(action);
      }

      _maybeBartenderEveryFiveMoves(action, msg.gameState.moveCount ?? 0);
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
  });

  API.onMessage('chooseLoserDrink', msg => showChooseLoserDrink(msg));

  API.onMessage('gameOver', msg => showResults(msg));
  API.onMessage('error', msg => showBanner(msg.message, true));

  API.onMessage('bacUpdate', msg => {
    if (msg.playerId !== state.myId) return;
    const fill = document.getElementById('bac-fill');
    const label = document.getElementById('bac-label');
    if (!fill || msg.level == null) return;
    fill.style.height = `${msg.level * 10}%`;
    fill.className = `bac-bar-fill level-${msg.level <= 3 ? 'low' : msg.level <= 6 ? 'mid' : msg.level <= 8 ? 'high' : 'danger'}`;
    if (label) label.textContent = msg.level;
  });
}

// ─── UI event wiring ──────────────────────────────────────────────────────────
function _askOpponentWithSelectedCard() {
  const opp = state.players.find(p => p.id !== state.myId);
  if (!opp || !state.selectedCard) return;
  state.selectedTarget = { id: opp.id, name: opp.name };
  sendAsk();
}

function wireUI() {
  document.addEventListener('touchmove', _onDragMove, { passive: false });
  document.addEventListener('touchend', _onDragEnd, { passive: true });
  document.addEventListener('mousemove', _onDragMove);
  document.addEventListener('mouseup', _onDragEnd);

  $('draw-pile-el')?.addEventListener('click', () => {
    if (!isMyTurnToAsk() || _askFlowBlocksPlay()) return;
    if (!state.selectedCard) return;
    _askOpponentWithSelectedCard();
  });

  $('deck-count')?.addEventListener('click', () => {
    const code = state.roomCode ?? $('room-code-display')?.textContent?.trim();
    if (code) {
      navigator.clipboard?.writeText(code).catch(() => {});
      showBanner(`Room ${code}`, false);
      haptic('light');
    }
  });

  $('btn-card-detail-close')?.addEventListener('click', closeCardDetailSheet);
  $('card-detail-backdrop')?.addEventListener('click', closeCardDetailSheet);

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

    const anchor = roastAnchorFromGame(state, me.name);
    if (!anchor) {
      showBanner('Play a move first — I roast misses, sets, bluffs, steals, and drinks from this table.');
      return;
    }

    await triggerBartender('roast', {
      playerName: me.name,
      scenario: anchor.scenario,
      profile: getProfile(),
      playersContext: _buildPlayersContext(),
      streakInfo: anchor.streakInfo,
      otherPlayer: _partnerName(state.myId),
      gameContext: buildLiveGameContext(state, anchor),
    });
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
    haptic('medium');
    openDrinkScan();
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
function showRecoveryBanner(event) {
  const banner = $('action-banner');
  if (!banner) return;
  const emoji = event.emoji ?? '🌀';
  banner.innerHTML = `${emoji} <strong>${event.title}</strong> — ${event.text}`;
  banner.classList.remove('hidden', 'banner--error');
  banner.classList.add('banner--recovery');
  haptic('heavy');
  setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('banner--recovery');
  }, 4200);
}

function showHouseRefillMoment(count) {
  const banner = $('action-banner');
  if (banner) {
    banner.innerHTML = `🍸 <strong>House Refill</strong> — ${count} card${count > 1 ? 's' : ''} from the pond`;
    banner.classList.remove('hidden', 'banner--error');
    banner.classList.add('banner--recovery');
    setTimeout(() => {
      banner.classList.add('hidden');
      banner.classList.remove('banner--recovery');
    }, 3800);
  }
  haptic('heavy');
  const hz = $('hand-zone');
  if (gsapReady() && hz) {
    gsap.fromTo(hz,
      { y: 0, filter: 'brightness(1)' },
      { y: -6, filter: 'brightness(1.25)', duration: 0.12, yoyo: true, repeat: 5,
        ease: 'power2.out', onComplete: () => gsap.set(hz, { y: 0, filter: 'none' }) }
    );
  }
}

function showBanner(text, isError = false) {
  const banner = $('action-banner');
  if (!banner) return;
  banner.innerHTML = text;
  banner.classList.toggle('banner--error', isError);
  banner.classList.remove('banner--recovery');
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 3200);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function init() {
  initMobile();
  document.addEventListener('pointerdown', _bootAudioOnce, { once: true });
  document.addEventListener('click', _bootAudioOnce, { once: true });
  API.init();
  wireHandlers();
  wireUI();

  setInterval(() => {
    if (state.screen === 'game' && state.gameState) {
      _watchTurnStall(state.gameState);
    }
  }, 5000);

  const bacContainer = $('bac-panel-container');
  if (bacContainer) {
    initBac(bacContainer, drink => {
      const payload = state.session?.powerHour
        ? { ...drink, oz: (drink.oz ?? 12) * 2, label: `${drink.label} (Power Hour)` }
        : drink;
      API.send({ type: 'logDrink', drink: payload });
      if (state.session) {
        const me = state.players.find(p => p.id === state.myId)?.name ?? 'You';
        const label = payload.label ?? drink.label ?? 'drink';
        recordEvent(state.session, {
          type: 'drink',
          playerName: me,
          summary: `${me} scanned and logged ${label}`
        });
      }
    });
  }

  state.profile = getProfile();
  if (state.profile?.name) prewarmAvatar(state.profile);
  wireLandingPage();
  showScreen('landing');
  initLandingMotion();
  const hero = document.querySelector('.lp-hero-inner');
  if (hero) hero.classList.add('lp-in-view');
  if (gsapReady()) {
    gsap.fromTo('.lp-hero-stack',
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' }
    );
    gsap.fromTo('.lp-logo',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out', delay: 0.08 }
    );
    gsap.fromTo('.lp-tagline, .lp-hero-actions',
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', delay: 0.18, stagger: 0.06 }
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
