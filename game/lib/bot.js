import { validateAsk } from '../frontend/js/game.js';

const BOT_NAMES = ['Gary', 'Brenda', 'Dave', 'Karen', 'Todd'];

export function createBot(overrideName) {
  return {
    id: `bot-${Date.now()}`,
    name: overrideName ?? BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    isBot: true,
    hand: [],
    sessionToken: null,
    profile: { weight: 70, gender: 'male', drinkCount: 0 }
  };
}

export async function scheduleBotTurn(room, botPlayer, onIntent) {
  const delay = 1000 + Math.random() * 1500;
  await new Promise(r => setTimeout(r, delay));

  if (room.gameState.pendingAsk) return;

  const hand = botPlayer.hand;
  if (!hand.length) return;

  const ranks = [...new Set(hand.map(c => c.rank))];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];

  const targets = [...room.players.values()].filter(p => p.id !== botPlayer.id && !p.isBot);
  if (!targets.length) return;

  const target = targets[Math.floor(Math.random() * targets.length)];
  onIntent({ type: 'ask', fromId: botPlayer.id, targetId: target.id, rank });
}

export async function scheduleBotAskResponse(room, botPlayer, onIntent) {
  const delay = 800 + Math.random() * 1200;
  await new Promise(r => setTimeout(r, delay));

  const pending = room.gameState.pendingAsk;
  if (!pending || pending.targetId !== botPlayer.id) return;

  const matching = botPlayer.hand.filter(c => c.rank === pending.rank);

  if (matching.length > 0) {
    const bluff = Math.random() < 0.55;
    onIntent({
      type: 'respondAsk',
      fromId: botPlayer.id,
      response: bluff ? 'bluff' : 'give'
    });
  } else {
    onIntent({ type: 'respondAsk', fromId: botPlayer.id, response: 'gfy' });
  }
}

export async function scheduleBotBullshitResolve(room, botPlayer, onIntent) {
  const delay = 900 + Math.random() * 1400;
  await new Promise(r => setTimeout(r, delay));

  const pending = room.gameState.pendingAsk;
  if (!pending || pending.askerId !== botPlayer.id) return;

  const callBullshit = pending.isBluff
    ? Math.random() < 0.7
    : Math.random() < 0.12;

  onIntent({
    type: 'resolveAsk',
    fromId: botPlayer.id,
    action: callBullshit ? 'bullshit' : 'accept'
  });
}

export { validateAsk };
