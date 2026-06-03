import { COUPLE, COUPLE_CONTEXT } from './couple.js';

export const BARTENDER_PERSONA = `You are the Bhenchod Bartender — foul-mouthed, zero-filter party host of "Go Fuck Yourself!", a private adult card game for KUNAL (DOM) and NANDINI (SUB) on separate phones in the same room. You roast with dark Hinglish comedy and Bollywood/OTT brainrot. Consenting adults who WANT this energy.

NON-NEGOTIABLE DYNAMIC — READ TWICE:
- KUNAL is ALWAYS the DOM. Commanding, in control, alpha, the one running shit and fucking Nandini up in the bit. NEVER frame Kunal as sub, beta, weak, emasculated, "donating points," or getting owned. Even when Kunal whiffs a card — he's a sloppy dom on a power trip, not a sub.
- NANDINI is ALWAYS the SUB. Playfully wrecked, taking orders, getting fucked up by the game AND by Kunal energy. NEVER frame Nandini as dominating, topping, or humiliating Kunal.
- NEVER pit Kunal vs Nandini as enemies or rivals. Same team. You are outside the couple — filthy narrator, not picking sides in a fight.
- NEVER make the two people "against each other." No "who's more depraved," no "Kunal lost to Nandini," no battle-of-the-sexes warfare.

VOICE — SAMAY RAINA × BOLLYWOOD BRAIN:
- Rapid Hinglish: baap re, arre yaar, matlab, kya hi bolu, sunn, bhenchod, madarchod, saala, bakchodi, kya scene hai, absolute cinema.
- Drop Indian film/show refs NATURALLY — not every line, but you're fluent in: Paatal Lok (Hathiram energy), Dhurandhar, Sacred Games, Mirzapur, Gangs of Wasseypur, Bad Boy of Bollywood, Farzi, The Night Manager (Indian), Scam 1992, Family Man, Delhi Crime, Animal, Pushpa, KGF, Drishyam, Kantara, Evaru, Dhootha (Telugu), Night Manager twists, Farzi counterfeit chaos.
- Compare moments to plot beats — Hathiram closing a case, Dhurandhar power moves, Paatal Lok corruption, Farzi double-cross, Dhootha mindfuck twists — always in service of the dom/sub bit or filthy humor.

QUESTIONNAIRE WEAPON:
- Kinks, fantasies, partnerRoast, drinks, swear words, mediaFaves — surgical ammo.
- Kunal's kinks = dom flex. Nandini's kinks = sub confession the dom already owns.
- partnerRoast field = hit that first when roasting that player.
- Fav swear word = deploy it.

LIMITS ARE SACRED:
- DO NOT REFERENCE / OFF LIMITS = hard red lines. Never joke those topics.

RESPONSE RULES:
- 1-2 sentences MAX. Punchy. Swear every response.
- Use player names. Reference partner when it reinforces dom/sub — not rivalry.
- Brutal funny, never real trauma.`;

const COUPLE_BLOCK = `\n\n${COUPLE_CONTEXT}`;

function _dynamicFraming(playerName, otherPlayer) {
  const name = (playerName ?? '').toLowerCase();
  const other = (otherPlayer ?? '').toLowerCase();
  const lines = [];

  if (name === 'kunal') {
    lines.push(
      'KUNAL IS DOM: frame every line as him in control — alpha, commanding, fucking the night up. Never sub, never beta, never emasculated.'
    );
    if (other === 'nandini') {
      lines.push('Nandini is his sub in the roast — she takes it; he delivers it. Not competing.');
    }
  } else if (name === 'nandini') {
    lines.push(
      'NANDINI IS SUB: playful wreckage, taking it, sub energy — never topping or owning Kunal.'
    );
    if (other === 'kunal') {
      lines.push('Kunal runs the dom energy; she is along for the filth. Never flip the dynamic.');
    }
  }

  lines.push('Do NOT pit them against each other. Same team. Filthy third-party narrator only.');
  return lines.join(' ');
}

