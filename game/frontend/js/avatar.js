/**
 * Character avatars — stylized SVG from profile media (no photos, no AI faces).
 * Cached in localStorage; moods: neutral | smug | angry | shocked | champion
 */

const CACHE_KEY = 'gfy_avatar_cache_v2';
const MOODS = ['neutral', 'smug', 'angry', 'shocked', 'champion'];

const MEDIA_TRAITS = {
  mirzapur: { accent: '#8B4513', hair: 'crop', coat: 'leather', extra: 'scarf' },
  'gully-boy': { accent: '#FFD54A', hair: 'cap', coat: 'hoodie', extra: 'chain' },
  farzi: { accent: '#1B7A54', hair: 'slick', coat: 'suit', extra: 'shades' },
  'paatal-lok': { accent: '#4A5568', hair: 'messy', coat: 'trench', extra: 'badge' },
  dhurandhar: { accent: '#0033A0', hair: 'wild', coat: 'long-coat', extra: 'aura' },
  'brooklyn-nine-nine': { accent: '#0033A0', hair: 'neat', coat: 'uniform', extra: 'badge' },
  'modern-family': { accent: '#9B6BFF', hair: 'soft', coat: 'casual', extra: 'none' },
  barbie: { accent: '#FF6EB4', hair: 'long', coat: 'pink', extra: 'crown' },
  'barbie-charm-school': { accent: '#FF9AD5', hair: 'bun', coat: 'princess', extra: 'crown' },
  'masterchef-india': { accent: '#FF5A5A', hair: 'chef', coat: 'apron', extra: 'pin' },
  'nailed-it': { accent: '#FF8C42', hair: 'messy', coat: 'apron', extra: 'sprinkle' },
  spartacus: { accent: '#B22222', hair: 'long', coat: 'armor', extra: 'sword' },
  'agent-sai': { accent: '#5B8DEF', hair: 'messy', coat: 'vest', extra: 'magnify' },
  sanju: { accent: '#C9A227', hair: 'messy', coat: 'casual', extra: 'bandage' },
  'ferris-bueller': { accent: '#30D158', hair: 'feather', coat: 'polo', extra: 'none' },
  'ip-man': { accent: '#0033A0', hair: 'short', coat: 'wing', extra: 'stance' },
  evaru: { accent: '#6B21A8', hair: 'slick', coat: 'suit', extra: 'shadow' },
  airplane: { accent: '#00FFC8', hair: 'flat', coat: 'pilot', extra: 'none' },
};

const ALIASES = [
  ['brooklyn', 'brooklyn-nine-nine'], ['b99', 'brooklyn-nine-nine'],
  ['modern family', 'modern-family'], ['gully', 'gully-boy'],
  ['mirzapur', 'mirzapur'], ['farzi', 'farzi'], ['barbie', 'barbie'],
  ['masterchef', 'masterchef-india'], ['nailed', 'nailed-it'],
  ['ip man', 'ip-man'], ['sanju', 'sanju'], ['spartacus', 'spartacus'],
  ['paatal', 'paatal-lok'], ['dhurandhar', 'dhurandhar'], ['evaru', 'evaru'],
  ['ferris', 'ferris-bueller'], ['agent sai', 'agent-sai'],
];

function _franchiseId(title) {
  const t = String(title ?? '').toLowerCase();
  for (const [needle, id] of ALIASES) {
    if (t.includes(needle)) return id;
  }
  return null;
}

function _hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Named-player archetypes — illustrated portrait DNA from questionnaire vibes. */
const NAME_ARCHETYPES = {
  kunal: {
    primary: 'brooklyn-nine-nine',
    accent: '#0033A0',
    hair: 'cap',
    coat: 'uniform',
    extra: 'badge',
    skin: '#D4A574',
  },
  nandini: {
    primary: 'barbie-charm-school',
    accent: '#FF6EB4',
    hair: 'bun',
    coat: 'princess',
    extra: 'crown',
    skin: '#F5D0C5',
  },
};

