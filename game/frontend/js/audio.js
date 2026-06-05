/**
 * GFY procedural audio — party-game mix (Web Audio API).
 * Volumes: ambient 10%, UI 35%, celebration 70%, major 100%.
 */

import { gameHaptic } from './mobile.js';

const VOL = { ambient: 0.1, ui: 0.35, celebration: 0.7, major: 1.0 };
const PRIORITY = { ui: 0, bartender: 1, chaos: 2, celebration: 3, major: 4 };

let _ctx = null;
let _master = null;
let _ambientBus = null;
let _sfxBus = null;
let _muted = false;
let _ambientOn = false;
let _heatLevel = 0;

let _lockUntil = 0;
let _lockPriority = -1;

let _ambientNodes = null;
let _bassOsc = null;
let _bassGain = null;
let _chatterTimer = null;
let _clinkTimer = null;

// ─── Context & mix ───────────────────────────────────────────────────────────

function ctx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _ctx.createGain();
    _master.gain.value = 1;
    _ambientBus = _ctx.createGain();
    _ambientBus.gain.value = VOL.ambient;
    _sfxBus = _ctx.createGain();
    _sfxBus.gain.value = 1;
    _ambientBus.connect(_master);
    _sfxBus.connect(_master);
    _master.connect(_ctx.destination);
  }
  return _ctx;
}

