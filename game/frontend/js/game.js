export const SCENARIOS = [
  {
    rank: 'A',
    name: 'Nandini Sucking Kunal — Aanchal Outside',
    dare: 'Nandini on her knees, Kunal in the chair — recreate it while someone "Aanchal" knocks twice outside. No sound. 45 seconds.',
    emoji: '👑'
  },
  {
    rank: '2',
    name: "Kunal's Whiskey Dick",
    dare: 'Kunal plays dead drunk dick — Nandini tries everything for 30 seconds. Then confess if whiskey dick is real lore or just an excuse.',
    emoji: '🥃'
  },
  {
    rank: '3',
    name: 'Four-Stroke Handjob',
    dare: 'Nandini gives a handjob. Kunal counts out loud. If he lasts more than four strokes, Nandini drinks. If not, he confesses why.',
    emoji: '✋'
  },
  {
    rank: '4',
    name: 'Family Caught You Fucking',
    dare: 'Act out the exact moment family almost walked in on Kunal and Nandini mid-fuck — panic, half-naked scramble, door handle turning.',
    emoji: '💣'
  },
  {
    rank: '5',
    name: 'Public Fuck Fantasy',
    dare: 'Describe where you\'d fuck with someone in the next room — balcony, car, parents\' house, hotel hallway. Name who\'s outside.',
    emoji: '🎭'
  },
  {
    rank: '6',
    name: 'Drunk & Raw',
    dare: 'Both sip. Confess the drunkest you\'ve ever been during sex — who initiated, who came, who passed out first.',
    emoji: '🪗'
  },
  {
    rank: '7',
    name: 'Family Taboo Confession',
    dare: 'Admit your filthiest family-taboo or "shouldn\'t have" fantasy out loud. Partner reacts — no judgment, full honesty.',
    emoji: '💭'
  },
  {
    rank: '8',
    name: 'Roast Their Stroke Game',
    dare: 'Roast Kunal or Nandini\'s actual performance in bed — best stroke, worst stroke, whiskey dick, four-stroke handjob. 30 seconds.',
    emoji: '👏'
  },
  {
    rank: '9',
    name: 'Caught on Camera',
    dare: 'Confess: ever filmed, almost filmed, or sent a nude you shouldn\'t have? Who has it? Would you do it again?',
    emoji: '📹'
  },
  {
    rank: '10',
    name: 'CNC / RPE Energy',
    dare: 'Whisper a CNC scenario you\'d actually try with each other — safeword, who tops, how far. No jokes. 20 seconds each.',
    emoji: '📦'
  },
  {
    rank: 'J',
    name: 'Nandini Riding Kunal — Door Unlocked',
    dare: 'Freestyle the filthiest version of Nandini riding Kunal with the door unlocked and footsteps in the hall. Rap or dirty talk.',
    emoji: '🎤'
  },
  {
    rank: 'Q',
    name: 'Silent Fuck Mime',
    dare: 'Mime how you fuck when you\'re trying not to get caught — no words. Partner guesses position + who came first.',
    emoji: '🎬'
  },
  {
    rank: 'K',
    name: 'Questionnaire Punishment Fuck',
    dare: 'Partner picks your nastiest kink chip from your profile — you describe doing it with them tonight in explicit detail. 45 seconds.',
    emoji: '🔄'
  }
];

export const TOTAL_SETS = SCENARIOS.length;
export const CARDS_PER_SET = 4;

export function createDeck() {
  const deck = [];
  for (const s of SCENARIOS) {
    for (let v = 1; v <= 4; v++) {
      deck.push({
        id: `${s.rank}-${v}-${Math.random().toString(36).slice(2, 8)}`,
        rank: s.rank,
        scenario: s.name,
        dare: s.dare,
        emoji: s.emoji,
        artVariant: v
      });
    }
  }
  return deck;
}

