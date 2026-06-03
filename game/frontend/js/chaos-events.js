/** Mid-game chaos — Jackbox-style surprise beats. */

export const CHAOS_EVENTS = [
  {
    id: 'power_hour',
    title: 'Power Hour',
    emoji: '⚡',
    tagline: 'Next drink counts double on the BAC meter.',
    durationMs: 120_000
  },
  {
    id: 'pond_tax',
    title: 'Pond Tax',
    emoji: '🌊',
    tagline: 'Every GFY miss — loser logs a drink.',
    durationMs: 180_000
  },
  {
    id: 'reverse_roast',
    title: 'Reverse Roast',
    emoji: '🔄',
    tagline: 'Partner picks who Bhenchod roasts next — tap Roast.',
    durationMs: 90_000
  },
  {
    id: 'bollywood_twist',
    title: 'Bollywood Twist',
    emoji: '🎬',
    tagline: '60 seconds — only movie dialogue. Paatal Lok energy.',
    durationMs: 60_000
  },
  {
    id: 'double_book',
    title: 'Golden Set',
    emoji: '✨',
    tagline: 'Next completed set — partner drinks twice.',
    durationMs: 300_000
  }
];

const MIN_ACTIONS = 6;
const COOLDOWN_ACTIONS = 8;

export function maybeTriggerChaos(session) {
  if (!session) return null;
  session.actionCount = (session.actionCount ?? 0) + 1;

  if (session.actionCount < MIN_ACTIONS) return null;
  if (session.lastChaosAt && session.actionCount - session.lastChaosAt < COOLDOWN_ACTIONS) return null;
  if (Math.random() > 0.22) return null;

  const event = CHAOS_EVENTS[Math.floor(Math.random() * CHAOS_EVENTS.length)];
  session.lastChaosAt = session.actionCount;
  session.activeChaos = { ...event, startedAt: Date.now(), endsAt: Date.now() + event.durationMs };

  if (event.id === 'power_hour') session.powerHour = true;
  if (event.id === 'pond_tax') session.pondTax = true;
  if (event.id === 'bollywood_twist') session.bollywoodTwistUntil = Date.now() + event.durationMs;

  return session.activeChaos;
}

export function clearExpiredChaos(session) {
  if (!session?.activeChaos) return;
  if (Date.now() < session.activeChaos.endsAt) return;
  if (session.activeChaos.id === 'power_hour') session.powerHour = false;
  if (session.activeChaos.id === 'pond_tax') session.pondTax = false;
  session.activeChaos = null;
}