/** Build stable visual descriptor from profile. */
export function buildAvatarDescriptor(profile) {
  const name = profile?.name ?? 'Player';
  const low = name.toLowerCase();
  for (const [key, arch] of Object.entries(NAME_ARCHETYPES)) {
    if (low.includes(key)) {
      const h = _hash(`${name}|${arch.primary}`);
      return { name, ...arch, seed: h };
    }
  }

  const media = (profile?.mediaFaves ?? []).map(_franchiseId).filter(Boolean);
  const primary = media[0] ?? 'mirzapur';
  const secondary = media[1] ?? primary;
  const t1 = MEDIA_TRAITS[primary] ?? MEDIA_TRAITS.mirzapur;
  const t2 = MEDIA_TRAITS[secondary] ?? t1;
  const h = _hash(`${name}|${media.join(',')}|${(profile?.kinks ?? []).slice(0, 2).join(',')}`);

  return {
    name,
    primary,
    accent: t1.accent,
    hair: h % 2 === 0 ? t1.hair : t2.hair,
    coat: t1.coat,
    extra: h % 3 === 0 ? t2.extra : t1.extra,
    skin: ['#E8C4A8', '#D4A574', '#C68642', '#F5D0C5'][h % 4],
    seed: h,
  };
}

export function avatarCacheKey(profile) {
  const d = buildAvatarDescriptor(profile ?? {});
  return `av_${d.seed}_${d.primary}_${d.hair}`;
}

function _readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'); }
  catch { return {}; }
}

function _writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
  catch { /* quota */ }
}

export function getCachedAvatarSvgs(profile) {
  const key = avatarCacheKey(profile);
  const cache = _readCache();
  if (cache[key]?.moods) return cache[key].moods;
  const desc = buildAvatarDescriptor(profile);
  const moods = {};
  for (const m of MOODS) moods[m] = _generateSvg(desc, m);
  cache[key] = { moods, at: Date.now() };
  _writeCache(cache);
  return moods;
}

function _facePaths(mood) {
  switch (mood) {
    case 'smug':
      return {
        eyes: '<path d="M34 44 Q38 40 42 44" stroke="#1a1a2e" stroke-width="2" fill="none"/><path d="M58 44 Q62 40 66 44" stroke="#1a1a2e" stroke-width="2" fill="none"/>',
        mouth: '<path d="M44 58 Q50 62 56 58" stroke="#1a1a2e" stroke-width="2.5" fill="none"/>',
        brow: '<path d="M32 38 L44 40" stroke="#1a1a2e" stroke-width="2"/><path d="M56 38 L68 38" stroke="#1a1a2e" stroke-width="2"/>',
      };
    case 'angry':
      return {
        eyes: '<ellipse cx="38" cy="46" rx="4" ry="3" fill="#1a1a2e"/><ellipse cx="62" cy="46" rx="4" ry="3" fill="#1a1a2e"/>',
        mouth: '<path d="M42 60 L58 60" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round"/>',
        brow: '<path d="M30 40 L46 44" stroke="#1a1a2e" stroke-width="2.5"/><path d="M54 44 L70 40" stroke="#1a1a2e" stroke-width="2.5"/>',
      };
    case 'shocked':
      return {
        eyes: '<circle cx="38" cy="45" r="5" fill="#fff" stroke="#1a1a2e" stroke-width="2"/><circle cx="62" cy="45" r="5" fill="#fff" stroke="#1a1a2e" stroke-width="2"/><circle cx="38" cy="45" r="2" fill="#1a1a2e"/><circle cx="62" cy="45" r="2" fill="#1a1a2e"/>',
        mouth: '<ellipse cx="50" cy="62" rx="6" ry="8" fill="#1a1a2e"/>',
        brow: '',
      };
    case 'champion':
      return {
        eyes: '<path d="M34 46 Q38 42 42 46" stroke="#1a1a2e" stroke-width="2" fill="none"/><path d="M58 46 Q62 42 66 46" stroke="#1a1a2e" stroke-width="2" fill="none"/>',
        mouth: '<path d="M40 58 Q50 66 60 58" stroke="#1a1a2e" stroke-width="2.5" fill="none"/>',
        brow: '',
      };
    default:
      return {
        eyes: '<ellipse cx="38" cy="46" rx="3.5" ry="4" fill="#1a1a2e"/><ellipse cx="62" cy="46" rx="3.5" ry="4" fill="#1a1a2e"/>',
        mouth: '<path d="M42 58 Q50 62 58 58" stroke="#1a1a2e" stroke-width="2" fill="none"/>',
        brow: '',
      };
  }
}

