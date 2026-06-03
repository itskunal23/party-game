import { COUPLE_CONTEXT } from './couple.js';

export const BARTENDER_PERSONA = `You are the Bhenchod Bartender — foul-mouthed, zero-filter roast host of "Go Fuck Yourself!", a private adult card game for KUNAL and NANDINI (couple, separate phones, same room). You destroy them with dark comedy. Consenting adults who WANT to be filthily roasted using their questionnaire answers.

VOICE — SAMAY RAINA ROAST ENERGY:
- Rapid Hinglish crowd-work: baap re, arre yaar, matlab, kya hi bolu, sunn, bhenchod, madarchod, saala, chutiya, bakchodi, pagal, gadha, kya scene hai, full roast mode.
- Dark edgy jokes with a grin — like a Comedy Club roast where everyone's in on it.
- Bollywood / OTT refs drop naturally: Dhurandhar, Paatal Lok, Sacred Games, Gangs of Wasseypur, Mirzapur, Delhi Crime, Animal, Pushpa, KGF, Drishyam, Kantara, Evaru, Family Man, Scam 1992.
- Say "Absolute cinema" when something is unhinged. Compare their kinks to plot twists from Paatal Lok or Hathiram energy from Dhurandhar.

QUESTIONNAIRE IS YOUR WEAPON:
- Their kinks, fantasies, roast material, drinks, swear words, dark cinema picks — USE ALL OF IT surgically.
- Compare Kunal vs Nandini: who listed public fucking, who has death kink, who drew the line at family taboo — couple chaos is the point.
- If they wrote partnerRoast material — hit that FIRST.
- If they have a fav swear word — deploy it like a slur of affection.

LIMITS ARE SACRED:
- DO NOT REFERENCE / OFF LIMITS tags are hard red lines. Never joke about those topics. Ever.
- Roasting a kink they listed is fair game. Roasting a limit they set is forbidden.

PERSONALITY:
- Professional hater who read both their filth files cover to cover.
- Win, lose, breathe — roast. Good luck? Roast the audacity. Bad draw? Roast the incompetence.
- Drunk bartender who's seen too much and has zero HR department.

RESPONSE RULES:
- 1-2 sentences MAX. Punchy. Devastating. No essays.
- Swear every response — non-negotiable.
- Always use the player's name. Mention the partner by name when roasting couple dynamics.
- Brutal but funny — never genuinely cruel about real trauma.`;

const COUPLE_BLOCK = `\n\n${COUPLE_CONTEXT}`;

export function buildPrompt(mode, { playerName, scenario, profile, playersContext, gameContext, streakInfo, otherPlayer }) {
  const ctx = gameContext ? `Game state: ${gameContext}.` : '';

  const profileBlock = profile
    ? `\n\n${playerName}'s filth file:\n${_formatProfile(profile)}`
    : '';

  const allPlayersBlock = playersContext
    ? `\n\nBoth players' questionnaire data (roast using this):\n${playersContext}`
    : '';

  const streakBlock = streakInfo
    ? `\n\nRunning pattern for ${playerName}: ${streakInfo}.`
    : '';

  const partnerLine = otherPlayer ? ` Their partner in this room is ${otherPlayer}.` : '';

  if (mode === 'book') {
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} just completed the full 4-card set of "${scenario}".${partnerLine} Roast this using their kinks/fantasy/roast material from the questionnaire. Compare to ${otherPlayer ?? 'their partner'} if you have both profiles. 1-2 sentences.`;
  }

  if (mode === 'gfy') {
    const from = otherPlayer ? `asked ${otherPlayer}` : 'asked someone';
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} ${from} for cards, got told Go Fuck Yourself, drew from the deck, and missed.${partnerLine} Humiliate them using questionnaire details — kinks, drink choice, dark cinema, roast material. 1-2 sentences.`;
  }

  if (mode === 'lucky') {
    const from = otherPlayer ? `asked ${otherPlayer}` : 'asked someone';
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} ${from} for cards, got GFY'd, then drew exactly what they needed.${partnerLine} Roast the undeserved luck using their filth file. 1-2 sentences.`;
  }

  if (mode === 'steal') {
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} just raided ${otherPlayer ?? "someone"}'s hand.${partnerLine} Roast the theft like a Paatal Lok heist — use kink data if relevant. 1-2 sentences.`;
  }

  if (mode === 'game_over') {
    return `${COUPLE_BLOCK}${ctx}${allPlayersBlock}

Game over. ${playerName} ${scenario ?? 'survived that shitshow'}.${partnerLine} Closing roast for Kunal & Nandini using both questionnaires — kinks, mismatches, who was more depraved tonight. 1-2 sentences.`;
  }

  if (mode === 'roast') {
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}${streakBlock}

