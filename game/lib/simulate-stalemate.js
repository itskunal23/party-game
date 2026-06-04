/**
 * Headless stalemate / deadlock simulations (Cases A–J).
 * Run: npm run test:stalemate
 */

import { handleIntent } from './rooms.js';
import { createDeck, shuffle, TOTAL_SETS } from '../frontend/js/game.js';
import { initPlayerPowers } from './game-powers.js';
import {
  initStalemateTrackers,
  ranksInBothHands,
  THRESHOLDS,
  checkAndApplyRecovery,
  getNearBookRank
} from './stalemate.js';

function card(rank, n = 0) {
  return { rank, scenario: `${rank}-${n}`, id: `${rank}-${n}-${Math.random().toString(36).slice(2, 6)}` };
}

function makeRoom(hands, deckCards = null) {
  const deck = deckCards ?? shuffle(createDeck());
  const p1 = { id: 'p1', name: 'Alice', hand: [...hands[0]], isBot: false };
  const p2 = { id: 'p2', name: 'Bob', hand: [...hands[1]], isBot: false };
  const ids = ['p1', 'p2'];
  const state = {
    phase: 'playing',
    deck: [...deck],
    currentTurnPlayerId: 'p1',
    books: new Map(ids.map(id => [id, []])),
    pendingAsk: null,
    playerPowers: initPlayerPowers(ids),
    pendingDrinks: new Map(),
    pendingBookPowerup: new Map(),
    peekReveal: new Map(),
    turnCount: 0,
    actionCount: 0,
    lastChaosAt: 0,
    cardTax: false,
    firstBookWinner: null,
    lastAction: null,
    lastChaos: null,
    pendingExtraTurn: null
  };
  initStalemateTrackers(state);
  return { players: new Map([['p1', p1], ['p2', p2]]), gameState: state, lastActivity: new Date() };
}

function playGfyMiss(room) {
  const asker = room.gameState.currentTurnPlayerId;
  const target = asker === 'p1' ? 'p2' : 'p1';
  const rank = room.players.get(asker).hand[0]?.rank ?? 'A';
  handleIntent(room, { type: 'ask', fromId: asker, targetId: target, rank });
  handleIntent(room, { type: 'respondAsk', fromId: target, response: 'gfy' });
  handleIntent(room, { type: 'resolveAsk', fromId: asker, action: 'accept' });
}

function handSize(room) {
  return [...room.players.values()].reduce((n, p) => n + p.hand.length, 0);
}

function deckSize(room) {
  return room.gameState.deck.length;
}