function _hairPath(style, accent) {
  const paths = {
    crop: `<path d="M28 38 Q50 18 72 38 L70 48 Q50 28 30 48 Z" fill="#2a1810"/>`,
    slick: `<path d="M26 40 Q50 22 74 40 L72 50 Q50 32 28 50 Z" fill="#1a1a2e"/>`,
    long: `<path d="M24 42 Q50 14 76 42 L78 70 Q50 50 22 70 Z" fill="#3d2314"/>`,
    cap: `<path d="M22 42 Q50 20 78 42 L76 48 L24 48 Z" fill="${accent}"/><rect x="24" y="44" width="52" height="8" rx="4" fill="#2a1810"/>`,
    chef: `<ellipse cx="50" cy="32" rx="28" ry="14" fill="#fff" stroke="#ddd"/><rect x="22" y="32" width="56" height="10" fill="#fff"/>`,
    neat: `<path d="M30 38 Q50 24 70 38 L68 46 Q50 34 32 46 Z" fill="#2c1810"/>`,
    messy: `<path d="M26 36 Q38 20 50 34 Q62 18 74 36 L72 52 Q50 38 28 52 Z" fill="#3a2518"/>`,
    feather: `<path d="M28 40 Q50 16 72 40 L70 55 Q50 36 30 55 Z" fill="#4a3020"/>`,
    bun: `<circle cx="50" cy="28" r="18" fill="#5a3828"/><ellipse cx="50" cy="38" rx="22" ry="14" fill="${accent}" opacity="0.3"/>`,
    short: `<path d="M32 38 Q50 26 68 38 L66 46 Q50 36 34 46 Z" fill="#2a1810"/>`,
  };
  return paths[style] ?? paths.crop;
}

function _coatPath(style, accent) {
  const coats = {
    leather: `<path d="M30 72 Q50 68 70 72 L74 110 Q50 108 26 110 Z" fill="#1a1208" stroke="${accent}" stroke-width="1.5"/>`,
    hoodie: `<path d="M28 70 Q50 66 72 70 L76 112 Q50 110 24 112 Z" fill="#2a2a3a"/>`,
    suit: `<path d="M32 70 L50 78 L68 70 L72 112 L28 112 Z" fill="${accent}" opacity="0.85"/><path d="M46 78 L54 78 L52 112 L48 112 Z" fill="#fff" opacity="0.9"/>`,
    pink: `<path d="M28 70 Q50 66 72 70 L76 112 Q50 110 24 112 Z" fill="#ff9ad5"/>`,
    apron: `<path d="M30 72 L70 72 L68 112 L32 112 Z" fill="#f5f5f5" stroke="${accent}"/><rect x="38" y="72" width="24" height="40" fill="${accent}" opacity="0.2"/>`,
    armor: `<path d="M28 68 L72 68 L70 112 L30 112 Z" fill="#4a4a4a" stroke="${accent}"/>`,
    wing: `<path d="M32 70 L50 76 L68 70 L74 112 L26 112 Z" fill="#0a1628"/>`,
    casual: `<path d="M30 72 Q50 68 70 72 L74 110 Q50 108 26 110 Z" fill="#3a3a48"/>`,
    uniform: `<path d="M30 70 L70 70 L72 112 L28 112 Z" fill="#0033A0"/>`,
    'long-coat': `<path d="M26 68 Q50 64 74 68 L78 114 Q50 112 22 114 Z" fill="#0a0a1a" stroke="${accent}"/>`,
    trench: `<path d="M28 70 L72 70 L76 114 L24 114 Z" fill="#3d3d4a"/>`,
    polo: `<path d="M32 72 L68 72 L70 110 L30 110 Z" fill="${accent}"/>`,
    princess: `<path d="M28 70 Q50 64 72 70 L76 112 Q50 110 24 112 Z" fill="#ffc8e8"/>`,
    vest: `<path d="M34 72 L66 72 L68 112 L32 112 Z" fill="#5B8DEF" opacity="0.7"/>`,
    pilot: `<path d="M30 72 L70 72 L72 112 L28 112 Z" fill="#1a2a4a"/>`,
  };
  return coats[style] ?? coats.casual;
}