export function initAudio() {
  const c = ctx();
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function setAudioMuted(m) {
  _muted = m;
  if (_master) _master.gain.value = m ? 0 : 1;
}

function _resume() {
  try {
    const c = ctx();
    if (c.state === 'suspended') c.resume();
  } catch { /* noop */ }
}

function _canPlay(priority) {
  if (_muted) return false;
  if (Date.now() < _lockUntil && priority < _lockPriority) return false;
  return true;
}

function _lock(ms, priority) {
  const until = Date.now() + ms;
  if (until > _lockUntil || priority >= _lockPriority) {
    _lockUntil = until;
    _lockPriority = priority;
  }
}

function _at(t = 0) {
  return ctx().currentTime + t;
}

function _dest(bus = 'sfx') {
  return bus === 'ambient' ? _ambientBus : _sfxBus;
}

function _gainFor(tier) {
  return VOL[tier] ?? VOL.ui;
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function _noiseBuffer(duration, shape = 'exp') {
  const c = ctx();
  const n = Math.max(1, Math.floor(c.sampleRate * duration));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let env = (1 - t) * (1 - t);
    if (shape === 'flat') env = 0.22;
    else if (shape !== 'exp') env = Math.sin(Math.PI * t);
    ch[i] = (Math.random() * 2 - 1) * env;
  }
  return buf;
}

function _playNoise({ duration = 0.08, filterHz = 2000, q = 0.8, vol = 0.04, tier = 'ui', when = 0, bus = 'sfx' }) {
  if (!_canPlay(PRIORITY.ui)) return;
  _resume();
  const c = ctx();
  const t0 = _at(when);
  const src = c.createBufferSource();
  src.buffer = _noiseBuffer(duration);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filterHz;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol * _gainFor(tier), t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(bp);
  bp.connect(g);
  g.connect(_dest(bus));
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

function _playTone({ freq = 440, type = 'sine', duration = 0.1, vol = 0.12, tier = 'ui', when = 0, slideTo = null }) {
  if (!_canPlay(PRIORITY.ui)) return;
  _resume();
  const c = ctx();
  const t0 = _at(when);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  g.gain.setValueAtTime(vol * _gainFor(tier), t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g);
  g.connect(_sfxBus);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function _playChord(notes, spacing = 0.07, tier = 'celebration', priority = PRIORITY.celebration) {
  if (!_canPlay(priority)) return;
  notes.forEach(([f, d], i) => {
    _playTone({ freq: f, duration: d, vol: 0.14, tier, when: i * spacing, type: 'sine' });
  });
}

// ─── Ambient bar (looping atmosphere) ────────────────────────────────────────

export function startAmbient() {
  if (_ambientOn) return;
  _resume();
  _ambientOn = true;
  const c = ctx();

  const rumble = c.createOscillator();
  const rumbleG = c.createGain();
  rumble.type = 'sine';
  rumble.frequency.value = 42;
  rumbleG.gain.value = 0.018 * _gainFor('ambient');
  rumble.connect(rumbleG);
  rumbleG.connect(_ambientBus);
  rumble.start();

  const room = c.createBufferSource();
  room.buffer = _noiseBuffer(4, 'flat');
  room.loop = true;
  const roomF = c.createBiquadFilter();
  roomF.type = 'lowpass';
  roomF.frequency.value = 380;
  const roomG = c.createGain();
  roomG.gain.value = 0.012 * _gainFor('ambient');
  room.connect(roomF);
  roomF.connect(roomG);
  roomG.connect(_ambientBus);
  room.start();

  _bassOsc = rumble;
  _bassGain = rumbleG;
  _ambientNodes = { room, rumble };

  const scheduleClink = () => {
    if (!_ambientOn) return;
    _playNoise({ duration: 0.04, filterHz: 4200, vol: 0.025, tier: 'ambient', bus: 'ambient', when: 0 });
    _clinkTimer = setTimeout(scheduleClink, 4000 + Math.random() * 7000);
  };
  scheduleClink();

  const scheduleChatter = () => {
    if (!_ambientOn) return;
    _playNoise({ duration: 0.18, filterHz: 900, q: 0.5, vol: 0.008, tier: 'ambient', bus: 'ambient' });
    _chatterTimer = setTimeout(scheduleChatter, 2500 + Math.random() * 5000);
  };
  scheduleChatter();
}

export function stopAmbient() {
  _ambientOn = false;
  clearTimeout(_chatterTimer);
  clearTimeout(_clinkTimer);
  _chatterTimer = _clinkTimer = null;
  try {
    _ambientNodes?.room?.stop();
    _ambientNodes?.rumble?.stop();
  } catch { /* already stopped */ }
  _ambientNodes = null;
  _bassOsc = _bassGain = null;
}

export function setHeatLevel(level) {
  const prev = _heatLevel;
  _heatLevel = level;
  if (!_bassGain) return;
  const base = 0.018;
  const mult = level >= 7 ? 2.8 : level >= 5 ? 2 : level >= 3 ? 1.35 : 1;
  _bassGain.gain.setTargetAtTime(base * mult * _gainFor('ambient'), ctx().currentTime, 0.4);

  if (level >= 7 && prev < 7) playHeatAlarm();
  else if (level >= 5 && prev < 5) playHeatPulse();
  else if (level >= 3 && prev < 3) playHeatRumble();
}

function playHeatRumble() {
  if (!_canPlay(PRIORITY.ui)) return;
  _playTone({ freq: 55, type: 'sine', duration: 0.35, vol: 0.08, tier: 'ui' });
}

function playHeatPulse() {
  if (!_canPlay(PRIORITY.ui)) return;
  _playTone({ freq: 70, type: 'triangle', duration: 0.2, vol: 0.1, tier: 'ui' });
  _playTone({ freq: 90, type: 'triangle', duration: 0.2, vol: 0.08, tier: 'ui', when: 0.12 });
}

export function playHeatWarning() {
  playHeatPulse();
  gameHaptic('chaos');
}

function playHeatAlarm() {
  if (!_canPlay(PRIORITY.chaos)) return;
  _lock(800, PRIORITY.chaos);
  [[440, 0.08], [380, 0.08], [440, 0.12]].forEach(([f, d], i) => {
    _playTone({ freq: f, type: 'square', duration: d, vol: 0.09, tier: 'celebration', when: i * 0.1 });
  });
  gameHaptic('chaos');
}

// ─── Card UI ───────────────────────────────────────────────────────────────────

export function playCardSelect() {
  if (!_canPlay(PRIORITY.ui)) return;
  _playNoise({ duration: 0.03, filterHz: 3200, vol: 0.028, tier: 'ui' });
  _playTone({ freq: 880, type: 'sine', duration: 0.04, vol: 0.04, tier: 'ui' });
  gameHaptic('light');
}

export function playCardHover() {
  if (!_canPlay(PRIORITY.ui)) return;
  _playTone({ freq: 1200, type: 'sine', duration: 0.025, vol: 0.022, tier: 'ui' });
}

export function playCardThrow() {
  if (!_canPlay(PRIORITY.ui)) return;
  _playNoise({ duration: 0.1, filterHz: 2600, vol: 0.045, tier: 'ui' });
  gameHaptic('medium');
}

/** Legacy alias */
export function playCardSlide() {
  playCardThrow();
  const c = ctx();
  const t0 = _at(0.07);
  const tap = c.createOscillator();
  const g = c.createGain();
  tap.type = 'sine';
  tap.frequency.setValueAtTime(220, t0);
  tap.frequency.exponentialRampToValueAtTime(110, t0 + 0.06);
  g.gain.setValueAtTime(0.04 * _gainFor('ui'), t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
  tap.connect(g);
  g.connect(_sfxBus);
  tap.start(t0);
  tap.stop(t0 + 0.08);
}

export function playCardReceive() {
  if (!_canPlay(PRIORITY.ui)) return;
  _playTone({ freq: 520, type: 'sine', duration: 0.06, vol: 0.1, tier: 'ui', slideTo: 780 });
  gameHaptic('light');
}

export function playDeal() {
  playCardSelect();
}

// ─── GFY moment ──────────────────────────────────────────────────────────────

export function playGFY() {
  if (!_canPlay(PRIORITY.major)) return;
  _lock(1400, PRIORITY.major);
  _resume();
  const c = ctx();
  const t0 = _at(0);

  _playNoise({ duration: 0.14, filterHz: 400, vol: 0.12, tier: 'major', when: 0 });
  _playNoise({ duration: 0.08, filterHz: 180, vol: 0.18, tier: 'major', when: 0.05 });

  const hit = c.createOscillator();
  const hitG = c.createGain();
  hit.type = 'sine';
  hit.frequency.setValueAtTime(90, t0 + 0.1);
  hit.frequency.exponentialRampToValueAtTime(45, t0 + 0.45);
  hitG.gain.setValueAtTime(0.001, t0 + 0.1);
  hitG.gain.linearRampToValueAtTime(0.35 * _gainFor('major'), t0 + 0.12);
  hitG.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
  hit.connect(hitG);
  hitG.connect(_sfxBus);
  hit.start(t0 + 0.1);
  hit.stop(t0 + 1.15);

  const rev = c.createOscillator();
  const revG = c.createGain();
  rev.type = 'triangle';
  rev.frequency.value = 110;
  revG.gain.setValueAtTime(0.08 * _gainFor('major'), t0 + 0.2);
  revG.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
  rev.connect(revG);
  revG.connect(_sfxBus);
  rev.start(t0 + 0.2);
  rev.stop(t0 + 1.05);

  gameHaptic('gfy');
}

// ─── Bluff & bullshit ────────────────────────────────────────────────────────

export function playBluffLanded() {
  playBluffSuccess();
}

export function playBluffSuccess() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(600, PRIORITY.celebration);
  _playChord([[392, 0.1], [494, 0.1], [587, 0.14]], 0.07, 'celebration');
  _playTone({ freq: 740, type: 'triangle', duration: 0.12, vol: 0.1, tier: 'celebration', when: 0.2 });
  gameHaptic('bullshitSuccess');
}

export function playBullshitCalled() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(900, PRIORITY.celebration);
  _playNoise({ duration: 0.06, filterHz: 800, vol: 0.14, tier: 'celebration' });
  _playTone({ freq: 200, type: 'sawtooth', duration: 0.05, vol: 0.06, tier: 'celebration', when: 0.04 });
  gameHaptic('medium');
}

export function playBullshitSuccess() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(500, PRIORITY.celebration);
  _playChord([[523, 0.08], [659, 0.1], [784, 0.14]], 0.06, 'celebration');
  gameHaptic('bullshitSuccess');
}

export function playBullshitFailed() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(700, PRIORITY.celebration);
  _playTone({ freq: 280, type: 'sawtooth', duration: 0.2, vol: 0.12, tier: 'celebration', slideTo: 140 });
  _playTone({ freq: 180, type: 'sine', duration: 0.25, vol: 0.1, tier: 'celebration', when: 0.1, slideTo: 90 });
  gameHaptic('medium');
}

