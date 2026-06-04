import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BARTENDER_PERSONA, buildPrompt, offlineLine, resolveBartenderReference } from './prompts.js';
import { estimateBAC } from './bac.js';
import { getRoomCount } from './rooms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(__dirname, '../frontend');

const NVIDIA_BASE = process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
const HOST_MODEL = process.env.HOST_MODEL ?? 'meta/llama-3.3-70b-instruct';
const VISION_MODEL = process.env.VISION_MODEL ?? 'meta/llama-3.2-90b-vision-instruct';
const AI_KEY = process.env.NVIDIA_API_KEY;

function _otherFromContext(playersContext, currentName) {
  if (!playersContext || !currentName) return null;
  const blocks = playersContext.split('\n---\n');
  for (const block of blocks) {
    const match = block.match(/^Name:\s*(.+)$/m);
    if (match && match[1].trim().toLowerCase() !== currentName.toLowerCase()) {
      return { name: match[1].trim() };
    }
  }
  return null;
}

function bartenderLine(text) {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  const sentences = flat.split(/(?<=[.!?])\s+/).filter(Boolean);
  const joined = sentences.slice(0, 3).join(' ');
  return joined.length > 320 ? `${joined.slice(0, 317)}…` : joined;
}

async function nvidiaChat(model, messages, maxTokens = 55) {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_KEY}`
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false })
  });
  if (!res.ok) throw new Error(`NVIDIA API ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(FRONTEND));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      aiEnabled: !!AI_KEY,
      textModel: HOST_MODEL,
      visionModel: VISION_MODEL,
      roomCount: getRoomCount()
    });
  });

  app.post('/api/host', async (req, res) => {
    const {
      mode,
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
    } = req.body;
    if (!mode || !playerName) return res.status(400).json({ error: 'missing fields' });

    const refOpts = {
      playerName,
      mode,
      profile,
      recentFranchises,
      streakInfo,
      referenceMode,
    };
    const picked = resolveBartenderReference(refOpts);

    if (!AI_KEY) {
      const line = offlineLine(mode, profile, _otherFromContext(playersContext, playerName), {
        ...refOpts,
        pickedReference: picked,
      });
      return res.json({ line, franchise: picked?.franchise ?? null });
    }

    try {
      const userPrompt = buildPrompt(mode, {
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
        pickedReference: picked,
      });
      const line = bartenderLine(await nvidiaChat(HOST_MODEL, [
        { role: 'system', content: BARTENDER_PERSONA },
        { role: 'user', content: userPrompt }
      ], 140));
      res.json({ line, franchise: picked?.franchise ?? null });
    } catch {
      const line = offlineLine(mode, profile, _otherFromContext(playersContext, playerName), {
        ...refOpts,
        pickedReference: picked,
      });
      res.json({ line, franchise: picked?.franchise ?? null });
    }
  });

  app.post('/api/detect-drink', async (req, res) => {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'no image' });

    if (!AI_KEY) {
      return res.json({ drink: 'Unknown drink', estimatedAbv: 5, estimatedOz: 12 });
    }

    try {
      const content = await nvidiaChat(VISION_MODEL, [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
            { type: 'text', text: 'Identify this drink. Reply with JSON only: {"drink":"name","estimatedAbv":number,"estimatedOz":number}' }
          ]
        }
      ], 60);
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      res.json({ drink: parsed.drink ?? 'Drink', estimatedAbv: parsed.estimatedAbv ?? 5, estimatedOz: parsed.estimatedOz ?? 12 });
    } catch {
      res.json({ drink: 'Drink', estimatedAbv: 5, estimatedOz: 12 });
    }
  });

  app.post('/api/movie-suggest', async (req, res) => {
    const { query } = req.body;
    if (!query?.trim()) return res.json({ suggestions: [] });
    if (!AI_KEY) return res.json({ suggestions: [] });
    try {
      const content = await nvidiaChat(HOST_MODEL, [{
        role: 'user',
        content: `The user likes dark Indian cinema/shows like "${query.trim()}". Suggest 5 similar dark, gritty Bollywood or OTT titles (e.g. Dhurandhar, Paatal Lok, Sacred Games, Gangs of Wasseypur, Mirzapur, Delhi Crime, Animal, Scam 1992). Reply with JSON only: {"suggestions":["Title 1","Title 2","Title 3","Title 4","Title 5"]}`
      }], 120);
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      res.json({ suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [] });
    } catch {
      res.json({ suggestions: [] });
    }
  });

  app.post('/api/bac', (req, res) => {
    const { weight, gender, drinks } = req.body;
    if (!weight || !drinks) return res.status(400).json({ error: 'missing fields' });
    res.json(estimateBAC({ weight, gender: gender ?? 'male', drinks }));
  });

  // Fallback to index.html for SPA navigation
  app.get('*', (req, res) => {
    res.sendFile(join(FRONTEND, 'index.html'));
  });

  return app;
}