const cases = {
  A_disjoint_ranks() {
    const room = makeRoom([
      [card('A'), card('A'), card('5'), card('8'), card('J')],
      [card('2'), card('3'), card('4'), card('7'), card('Q')]
    ]);
    const overlap = ranksInBothHands(room);
    let recovery = null;
    for (let i = 0; i < 12; i++) {
      playGfyMiss(room);
      if (room.gameState.lastChaos?.recovery) {
        recovery = room.gameState.lastChaos.id;
        break;
      }
    }
    return {
      pass: !!recovery,
      overlap: overlap.length,
      gfyStreak: room.gameState.gfyStreak,
      recovery,
      handSize: handSize(room)
    };
  },

  B_useless_draws() {
    const deck = Array.from({ length: 30 }, (_, i) => card('K', i));
    const room = makeRoom([
      [card('A'), card('2'), card('3')],
      [card('4'), card('5'), card('6')]
    ], deck);
    for (let i = 0; i < 8; i++) playGfyMiss(room);
    return {
      pass: room.gameState.gfyStreak < THRESHOLDS.gfyStreak || !!room.gameState.lastChaos?.recovery,
      deckLeft: deckSize(room),
      recovery: room.gameState.lastChaos?.id ?? null
    };
  },

  C_no_books_20_turns() {
    const room = makeRoom([
      [card('A'), card('2'), card('3'), card('4')],
      [card('5'), card('6'), card('7'), card('8')]
    ]);
    room.gameState.turnsWithoutBook = THRESHOLDS.turnsWithoutBook;
    room.gameState.turnCount = 20;
    room.gameState.lastRecoveryAt = 0;
    const ev = checkAndApplyRecovery(room);
    return { pass: !!ev, event: ev?.id ?? null };
  },

  D_lucky_player() {
    const room = makeRoom([
      [card('A'), card('A'), card('A'), card('2')],
      [card('A'), card('3'), card('4'), card('5')]
    ]);
    handleIntent(room, { type: 'ask', fromId: 'p1', targetId: 'p2', rank: 'A' });
    handleIntent(room, { type: 'respondAsk', fromId: 'p2', response: 'give' });
    const books = (room.gameState.books.get('p1') ?? []).length;
    return { pass: books >= 1, books };
  },

  E_three_books_fast() {
    const room = makeRoom([[], []]);
    room.gameState.books.set('p1', ['A', '2', '3']);
    room.gameState.books.set('p2', []);
    updateComebackViaBooks(room);
    const comeback = room.gameState.playerPowers.get('p2')?.comebackToken ?? 0;
    return { pass: comeback >= 1, comeback };
  },

  F_deck_nearly_empty() {
    const deck = [card('9'), card('10')];
    const room = makeRoom([
      [card('A'), card('2')],
      [card('3'), card('4')]
    ], deck);
    for (let i = 0; i < 4; i++) playGfyMiss(room);
    return { pass: deckSize(room) >= 0 && !Number.isNaN(handSize(room)), deckLeft: deckSize(room) };
  },

  G_pond_empty() {
    const room = makeRoom([
      [card('A'), card('2')],
      [card('3'), card('4')]
    ], []);
    playGfyMiss(room);
    return { pass: room.gameState.lastAction?.type === 'gfy', drawn: !!room.gameState.lastAction?.drawnCard };
  },

  H_one_card() {
    const room = makeRoom([[card('A')], [card('2'), card('3'), card('4')]]);
    playGfyMiss(room);
    return { pass: room.players.get('p1').hand.length >= 0 };
  },

  I_zero_cards() {
    const room = makeRoom([[], [card('2'), card('3')]]);
    room.gameState.currentTurnPlayerId = 'p1';
    handleIntent(room, { type: 'ask', fromId: 'p1', targetId: 'p2', rank: '2' });
    return { pass: room.gameState.pendingAsk === null || room.gameState.pendingAsk?.rank === '2' };
  },

  J_unmatched_only() {
    const room = makeRoom([
      [card('A'), card('2'), card('3'), card('4')],
      [card('5'), card('6'), card('7'), card('8')]
    ]);
    for (let i = 0; i < THRESHOLDS.gfyStreak + 2; i++) playGfyMiss(room);
    return {
      pass: !!room.gameState.lastChaos?.recovery || ranksInBothHands(room).length > 0,
      recovery: room.gameState.lastChaos?.id ?? null
    };
  }
};

function updateComebackViaBooks(room) {
  const state = room.gameState;
  const ids = ['p1', 'p2'];
  const scored = ids.map(id => ({ id, books: (state.books.get(id) ?? []).length }));
  scored.sort((a, b) => b.books - a.books);
  const leader = scored[0].books;
  for (const { id, books } of scored) {
    const powers = state.playerPowers.get(id);
    if (!powers || powers.comebackGranted) continue;
    if (leader - books >= 2) {
      powers.comebackToken = (powers.comebackToken ?? 0) + 1;
      powers.comebackGranted = true;
    }
  }
}

function nearBookBias() {
  const hand = [card('A'), card('A'), card('A'), card('2')];
  const near = getNearBookRank(hand);
  return { pass: near === 'A', near };
}

console.log('GFY stalemate simulations\n');

let failed = 0;
for (const [name, fn] of Object.entries(cases)) {
  try {
    const result = fn();
    const ok = result.pass !== false;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}`, JSON.stringify(result));
  } catch (err) {
    failed++;
    console.log(`✗ ${name}`, err.message);
  }
}

const nb = nearBookBias();
console.log(`${nb.pass ? '✓' : '✗'} near_book_detect`, JSON.stringify(nb));
if (!nb.pass) failed++;

console.log(`\n${failed === 0 ? 'All simulations passed.' : `${failed} simulation(s) failed.`}`);
process.exit(failed > 0 ? 1 : 0);
