import { apiPost } from './api.js';
import { getProfile } from './profile.js';

const DRINK_PRESETS = [
  { label: 'Beer',     abv: 5,  oz: 12,  emoji: '🍺' },
  { label: 'Wine',     abv: 13, oz: 5,   emoji: '🍷' },
  { label: 'Shot',     abv: 40, oz: 1.5, emoji: '🥃' },
  { label: 'Cocktail', abv: 12, oz: 6,   emoji: '🍹' },
  { label: 'Seltzer',  abv: 5,  oz: 12,  emoji: '🫧' },
  { label: 'Vodka',    abv: 40, oz: 1.5, emoji: '🥃' },
  { label: 'Tequila',  abv: 40, oz: 1.5, emoji: '🍋' },
  { label: 'Energy',   abv: 0,  oz: 8,   emoji: '⚡' }
];

const MANUAL_TYPES = [
  { type: 'beer', label: 'Beer', abv: 5, oz: 12 },
  { type: 'wine', label: 'Wine', abv: 13, oz: 5 },
  { type: 'whiskey', label: 'Whiskey', abv: 40, oz: 1.5 },
  { type: 'vodka', label: 'Vodka', abv: 40, oz: 1.5 },
  { type: 'tequila', label: 'Tequila', abv: 40, oz: 1.5 },
  { type: 'cocktail', label: 'Cocktail', abv: 12, oz: 6 },
  { type: 'seltzer', label: 'Seltzer', abv: 5, oz: 12 },
  { type: 'energy', label: 'Energy Drink', abv: 0, oz: 8 },
  { type: 'soda', label: 'Soda / Mixer', abv: 0, oz: 12 }
];

let myDrinks = [];
let currentBAC = 0;
let currentLevel = 0;
let _onLogDrink = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export function initBac(container, onLogDrink) {
  _onLogDrink = onLogDrink;
  container.innerHTML = `
    <div class="bac-panel bac-panel--camera-first">
      <div class="bac-meter-wrap">
        <div class="bac-bar-bg">
          <div class="bac-bar-fill" id="bac-fill"></div>
          <div class="bac-level-label" id="bac-label">0</div>
        </div>
      </div>
      <button type="button" class="bac-scan-primary" id="bac-scan-primary" aria-label="Scan drink with camera">
        <span class="bac-scan-primary-icon">📷</span>
        <span class="bac-scan-primary-text">Scan Drink</span>
        <span class="bac-scan-primary-sub">Camera · auto-detect · confirm</span>
      </button>
      <details class="bac-quick-log">
        <summary>Quick log without camera</summary>
        <div class="bac-presets">
          ${DRINK_PRESETS.map(d => `
            <button type="button" class="bac-preset-btn" data-abv="${d.abv}" data-oz="${d.oz}" data-label="${d.label}">
              <span>${d.emoji}</span><span>${d.label}</span>
            </button>`).join('')}
        </div>
      </details>
      <p class="bac-disclaimer">BAC estimates are for entertainment only. Never drive after drinking.</p>
    </div>
    <div class="bac-modal hidden" id="bac-intervention">
      <div class="bac-modal-box">
        <div class="bac-modal-icon">💧</div>
        <p id="bac-modal-msg"></p>
        <button type="button" id="bac-modal-ok">Got it</button>
      </div>
    </div>`;

  container.querySelector('#bac-scan-primary')?.addEventListener('click', () => openDrinkScan());
  container.querySelectorAll('.bac-preset-btn[data-abv]').forEach(btn => {
    btn.addEventListener('click', () => addDrink({
      abv: parseFloat(btn.dataset.abv),
      oz: parseFloat(btn.dataset.oz),
      label: btn.dataset.label,
      timestamp: Date.now()
    }, _onLogDrink));
  });
  container.querySelector('#bac-modal-ok')?.addEventListener('click', () =>
    container.querySelector('#bac-intervention')?.classList.add('hidden')
  );
}

/** Camera-first entry — toolbar, drink assignment, etc. */
export function openDrinkScan(onLogDrink = _onLogDrink) {
  if (onLogDrink) _onLogDrink = onLogDrink;
  if (!_onLogDrink) return;
  openScanOverlay(_onLogDrink);
}

export function getLevel() { return currentLevel; }

// ─── Drink logging ────────────────────────────────────────────────────────────

async function addDrink(drink, onLogDrink) {
  myDrinks.push(drink);
  onLogDrink?.(drink);
  try {
    const result = await apiPost('/api/bac', {
      weight: _profileWeight(),
      gender: getProfile()?.gender ?? 'neutral',
      drinks: myDrinks
    });
    updateMeter(result.level, result.bac, result.interventionRequired);
  } catch { /* offline */ }
}