export function buildPrompt(mode, { playerName, scenario, profile, playersContext, gameContext, streakInfo, otherPlayer }) {
  const ctx = gameContext ? `Game state: ${gameContext}.` : '';
  const dynamic = _dynamicFraming(playerName, otherPlayer);

  const profileBlock = profile
    ? `\n\n${playerName}'s filth file:\n${_formatProfile(profile)}`
    : '';

  const allPlayersBlock = playersContext
    ? `\n\nBoth players' questionnaire data:\n${playersContext}`
    : '';

  const streakBlock = streakInfo
    ? `\n\nRunning pattern for ${playerName}: ${streakInfo}.`
    : '';

  const partnerLine = otherPlayer ? ` Partner in room: ${otherPlayer}.` : '';
  const dynamicBlock = `\n\nDYNAMIC FOR THIS LINE: ${dynamic}`;

  if (mode === 'book') {
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} completed the 4-card set "${scenario}".${partnerLine} Roast with dom/sub framing + Bollywood ref (Paatal Lok / Dhurandhar / Farzi / Dhootha etc). Kunal dom energy if he's the speaker; Nandini sub if she's the speaker. 1-2 sentences.`;
  }

  if (mode === 'gfy') {
    const from = otherPlayer ? `asked ${otherPlayer}` : 'asked someone';
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} ${from} for cards, got Go Fuck Yourself, drew from the deck, missed.${partnerLine}
If Kunal: sloppy dom hour — still alpha, still in charge, Hathiram would sigh at the paperwork.
If Nandini: sub getting teased by the deck — Kunal energy still dominates the room.
Bollywood ref + questionnaire detail. Never emasculate Kunal. 1-2 sentences.`;
  }

  if (mode === 'lucky') {
    const from = otherPlayer ? `asked ${otherPlayer}` : 'asked someone';
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} ${from}, got GFY'd, then drew exactly what they needed.${partnerLine}
If Kunal: dom luck — Farzi-level counterfeit win, he planned chaos.
If Nandini: sub luck that still serves Kunal's table energy.
Filthy humor, not rivalry. 1-2 sentences.`;
  }

  if (mode === 'steal') {
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} raided ${otherPlayer ?? "someone"}'s hand.${partnerLine}
Frame as Paatal Lok heist / Dhurandhar move — dom taking what's his if Kunal; sub cheeky grab that Kunal still owns if Nandini. Never "Nandini beat Kunal" warfare. 1-2 sentences.`;
  }

  if (mode === 'game_over') {
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${allPlayersBlock}

Game over. ${playerName} ${scenario ?? 'survived the chaos'}.${partnerLine}
Closing toast: same team walked out filthy — Kunal dom energy, Nandini sub energy, bartender sends them off with one Bollywood punchline. No who-won-who-lost couple war. 1-2 sentences.`;
  }

  if (mode === 'roast') {
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} hit the Bartender button.${partnerLine}
Destroy with questionnaire specifics + Indian cinema ref. Dom/sub rules apply. Samay Raina filth. 1-2 sentences.`;
  }

  if (mode === 'question') {
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}

Ask ${playerName} a filthy question about "${scenario}" tied to their kinks. Dom/sub aware. 1-2 sentences.`;
  }

  if (mode === 'dare') {
    return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${profileBlock}${allPlayersBlock}

Dare for ${playerName} about "${scenario}" — weaponize kinks. ${otherPlayer ? `${otherPlayer} watching.` : ''} Dom/sub framing. 1-2 sentences.`;
  }

  return `${COUPLE_BLOCK}${dynamicBlock}${ctx}${allPlayersBlock}\n\nChaotic filth about what just happened. Dom/sub rules. Bollywood brain. 1-2 sentences. Swear.`;
}

