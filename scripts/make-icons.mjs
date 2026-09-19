// Renders the app icons (favicon, PWA icons, Apple touch icon) from one SVG.
// Run once after changing the artwork: node scripts/make-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const glyph = (scale = 1) => {
  const t = (32 * (1 - scale)).toFixed(2);
  return `<g transform="translate(${t} ${t}) scale(${scale})">
    <g fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
      <path d="M21 22V40q0 8 8 8h7"/><path d="M21 25q0 7 8 7h7"/>
    </g>
    <circle cx="21" cy="17" r="6" fill="#fff"/>
    <circle cx="43" cy="32" r="5.2" fill="#fff" opacity="0.92"/>
    <circle cx="43" cy="48" r="5.2" fill="#fff" opacity="0.92"/>
  </g>`;
};
const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#43c08b"/><stop offset="1" stop-color="#1e7f58"/></linearGradient></defs>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${grad}<rect width="64" height="64" rx="17" fill="url(#g)"/>${glyph()}</svg>`;
// Maskable: full-bleed background, glyph inside the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${grad}<rect width="64" height="64" fill="url(#g)"/>${glyph(0.72)}</svg>`;
// Apple: square, iOS rounds it itself.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${grad}<rect width="64" height="64" fill="url(#g)"/>${glyph(0.86)}</svg>`;

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync('public/favicon.svg', rounded);
writeFileSync('public/icons/icon-192.png', png(rounded, 192));
writeFileSync('public/icons/icon-512.png', png(rounded, 512));
writeFileSync('public/icons/maskable-512.png', png(maskable, 512));
writeFileSync('public/icons/apple-touch-icon.png', png(apple, 180));
console.log('icons written');
