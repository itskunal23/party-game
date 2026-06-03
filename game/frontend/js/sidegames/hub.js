import { init as initUno } from './uno.js';

const SIDE_GAMES = [
  { id: 'uno', name: 'Fucking UNO', description: 'UNO with LLM-powered chaos cards and house rules.' }
];

export function renderHub(container, playerNames) {
  container.innerHTML = `
    <div class="hub-panel">
      <h2 class="hub-title">Side Games</h2>
      <p class="hub-subtitle">Pass and play — takes turns on this device.</p>
      <ul class="hub-list">
        ${SIDE_GAMES.map(g => `
          <li class="hub-item">
            <button class="hub-btn" data-id="${g.id}">
              <strong>${g.name}</strong>
              <span>${g.description}</span>
            </button>
          </li>`).join('')}
      </ul>
      <button class="btn-secondary hub-close" id="hub-close-btn">Close</button>
    </div>`;

  container.querySelectorAll('.hub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.id === 'uno') {
        container.innerHTML = '';
        initUno(container, playerNames, () => renderHub(container, playerNames));
      }
    });
  });

  container.querySelector('#hub-close-btn')?.addEventListener('click', () => {
    container.classList.add('hidden');
  });
}