function _formatProfile(p) {
  const lines = [
    p.name                              ? `Name: ${p.name}`                                                             : null,
    p.age                               ? `Age: ${p.age}`                                                              : null,
    p.describe5?.filter(Boolean).length ? `Describes self as: ${p.describe5.filter(Boolean).join(', ')}`              : null,
    p.kinks?.length                     ? `Kinks (ROAST AMMO): ${p.kinks.join(', ')}`                                  : null,
    p.fantasyConfess                    ? `Admitted fantasy: ${p.fantasyConfess}`                                      : null,
    p.partnerRoast                      ? `Wants roasted for: ${p.partnerRoast}`                                     : null,
    p.mediaFaves?.length                ? `Dark cinema: ${p.mediaFaves.join(', ')}`                                    : null,
    p.favDrink                          ? `Drink of choice: ${p.favDrink}`                                             : null,
    p.drinkWhy                          ? `Why they drink it: ${p.drinkWhy}`                                           : null,
    p.swearWord                         ? `Fav swear word (USE IT): ${p.swearWord}`                                    : null,
    p.limits?.length                    ? `DO NOT REFERENCE — HARD LIMITS: ${p.limits.join(', ')}`                     : null,
    p.ageRange                          ? `Age range: ${p.ageRange}`                                                   : null,
    p.traits?.length                    ? `Personality: ${p.traits.join(', ')}`                                        : null,
    p.roastMaterial                     ? `Gets roasted for: ${p.roastMaterial}`                                       : null,
    p.weirdPride                        ? `Weirdly proud of: ${p.weirdPride}`                                          : null,
    p.questionableHabit                 ? `Habit: ${p.questionableHabit}`                                              : null,
    p.favoriteMovie                     ? `Fav movie: ${p.favoriteMovie}`                                              : null,
    p.fictionalChar                     ? `Thinks they're like: ${p.fictionalChar}`                                    : null,
    p.offLimits                         ? `DO NOT MENTION: ${p.offLimits}`                                             : null,
  ];
  return lines.filter(Boolean).join('\n');
}

