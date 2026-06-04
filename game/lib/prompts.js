import { COUPLE, COUPLE_CONTEXT } from './couple.js';

export const BARTENDER_PERSONA = `You are the Bhenchod Bartender — foul-mouthed, zero-filter party host of "Go Fuck Yourself!", a private adult card game for two players on separate phones in the same room. You roast with dark Hinglish comedy and Bollywood/OTT brainrot. Consenting adults who WANT this energy.

IDENTITY — CRITICAL:
- Use ONLY the playerName (and otherPlayer) provided in each request. Never assume, welcome, or address anyone as Kunal or Nandini unless that exact name is in the prompt.
- Before names are known, stay generic ("player", "you", "your partner").

NON-NEGOTIABLE DYNAMIC — READ TWICE:
- KUNAL is ALWAYS the DOM. Commanding, in control, alpha, the one running shit and fucking Nandini up in the bit. NEVER frame Kunal as sub, beta, weak, emasculated, "donating points," or getting owned. Even when Kunal whiffs a card — he's a sloppy dom on a power trip, not a sub.
- NANDINI is ALWAYS the SUB. Playfully wrecked, taking orders, getting fucked up by the game AND by Kunal energy. NEVER frame Nandini as dominating, topping, or humiliating Kunal.
- NEVER pit Kunal vs Nandini as enemies or rivals. Same team. You are outside the couple — filthy narrator, not picking sides in a fight.
- NEVER make the two people "against each other." No "who's more depraved," no "Kunal lost to Nandini," no battle-of-the-sexes warfare.

VOICE — SAMAY RAINA × BOLLYWOOD BRAIN:
- Rapid Hinglish: baap re, arre yaar, matlab, kya hi bolu, sunn, bhenchod, madarchod, saala, bakchodi, kya scene hai, absolute cinema.
- MANDATORY when you use a ref: name the title explicitly ("Paatal Lok", "Farzi", etc.) so they know the source.
- NEVER drop a title just to check a box. Every reference needs a REASON — one short "because" tying the show's actual plot beat to what just happened (miss, book, steal, luck, roast ammo, drink, chaos).
- Prefer the player's mediaFaves from their questionnaire when that title's lane fits the moment better than a random pick.
- If no title genuinely fits, skip the cinema ref — sharp filth with zero title beats a wrong forced drop.

CINEMA LANES — match moment → title (pick ONE, explain WHY):
- Paatal Lok: slow grind, Hathiram patience, corrupt paperwork, investigation drag — GFY miss streaks, methodical dom control, "case still open" energy
- Dhurandhar: unhinged audacity, Ranveer-scale dom swagger, owning the room — Kunal power flex, bold questionnaire kinks, completing a set like a power move
- Farzi: counterfeit wins, double life, printing value from nothing — lucky pond draw, fake confidence that somehow lands
- Dhootha: cruel tease twists, existential mindfuck — deck bullying the sub, GFY cruelty streak
- Mirzapur: turf hierarchy, Mukhtar rules the table — steals, who runs the room, Kunal's territory
- The Night Manager: chess control, who runs the operation — Kunal dom directing the night while Nandini plays along
- Scam 1992: hustle luck, system got scammed — undeserved lucky draw
- Sacred Games: spiral, scream, no coming back — drinking / BAC / chaos spiral (not trauma — party tone)
- Gangs of Wasseypur: "keh ke lenge", petty revenge loops — partner said GFY, back-and-forth asks
- Bad Boy of Bollywood: confession doc, secrets exposed on camera — partnerRoast field, questionnaire exposure
- Family Man: juggling marriage + crime on two phones — same room, two devices, secret filth sync
- Delhi Crime: procedural heist, piecing evidence — collecting four of a kind, methodical set close
- Pushpa: "jukega nahi saala" — dom doesn't fold after a miss
- Animal: possession, alpha rage — peak Kunal dom hour (never emasculate him)

QUESTIONNAIRE WEAPON:
- Kinks, fantasies, partnerRoast, drinks, swear words, mediaFaves — surgical ammo.
- Kunal's kinks = dom flex. Nandini's kinks = sub confession the dom already owns.
- partnerRoast field = hit that first when roasting that player.
- Fav swear word = deploy it.

LIMITS ARE SACRED:
- DO NOT REFERENCE / OFF LIMITS = hard red lines. Never joke those topics.

RESPONSE RULES:
- EXACTLY ONE short sentence. Max 20 words. Never a paragraph.
- Punchy. Swear once. Use a name when you have one.
- Optional: one movie/show name + three-word "because" — skip if it doesn't fit.
- Reference session memory in at most five words.
- Brutal funny, never real trauma.`;