function _profileWeight() {
  const p = getProfile();
  if (!p?.weight) return 70;
  const w = p.weight;
  if (typeof w === 'object') return w.unit === 'lb' ? Math.round(w.value * 0.453592) : (w.value ?? 70);
  return w;
}

function updateMeter(level, bac, interventionRequired) {
  currentLevel = level;
  currentBAC = bac;
  const fill = document.getElementById('bac-fill');
  const label = document.getElementById('bac-label');
  const modal = document.getElementById('bac-intervention');
  const msg = document.getElementById('bac-modal-msg');
  if (!fill) return;
  fill.style.height = `${level * 10}%`;
  fill.className = `bac-bar-fill level-${level <= 3 ? 'low' : level <= 6 ? 'mid' : level <= 8 ? 'high' : 'danger'}`;
  if (label) label.textContent = level;
  if (interventionRequired && modal && msg) {
    if (level >= 10) msg.textContent = '⛔ Please stop drinking. Get some water.';
    else if (level >= 9) msg.textContent = '🚨 Water break before your next drink.';
    else msg.textContent = '💧 Maybe slow down? Grab some water.';
    modal.classList.remove('hidden');
  }
}

// ─── Vision client (retries + compression) ────────────────────────────────────

function _compressFrame(video, maxW = 1024, quality = 0.72) {
  const vw = video.videoWidth || 1024;
  const vh = video.videoHeight || 576;
  const w = Math.min(vw, maxW);
  const h = Math.round(w * (vh / vw));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

async function detectDrinkWithRetry(base64, { attempts = 3, timeoutMs = 12_000 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch('/api/detect-drink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
        signal: ctrl.signal
      });
      const data = await res.json();
      if (data?.drink) return data;
      lastErr = new Error('no_drink');
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  throw lastErr ?? new Error('detect_failed');
}

function _formatDetectionLine(result) {
  const name = result?.drink ?? 'Unknown drink';
  const pct = result?.confidence != null
    ? Math.round(result.confidence * 100)
    : result?.estimatedAbv != null
      ? Math.round(result.estimatedAbv)
      : null;
  if (pct == null) return `Looks like ${name}`;
  const suffix = result.confidence != null ? '%' : '% ABV';
  return `Looks like ${name} (${pct}${suffix})`;
}

function drinkEmoji(result) {
  const t = (result?.drinkType ?? result?.drink ?? '').toLowerCase();
  if (/beer|lager|ale/.test(t)) return '🍺';
  if (/wine|champagne/.test(t)) return '🍷';
  if (/whiskey|whisky|bourbon|vodka|tequila|rum|gin|spirit|shot/.test(t)) return '🥃';
  if (/seltzer/.test(t)) return '🫧';
  if (/energy/.test(t)) return '⚡';
  if (/soda|coke|mixer/.test(t)) return '🥤';
  return '🍹';
}

// ─── Camera overlay (iPhone / Wallet style) ─────────────────────────────────

function openScanOverlay(onLogDrink) {
  const overlay = document.createElement('div');
  overlay.className = 'scan-overlay scan-overlay--native';
  overlay.innerHTML = `
    <div class="scan-top-bar">
      <button type="button" class="scan-close" aria-label="Close">✕</button>
      <span class="scan-title">Scan Drink</span>
      <span class="scan-top-spacer"></span>
    </div>
    <div class="scan-camera-wrap">
      <video class="scan-video" autoplay playsinline muted></video>
      <div class="scan-vframe" aria-hidden="true">
        <span class="scan-vframe-corner scan-vframe-corner--tl"></span>
        <span class="scan-vframe-corner scan-vframe-corner--tr"></span>
        <span class="scan-vframe-corner scan-vframe-corner--bl"></span>
        <span class="scan-vframe-corner scan-vframe-corner--br"></span>
      </div>
      <p class="scan-hint">Point at the drink · tap shutter</p>
    </div>
    <div class="scan-ui">
      <label class="scan-gallery-btn">
        <input type="file" accept="image/*" capture="environment" class="scan-file-input" hidden>
        Photo
      </label>
      <button type="button" class="scan-capture" aria-label="Take photo">
        <span class="scan-capture-ring"></span>
      </button>
      <div class="scan-spacer"></div>
    </div>
    <div class="scan-loading hidden" id="scan-loading">
      <div class="scan-spinner"></div>
      <p>Identifying that drink…</p>
    </div>
    <div class="scan-result hidden" id="scan-result">
      <div class="scan-result-inner">
        <span class="scan-result-emoji" id="scan-result-emoji">🍹</span>
        <p class="scan-result-name" id="scan-result-name"></p>
        <p class="scan-result-conf" id="scan-result-conf"></p>
        <div class="scan-result-actions">
          <button type="button" class="scan-btn scan-btn--retake">Retake</button>
          <button type="button" class="scan-btn scan-btn--confirm">Confirm</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.classList.add('scan-body-lock');

  let stream = null;
  let detectedDrink = null;
  const g = typeof gsap !== 'undefined' ? gsap : null;
  if (g) g.from(overlay, { opacity: 0, duration: 0.28, ease: 'power2.out' });

  const video = overlay.querySelector('.scan-video');
  const capBtn = overlay.querySelector('.scan-capture');
  const resultEl = overlay.querySelector('#scan-result');
  const loadEl = overlay.querySelector('#scan-loading');
  const fileInput = overlay.querySelector('.scan-file-input');

  function stopStream() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }

  function closeOverlay() {
    stopStream();
    document.body.classList.remove('scan-body-lock');
    if (g) {
      g.to(overlay, { opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: () => overlay.remove() });
    } else {
      overlay.remove();
    }
  }

  function showResult(result) {
    detectedDrink = result;
    loadEl.classList.add('hidden');
    overlay.querySelector('#scan-result-emoji').textContent = drinkEmoji(result);
    overlay.querySelector('#scan-result-name').textContent = _formatDetectionLine(result);
    overlay.querySelector('#scan-result-conf').textContent =
      result.fallback ? 'Best guess — tap Confirm or Retake' : 'Tap Confirm to log · Retake if wrong';
    resultEl.classList.remove('hidden');
    if (g) g.from('.scan-result-inner', { y: 44, opacity: 0, duration: 0.32, ease: 'power2.out' });
  }

  async function processBase64(base64) {
    loadEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    capBtn.disabled = true;
    try {
      const result = await detectDrinkWithRetry(base64);
      showResult(result);
    } catch {
      closeOverlay();
      showFallbackPicker(onLogDrink);
    } finally {
      capBtn.disabled = false;
    }
  }

  function startCamera() {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    return navigator.mediaDevices.getUserMedia(constraints)
      .then(s => {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .catch(() => {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          .then(s => {
            stream = s;
            video.srcObject = s;
            return video.play();
          });
      });
  }

  overlay.querySelector('.scan-close').addEventListener('click', closeOverlay);

  startCamera().catch(() => {
    overlay.querySelector('.scan-hint').textContent = 'Camera blocked — use Photo or pick below';
  });

  capBtn.addEventListener('click', () => {
    if (!video.videoWidth) return;
    stopStream();
    processBase64(_compressFrame(video));
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    stopStream();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).includes(',') ? String(dataUrl).split(',')[1] : dataUrl;
      processBase64(base64);
    };
    reader.readAsDataURL(file);
  });

  resultEl.querySelector('.scan-btn--confirm').addEventListener('click', () => {
    if (!detectedDrink) return;
    addDrink({
      abv: detectedDrink.estimatedAbv ?? 5,
      oz: detectedDrink.estimatedOz ?? 12,
      label: detectedDrink.drink ?? 'Drink',
      drinkType: detectedDrink.drinkType,
      timestamp: Date.now()
    }, onLogDrink);
    closeOverlay();
  });

  resultEl.querySelector('.scan-btn--retake').addEventListener('click', () => {
    resultEl.classList.add('hidden');
    detectedDrink = null;
    startCamera().catch(() => showFallbackPicker(onLogDrink));
  });
}

function showFallbackPicker(onLogDrink) {
  const el = document.createElement('div');
  el.className = 'scan-fallback';
  el.innerHTML = `
    <div class="scan-fallback-inner">
      <p class="scan-fallback-title">Couldn't identify that shit.</p>
      <p class="scan-fallback-sub">Pick one — game keeps moving:</p>
      <div class="scan-fallback-grid">
        ${MANUAL_TYPES.map(d =>
          `<button type="button" class="scan-fallback-btn" data-abv="${d.abv}" data-oz="${d.oz}" data-label="${d.label}">
            ${d.label}
          </button>`
        ).join('')}
      </div>
      <button type="button" class="scan-fallback-close">Cancel</button>
    </div>`;
  document.body.appendChild(el);

  const g = typeof gsap !== 'undefined' ? gsap : null;
  if (g) g.from('.scan-fallback-inner', { y: 60, opacity: 0, duration: 0.32, ease: 'back.out(1.4)' });

  el.querySelectorAll('.scan-fallback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addDrink({
        abv: parseFloat(btn.dataset.abv),
        oz: parseFloat(btn.dataset.oz),
        label: btn.dataset.label,
        timestamp: Date.now()
      }, onLogDrink);
      el.remove();
    });
  });
  el.querySelector('.scan-fallback-close').addEventListener('click', () => el.remove());
}