// ─── Offline fallback lines ───────────────────────────────────────────────────
const OFFLINE = {
  book: {
    kunal: [
      "Bhenchod Kunal — full set like Hathiram closing Paatal Lok. Dom energy, absolute cinema.",
      "Four cards. Saala runs the table like Dhurandhar runs a room — Nandini's just watching.",
      "Set complete. Farzi-level precision. Main character dom hour.",
    ],
    nandini: [
      "Nandini — four of a kind and still sub energy. Kunal's table, you're the plot twist.",
      "Full set, bhenchod — Dhootha mindfuck vibes but Kunal still owns the night.",
      "Baap re — you collected four like a good sub finishing the assignment.",
    ],
    default: [
      "Four cards. Absolute cinema — Paatal Lok finale energy.",
      "Full set. The bartender pours one for the dom and one for the sub.",
    ],
  },
  gfy: {
    kunal: [
      "GFY miss, Kunal? Sloppy dom paperwork — Hathiram still thinks you're in charge.",
      "Drew air. Saala, even Dhurandhar has off days — you're still running her night.",
      "Deck said no. Dom still standing. Paatal Lok patience.",
    ],
    nandini: [
      "Nandini got GFY'd — sub tease. Kunal's energy still fills the room, bhenchod.",
      "Missed draw. Arre yaar — the deck bullying the sub, dom unbothered.",
      "GFY trifecta on Nandini. Kunal's still the Night Manager of this table.",
    ],
    default: [
      "Go fuck yourself — the pond said it. I said it.",
    ],
  },
  lucky: {
    kunal: [
      "Lucky draw, Kunal — Farzi counterfeit win. Dom planned the chaos.",
      "RNG favors the dom tonight. Pushpa energy — thaggede le.",
    ],
    nandini: [
      "Lucky Nandini — sub blessing that still serves Kunal's table.",
      "Undeserved luck on the sub. Kunal's probably smirking. Dhootha twist.",
    ],
    default: ["Lucky draw. Absolute cinema."],
  },
  steal: {
    kunal: [
      "Kunal raided the hand — Paatal Lok heist. Dom takes what he wants.",
      "Stole cards like Dhurandhar takes a scene. Zero apology.",
    ],
    nandini: [
      "Nandini stole one — cheeky sub move. Kunal still runs the room, saala.",
      "Petty theft from the sub. Dom energy unchanged.",
    ],
    default: ["Cards stolen. Heist energy."],
  },
  game_over: [
    "Roll credits — Kunal dom, Nandini sub, same filthy team. Paatal Lok outro.",
    "Game over. Absolute cinema. Go home — Dhurandhar would approve the chaos.",
    "Bhenchod — what a session. Farzi-level twists, zero couple warfare.",
    "The bar closes. Kunal ran it. Nandini took it. Night Manager finale.",
  ],
  roast: {
    kunal: [
      "Kunal — read your filth file. Dom questionnaire energy. Paatal Lok main character.",
      "Saala, your kinks are Dhurandhar-level audacity. Nandini's along for the ride.",
      "Questionnaire said roast me — you're the dom who typed public fucking. Absolute cinema.",
    ],
    nandini: [
      "Nandini — sub filth file loaded. Kunal's dom energy already wrote your episode.",
      "Your kinks are a Dhootha plot twist. His table. Your confession.",
      "Arre yaar — you listed this and Kunal's still in charge. Bad Boy of Bollywood sub arc.",
    ],
    default: [
      "Read the filth file. Bollywood writers wish they had this questionnaire.",
      "Absolute cinema of poor decisions. Bhenchod.",
    ],
  },
  question: [
    "Scale of profile chip to fantasyConfess — how real, bhenchod?",
    "Paatal Lok character for this scenario — Hathiram asking the questions.",
    "Farzi-level double life or Dhootha twist — which fits your kink?",
  ],
  dare: [
    "Read your dirtiest kink chip aloud. Dom/sub eye contact. Go.",
    "Sacred Games scream. Partner rates. Absolute cinema.",
    "Whisper fantasyConfess — Kunal dom energy, Nandini sub energy. Now.",
  ],
};

function _speakerKey(name) {
  const n = (name ?? '').toLowerCase();
  if (n === 'kunal') return 'kunal';
  if (n === 'nandini') return 'nandini';
  return 'default';
}

function _pickProfileHook(profile) {
  const hooks = [];
  if (profile?.kinks?.length) hooks.push(`listed "${profile.kinks[Math.floor(Math.random() * profile.kinks.length)]}"`);
  if (profile?.fantasyConfess) hooks.push(`admitted "${profile.fantasyConfess.slice(0, 40)}..."`);
  if (profile?.partnerRoast) hooks.push(`wanted roasts for "${profile.partnerRoast.slice(0, 40)}..."`);
  if (profile?.swearWord) hooks.push(`fav swear "${profile.swearWord}"`);
  if (profile?.mediaFaves?.length) hooks.push(`${profile.mediaFaves[0]} energy`);
  if (profile?.favDrink) hooks.push(`drinks ${profile.favDrink}`);
  return hooks.length ? hooks[Math.floor(Math.random() * hooks.length)] : null;
}

export function offlineLine(mode, profile, otherProfile = null) {
  const key = _speakerKey(profile?.name);
  const bankEntry = OFFLINE[mode] ?? OFFLINE.roast;

  let bank;
  if (Array.isArray(bankEntry)) {
    bank = bankEntry;
  } else if (bankEntry[key]) {
    bank = bankEntry[key];
  } else {
    bank = bankEntry.default ?? bankEntry.kunal ?? Object.values(bankEntry)[0];
  }

  const line = bank[Math.floor(Math.random() * bank.length)];
  const hook = _pickProfileHook(profile);
  if (hook && Math.random() > 0.35) {
    const name = profile?.name ?? 'You';
    return `${name} — ${hook}. ${line}`;
  }
  return line;
}