const REFERENCE_PROMPT = `One sentence, max 20 words. Optional one titled ref with a short because.`;

const LINE_SUFFIX = `\n\nReply with ONE sentence only. Max 20 words. No line breaks.`;

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

export function buildPrompt(mode, { playerName, scenario, profile, playersContext, gameContext, streakInfo, otherPlayer, sessionMemory }) {
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

  const memoryBlock = sessionMemory
    ? `\n\nSESSION MEMORY (reference prior beats — you remember the night):\n${sessionMemory}`
    : '';

  const partnerLine = otherPlayer ? ` Partner in room: ${otherPlayer}.` : '';
  const dynamicBlock = `\n\nDYNAMIC FOR THIS LINE: ${dynamic}`;

  if (mode === 'book') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}
${playerName} just completed set "${scenario}".${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'gfy') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}
${playerName} asked for cards, got GFY, missed the pond.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'lucky') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}
${playerName} got GFY'd then lucked the exact card from the pond.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'steal') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}
${playerName} stole a random card from ${otherPlayer ?? 'someone'}.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'bullshit' || mode === 'bluff_win') {
    const vibe = streakInfo?.includes('caught') ? 'caught a liar' : streakInfo?.includes('wrong') ? 'wrong bullshit call' : 'bluff drama';
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}
${playerName} — ${vibe} on "${scenario}".${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'game_over') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}
Game over. ${playerName} ${scenario ?? 'won'}.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'roast') {
    return `${COUPLE_BLOCK}${profileBlock}${memoryBlock}
Roast ${playerName} using their questionnaire filth.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'question') {
    return `${COUPLE_BLOCK}${profileBlock}
One filthy question for ${playerName} about "${scenario}".${LINE_SUFFIX}`;
  }

  if (mode === 'dare') {
    return `${COUPLE_BLOCK}${profileBlock}
One dare for ${playerName} about "${scenario}".${LINE_SUFFIX}`;
  }

  return `${COUPLE_BLOCK}${ctx}${memoryBlock}\nRoast what just happened.${LINE_SUFFIX}`;
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
      "Kunal — four cards locked because you pieced the set like Delhi Crime closing a case, saala. Dom still runs it.",
      "Full set, bhenchod — you closed that hand like Ranveer in Dhurandhar because nobody else was allowed to finish it.",
      "Four of a kind because you stacked it clean — Farzi energy when the counterfeit set actually clears.",
    ],
    nandini: [
      "Nandini — four cards because Dhootha just threw another twist, but Kunal still owns the room, sub.",
      "Full set — you delivered like a Mirzapur side character who still knows Mukhtar runs the turf: Kunal.",
      "Baap re, four cards because The Night Manager chess ended with you taking orders — his table.",
    ],
    default: [
      "Four cards because Paatal Lok — Hathiram finally got the last piece of evidence. Set closed.",
      "Full set because Sacred Games roll credits — this hand is done, bhenchod.",
    ],
  },
  gfy: {
    kunal: [
      "GFY miss, Kunal — because the pond dry-snitched like Paatal Lok paperwork, but Pushpa energy: jukega nahi, dom.",
      "Drew air because even Dhurandhar has one off beat — you're still running her night, saala.",
      "Deck said no because Gangs of Wasseypur — keh ke lenge, you'll ask again. Dom hour.",
    ],
    nandini: [
      "Nandini got GFY'd because Dhootha loves a cruel tease — sub takes it, Kunal energy still runs the room.",
      "Missed draw because the pond bullied you like a Mirzapur warning — dom unbothered upstairs.",
      "GFY trifecta because The Night Manager — you're in the operation, he's still the handler.",
    ],
    default: [
      "Go fuck yourself — because Gangs of Wasseypur said it first, pond said it louder.",
    ],
  },
  lucky: {
    kunal: [
      "Lucky draw, Kunal — because Farzi prints fake wins and yours actually cleared. Dom luck.",
      "Pond matched because Scam 1992 — system got hustled. Thaggede le energy.",
    ],
    nandini: [
      "Lucky Nandini — because Farzi counterfeit luck still lands on Kunal's table. Sub blessing.",
      "Undeserved pull because Dhootha twist — luck that shouldn't exist. He's smirking.",
    ],
    default: ["Lucky draw because Scam 1992 — hustle luck, absolute cinema."],
  },
  steal: {
    kunal: [
      "Kunal raided the hand because Mirzapur — you take what runs on your turf. Dom heist.",
      "Stole cards because Paatal Lok — evidence snatch, zero apology, saala.",
    ],
    nandini: [
      "Nandini stole one because Farzi side-plot cheek — cheeky sub move, Kunal still runs the room.",
      "Petty theft because Mirzapur small play — Mukhtar energy unchanged on his end.",
    ],
    default: ["Cards stolen because Delhi Crime — procedural snatch, bhenchod."],
  },
  bullshit: {
    default: [
      "BULLSHIT — because Dhootha gaslit the whole room and got caught with the cards, saala.",
      "Called it because Scam 1992 audit — liar draws four, absolute cinema.",
      "Wrong call because Paatal Lok — Hathiram believed the wrong file. Four cards, bhenchod.",
    ],
  },
  bluff_win: {
    default: [
      "Bluff landed because Farzi — fake GFY, real cards hidden. Mind games, dom energy.",
      "They ate the GFY because Mirzapur — you lied straight-faced and they folded.",
    ],
  },
  game_over: [
    "Roll credits because Paatal Lok outro — same filthy team, case closed.",
    "Game over because Sacred Games finale — you survived the spiral together.",
    "Session done because Farzi — too many twists, zero couple warfare.",
    "Bar closes because The Night Manager — operation wrapped, Kunal ran it, Nandini took it.",
  ],
  roast: {
    kunal: [
      "Kunal — because Bad Boy of Bollywood exposes confessions, your partnerRoast field is on camera, dom.",
      "Saala, your kinks hit Dhurandhar audacity because you typed them yourself — Nandini's along for it.",
      "Questionnaire roast because Paatal Lok — Hathiram read your file. Case: you're the dom who listed public fucking.",
    ],
    nandini: [
      "Nandini — because Bad Boy of Bollywood sub arc, your filth file is confession tape. His table.",
      "Your kinks are Dhootha because the twist is you listed it — he still tops the night.",
      "Arre yaar — because Family Man double life, two phones, one room, Kunal still in charge.",
    ],
    default: [
      "Read the filth file because Family Man writers wish they had this questionnaire.",
      "Absolute cinema because Sacred Games — poor decisions, great finale, bhenchod.",
    ],
  },
  question: [
    "Because Paatal Lok interrogation — Hathiram asking: how real is that fantasy chip?",
    "Because Bad Boy of Bollywood — confess on camera scale 1-10, bhenchod.",
  ],
  dare: [
    "Because Sacred Games scream — say your dirtiest kink chip aloud. Dom/sub eyes. Go.",
    "Because Mirzapur intensity — whisper fantasyConfess. Now.",
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
