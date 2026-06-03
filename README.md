# Go Fuck Yourself (GFY)

A real-time, two-phone party card game with **Bhenchod Bartender** — an AI roast host — plus drink logging, BAC-aware safety prompts, and a mobile-first PWA. Built for couples or friends on separate devices in the same room.

| | |
|---|---|
| **Stack** | Node.js 18+, Express, WebSocket (`ws`), vanilla ES modules |
| **AI** | NVIDIA Build API (LLM + vision), proxied server-side |
| **Clients** | Two phones per room (portrait PWA) |
| **Theme** | Boeing Blue party aesthetic (`#0033A0`) |
| **License** | MIT |

**Repository:** [github.com/itskunal23/party-game](https://github.com/itskunal23/party-game)

---

> **Disclaimer — 21+ only**
>
> Drink responsibly. This is entertainment software, not medical or safety advice. BAC estimates are approximate. Never drive after drinking. Hosts are responsible for player safety and local laws. Adult content and roasts are for consenting adults in private sessions.

---

## Table of contents

- [What it is](#what-it-is)
- [Features](#features)
- [How to play (Kunal & Nandini)](#how-to-play-kunal--nandini)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Deploy on Render](#deploy-on-render)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Security](#security)

---

## What it is

**Go Fuck Yourself** turns Go Fish into a synchronized multiplayer session:

1. Each player completes a **filth questionnaire** (kinks, limits, fantasies, dark cinema, drink habits).
2. One phone **creates a room**; the other **joins with a 4-letter code**.
3. The server holds deck state, validates turns, and triggers **Bhenchod Bartender** roasts from questionnaire data.
4. Completing sets of four triggers kink-themed dares on the cards.

The server is authoritative — clients never see each other's hands. Snapshots sync over WebSocket with auto-reconnect.

---

## Features

### Multiplayer

| Capability | Description |
|---|---|
| Room codes | 4 letters; excludes ambiguous chars (I, O, 0, 1) |
| Two-player rooms | Max 2 humans; solo mode adds **Bhenchod Bot** |
| WebSocket sync | `/ws` with session tokens and rejoin |
| Host controls | Host starts game and can play again after results |

### Filth questionnaire & roasts

- Chip-based **kinks** and **hard limits** (plus custom entries)
- Free-text: dirtiest fantasy, roast material, drink + why, swear word
- Dark cinema picker with AI suggestions (Paatal Lok, Dhurandhar, etc.)
- **Bhenchod Bartender** uses questionnaire data for Hinglish roasts (Samay Raina energy)
- Respects limit tags — listed limits are never referenced in roasts
- Offline roast bank when `NVIDIA_API_KEY` is unset

### Card game

- Classic Go Fish: 7-card deal, ask for ranks, collect sets of four
- 13 kink-themed scenario ranks (A–K) with couple dares
- GSAP card animations, procedural audio, full-screen GFY miss overlay

### Drinking & safety

- Drink log with presets and optional vision identification (`/api/detect-drink`)
- BAC estimation (Watson + Widmark) on a 0–10 scale
- High-BAC intervention prompts via `frontend/js/bac.js`

### Client UX

- Installable PWA (`manifest.webmanifest`, service worker)
- Boeing Blue landing page with animated cocktail bar scene
- iOS-oriented: safe areas, 44px touch targets, wake lock, haptics
- Side games hub (e.g. Fucking UNO) from in-game toolbar

---

## How to play (Kunal & Nandini)

Designed for **two phones, one room** — **same link on both**:

**https://party-game-armi.onrender.com**

(Optional: `?who=kunal` or `?who=nandini` only pre-fills a name in the questionnaire — not required.)

1. Both open the link and complete the questionnaire on their own phone.
2. **One person** → **Start Chaos** → share the 4-letter room code.
3. **The other** → enter code → **Join Chaos**.
4. Whoever created the room taps **Start Game**.
5. Tap **Bartender** anytime for a couple roast using both profiles.

**Same Wi‑Fi local test:** `http://<your-lan-ip>:3000` on both phones.

---

## Architecture

```
┌─────────────┐     HTTPS/WSS      ┌──────────────────────────────────┐
│  Phone A    │ ◄────────────────► │  game/server.js                  │
│  (PWA)      │                    │  Express + WebSocket /ws         │
└─────────────┘                    │  lib/rooms.js      — game state  │
┌─────────────┐                    │  lib/create-app.js — API + static│
│  Phone B    │ ◄────────────────► │  lib/prompts.js    — AI host     │
│  (PWA)      │                    │  lib/couple.js     — session ctx │
└─────────────┘                    └──────────────────────────────────┘
```

**Flow:** clients send intents (`create`, `join`, `ask`, `logDrink`, …) → server validates and updates room state → optional NVIDIA call for bartender lines → per-player snapshots pushed over WebSocket.

Profiles live in each phone's `localStorage` (`gfy_profile`) and are sent to the server at join time for roasts.

---

## Quick start

```bash
git clone https://github.com/itskunal23/party-game.git
cd party-game
npm install
cp .env.example .env
# Edit .env — set NVIDIA_API_KEY (optional; offline roasts work without it)
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Verify AI: `GET http://localhost:3000/api/health` → `"aiEnabled": true` when the key is set.

**Dev with auto-reload:**

```bash
npm run dev
```

**Regenerate placeholder PWA icons:**

```bash
node generate-icons.mjs
```

---

## Configuration

Copy `.env.example` to `.env`. **Never commit `.env`.**

| Variable | Required | Default | Description |
|---|---|---|---|
| `NVIDIA_API_KEY` | Recommended | — | NVIDIA Build key (`nvapi-…`) from [build.nvidia.com](https://build.nvidia.com) |
| `NVIDIA_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | API base URL |
| `HOST_MODEL` | No | `meta/llama-3.3-70b-instruct` | Bartender text model |
| `VISION_MODEL` | No | `meta/llama-3.2-90b-vision-instruct` | Drink vision model |
| `PORT` | No | `3000` | HTTP listen port |

Without `NVIDIA_API_KEY`, the app runs with offline roast lines and no vision drink detection.

---

## Deploy on Render

WebSocket and in-memory rooms need a **long-running Node process**. This repo includes a root `render.yaml` Blueprint configured for the **free** web tier only (`plan: free`).

> **Important:** If `plan` is omitted, Render defaults to `starter` (paid) and may require a payment method before deploy. This repo sets `plan: free` explicitly.

### Option A — Blueprint (recommended)

1. Push this repo to [github.com/itskunal23/party-game](https://github.com/itskunal23/party-game).
2. In [Render Dashboard](https://dashboard.render.com) → **New → Blueprint**.
3. Connect the `party-game` repository — Render reads `render.yaml`.
4. Confirm the service shows **Free** instance type (not Starter).
5. Set **`NVIDIA_API_KEY`** in Environment (Dashboard → your service → Environment). Do not put it in git.
6. Deploy. Open your Render URL on both phones → Add to Home Screen.

### Option B — Manual web service

| Setting | Value |
|---|---|
| Instance Type | **Free** |
| Root Directory | *(empty — repo root)* |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Environment | `NVIDIA_API_KEY` = your key (secret) |

### Free tier limits

| Limit | Detail |
|---|---|
| Spin-down | Service sleeps after ~15 min with no traffic (cold start on next visit) |
| WebSockets | Supported on free web services |
| Databases | Not used — this app keeps rooms in memory (no Postgres needed) |
| Billing | No instance charges on `plan: free`; Render may still ask for a card for account verification |

### Production checklist

- [ ] `NVIDIA_API_KEY` set in Render env (not in repo)
- [ ] `GET https://<your-service>.onrender.com/api/health` → `aiEnabled: true`
- [ ] Both phones use the **same HTTPS origin**
- [ ] `/css/styles.css` returns `200` with `Content-Type: text/css`
- [ ] PWA installed from home screen on iOS for best UX

If Render still asks for a payment method after this fix, cancel and re-create the Blueprint so it re-reads `plan: free` from GitHub (or delete any existing Starter service and redeploy).

---

## API reference

### HTTP

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health, `aiEnabled`, model IDs, room count |
| POST | `/api/host` | Generate bartender line (`mode`, `playerName`, `profile`, …) |
| POST | `/api/detect-drink` | Vision drink ID (base64 image) |
| POST | `/api/movie-suggest` | Dark cinema suggestions from a seed title |

### WebSocket (`/ws`)

Message types include: `create`, `join`, `rejoin`, `start`, `ask`, `logDrink`, `skipDrink`, `playAgain`, `leave`.

Clients store `gfy_room`, `gfy_token`, and `gfy_pid` in `localStorage` for reconnect.

---

## Project structure

```
party-game/
├── package.json              # npm start → node game/server.js
├── render.yaml               # Render Blueprint
├── .env.example              # Env template (no secrets)
├── generate-icons.mjs        # Placeholder PWA icons
└── game/
    ├── server.js             # HTTP + WebSocket entry
    ├── lib/
    │   ├── create-app.js     # Express, static files, NVIDIA proxy
    │   ├── rooms.js          # Rooms, game logic, bot partner
    │   ├── prompts.js        # Bhenchod Bartender persona + offline bank
    │   ├── couple.js         # Kunal & Nandini session context
    │   ├── bot.js            # Solo opponent AI
    │   └── bac.js            # Server-side BAC helpers
    └── frontend/             # PWA client
        ├── index.html
        ├── manifest.webmanifest
        ├── sw.js
        ├── css/              # styles, profile, card-stacks, game-theatre, gfy-board
        ├── js/
        │   ├── app.js        # UI orchestration
        │   ├── api.js        # WebSocket + REST client
        │   ├── profile.js    # Questionnaire wizard
        │   ├── game.js       # Scenarios + deck (shared with server)
        │   ├── bac.js        # Drunk meter UI
        │   ├── mobile.js     # iOS UX helpers
        │   └── sidegames/    # Hub + UNO variant
        └── icons/
```

---

## Security

- **Never commit** `.env` or real API keys — only `.env.example` with placeholders.
- All NVIDIA requests are proxied; browsers never receive the raw key.
- Rotate keys immediately if exposed in logs, commits, or screenshots.
- Drink vision images are resized client-side before upload.

---

## License

MIT — use at your own risk. Authors are not liable for misuse or harm resulting from alcohol consumption or adult content.
