# Go Fuck Yourself — Complete Player Guide

Everything you can do in **GFY**, what **Bhenchod Bartender** does, and how **drink tracking** works (including scanning and set-based logging).

**Live app:** [https://party-game-armi.onrender.com](https://party-game-armi.onrender.com)  
**Built for:** Kunal & Nandini — two phones, one room, same URL.

> **21+ only.** Drink responsibly. BAC numbers are entertainment estimates, not medical advice. Never drive after drinking.

## Simple rules (read this first)

**Goal:** Collect all 4 cards of a set → complete the book → assign a drink → do the dare.

**Each turn:**
1. Pick a card (or tap **Wild Ask** to ask for a rank you don't hold).
2. Swipe it at your partner (or tap them).
3. They pick: **Give** · **GFY** (don't have it) · **Bluff** (lie — say GFY but keep cards).
4. If they say GFY, you pick: **Accept** (draw from pond) or **Bullshit** (call the lie).
   - Liar caught → they draw **4**.
   - Wrong call → **you** draw **2** (asymmetric — wrong calls hurt but don't wreck you).

**Once per game (tap the pills on your turn):**
| Move | What it does |
|------|----------------|
| **Steal** | Take 1 random card from them (they don't see which). |
| **Wild Ask** | Ask for any rank — even one you don't hold. Miss = draw **2**. (1 token per game; recovery events can grant more.) |
| **2×** | Win = keep going. Lose = draw **2** and lose turn. |
| **Comeback** | If you're down 2+ books, you get one token: steal · reveal a rank · keep turn · or earn Wild Ask. |

**Stalemate recovery (automatic):** If the game loops on GFY misses with no real progress, the server injects a chaos event — Pond Surge, Rank Reveal, Wild Ask tokens, Card Swap, or Chaos Draw. You'll see a gold banner; it should feel like the bartender shaking things up, not a bug patch.

**Bonuses:**
- **3 lucky pond draws** → pick: draw 2 OR peek at their hand (by rank).
- **Complete a book** → pick: draw 1 · they draw 1 · get steal back.
- **Secret mission** → shown at start; finish it for bragging rights.
- **Chaos** → random mid-game event from a pool of 8 (pond flood, card tax, steal refresh, wild surge, pond drought, swap fates, double down, hand reveal).

**Bartender:** Samay Raina-style — observational humiliation, cinema comparison, conversational Hinglish; says full **Go Fuck Yourself** (never "GFY"); punchline finish.

---

## Design direction (product audit)

**Brand color stays Boeing Blue (`#0033A0`).** Visual layer is **neon cocktail bar × Apple glass × Jackbox beats** — not corporate aviation.

| Pillar | What we built |
|--------|----------------|
| **Reveal moments** | Multi-stage book celebration (slam → shake → sting → toast → dare → bartender → drink assign) |
| **Direct manipulation** | No Ask/Confirm buttons — grab card, throw at partner or pond |
| **Hand feel** | Cards in a horizontal row; duplicates stack with a count badge |
| **Bartender memory** | Session log + streaks fed into every roast (`sessionMemory`) |
| **Streak titles** | Lucky Bastard, Card Shark, Pond Goblin, Chaos Lord — pop when unlocked |
| **Chaos events** | Power Hour, Pond Tax, Reverse Roast, Bollywood Twist, Golden Set — random mid-game |
| **Fast onboarding** | ~60s core questionnaire → **Play now** gate; extended filth optional |
| **Drink loop** | Set winner assigns drink → loser scans/logs on their phone |

Players remember the **roasts, reactions, drinks, and chaos** — not Go Fish mechanics.

---

## Table of contents

1. [Before you play — setup flow](#before-you-play--setup-flow)
2. [The filth questionnaire](#the-filth-questionnaire)
3. [Lobby & starting a game](#lobby--starting-a-game)
4. [How Go Fish works in GFY](#how-go-fish-works-in-gfy)
5. [The 13 kink sets (cards & dares)](#the-13-kink-sets-cards--dares)
6. [Game board — what you can tap and swipe](#game-board--what-you-can-tap-and-swipe)
7. [Winning, results, play again](#winning-results-play-again)
8. [Bhenchod Bartender — everything it can do](#bhenchod-bartender--everything-it-can-do)
9. [Drink tracking — scan, log, BAC meter](#drink-tracking--scan-log-bac-meter)
10. [Set-based drinks — when someone completes a book](#set-based-drinks--when-someone-completes-a-book)
11. [Side games](#side-games)
12. [PWA & phone tips](#pwa--phone-tips)
13. [What needs NVIDIA API key vs works offline](#what-needs-nvidia-api-key-vs-works-offline)

---

## Before you play — setup flow

```
Landing page → Filth questionnaire (first time) → Home → Lobby → Game
```

| Step | Who | Action |
|------|-----|--------|
| 1 | Both | Open the same URL on each phone |
| 2 | Both | **Start Chaos** (or **Join Chaos** with a room code) |
| 3 | Both | Complete the questionnaire if you haven't (stored on *your* phone only) |
| 4 | Host | **Start Chaos** creates a **4-letter room code** — share it |
| 5 | Partner | Enter code → **Join** |
| 6 | Host | Tap **Start Game** when both are in the lobby |

Optional: enter your name in the questionnaire when you join — no URL tricks needed.

**Solo mode:** If only one human is in the room when the host starts, **Bhenchod Bot** joins automatically as the second player.

---

## The filth questionnaire

Each phone saves a private **filth file** in `localStorage` (`gfy_profile`). It is sent to the server at join time so the bartender can roast you — your partner sees a **sanitized** subset (limits and weight are stripped from what they receive).

| Question | What it feeds |
|----------|----------------|
| Name | Display name in lobby and game |
| Age range | Context (18+ only) |
| Height | Profile only |
| Weight | **Drunk meter / BAC** calibration (lbs → kg on server) |
| Kinks & hard limits | Roast ammo + **sacred red lines** (limits are never referenced in roasts) |
| Dirtiest fantasy | Bartender ammo |
| What should the bartender roast you for | `partnerRoast` — hit this first when roasting you |
| Dark cinema | `mediaFaves` — Paatal Lok, Dhurandhar, etc. |
| Drink + why you drink it | `favDrink`, `drinkWhy` — bartender ammo |
| Fav swear word | Deployed in roasts |

You can **Skip** any question, **Edit Profile** from home, or jump steps with the dot nav on pick-one screens.

---

## Lobby & starting a game

**Lobby shows:**

- Room code + **Copy Code**
- Player list (host marked)
- Rules reminder: shuffle · deal 5 · ask · collect sets of 4 · draw from pond on a miss

**Host only:** **Start Game**

**On start — setup ceremony (both phones):**

1. 🔀 Shuffling the deck…
2. 🃏 Dealing 5 cards to each player
3. 🌊 N cards in the pond
4. `[First player]` goes first

Then the board unlocks.

---

## How Go Fish works in GFY

Classic Go Fish rules, kink-themed deck:

| Rule | Detail |
|------|--------|
| Deck | 13 scenarios × 4 copies = **52 cards** |
| Deal | **5 cards** each (2 players) |
| Your turn | You must hold at least one card of the rank you're asking for |
| Ask partner | If they have matching rank → they give **all** of that rank → **you keep asking** |
| Miss | Partner says **"Go Fuck Yourself!"** → you draw **one** from the pond |
| Lucky pond draw | If the drawn card **matches** the rank you asked for → you keep your turn |
| Book (set) | **4 of the same scenario** → removed from hand, shown face-up, dare toast fires |
| Turn ends | After a GFY miss where the pond card **doesn't** match |
| Game over | All **13 sets** completed **or** pond empty and no cards left in any hand |

**Important:** You can only ask for a **rank** you already hold (same as standard Go Fish — the app uses the scenario name as the match key).

---

## The 13 kink sets (cards & dares)

When you complete a set of four, a full-screen toast plays the official book line:

> *Sweet I officially have*  
> **[scenario name]**  
> *— [your name]*

Each rank has a couple dare tied to it (Kunal dom / Nandini sub energy in the copy):

| Rank | Scenario | Dare (summary) |
|------|----------|----------------|
| A | Nandini Sucking Kunal — Aanchal Outside | Recreate kneeling scene; silent 45s with knock bit |
| 2 | Kunal's Whiskey Dick | Dead drunk dick roleplay + confession |
| 3 | Four-Stroke Handjob | Count strokes aloud; drink/confess rules |
| 4 | Family Caught You Fucking | Act out almost-walked-in panic |
| 5 | Public Fuck Fantasy | Describe where you'd fuck with someone nearby |
| 6 | Drunk & Raw | Confess drunkest sex story |
| 7 | Family Taboo Confession | Admit taboo fantasy; partner reacts |
| 8 | Roast Their Stroke Game | 30s performance roast |
| 9 | Caught on Camera | Film/nude confession |
| 10 | CNC / RPE Energy | Whisper real CNC scenario + safeword |
| J | Nandini Riding Kunal — Door Unlocked | Freestyle filth rap/talk |
| Q | Silent Fuck Mime | Mime caught-fucking; partner guesses |
| K | Questionnaire Punishment Fuck | Partner picks your nastiest kink chip — describe doing it tonight |

Completed sets appear in **your books row** at the top of your hand area (emoji + scenario name).

---

## Game board — what you can tap and swipe

### Top bar

| Element | Meaning |
|---------|---------|
| 🌊 | Cards left in the **pond** |
| 📦 | Sets completed globally (`0/13`) |
| Room code | Current room |
| 📚 | **Your** completed set count |

### Partner zone (top)

- Shows partner name, card count, set count, BAC level indicator
- **Your turn:** swipe a card **up** onto partner **or** tap a card in your hand → tap partner
- Drop target highlights when a card is selected

### Pond (center)

- Alternate ask target: swipe card up to **POND** (same as asking partner — server resolves against partner's hand)
- Label shows pond count

### Your hand (bottom fan)

- Tap to select a card (rank/scenario)
- Drag/swipe upward to partner or pond
- GSAP animations + sound on GFY miss / lucky draw / book

### Action banner

- Short text for what just happened (got cards, GFY, lucky draw)
- **GFY overlay** (full screen) when *you* get told to go fuck yourself and miss

### Bottom toolbar

| Button | Action |
|--------|--------|
| 🍺 **Drinks** | Opens/closes the **BAC drink panel** (see below) |
| 🎲 **Side Games** | Pass-and-play hub on this device |
| 🍸 **Roast** | Manual **Bhenchod Bartender** roast (uses your profile + partner context) |

---

## Winning, results, play again

- When the game ends, **Results** shows winner by most sets completed
- **Play Again** re-deals from lobby rules (host can restart from `gameOver` phase)
- Bartender fires a **game over** closing line after results

---

## Bhenchod Bartender — everything it can do

**Bhenchod Bartender** is an AI roast host (NVIDIA LLM when configured, offline bank otherwise). **Samay Raina energy** — not random swearing: **observational humiliation**, exaggerated confidence, specific cinema beats, conversational Hinglish. Reads questionnaire + session memory.

### Persona rules (always on)

| Rule | Behavior |
|------|----------|
| Kunal | **Always dom** — commanding, in control; even whiffs = sloppy dom on a power trip / public humiliation tour, never sub |
| Nandini | **Always sub** — playfully wrecked; never topping Kunal |
| Couple dynamic | **Same team** — never pit them against each other as rivals |
| Limits | Hard limits from questionnaire are **never** referenced |
| Length | **1–3 sentences**, max ~70 words; **1–2 swear words** (vary — don't spam madarchod) |
| Game phrase | Say full **Go Fuck Yourself** when partner refuses or pond punishes — **never abbreviate "GFY"** in roast lines |
| Copyright | **No verbatim dialogue** — inspired situations, catchphrase *energy*, named titles |
| Format | **Name → what just happened → movie comparison → profanity → punchline** (often ends with standalone *Go Fuck Yourself.*) |
| Never | Generic "you're bad", corporate AI tone, long paragraphs |
| References | **Assigned reference bank** per player (Nandini: Brooklyn Nine-Nine, Modern Family, Nailed It, etc.; Kunal: his mediaFaves + OTT beats) — specific moments, not title name-drops |
| Anti-repeat | Same **franchise** not reused within the last **5** bartender lines in a session |
| mediaFaves | Questionnaire picks boost matching franchises in the bank |

### When bartender fires automatically

| Trigger | Mode | Who gets roasted |
|---------|------|------------------|
| You complete a set (book) | `book` | Set winner — uses their profile |
| You ask, get GFY'd, draw from pond and **miss** | `gfy` | The asker (you) |
| You ask, get GFY'd, draw and **match** (lucky) | `lucky` | The asker (you) |
| Game ends | `game_over` | Winner-focused send-off |

Auto-triggers have a **~5 second cooldown** between lines so roasts don't stack.

### Manual roast

Tap **🍸 Roast** in the game toolbar anytime. Uses:

- Your profile from this phone
- Partner's sanitized profile from the server
- Tonight's stats (miss streaks, lucky draws, books collected)

### Transcript UI

- Full-screen **Bhenchod Bartender** overlay with the line
- **Tap anywhere** (or Enter/Space) to dismiss — no auto-hide
- Home screen shows rotating **preview lines** before you enter a room

### Modes supported in code (not all wired to UI buttons)

| Mode | Used today? | Purpose |
|------|-------------|---------|
| `book` | ✅ Auto on set | Roast completing a 4-card set |
| `gfy` | ✅ Auto on miss | Roast after Go Fuck Yourself + bad draw |
| `lucky` | ✅ Auto on lucky pond | Roast lucky matching draw |
| `game_over` | ✅ Auto on results | Closing toast |
| `roast` | ✅ Manual button | On-demand destruction |
| `steal` | ❌ Not auto-triggered | When someone raids a hand (prompt exists) |
| `question` | ❌ Not in UI | Filthy question tied to scenario |
| `dare` | ❌ Not in UI | Dare tied to scenario |

### What the bartender uses from your filth file

- Kinks, fantasy, partnerRoast, mediaFaves, favDrink, drinkWhy, swear word, traits, describe-yourself chips
- **Never:** off-limits / hard limit topics

---

## Drink tracking — scan, log, BAC meter

Each player tracks **their own** drinks on **their own phone**. The server stores drinks per player, recalculates BAC, and broadcasts levels to both clients.

### Open the drink panel

In an active game → toolbar → **🍺 Drinks**

### Log a drink — three ways

| Method | How |
|--------|-----|
| **Preset — Beer** | 🍺 5% ABV, 12 oz |
| **Preset — Wine** | 🍷 13% ABV, 5 oz |
| **Preset — Shot** | 🥃 40% ABV, 1.5 oz |
| **Preset — Cocktail** | 🍹 12% ABV, 6 oz |
| **📷 Scan** | Opens rear camera → captures frame → sends to `/api/detect-drink` → AI returns drink name + estimated ABV/oz → logs automatically |

**Scan requirements:**

- `NVIDIA_API_KEY` set on the server (vision model)
- Camera permission on the phone
- Without AI: scan still runs but falls back to generic estimates (Beer-like defaults)

### What happens when you log

1. Drink appended to **your** server-side drink list (with timestamp)
2. WebSocket message `{ type: 'logDrink', drink: { label, abv, oz, timestamp } }`
3. Server runs **Watson/Widmark** BAC estimate using **your questionnaire weight**
4. Both phones get `bacUpdate` + refreshed snapshots (partner sees your **level** 0–10, not full drink list)

### BAC meter (0–10 scale)

- Vertical bar fills by level
- **Level 8+:** "slow down / water" intervention modal
- **Level 9+:** water break prompt
- **Level 10:** stop drinking prompt

Disclaimer shown: *BAC estimates are for entertainment only.*

### Weight calibration

Set your weight in the questionnaire (US lbs pick-one). That value converts to kg for BAC math on the server.

---

## Set-based drinks — when someone completes a book

This is the **intended house rule** for linking drinks to Go Fish sets: when **you** complete a set, **your partner** drinks — and you choose what (or scan it).

### Intended flow (designed in server + UI shells)

```
Player completes 4-of-a-kind
        │
        ▼
Toast: "Sweet I officially have [scenario] — [name]"
        │
        ├──► Winner's phone: chooseLoserDrink panel
        │         Pick drink for partner (presets / scan / custom label)
        │         WebSocket: { type: 'chooseDrink', loserId, drinkLabel, scenario }
        │
        └──► Loser's phone: drink-assigned modal
                  "Kunal assigned you: [drink] for [scenario]"
                  Partner logs it via Drinks panel (scan or preset)
                  WebSocket: { type: 'logDrink', drink: {...} }
                  Optional: { type: 'skipDrink', scenario } to dismiss assignment
```

### Server behavior (implemented)

When `resolveBooks()` runs in `game/lib/rooms.js`:

1. Four matching scenario cards leave the winner's hand → added to their **books**
2. `bookComplete` broadcast → toast + bartender `book` roast
3. Winner receives **`chooseLoserDrink`** with `{ scenario, losers: [{ id, name }] }`
4. Winner sends **`chooseDrink`** → `assignDrink()` adds to loser's **`pendingDrinks`**:
   ```js
   { scenario, toastFor, drinkLabel, assignedBy }
   ```
5. Loser's snapshots include **`pendingDrinks`** array
6. When loser **`logDrink`** or **`skipDrink`**, matching scenario entries clear from pending

### How to track drinks in practice today

| Step | Player | Action |
|------|--------|--------|
| 1 | Set winner | Complete 4-of-a-kind → read dare toast |
| 2 | Set winner | Tell partner what they're drinking (or use assign UI when wired) |
| 3 | Set loser | Open **🍺 Drinks** → tap preset **or** **📷 Scan** the actual glass/bottle |
| 4 | Set loser | Drink logs to **your** BAC meter; partner sees your level tick up |
| 5 | Both | Do the **dare** on the card while loser sips |

### Current UI status

| Piece | Status |
|-------|--------|
| Server: `chooseLoserDrink`, `assignDrink`, `pendingDrinks`, `skipDrink` | ✅ Implemented |
| Winner drink-assignment sheet | ✅ Wired (`chooseLoserDrink` → bottom sheet) |
| Loser drink-assigned modal + log/skip | ✅ Wired on snapshot |
| Manual **🍺 Drinks** panel (presets + scan) | ✅ Always available |

### Recommended ritual (Kunal & Nandini)

1. **Kunal** completes a set → Nandini drinks (sub takes the pour)
2. **Nandini** completes a set → Kunal drinks (dom still runs the room; he still logs his own drink on his phone)
3. Loser **scans the real drink** when possible so ABV/oz match what's in the glass
4. Bartender **`book`** line fires ~3s after toast — named Bollywood ref, dom/sub framing

---

## Side games

**🎲 Side Games** opens a pass-and-play hub on **whichever phone tapped it** (does not sync over WebSocket).

| Game | Description |
|------|-------------|
| **Fucking UNO** | UNO variant with LLM chaos cards and house rules |

Use between rounds or when waiting for partner's turn.

---

## PWA & phone tips

| Tip | Why |
|-----|-----|
| **Add to Home Screen** (iOS Safari) | Full-screen, fewer tap bugs |
| Hard refresh after deploy | Service worker cache (`gfy-v5`) |
| Same HTTPS origin on both phones | WebSocket room sync |
| Wake lock | Acquired during game so screen stays on |
| Tap bartender transcript to dismiss | No auto-hide by design |
| Tap book toast to skip early | Returns to board before 3.2s timer |

**Local LAN test:** `http://<your-computer-ip>:3000` on both phones on same Wi‑Fi.

---

## What needs NVIDIA API key vs works offline

| Feature | Without `NVIDIA_API_KEY` | With key |
|---------|--------------------------|----------|
| Card game multiplayer | ✅ | ✅ |
| Offline roast bank | ✅ | ✅ |
| Live AI bartender roasts | ❌ (fallback lines) | ✅ |
| Drink **scan** (vision ID) | ⚠️ Generic fallback | ✅ Named drink + ABV/oz |
| Dark cinema AI suggestions | ❌ | ✅ |
| Fucking UNO LLM cards | Depends on UNO impl | ✅ |

Check: `GET /api/health` → `"aiEnabled": true`

---

## Quick reference — WebSocket messages you send

| Message | When |
|---------|------|
| `create` | Start Chaos — new room |
| `join` | Join with code + profile |
| `start` | Host starts game |
| `ask` | `{ rank, targetId }` — your turn |
| `logDrink` | `{ drink: { label, abv, oz, timestamp } }` |
| `chooseDrink` | Winner assigns `{ loserId, drinkLabel, scenario }` |
| `skipDrink` | `{ scenario }` — dismiss pending assignment |
| `playAgain` | Restart after game over |
| `leave` | Leave room |

---

## One-screen cheat sheet

```
ASK:     pick card → swipe ↑ to partner (or tap card → tap partner)
MISS:    "Go Fuck Yourself!" → draw pond → turn ends unless lucky match
BOOK:    4 same scenario → toast + dare + bartender + (partner should drink)
DRINK:   🍺 → preset or 📷 Scan → BAC bar updates
ROAST:   🍸 anytime → tap transcript to dismiss
WIN:     most sets when all 13 done or pond/hand empty
```

*Bhenchod Bartender names the movie. Kunal doms. Nandini subs. Same team. Absolute cinema.*
