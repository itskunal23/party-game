/**
 * NVIDIA Vision drink detection — abstraction with retry, timeout, normalization.
 */

const NVIDIA_BASE = process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
const VISION_MODEL = process.env.VISION_MODEL ?? 'meta/llama-3.2-90b-vision-instruct';
const AI_KEY = process.env.NVIDIA_API_KEY;

export const DRINK_TYPES = [
  'beer', 'wine', 'whiskey', 'vodka', 'tequila', 'cocktail',
  'seltzer', 'energy', 'soda', 'other'
];

const TYPE_ALIASES = [
  [/beer|lager|ale|stout|ipa|pint/i, 'beer'],
  [/wine|champagne|prosecco|ros[eé]|merlot|cabernet/i, 'wine'],
  [/whiskey|whisky|bourbon|scotch|rye/i, 'whiskey'],
  [/vodka/i, 'vodka'],
  [/tequila|mezcal/i, 'tequila'],
  [/cocktail|margarita|mojito|martini|old fashioned|highball/i, 'cocktail'],
  [/seltzer|hard seltzer|white claw|truly/i, 'seltzer'],
  [/energy|redbull|monster|celsius/i, 'energy'],
  [/soda|coke|pepsi|sprite|ginger ale|tonic|mixer|juice/i, 'soda'],
];

const FALLBACK = {
  drinkType: 'other',
  drink: 'Unknown drink',
  confidence: 0,
  estimatedAbv: 5,
  estimatedOz: 12,
  fallback: true
};

function _normalizeType(name) {
  const n = String(name ?? '');
  for (const [re, type] of TYPE_ALIASES) {
    if (re.test(n)) return type;
  }
  return 'other';
}

function _clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function _parseVisionJson(raw) {
  const match = String(raw ?? '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function _nvidiaVisionRequest(imageBase64, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_KEY}`
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            {
              type: 'text',
              text: `Identify this alcoholic or mixer drink in a photo. Classify drinkType as one of: ${DRINK_TYPES.join(', ')}.
Reply JSON only: {"drinkType":"beer|wine|whiskey|vodka|tequila|cocktail|seltzer|energy|soda|other","drink":"short human name","confidence":0.0-1.0,"estimatedAbv":number,"estimatedOz":number}`
            }
          ]
        }],
        max_tokens: 120,
        stream: false
      })
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function _normalizeResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ...FALLBACK };

  const drink = String(parsed.drink ?? parsed.name ?? 'Drink').trim() || 'Drink';
  const drinkType = DRINK_TYPES.includes(parsed.drinkType)
    ? parsed.drinkType
    : _normalizeType(drink);

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.72;
  confidence = _clamp(confidence, 0, 1);

  let estimatedAbv = Number(parsed.estimatedAbv ?? parsed.abv);
  if (!Number.isFinite(estimatedAbv)) {
    estimatedAbv = drinkType === 'wine' ? 13 : drinkType === 'beer' ? 5 : drinkType === 'whiskey' ? 40 : 12;
  }
  estimatedAbv = _clamp(estimatedAbv, 0, 80);

  let estimatedOz = Number(parsed.estimatedOz ?? parsed.oz);
  if (!Number.isFinite(estimatedOz)) {
    estimatedOz = drinkType === 'beer' ? 12 : drinkType === 'wine' ? 5 : drinkType === 'whiskey' ? 1.5 : 6;
  }
  estimatedOz = _clamp(estimatedOz, 0.5, 32);

  return { drinkType, drink, confidence, estimatedAbv, estimatedOz, fallback: false };
}

/**
 * Detect drink from JPEG base64 (no data: prefix).
 * @param {string} imageBase64
 * @param {{ retries?: number, timeoutMs?: number }} opts
 */
export async function detectDrinkFromImage(imageBase64, opts = {}) {
  if (!imageBase64) return { ...FALLBACK, error: 'no_image' };
  if (!AI_KEY) return { ...FALLBACK, fallback: true, reason: 'no_api_key' };

  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await _nvidiaVisionRequest(imageBase64, timeoutMs);
      const parsed = _parseVisionJson(raw);
      const result = _normalizeResult(parsed);
      if (result.drink && result.drink !== 'Drink') return result;
      lastErr = new Error('empty_parse');
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  return { ...FALLBACK, error: lastErr?.message ?? 'detect_failed' };
}

export function formatDetectionLine(result) {
  const name = result?.drink ?? 'Unknown drink';
  const pct = result?.confidence != null
    ? Math.round(result.confidence * 100)
    : result?.estimatedAbv != null
      ? Math.round(result.estimatedAbv)
      : null;
  if (pct == null) return `Looks like ${name}`;
  const suffix = result.confidence != null ? '%' : '% ABV';
  return `Looks like ${name} (${pct}${suffix})`;
}
