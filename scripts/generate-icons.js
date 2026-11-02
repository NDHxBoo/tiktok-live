/**
 * Tạo icon PWA (192, 512) từ SVG bằng trình duyệt headless Playwright.
 * Chạy: npm run icons   (cần có playwright: npm i -D playwright && npx playwright install chromium)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/public/icons');
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="#7b5cff"/>
  <rect x="86" y="120" width="340" height="300" rx="40" fill="#ffcf3f" stroke="#2b2150" stroke-width="18"/>
  <circle cx="256" cy="250" r="78" fill="#ffd9bd" stroke="#2b2150" stroke-width="14"/>
  <ellipse cx="228" cy="250" rx="11" ry="16" fill="#2b2150"/><ellipse cx="284" cy="250" rx="11" ry="16" fill="#2b2150"/>
  <path d="M232 288 q24 18 48 0" stroke="#2b2150" stroke-width="10" fill="none" stroke-linecap="round"/>
  <g stroke="#2b2150" stroke-width="18" stroke-linecap="round">
    <line x1="150" y1="135" x2="150" y2="405"/><line x1="203" y1="135" x2="203" y2="405"/><line x1="309" y1="135" x2="309" y2="405"/><line x1="362" y1="135" x2="362" y2="405"/>
  </g>
  <rect x="86" y="120" width="340" height="300" rx="40" fill="none" stroke="#2b2150" stroke-width="18"/>
  <rect x="150" y="60" width="212" height="56" rx="20" fill="#ff5fa2" stroke="#2b2150" stroke-width="12"/>
  <circle cx="256" cy="88" r="16" fill="#ffb84d" stroke="#2b2150" stroke-width="6"/>
</svg>`;

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0">${SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: path.join(OUT, `icon-${size}.png`), omitBackground: true });
  console.log('Đã tạo', `icon-${size}.png`);
}
await b.close();