// ─── Book complete ───────────────────────────────────────────────────────────

export function playBookSlam() {
  playBookLock();
}

export function playBookLock() {
  if (!_canPlay(PRIORITY.major)) return;
  _lock(3200, PRIORITY.major);
  _playTone({ freq: 180, type: 'square', duration: 0.08, vol: 0.2, tier: 'major' });
  _playTone({ freq: 220, type: 'square', duration: 0.08, vol: 0.18, tier: 'major', when: 0.05 });
  _playTone({ freq: 280, type: 'square', duration: 0.1, vol: 0.16, tier: 'major', when: 0.1 });
  gameHaptic('bookComplete');
}

export function playBookJackpot() {
  if (!_canPlay(PRIORITY.major)) return;
  _playChord([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.2]], 0.09, 'major', PRIORITY.major);
}

export function playBookSparkle() {
  if (!_canPlay(PRIORITY.major)) return;
  [1200, 1400, 1600, 1800].forEach((f, i) => {
    _playTone({ freq: f, type: 'sine', duration: 0.08, vol: 0.06, tier: 'major', when: i * 0.04 });
  });
}

export function playBookFlourish() {
  if (!_canPlay(PRIORITY.major)) return;
  _playChord([[392, 0.15], [523, 0.15], [659, 0.2], [784, 0.25]], 0.1, 'major', PRIORITY.major);
}

export function playBook() {
  playBookFlourish();
}

export function playBookCelebrationAudio() {
  playBookLock();
  setTimeout(() => playBookJackpot(), 420);
  setTimeout(() => playBookSparkle(), 680);
  setTimeout(() => playBookFlourish(), 1100);
}

// ─── Lucky draw & close call ─────────────────────────────────────────────────

