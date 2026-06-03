import { apiPost } from '../api.js';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0','1','2','3','4','5','6','7','8','9','Skip','Reverse','Draw Two'];
const SPECIAL = ['Wild','Wild Draw Four','Chaos'];

const OFFLINE_CHAOS = [
  'Everyone swaps hands.',
  'The player to your left must compliment you sincerely.',
  'Skip your turn AND take a sip.',
  'Everyone draws 2 except the person who played this.',
  'The player with the most cards wins this round.',
  'Name three embarrassing truths or draw 3.',
  'Play continues backwards for 2 full rounds.',
  'Everyone shows their hand to the player on their left.',
  'Next player must say the card name in a funny accent.',
  'Pick any player — they skip their next 2 turns.',
  'Swap hands with the player of your choice.',
  'All Skips are cancelled for the next round.',
  'The quietest player in the last 5 minutes draws 3.',
  'Everyone passes a card to the right.',
  'No talking until your next turn or draw 2.'
];

function createUnoDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (const val of VALUES) {
      deck.push({ color, value: val, type: 'number' });
      if (val !== '0') deck.push({ color, value: val, type: 'number' });
    }
  }
  for (const sp of SPECIAL) {
    deck.push({ color: 'wild', value: sp, type: 'wild' });
    deck.push({ color: 'wild', value: sp, type: 'wild' });
  }
  return deck;
}

function shuffle(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardLabel(c) {
  return c.color === 'wild' ? c.value : `${c.color} ${c.value}`;
}

function canPlay(card, topCard, activeColor) {
  if (card.type === 'wild') return true;
  const color = activeColor ?? topCard.color;
  return card.color === color || card.value === topCard.value;
}

export function init(container, playerNames, onExit) {
  const players = playerNames.map((name, i) => ({ name, hand: [] }));
  let deck = shuffle(createUnoDeck());
  let discard = [];
  let activeColor = null;
  let direction = 1;
  let currentIdx = 0;
  let pendingDraw = 0;
  let gameOver = false;

  // Deal 7 cards each
  players.forEach(p => {
    for (let i = 0; i < 7; i++) p.hand.push(deck.pop());
  });
  discard.push(deck.pop());
  activeColor = discard[discard.length - 1].color;

  function topCard() { return discard[discard.length - 1]; }

  function nextPlayer(skip = 0) {
    currentIdx = ((currentIdx + direction * (1 + skip)) % players.length + players.length) % players.length;
  }

  async function getChaosEffect() {
    try {
      const res = await apiPost('/api/host', { mode: 'dare', playerName: players[currentIdx].name, scenario: 'UNO Chaos', gameContext: `UNO game with ${players.length} players` });
      return res.line ?? offlineEffect();
    } catch { return offlineEffect(); }
  }

  function offlineEffect() {
    return OFFLINE_CHAOS[Math.floor(Math.random() * OFFLINE_CHAOS.length)];
  }

  async function playCard(player, cardIdx) {
    const card = player.hand[cardIdx];
    if (!canPlay(card, topCard(), activeColor)) {
      render('Cannot play that card!');
      return;
    }
    player.hand.splice(cardIdx, 1);
    discard.push(card);

    let message = `${player.name} played ${cardLabel(card)}`;
    let chaosMsg = '';

    if (card.type === 'wild') {
      if (card.value === 'Chaos') {
        chaosMsg = await getChaosEffect();
        message += `\n💥 CHAOS: ${chaosMsg}`;
        activeColor = COLORS[Math.floor(Math.random() * 4)];
      } else {
        activeColor = COLORS[Math.floor(Math.random() * 4)];
        if (card.value === 'Wild Draw Four') pendingDraw += 4;
        message += ` → color is now ${activeColor}`;
      }
    } else {
      activeColor = card.color;
      if (card.value === 'Skip') { nextPlayer(); message += ' (skip!)'; }
      else if (card.value === 'Reverse') { direction *= -1; message += ' (reversed!)'; }
      else if (card.value === 'Draw Two') { pendingDraw += 2; }
    }

    if (player.hand.length === 0) {
      gameOver = true;
      render(`🎉 ${player.name} wins UNO!`, true);
      return;
    }

    nextPlayer();

    if (pendingDraw > 0) {
      const next = players[currentIdx];
      for (let i = 0; i < pendingDraw; i++) {
        if (!deck.length) { deck = shuffle([...discard.splice(0, discard.length - 1)]); }
        next.hand.push(deck.pop());
      }
      message += `\n${next.name} draws ${pendingDraw}!`;
      pendingDraw = 0;
      nextPlayer();
    }

    render(message);
  }

  function drawCard() {
    if (!deck.length) { deck = shuffle([...discard.splice(0, discard.length - 1)]); }
    players[currentIdx].hand.push(deck.pop());
    nextPlayer();
    render(`${players[currentIdx].name} drew a card.`);
  }

  function render(message = '', final = false) {
    const current = players[currentIdx];
    const top = topCard();

    container.innerHTML = `
      <div class="uno-game">
        <div class="uno-header">
          <h2>Fucking UNO</h2>
          <button class="btn-secondary uno-exit" id="uno-exit">Exit</button>
        </div>
        <div class="uno-status">
          <div class="uno-top-card" style="background:${top.color === 'wild' ? '#333' : `var(--uno-${top.color})`}">
            <span class="uno-top-label">${cardLabel(top)}</span>
          </div>
          <div class="uno-info">
            <p>Active color: <strong style="color:var(--uno-${activeColor})">${activeColor}</strong></p>
            <p>Deck: ${deck.length} cards</p>
          </div>
        </div>
        ${message ? `<div class="uno-message">${message.replace(/\n/g, '<br>')}</div>` : ''}
        ${!final ? `
        <div class="uno-turn">
          <h3>Pass to: <em>${current.name}</em></h3>
          <div class="uno-hand">
            ${current.hand.map((c, i) => `
              <button class="uno-card${canPlay(c, top, activeColor) ? ' playable' : ''}"
                data-i="${i}"
                style="background:${c.color === 'wild' ? '#333' : `var(--uno-${c.color})`}">
                ${cardLabel(c)}
              </button>`).join('')}
          </div>
          <button class="btn-secondary uno-draw" id="uno-draw">Draw Card</button>
        </div>` : `<button class="btn-primary" id="uno-exit-final">Back to Hub</button>`}
      </div>`;

    container.querySelectorAll('.uno-card.playable').forEach(btn => {
      btn.addEventListener('click', () => playCard(current, parseInt(btn.dataset.i)));
    });
    container.querySelector('#uno-draw')?.addEventListener('click', drawCard);
    container.querySelector('#uno-exit')?.addEventListener('click', onExit);
    container.querySelector('#uno-exit-final')?.addEventListener('click', onExit);
  }

  render();
}