${playerName} hit the Bartender button.${partnerLine} Destroy them using specific kinks, fantasyConfess, partnerRoast, limits contrast vs ${otherPlayer ?? 'partner'}. Samay Raina energy. 1-2 sentences.`;
  }

  if (mode === 'question') {
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}

Ask ${playerName} a pointed filthy question about "${scenario}" — tie it to their listed kinks or fantasy. Reference ${otherPlayer ?? 'their partner'} if both profiles exist. 1-2 sentences.`;
  }

  if (mode === 'dare') {
    return `${COUPLE_BLOCK}${ctx}${profileBlock}${allPlayersBlock}

Give ${playerName} a short embarrassing dare about "${scenario}" — weaponize their kinks, drink habits, or roast material. ${otherPlayer ? `${otherPlayer} is watching.` : ''} 1-2 sentences.`;
  }

  return `${COUPLE_BLOCK}${ctx}${allPlayersBlock}\n\nSay something chaotic about what just happened. Use questionnaire data. 1-2 sentences. Swear.`;
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
  book: [
    "Bhenchod — four cards. You hunted this set like Hathiram chasing a Paatal Lok case.",
    "Absolute cinema. Kunal and Nandini energy and I'm not saying which one of you is more fucked up.",
    "Full set complete. Your questionnaire warned me. I didn't listen. Neither should your partner.",
    "Four of a kind. Matlab kya hi bolu — the filth file didn't lie.",
    "Saala, you collected all four like it's a Dhurandhar operation. Zero subtlety.",
    "The bar was on the floor and you tunneled under it with your listed kinks. Respect.",
    "This achievement belongs in Sacred Games season 4. Netflix, call me.",
    "Baap re — nobody in this room is shocked. Your kink chips told us everything.",
  ],
  gfy: [
    "Go fuck yourself. The deck said it. I said it. Your partner probably agrees.",
    "Asked for cards, got rejected, drew air. Bhenchod, even Paatal Lok villains have better plans.",
    "What the fuck was that strategy? Mirzapur ka Munna would've done better.",
    "GFY trifecta — asked, rejected, whiffed. Absolute cinema of incompetence.",
    "The pile had one job. You had a whole questionnaire of kinks and still couldn't pull a card.",
    "Arre yaar — drew nothing. Your drunk-fucking kink won't save you here either.",
    "Saala, the deck looked at your filth file and said nah.",
    "Three failures one turn. Gangs of Wasseypur mein bhi itna disaster nahi hota.",
  ],
  lucky: [
    "RNG ne adopt kar liya isko. Bhenchod — you don't deserve this luck or those kinks.",
    "Drew lucky after GFY. Pushpa energy — thaggede le... but with cards.",
    "Statistically impossible. Emotionally inevitable for whoever listed death kink on their profile.",
    "The deck is cheating. Delhi Crime should investigate.",
    "Lucky draw. Kya scene hai — rejected AND victorious. Main character syndrome.",
    "Your partner is watching you get lucky. Questionnaire says they have opinions about that.",
    "Undeserved. Like a Dhurandhar plot twist nobody asked for.",
  ],
  steal: [
    "Walked in, raided the hand, walked out. Paatal Lok heist — zero remorse.",
    "Bhenchod — stole cards like you're collecting kinks on the questionnaire.",
    "Professional thief energy. Mirzapur behaviour. No apology.",
    "Took what they wanted. Your limits say no CNC but this theft was consensual robbery.",
    "The audacity. The fucking audacity. KGF Chapter 2 vibes.",
  ],
  game_over: [
    "Roll credits. Kunal, Nandini — go home and process what your questionnaires exposed.",
    "Game over. Pour one out. Your kinks survived. Your dignity didn't.",
    "Bhenchod — what a game. Paatal Lok finale energy. Get the fuck out.",
    "Absolute cinema. Both filth files fully weaponized tonight. No regrets. Many regrets.",
    "The bartender has seen your kinks, your limits, and your card play. All disappointing.",
    "More twists than Dhurandhar. Go reconcile with your partner. Or don't. Not my problem.",
  ],
  roast: [
    "Read your filth file. Bhenchod — public fucking AND family taboo on the same profile? Absolute cinema.",
    "Your kinks are a Netflix pitch. Paatal Lok writers are taking notes.",
    "I know what you're into. You typed it yourself. Saala, the audacity.",
    "Questionnaire said roast me for this — so here: you're exactly as depraved as you admitted.",
    "Kunal, Nandini — one of you has weirder chips than the other. I'm not saying who. Actually I am.",
    "Your fav swear word is in your profile and I'm still not using it enough to describe you.",
    "Death kink on paper, can't complete a book in cards. Priorities, bhenchod.",
    "Drunk fucking kink but you can't hold your liquor OR your hand. Matlab kya hi bolu.",
  ],
  question: [
    "On a scale of 'profile chip' to 'fantasyConfess field' — how real is this for you?",
    "Does your partner know you listed this kink? Should they? Be honest, bhenchod.",
    "Which Paatal Lok character would do this scenario? Wrong answers only.",
    "Your limits say one thing. Your kinks say another. Explain like I'm Hathiram.",
    "Walk us through the first time. We have drinks and your whole filth file.",
    "Kunal or Nandini — who'd actually do this? Point at them. Now.",
  ],
  dare: [
    "Read your dirtiest kink chip aloud. Eye contact with your partner. Go.",
    "Confess which questionnaire answer was a lie. 10 seconds. Absolute cinema.",
    "Do your best Sacred Games scream. Partner rates it 1-10.",
    "Whisper your fantasyConfess field in your partner's ear. They react. We watch.",
    "Say your fav swear word like it's the last line of Dhurandhar. Commit.",
    "Reenact your listed kink using only hand gestures. Partner guesses. No speaking.",
  ]
};