export function playLuckyDraw() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(1800, PRIORITY.celebration);
  _playNoise({ duration: 0.12, filterHz: 600, vol: 0.08, tier: 'celebration' });
  _playTone({ freq: 330, type: 'sine', duration: 0.1, vol: 0.08, tier: 'celebration', when: 0.1, slideTo: 440 });
  setTimeout(() => {
    _playChord([[523, 0.1], [659, 0.1], [784, 0.14], [988, 0.18]], 0.08, 'celebration');
    _playTone({ freq: 1047, type: 'sine', duration: 0.08, vol: 0.14, tier: 'celebration', when: 0.35 });
  }, 200);
  gameHaptic('luckyDraw');
}

export function playCloseCall() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(1200, PRIORITY.celebration);
  _playTone({ freq: 72, type: 'sine', duration: 0.12, vol: 0.14, tier: 'celebration' });
  _playTone({ freq: 72, type: 'sine', duration: 0.12, vol: 0.12, tier: 'celebration', when: 0.28 });
  setTimeout(() => {
    _playNoise({ duration: 0.05, filterHz: 5000, vol: 0.1, tier: 'celebration' });
    _playTone({ freq: 240, type: 'sawtooth', duration: 0.22, vol: 0.1, tier: 'celebration', slideTo: 120 });
  }, 450);
  gameHaptic('closeCall');
}

// ─── Chaos events ────────────────────────────────────────────────────────────

const CHAOS_STING = {
  power_hour: () => {
    _playNoise({ duration: 0.15, filterHz: 400, vol: 0.06, tier: 'celebration' });
    _playChord([[330, 0.08], [415, 0.08], [523, 0.12]], 0.06, 'celebration');
  },
  pond_tax: () => {
    _playTone({ freq: 880, type: 'square', duration: 0.06, vol: 0.08, tier: 'celebration' });
    _playTone({ freq: 660, type: 'square', duration: 0.08, vol: 0.07, tier: 'celebration', when: 0.08 });
  },
  reverse_roast: () => {
    _playTone({ freq: 400, type: 'sawtooth', duration: 0.15, vol: 0.06, tier: 'celebration', slideTo: 120 });
  },
  bollywood_twist: () => {
    _playChord([[523, 0.08], [622, 0.08], [740, 0.1]], 0.07, 'celebration');
  },
  double_book: () => {
    _playTone({ freq: 988, type: 'sine', duration: 0.15, vol: 0.1, tier: 'celebration' });
  }
};

export function playChaosEvent(eventId = null) {
  if (!_canPlay(PRIORITY.chaos)) return;
  _lock(1200, PRIORITY.chaos);
  playChaosSting();
  const custom = eventId && CHAOS_STING[eventId];
  setTimeout(() => (custom ? custom() : playChaosTail()), 280);
  gameHaptic('chaos');
}

function playChaosSting() {
  _playTone({ freq: 520, type: 'square', duration: 0.07, vol: 0.09, tier: 'celebration' });
  _playTone({ freq: 780, type: 'square', duration: 0.09, vol: 0.08, tier: 'celebration', when: 0.06 });
}

function playChaosTail() {
  _playChord([[330, 0.07], [415, 0.07], [523, 0.1], [880, 0.08]], 0.05, 'celebration');
}

// ─── Bartender & results ─────────────────────────────────────────────────────

export function playBartenderEnter() {
  if (!_canPlay(PRIORITY.bartender)) return;
  if (Date.now() < _lockUntil && _lockPriority >= PRIORITY.celebration) return;
  _playNoise({ duration: 0.2, filterHz: 1200, vol: 0.04, tier: 'ui' });
  _playTone({ freq: 660, type: 'sine', duration: 0.08, vol: 0.06, tier: 'ui', when: 0.05 });
  _playTone({ freq: 880, type: 'sine', duration: 0.1, vol: 0.05, tier: 'ui', when: 0.12 });
  _playNoise({ duration: 0.08, filterHz: 2000, vol: 0.02, tier: 'ambient', bus: 'ambient', when: 0.18 });
  gameHaptic('light');
}

export function playResultsAmbience() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(2500, PRIORITY.celebration);
  _playTone({ freq: 262, type: 'triangle', duration: 0.5, vol: 0.08, tier: 'celebration' });
  _playTone({ freq: 330, type: 'triangle', duration: 0.5, vol: 0.07, tier: 'celebration', when: 0.15 });
  _playTone({ freq: 392, type: 'triangle', duration: 0.6, vol: 0.06, tier: 'celebration', when: 0.3 });
  _playTone({ freq: 523, type: 'sine', duration: 0.8, vol: 0.05, tier: 'celebration', when: 0.5 });
}

export function playAchievementSound() {
  if (!_canPlay(PRIORITY.celebration)) return;
  _lock(400, PRIORITY.celebration);
  _playChord([[523, 0.1], [659, 0.1], [784, 0.1], [1046, 0.18]], 0.065, 'celebration');
  gameHaptic('medium');
}