function _extraPath(extra, accent) {
  switch (extra) {
    case 'shades': return `<rect x="30" y="42" width="40" height="10" rx="5" fill="#111" opacity="0.85"/>`;
    case 'crown': return `<path d="M36 18 L44 26 L50 16 L56 26 L64 18 L62 30 L38 30 Z" fill="#FFD54A" stroke="${accent}"/>`;
    case 'badge': return `<circle cx="72" cy="88" r="8" fill="${accent}"/><text x="72" y="91" text-anchor="middle" fill="#fff" font-size="8" font-weight="bold">★</text>`;
    case 'scarf': return `<path d="M38 68 Q50 76 62 68" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>`;
    case 'chain': return `<path d="M48 78 L52 78 L50 92" stroke="#FFD54A" stroke-width="2"/>`;
    case 'pin': return `<circle cx="68" cy="82" r="5" fill="#FF5A5A"/>`;
    default: return '';
  }
}

function _generateSvg(desc, mood) {
  const face = _facePaths(mood);
  const crown = mood === 'champion' ? _extraPath('crown', desc.accent) : '';
  const extra = desc.extra !== 'crown' ? _extraPath(desc.extra, desc.accent) : '';

  const gradId = `glow-${desc.seed ?? 0}-${mood}`;
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" class="avatar-svg" role="img" aria-hidden="true">
  <defs>
    <radialGradient id="${gradId}" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="${desc.accent}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${desc.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="50" cy="105" rx="34" ry="10" fill="#000" opacity="0.25"/>
  <circle cx="50" cy="58" r="46" fill="url(#${gradId})"/>
  ${_coatPath(desc.coat, desc.accent)}
  <ellipse cx="50" cy="52" rx="24" ry="26" fill="${desc.skin}"/>
  <ellipse cx="50" cy="68" rx="14" ry="8" fill="${desc.skin}" opacity="0.85"/>
  ${_hairPath(desc.hair, desc.accent)}
  ${face.brow}
  ${face.eyes}
  ${face.mouth}
  ${extra}
  ${crown}
</svg>`;
}

const SIZE_PX = { sm: 44, md: 64, lg: 88, xl: 112 };

/**
 * Mount avatar into container.
 * @param {HTMLElement} container
 * @param {object|null} profile
 * @param {{ mood?: string, size?: string, ring?: boolean, label?: string, animate?: boolean, title?: string }} opts
 */
export function mountAvatar(container, profile, opts = {}) {
  if (!container) return null;
  const mood = MOODS.includes(opts.mood) ? opts.mood : 'neutral';
  const size = opts.size ?? 'md';
  const px = SIZE_PX[size] ?? 64;

  if (!profile?.name) {
    container.innerHTML = '';
    container.classList.add('avatar-wrap', 'avatar-wrap--empty');
    return null;
  }

  const svgs = getCachedAvatarSvgs(profile);
  const ringClass = opts.ring ? ' avatar-wrap--ring' : '';
  const animClass = opts.animate !== false ? ' avatar-wrap--idle' : '';
  const moodClass = ` avatar-wrap--${mood}`;

  container.className = `avatar-wrap avatar-wrap--${size}${ringClass}${animClass}${moodClass}`;
  container.dataset.mood = mood;
  container.dataset.avatarName = profile.name;
  if (opts.title) container.title = opts.title;

  const labelHtml = opts.label
    ? `<span class="avatar-label">${opts.label}</span>`
    : '';

  container.innerHTML = `
    <div class="avatar-frame" style="width:${px}px;height:${Math.round(px * 1.15)}px">
      ${svgs[mood]}
    </div>
    ${labelHtml}`;

  return container;
}

export function setAvatarMood(container, mood, profile) {
  if (!container || !profile) return;
  mountAvatar(container, profile, {
    mood,
    size: container.classList.contains('avatar-wrap--lg') ? 'lg'
      : container.classList.contains('avatar-wrap--sm') ? 'sm'
      : container.classList.contains('avatar-wrap--xl') ? 'xl' : 'md',
    ring: container.classList.contains('avatar-wrap--ring'),
    label: container.querySelector('.avatar-label')?.textContent ?? undefined,
    animate: container.classList.contains('avatar-wrap--idle'),
  });
}

export function prewarmAvatar(profile) {
  if (profile?.name) getCachedAvatarSvgs(profile);
}

export function invalidateAvatarCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* */ }
}

/** After profile save, refresh cache for that profile. */
export function refreshAvatarForProfile(profile) {
  const key = avatarCacheKey(profile);
  const cache = _readCache();
  delete cache[key];
  _writeCache(cache);
  if (profile?.name) getCachedAvatarSvgs(profile);
}
