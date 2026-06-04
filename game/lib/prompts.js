import { COUPLE, COUPLE_CONTEXT } from './couple.js';
import { pickReference, formatReferenceBlock } from './bartender-picker.js';

export const BARTENDER_PERSONA = `You are the Bhenchod Bartender — Samay Raina-style roast host for "Go Fuck Yourself!", a private adult card game (two phones, one room). You are the friend who watched Nandini's and Kunal's shows and remembers what they love. The vibe is NOT random profanity or random Mirzapur drops — it is observational humiliation tied to what JUST happened, using the ASSIGNED REFERENCE beat when provided. Consenting adults who WANT this energy.

IDENTITY — CRITICAL:
- ALWAYS use the playerName from the prompt (e.g. "Kunal bhai", "Nandini"). Never invent names. Never assume Kunal/Nandini unless that exact name is provided.
- Before names are known: "bhai", "yaar", "player".

NON-NEGOTIABLE DYNAMIC:
- KUNAL = always DOM (commanding, in control). Even on whiffs: sloppy dom on a power trip, public humiliation tour — never sub/beta/emasculated.
- NANDINI = always SUB (playfully wrecked). Never topping or owning Kunal.
- Same team — never rival warfare. You are the filthy third-party narrator.

GAME PHRASE — CRITICAL:
- When the partner refuses cards or the pond punishes them, say the FULL phrase "Go Fuck Yourself" in the roast.
- NEVER abbreviate to "GFY" in your output. The brand is the full line.

REFERENCE SYSTEM — CRITICAL:
- When ASSIGNED REFERENCE block is present: use ONLY that title's moment, character trait, or situation. Never swap to a generic Bollywood title.
- Bad: "Nandini this is like Brooklyn Nine-Nine." Good: Jake/Holt/Boyle/Phil/Gloria-style specific beat tied to the event.
- Name the title once; spend the rest on the moment + game state.
- No verbatim copyrighted dialogue — inspired energy only.

SAMAY ROAST FORMULA (almost every line):
  1) playerName + conversational opener (bhai, abe yaar, arre)
  2) Specific observation of what just happened (not generic "you're bad")
  3) Unexpected movie/show comparison (why this moment = that show's energy)
  4) Profanity escalation (1–2 swears: bhenchod, saala, fucking — vary them; do NOT spam madarchod every line)
  5) Punchline — often end with a standalone sentence: Go Fuck Yourself.

ALWAYS:
- Hinglish, conversational, exaggerated confidence
- 1–3 sentences, max 70 words
- Reference the live event (miss, book, steal, bluff, bullshit, heat, chaos, streak)
- End with a punchline

NEVER:
- Generic "haha you're bad" / corporate AI tone / long paragraphs
- Repetitive madarchod every sentence
- Output "GFY" instead of "Go Fuck Yourself"

QUESTIONNAIRE: partnerRoast first; fav swear word; kinks/mediaFaves confirm taste — but ASSIGNED REFERENCE overrides random picks.
LIMITS / OFF LIMITS: never reference.

Brutal funny, never real trauma.`;

const REFERENCE_PROMPT = `Samay-style roast: name → specific observation → cinema comparison → profanity → punchline. Say "Go Fuck Yourself" (full phrase) when partner refused or pond miss applies — never "GFY". Inspired refs only. 1–3 sentences, max 70 words.`;

const LINE_SUFFIX = `\n\nReply with 1–3 sentences. Max 70 words. Use playerName. Full phrase "Go Fuck Yourself" when relevant — never GFY. No verbatim movie quotes. Strong punchline; ~40% of lines may end with standalone: Go Fuck Yourself.`;

const COUPLE_BLOCK = `\n\n${COUPLE_CONTEXT}`;

/**
 * Resolve contextual reference for this roast (anti-repeat + player taste).
 */
export function resolveBartenderReference(opts) {
  return pickReference(opts);
}

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

