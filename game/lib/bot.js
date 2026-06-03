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

  const hand = botPlayer.hand;
  if (!hand.length) return;

  // Pick a random rank from bot hand
  const ranks = [...new Set(hand.map(c => c.rank))];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];

  // Pick a random non-bot player to ask
  const targets = [...room.players.values()].filter(p => p.id !== botPlayer.id && !p.isBot);
  if (!targets.length) return;

  const target = targets[Math.floor(Math.random() * targets.length)];

  onIntent({ type: 'ask', fromId: botPlayer.id, targetId: target.id, rank });
}