export function shuffle(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHands(deck, cardsEach, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  const deckCopy = [...deck];
  for (let i = 0; i < cardsEach * playerCount; i++) {
    hands[i % playerCount].push(deckCopy.shift());
  }
  // Remaining cards stay as draw pile — mutate original deck in-place
  deck.length = 0;
  deckCopy.forEach(c => deck.push(c));
  return hands;
}

function _handRankCounts(hand) {
  const counts = {};
  for (const c of hand) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
  return counts;
}

function _hasPairOrBetter(hand) {
  return Object.values(_handRankCounts(hand)).some(n => n >= 2);
}

/**
 * Smart 2-player deal — 70–80% overlap pool, guaranteed pair/triple each.
 * Falls back to standard dealing for non-2-player games.
 * @param {number} overlapRatio 0.7–0.85 (default 0.75)
 */
export function smartDealHands(deck, cardsEach, playerCount, overlapRatio = 0.75) {
  if (playerCount !== 2) return dealHands(deck, cardsEach, playerCount);

  const byRank = new Map();
  for (const card of deck) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
  }

  const ranks = [...byRank.keys()].sort(() => Math.random() - 0.5);
  const h0 = [], h1 = [];
  const usedIds = new Set();

  const sharedTarget = Math.max(3, Math.round(cardsEach * overlapRatio));
  const sharedRankCount = Math.min(3, Math.max(2, Math.ceil(sharedTarget / 2)));
  const splitPatterns = [
    [2, 2], [2, 1], [1, 2], [3, 1], [1, 3], [2, 2], [2, 1]
  ];

  const sharedRanks = ranks.slice(0, sharedRankCount);
  sharedRanks.forEach((rank, idx) => {
    const pool = byRank.get(rank) ?? [];
    let [p0n, p1n] = splitPatterns[idx % splitPatterns.length];
    const cap0 = cardsEach - h0.length;
    const cap1 = cardsEach - h1.length;
    p0n = Math.min(p0n, cap0, pool.length);
    p1n = Math.min(p1n, cap1, pool.length - p0n);
    if (p0n + p1n < 2 && pool.length >= 2) {
      p0n = Math.min(1, cap0);
      p1n = Math.min(1, cap1);
    }
    let pi = 0;
    for (let i = 0; i < p0n && pi < pool.length; i++, pi++) {
      h0.push(pool[pi]);
      usedIds.add(pool[pi].id);
    }
    for (let i = 0; i < p1n && pi < pool.length; i++, pi++) {
      h1.push(pool[pi]);
      usedIds.add(pool[pi].id);
    }
  });

  // Unique filler — ~20–30% of hand
  let ri = sharedRankCount;
  while ((h0.length < cardsEach || h1.length < cardsEach) && ri < ranks.length) {
    const pool = (byRank.get(ranks[ri++]) ?? []).filter(c => !usedIds.has(c.id));
    if (!pool.length) continue;
    if (h0.length < cardsEach) {
      h0.push(pool[0]);
      usedIds.add(pool[0].id);
    }
    if (h1.length < cardsEach && pool.length > 1) {
      h1.push(pool[1]);
      usedIds.add(pool[1].id);
    } else if (h1.length < cardsEach) {
      const extra = pool.find(c => !usedIds.has(c.id));
      if (extra) { h1.push(extra); usedIds.add(extra.id); }
    }
  }

  // Guarantee pair or triple — steal one more from a shared rank if needed
  for (const rank of sharedRanks) {
    if (_hasPairOrBetter(h0) && _hasPairOrBetter(h1)) break;
    const pool = (byRank.get(rank) ?? []).filter(c => !usedIds.has(c.id));
    if (!pool.length) continue;
    if (!_hasPairOrBetter(h0) && h0.length < cardsEach) {
      h0.push(pool[0]);
      usedIds.add(pool[0].id);
    } else if (!_hasPairOrBetter(h1) && h1.length < cardsEach) {
      h1.push(pool[0]);
      usedIds.add(pool[0].id);
    }
  }

  const remaining = deck.filter(c => !usedIds.has(c.id)).sort(() => Math.random() - 0.5);
  deck.length = 0;
  remaining.forEach(c => deck.push(c));

  return [h0, h1];
}

export function validateAsk(hand, rank) {
  return hand.some(c => c.rank === rank);
}

export function checkForBook(hand) {
  const counts = {};
  for (const c of hand) counts[c.scenario] = (counts[c.scenario] ?? 0) + 1;
  return Object.entries(counts).filter(([, n]) => n >= 4).map(([s]) => s);
}
