// Renders the PWA icons from the LifeLoop logo. Run: node apps/web/scripts/make-icons.mjs
// (uses sharp from the API workspace; output goes to apps/web/public/icons)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../../api/package.json'));
const sharp = require('sharp');
const out = resolve(here, '../public/icons');
mkdirSync(out, { recursive: true });

const BRAND = '#1a7a68';
// The loop mark, drawn in a 32x32 box (same shape as the in-app logo).
const mark = (stroke = 'white') => `
  <path d="M20 9.07 A8 8 0 1 1 12.4 8.85" stroke="${stroke}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M15.4 7.1 L10.6 5.9 L11.9 10.7 Z" fill="${stroke}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>`;

// Rounded square icon (normal "any" purpose).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${BRAND}"/>${mark()}</svg>`;
// Maskable: full-bleed background, mark scaled into the central 70% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BRAND}"/><g transform="translate(4.8 4.8) scale(0.7)">${mark()}</g></svg>`;
// Notification badge: white mark on transparent (Android tints it).
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${mark('white')}</svg>`;

const render = (svg, size, file) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toFile(resolve(out, file));

await Promise.all([
  render(rounded, 192, 'icon-192.png'),
  render(rounded, 512, 'icon-512.png'),
  render(maskable, 512, 'maskable-512.png'),
  render(maskable, 180, 'apple-touch-icon.png'),
  render(badge, 96, 'badge-96.png'),
]);
console.log('icons written to', out);
