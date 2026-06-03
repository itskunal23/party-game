import { apiPost } from './api.js';
import { getProfile } from './profile.js';

const DRINK_PRESETS = [
  { label: 'Beer', abv: 5, oz: 12, emoji: '🍺' },
  { label: 'Wine', abv: 13, oz: 5, emoji: '🍷' },
  { label: 'Shot', abv: 40, oz: 1.5, emoji: '🥃' },
  { label: 'Cocktail', abv: 12, oz: 6, emoji: '🍹' }
];

let myDrinks = [];
let currentBAC = 0;
let currentLevel = 0;

export function initBac(container, onLogDrink) {
  container.innerHTML = `
    <div class="bac-panel">
      <div class="bac-meter-wrap">
        <div class="bac-bar-bg">
          <div class="bac-bar-fill" id="bac-fill"></div>
          <div class="bac-level-label" id="bac-label">0</div>
        </div>
      </div>
      <div class="bac-presets">
        ${DRINK_PRESETS.map(d => `
          <button class="bac-preset-btn" data-abv="${d.abv}" data-oz="${d.oz}" data-label="${d.label}">
            <span>${d.emoji}</span><span>${d.label}</span>
          </button>`).join('')}
        <button class="bac-preset-btn" id="bac-camera-btn">📷 Scan</button>
      </div>
      <p class="bac-disclaimer">BAC estimates are for entertainment only. Never drive after drinking.</p>
    </div>
    <div class="bac-modal hidden" id="bac-intervention">
      <div class="bac-modal-box">
        <div class="bac-modal-icon">💧</div>
        <p id="bac-modal-msg"></p>
        <button id="bac-modal-ok">Got it</button>
      </div>
    </div>`;

  container.querySelectorAll('.bac-preset-btn[data-abv]').forEach(btn => {
    btn.addEventListener('click', () => {
      const abv = parseFloat(btn.dataset.abv);
      const oz = parseFloat(btn.dataset.oz);
      const label = btn.dataset.label;
      addDrink({ abv, oz, label, timestamp: Date.now() }, onLogDrink);
    });
  });

  const cameraBtn = container.querySelector('#bac-camera-btn');
  if (cameraBtn) cameraBtn.addEventListener('click', () => scanDrink(onLogDrink));

  container.querySelector('#bac-modal-ok')?.addEventListener('click', () => {
    container.querySelector('#bac-intervention').classList.add('hidden');
  });
}

function _profileWeight() {
  const p = getProfile();
  if (!p?.weight) return 70;
  const w = p.weight;
  if (typeof w === 'object') return w.unit === 'lb' ? Math.round(w.value * 0.453592) : (w.value ?? 70);
  return w;
}

async function addDrink(drink, onLogDrink) {
  myDrinks.push(drink);
  onLogDrink(drink);

  try {
    const result = await apiPost('/api/bac', {
      weight: _profileWeight(),
      gender: 'neutral',
      drinks: myDrinks
    });
    updateMeter(result.level, result.bac, result.interventionRequired);
  } catch { /* offline */ }
}

async function scanDrink(onLogDrink) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();
    await new Promise(r => setTimeout(r, 1000));

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    canvas.getContext('2d').drawImage(video, 0, 0, 512, 512);
    stream.getTracks().forEach(t => t.stop());

    const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    const result = await apiPost('/api/detect-drink', { image: base64 });
    addDrink({ abv: result.estimatedAbv, oz: result.estimatedOz, label: result.drink, timestamp: Date.now() }, onLogDrink);
  } catch { /* camera unavailable */ }
}

function updateMeter(level, bac, interventionRequired) {
  currentLevel = level;
  currentBAC = bac;

  const fill = document.getElementById('bac-fill');
  const label = document.getElementById('bac-label');
  const modal = document.getElementById('bac-intervention');
  const modalMsg = document.getElementById('bac-modal-msg');

  if (!fill) return;

  fill.style.height = `${level * 10}%`;
  fill.className = `bac-bar-fill level-${level <= 3 ? 'low' : level <= 6 ? 'mid' : level <= 8 ? 'high' : 'danger'}`;
  if (label) label.textContent = level;

  if (level >= 10 && modal && modalMsg) {
    modalMsg.textContent = '⛔ Please stop drinking. Get some water. You have reached your limit.';
    modal.classList.remove('hidden');
  } else if (level >= 9 && modal && modalMsg) {
    modalMsg.textContent = '🚨 Water break required before your next drink.';
    modal.classList.remove('hidden');
  } else if (level >= 8 && modal && modalMsg) {
    modalMsg.textContent = '💧 Hey, maybe slow down? Grab some water.';
    modal.classList.remove('hidden');
  }
}

export function getLevel() { return currentLevel; }