function _pickProfileHook(profile, otherProfile) {
  const hooks = [];
  if (profile?.kinks?.length) hooks.push(`listed "${profile.kinks[Math.floor(Math.random() * profile.kinks.length)]}" as a kink`);
  if (profile?.fantasyConfess) hooks.push(`admitted "${profile.fantasyConfess.slice(0, 40)}..."`);
  if (profile?.partnerRoast) hooks.push(`asked to be roasted for "${profile.partnerRoast.slice(0, 40)}..."`);
  if (profile?.swearWord) hooks.push(`whose fav swear is "${profile.swearWord}"`);
  if (profile?.mediaFaves?.length) hooks.push(`who loves ${profile.mediaFaves[0]}`);
  if (profile?.favDrink) hooks.push(`who drinks ${profile.favDrink}`);
  if (otherProfile?.name && profile?.kinks?.length && otherProfile?.limits?.length) {
    hooks.push(`while ${otherProfile.name} drew a line at ${otherProfile.limits[0]}`);
  }
  return hooks.length ? hooks[Math.floor(Math.random() * hooks.length)] : null;
}

export function offlineLine(mode, profile, otherProfile = null) {
  const bank = OFFLINE[mode] ?? OFFLINE.roast;
  const line = bank[Math.floor(Math.random() * bank.length)];
  const hook = _pickProfileHook(profile, otherProfile);
  if (hook && Math.random() > 0.35) {
    const name = profile?.name ?? 'You';
    return `${name} — ${hook}. ${line}`;
  }
  return line;
}
