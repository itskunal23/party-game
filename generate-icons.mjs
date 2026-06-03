// Run once: node generate-icons.mjs
// Writes minimal placeholder PNGs for PWA icons and splash screens.

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconDir = join(__dirname, 'game/frontend/icons');
mkdirSync(iconDir, { recursive: true });

const placeholder = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
  'base64'
);

writeFileSync(join(iconDir, 'icon-192.png'), placeholder);
writeFileSync(join(iconDir, 'icon-512.png'), placeholder);
writeFileSync(join(iconDir, 'splash-390x844.png'), placeholder);
writeFileSync(join(iconDir, 'splash-375x812.png'), placeholder);

console.log('Placeholder icons written to game/frontend/icons/');
