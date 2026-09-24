#!/usr/bin/env node
/**
 * Render an SVG icon to the raster files browsers and search engines ask for (#1384).
 *
 *   node scripts/render-icons.mjs <icon.svg> <outDir>
 *
 * writes, beside nothing else:
 *   favicon.ico            16, 32 and 48 px frames — what a browser (and Google's result icon) fetches
 *                          at the site root with no <link> at all
 *   apple-touch-icon.png   180 px — iOS asks for it at the root on "add to home screen", and 404s otherwise
 *
 * The SVG stays the source of truth: the rasters are REGENERATED from it, never edited, and committed
 * because the deploy is a file copy with no build step (deploy/homepage/ — docs/RUNBOOK.md §2b).
 *
 * Rendering goes through Chromium (Playwright, already a dev dependency) so the pixels are the ones a
 * browser draws. The .ico container holds PNG frames, which every browser since IE 11 reads; writing
 * that container is 22 bytes of header per frame, so no image library is pulled in for it.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [svgPath, outDir] = process.argv.slice(2);
if (!svgPath || !outDir) {
  console.error('usage: node scripts/render-icons.mjs <icon.svg> <outDir>');
  process.exit(2);
}
const svg = readFileSync(svgPath, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
/** One square PNG of `size` px, transparent outside the icon's own shape. */
async function png(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img style="display:block;width:${size}px;height:${size}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const sizes = [16, 32, 48];
const frames = [];
for (const s of sizes) frames.push(await png(s));
const touch = await png(180);
await browser.close();

// ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per frame, then the PNG bytes themselves.
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((f, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(sizes[i] % 256, e); // width (0 would mean 256)
  header.writeUInt8(sizes[i] % 256, e + 1); // height
  header.writeUInt8(0, e + 2); // palette
  header.writeUInt8(0, e + 3); // reserved
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(f.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += f.length;
});
writeFileSync(path.join(outDir, 'favicon.ico'), Buffer.concat([header, ...frames]));
writeFileSync(path.join(outDir, 'apple-touch-icon.png'), touch);
console.log(`wrote favicon.ico (${sizes.join('/')} px) and apple-touch-icon.png (180 px) to ${outDir}`);
