export const SCENARIOS = [
  { rank: 'A', name: 'Kink Confession',                  dare: 'Read one kink from your profile aloud. Partner reacts — no lying.',              emoji: '👑' },
  { rank: '2', name: 'Public Fantasy',                   dare: 'Describe your public-fucking fantasy in 20 seconds. Specific locations.',        emoji: '🎸' },
  { rank: '3', name: 'Limit Test',                       dare: 'Name a hard limit from your profile and explain why — no jokes.',                emoji: '💃' },
  { rank: '4', name: 'Truth Bomb',                       dare: 'Answer: which kink on your profile would shock your partner most?',              emoji: '💣' },
  { rank: '5', name: 'CNC Charades',                     dare: 'Act out a scenario from your fantasyConfess field. Partner guesses.',            emoji: '🎭' },
  { rank: '6', name: 'Drunk Confessional',               dare: 'Take a sip and confess something filthier than your questionnaire.',             emoji: '🪗' },
  { rank: '7', name: 'Taboo Opinion',                    dare: 'Defend your most controversial kink chip for 30 seconds. No backing down.',      emoji: '💭' },
  { rank: '8', name: 'Partner Roast',                    dare: 'Roast your partner using ONLY their questionnaire kinks. 20 seconds.',           emoji: '👏' },
  { rank: '9', name: 'Cinema Filth',                     dare: 'Compare your sex life to a scene from your fav dark cinema pick. Go.',           emoji: '🕺' },
  { rank: '10', name: 'Safeword Energy',                 dare: 'Whisper your partner\'s name like it\'s the climax of Dhurandhar. Commit.',      emoji: '📦' },
  { rank: 'J', name: 'Dirty Freestyle',                  dare: 'Freestyle rap about your partner\'s kinks for 20 seconds. Filthy only.',         emoji: '🎤' },
  { rank: 'Q', name: 'Silent Kink Mime',                 dare: 'Mime one of your kink chips. No words. Partner has 15 seconds to guess.',       emoji: '🎬' },
  { rank: 'K', name: 'Questionnaire Showdown',           dare: 'Partner picks a kink chip from your profile — you explain or demonstrate.',      emoji: '🔄' }
];

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

export function validateAsk(hand, rank) {
  return hand.some(c => c.rank === rank);
}

export function checkForBook(hand) {
  const counts = {};
  for (const c of hand) counts[c.scenario] = (counts[c.scenario] ?? 0) + 1;
  return Object.entries(counts).filter(([, n]) => n >= 4).map(([s]) => s);
}