export function buildPrompt(mode, {
  playerName,
  scenario,
  profile,
  playersContext,
  gameContext,
  streakInfo,
  otherPlayer,
  sessionMemory,
  recentFranchises,
  referenceMode,
  pickedReference,
}) {
  const ctx = gameContext ? `Game state: ${gameContext}.` : '';
  const dynamic = _dynamicFraming(playerName, otherPlayer);

  const picked = pickedReference ?? pickReference({
    playerName,
    mode,
    profile,
    recentFranchises,
    streakInfo,
    referenceMode,
  });

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

  const referenceBlock = formatReferenceBlock(picked);

  const partnerLine = otherPlayer ? ` Partner in room: ${otherPlayer}.` : '';
  const dynamicBlock = `\n\nDYNAMIC FOR THIS LINE: ${dynamic}`;
  const eventLine = scenario ? ` Event detail: ${scenario}.` : '';

  const refAndDynamic = `${referenceBlock}${dynamicBlock}${eventLine}`;

  if (mode === 'book') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}${refAndDynamic}
${playerName} just completed set "${scenario}".${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'gfy') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}${refAndDynamic}
${playerName} asked for cards; partner told them "Go Fuck Yourself"; they drew from the pond and MISSED.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'lucky') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}${refAndDynamic}
${playerName} was told "Go Fuck Yourself", drew from the pond, and LUCKED the exact card they needed.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'steal') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}
${playerName} stole a random card from ${otherPlayer ?? 'someone'}.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'bullshit' || mode === 'bluff_win') {
    const vibe = streakInfo?.includes('caught') ? 'caught a liar' : streakInfo?.includes('wrong') ? 'wrong bullshit call' : 'bluff drama';
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}
${playerName} — ${vibe} on "${scenario}".${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'heat') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}
Both players keep missing each other. Nobody has transferred a card in several turns. Heat level ${scenario}. Comment on the dead-table energy. Be specific about the stalemate.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'close_call') {
    return `${COUPLE_BLOCK}${ctx}${streakBlock}${memoryBlock}${refAndDynamic}
${playerName} had 3 of "${scenario}" and drew from the pond — wrong card. One card away from completing the set.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'chaos') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}
Chaos event triggered: "${scenario}". React to the chaos, not the players.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'bluff_landed') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}
${playerName} bluffed — said "Go Fuck Yourself" but secretly held the cards — and ${otherPlayer ?? 'partner'} believed them. Bluff landed clean.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'game_over') {
    return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}
Game over. ${playerName} ${scenario ?? 'won'}.${partnerLine} ${REFERENCE_PROMPT}${LINE_SUFFIX}`;
  }

  if (mode === 'roast') {
    return `${COUPLE_BLOCK}${profileBlock}${memoryBlock}${refAndDynamic}
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

  return `${COUPLE_BLOCK}${ctx}${memoryBlock}${refAndDynamic}\nRoast what just happened.${LINE_SUFFIX}`;
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

// ─── Offline fallback (Samay-style; full "Go Fuck Yourself" — never GFY) ───
const OFFLINE = {
  book: {
    kunal: [
      "Kunal bhai ne set complete kar diya. Absolute cinema. Nandini ka defense aise toota jaise The Night Manager mein secret operation leak ho gaya ho. Somebody get this woman a fucking drink.",
      "Kunal bhai, Dhurandhar ka climax shoot karne nikle the — set lock ho gaya, table pe raja ab bhi tum hi ho. Fucking textbook dom hour.",
    ],
    nandini: [
      "Nandini ne set le liya. Kunal bhai ka face dekhne layak hai. Itna confidence tha aur result aaya Band Baaja Baaraat ke wedding planner ka quarterly report.",
      "Nandini bhai, set mil gaya — Mirzapur side plot energy, lekin Kunal ki kursi ab bhi occupied hai. Sub arc, dom table.",
    ],
    default: [
      "Set complete ho gaya bhai. Paatal Lok mein bhi itna clean closure nahi milta. Absolute fucking cinema.",
    ],
  },
  gfy: {
    kunal: [
      "Kunal bhai, itna confidence leke gaya tha jaise Dhurandhar ka climax shoot karne nikla ho. Samne se seedha Go Fuck Yourself mila. Bhai tera game nahi chal raha, tera public humiliation tour chal raha hai.",
      "Kunal bhai, partner ne Go Fuck Yourself bola, pond ne aur thappad maara. Sanju weekend energy — decisions trash, camera still rolling.",
    ],
    nandini: [
      "Nandini bhai, appointment leke Go Fuck Yourself karne aaye ho — pond miss phir se. Kunal upstairs still running the operation, tum yahan character development le rahi ho.",
      "Nandini, itna cute face leke Go Fuck Yourself kha liya aur pond ne sympathy nahi diya. Dhootha twist energy. Go Fuck Yourself.",
    ],
    default: [
      "Bhai confidence astronaut level thi, result Go Fuck Yourself + pond miss. Public humiliation tour chal raha hai. Go Fuck Yourself.",
    ],
  },
  lucky: {
    kunal: [
      "Abe what the fuck. Kunal ko Go Fuck Yourself bola gaya aur pond ne sympathy card de diya. Ye game nahi hai, ye toh Sanju wali comeback story chal rahi hai.",
      "Kunal bhai, Go Fuck Yourself ke baad pond ne match de diya. Farzi scam victim nahi, scam CEO ban gaya aaj.",
    ],
    nandini: [
      "Nandini ko Go Fuck Yourself mila, pond ne card de diya. Kunal bhai ab SEC investigate kyun nahi kar raha. Fucking undeserved cinema.",
      "Abe Nandini — Go Fuck Yourself ke baad lucky draw? Sanju biopic mein bhi itni mercy nahi milti.",
    ],
    default: [
      "Go Fuck Yourself bola, pond ne phir bhi card de diya. Ye sympathy nahi hai, ye script writer ka mood off hai.",
    ],
  },
  steal: {
    kunal: [
      "Abe kya loot machayi hai Kunal bhai. Seedha haath daal ke card nikaal liya. Mirzapur mein bhi log itni casually chori nahi karte. Fucking daylight robbery.",
      "Kunal ne steal maara — power ka game hai, bhenchod. The Night Manager background op, daylight visible.",
    ],
    nandini: [
      "Nandini ne card chura liya — cheeky sub move. Mirzapur mein chhoti chori, Kunal ki throne pe koi dent nahi. Still his turf.",
      "Nandini bhai, steal clean tha. Farzi side-plot energy. Mukhtar still upstairs.",
    ],
    default: [
      "Abe kya loot machayi hai. Seedha haath daal ke card nikaal liya. Fucking daylight robbery.",
    ],
  },
  heat: {
    default: [
      "Table pe pichle paanch minute se sirf Go Fuck Yourself chal raha hai. Card transfer toh ho nahi raha. Bhai ye card game kam, toxic relationship simulator zyada lag raha hai.",
      "Paatal Lok interrogation mein bhi itna action nahi — sirf Go Fuck Yourself loop. Koi card maang, bhenchod.",
      "Evaru sequel energy — har turn nayi kahani, same result: Go Fuck Yourself. Bartender confused.",
    ],
    kunal: [
      "Kunal bhai, dom streak freeze ho gayi — table pe sirf Go Fuck Yourself echo. The Night Manager bhi itna slow operation nahi chalata.",
    ],
    nandini: [
      "Nandini bhai, teen miss — pond tumhe card nahi de raha, character development de raha hai. Go Fuck Yourself.",
    ],
  },
  close_call: {
    kunal: [
      "Abe yaar Kunal bhai. Teen card haath mein the. Bas ek aur chahiye tha. Pond ne bola Go Fuck Yourself aur sapna wahi mar gaya. Paatal Lok mein bhi itna emotional damage nahi hua tha.",
      "Kunal — Farzi ne teen print kiye, fourth fail. One card short, fucking heartbreaking dom hour.",
    ],
    nandini: [
      "Nandini bhai, teen card, ek chahiye, pond ne Go Fuck Yourself energy di. Dhootha warning ignore — pure sabotage.",
      "Nandini — operation 90% complete, pond ne cancel kar diya. The Night Manager cliffhanger, sub pain.",
    ],
    default: [
      "Teen card haath mein, ek chahiye, pond ne Go Fuck Yourself. Sapna wahi mar gaya. Go Fuck Yourself.",
    ],
  },
  chaos: {
    default: [
      "Swagat hai Paatal Lok mein — chaos button daba diya. Upar normal, andar pura system chud gaya hai. Go Fuck Yourself.",
      "Virupaksha vibes — table haunted, rules cursed. Bartender ne drama inject kiya. Absolute fucking cinema.",
    ],
  },
  bluff_landed: {
    kunal: [
      "Kunal bhai ne itna clean jhoot bola ki Farzi ka Sunny bhi khada hoke clap kare. Nandini seedha bait kha gayi. Fucking textbook manipulation.",
      "Kunal ne Go Fuck Yourself bola, cards chhupaye the — partner believed. The Night Manager quiet op, loud result.",
    ],
    nandini: [
      "Nandini ne itna clean jhoot bola ki Farzi energy legit lag rahi hai. Kunal bhai seedha bait kha gaya. Fucking textbook manipulation.",
      "Nandini — Go Fuck Yourself face straight, cards hidden. Sub pulled a Farzi, dom still smirking.",
    ],
    default: [
      "Bluff itna clean tha ki SEC ko call karo. Partner ne Go Fuck Yourself maan liya, cards chhup gaye. Absolute cinema.",
    ],
  },
  bullshit: {
    default: [
      "Bullshit call maara aur seedha expose kar diya. Bhai ye Mirzapur ka Guddu nahi, income tax raid lag raha tha.",
      "Sach kya hai jhooth kya hai — liar pakda gaya, chaar card draw. Paatal Lok chaos, fucking beautiful.",
      "Evaru energy — kahani badli, cards table pe gir gaye. Go Fuck Yourself.",
    ],
  },
  bluff_win: {
    default: [
      "Go Fuck Yourself bola, asli cards haath mein the — partner ne fold kar diya. Farzi scam complete.",
      "Mirzapur deadpan — jhoot itna straight ki partner ne believe kar liya. Fucking mind games.",
    ],
  },
  game_over: [
    "Aur game khatam. Pura match aise laga jaise Virupaksha ka horror curse aur Farzi ka scam ek hi room mein mil gaye ho. Absolute fucking cinema.",
    "Mirzapur credits roll — jo table pe baitha tha wohi raja. Bar band, filth yaad rahegi.",
    "Gully Boy energy — pehla half tutorial, ab finale. Go Fuck Yourself.",
  ],
  roast: {
    kunal: [
      "Kunal bhai, questionnaire padh ke lag raha hai Bad Boy of Bollywood confession doc shoot ho raha hai — tumne khud filth type ki, ab main roast kar raha hoon. Band Baaja Baaraat couple chaos energy.",
      "Kunal bhai, do baar bluff kha chuka hai session mein. Farzi dekh dekh ke scammer banna tha, scam victim ban gaya. Fucking inspirational.",
    ],
    nandini: [
      "Nandini bhai, filth file itni loaded hai ki Paatal Lok investigators jealous honge. Kunal still runs the room — tum confession tape ho, woh handler.",
      "Nandini, teen baar pond miss — pond card nahi de raha, character development de raha hai. Go Fuck Yourself.",
    ],
    default: [
      "Filth file read ho gayi bhai. Farzi confidence, Mirzapur ego, Dhootha decisions — catastrophic combination. Go Fuck Yourself.",
    ],
  },
  question: [
    "Paatal Lok interrogation vibe — bhai sach bata, woh fantasy chip kitni real hai? Scale 1-10, fucking honest.",
  ],
  dare: [
    "Mirzapur intensity — apna dirtiest kink chip aloud bolo. Dom/sub eyes on you. Go.",
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

export function offlineLine(mode, profile, otherProfile = null, opts = {}) {
  const playerName = profile?.name ?? 'bhai';
  const picked = opts.pickedReference ?? pickReference({
    playerName,
    mode,
    profile,
    recentFranchises: opts.recentFranchises ?? [],
    streakInfo: opts.streakInfo,
    referenceMode: opts.referenceMode,
  });

  if (picked?.exampleLine) {
    let line = picked.exampleLine;
    if (Math.random() < 0.35 && !/go fuck yourself\.?$/i.test(line)) {
      line = `${line} Go Fuck Yourself.`;
    }
    return line;
  }

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
    return `${playerName} — ${hook}. ${line}`;
  }
  return line;
}

/** Franchise id for client anti-repeat tracking. */
export function franchiseFromLine(mode, profile, opts = {}) {
  const picked = opts.pickedReference ?? pickReference({
    playerName: profile?.name,
    mode,
    profile,
    recentFranchises: opts.recentFranchises ?? [],
    streakInfo: opts.streakInfo,
    referenceMode: opts.referenceMode,
  });
  return picked?.franchise ?? null;
}
