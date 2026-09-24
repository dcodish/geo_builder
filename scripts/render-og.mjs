#!/usr/bin/env node
/**
 * Render each builder's 1200×630 link-preview image from a REAL figure (#1383, ADR-W-085).
 *
 *   npm run dev                                          # this script does NOT start a server
 *   node scripts/render-og.mjs                           # all four builders
 *   node scripts/render-og.mjs --app 3d --base http://localhost:5174
 *
 * Writes `<product>/seo/og.png` — the file `seo-pages.ts` hands to the build, which publishes it as
 * `<builder>/seo/og.png` and names it in `og:image`. Regenerated, never hand-edited, and committed:
 * the build must not need a browser.
 *
 * The figure is typed into the running app exactly as a student would (`FIGURES` below — a real
 * bagrut question for 2-D, the smoke sequences elsewhere), and the picture is the app's OWN
 * «download image» output: the chrome-free export (FR-EX-3), so no zoom button or hover ring can reach a
 * preview. A chat app therefore shows a figure the tool really draws, drawn the way it prints. The card around it carries only the builder's icon and its name,
 * read from the served page's `<h1>`, so the card cannot disagree with the page it previews. It refuses
 * to write a card if any line was refused or the figure is empty.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { APPS, dismissModal, refusals, waitForSettle } from './visual-smoke.mjs';

/**
 * What each card shows. A SHOWCASE, not a test: the smoke sequences are stress cases (analytic's piles
 * every surface onto one pair of axes), so a builder may name a calmer figure here. Each line must still
 * build — the script refuses to write a card over a refusal.
 */
const FIGURES = {
  // Bagrut summer 2022 — the exam's own sentences; locked by src/__tests__/fixtures/2022-summer-a-issue59.geo.json.
  '2d': [
    'נתון מעגל שרדיוסו R ומרכזו O',
    'מנקודה A הוציאו משיק למעגל בנקודה B',
    'המשך AO חותך את המעגל בנקודה D',
    'AO חותך את המעגל בנקודה C',
    'G נמצאת על המשך DB',
    'AG מאונך ל AD',
    'AG=8',
    'AC=0.5DC',
  ],
  '3d': APPS['3d'].sequence,
  complex: APPS.complex.sequence,
  // No circle and no stray crossing: analytic's export still carries its crossing-offer rings (#1391),
  // and a preview must not advertise a defect. Revisit once #1391 lands.
  analytic: ['נתונה הנקודה A(2,6)', 'B(-4,1)', 'C(-3,8)', 'משולש ABC', 'M מפגש התיכונים במשולש ABC'],
};

/** Where each product keeps its seo/ assets — the same directories seo-pages.ts reads. */
const DIRS = { '2d': 'src', '3d': 'src3d', complex: 'src-complex', analytic: 'src-analytic' };

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const base = opt('--base', 'http://localhost:5173');
const apps = args.includes('--app') ? [opt('--app')].filter((a) => a !== 'home') : Object.keys(DIRS);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const browser = await chromium.launch();
let failed = false;
for (const app of apps) {
  const spec = APPS[app];
  const dir = DIRS[app];
  if (!spec || !dir) throw new Error(`unknown app ${app}`);

  // The name, from the page a crawler reads (the static block's <h1>) — before React replaces it.
  const raw = await (await fetch(base + spec.urlPath)).text();
  const name = /<h1[^>]*>([^<]+)<\/h1>/.exec(raw)?.[1]?.trim();
  if (!name) throw new Error(`${app}: the served page has no <h1> — is the seo plugin wired?`);

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(base + spec.urlPath, { waitUntil: 'networkidle' });
  await waitForSettle(page);
  await dismissModal(page);
  const input = page.getByPlaceholder(spec.inputHint).first();
  const before = new Set(await refusals(page));
  for (const line of FIGURES[app]) {
    await input.fill(line);
    await input.press('Enter');
    await waitForSettle(page);
  }
  // The smoke's own refusal reader: any NEW refusal means the picture would show a figure the
  // sequence did not fully build.
  const refused = (await refusals(page)).filter((r) => !before.has(r)).length;
  if (refused) {
    console.error(`${app}: NOT written — ${refused} refusal(s) on screen`);
    failed = true;
    await page.close();
    continue;
  }
  // The app's own export — the same button a teacher presses for a worksheet.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /הורידו תמונה/ }).first().click(),
  ]);
  const figure = readFileSync(await download.path());
  await page.close();
  if (figure.length < 3000) {
    console.error(`${app}: NOT written — the exported image is ${figure.length} bytes, i.e. empty`);
    failed = true;
    continue;
  }

  const icon = readFileSync(path.join(root, dir, 'seo', 'icon.svg'), 'utf8');
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await card.setContent(`<!doctype html><html lang="he" dir="rtl"><body style="margin:0;width:1200px;height:630px;display:flex;background:#fff;font-family:system-ui,'Segoe UI',Arial,sans-serif">
    <div style="width:430px;background:#046bd2;color:#fff;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 56px;box-sizing:border-box">
      <div style="width:112px;height:112px">${icon.replace('<svg ', '<svg width="112" height="112" ')}</div>
      <div style="font-size:58px;font-weight:700;line-height:1.1">${esc(name)}</div>
      <div style="font-size:28px;opacity:.9" dir="ltr">themathbible.com</div>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:28px 36px;box-sizing:border-box">
      <img src="data:image/png;base64,${figure.toString('base64')}" style="max-width:100%;max-height:100%;object-fit:contain">
    </div></body></html>`);
  await card.waitForFunction(() => document.images[0]?.complete);
  const out = path.join(root, dir, 'seo', 'og.png');
  writeFileSync(out, await card.screenshot({ type: 'png' }));
  await card.close();
  console.log(`${app}: ${path.relative(root, out)} (${name})`);
}
// The HOMEPAGE card: the four builders' icons under the homepage's own approved title, read from
// deploy/homepage/index.html («<name> — <tagline> | themathbible.com») so the two cannot drift.
if (!args.includes('--app') || opt('--app') === 'home') {
  const home = readFileSync(path.join(root, 'deploy', 'homepage', 'index.html'), 'utf8');
  const title = /<title>([^<]+)<\/title>/.exec(home)?.[1] ?? '';
  const [who, rest = ''] = title.split(' — ');
  const tagline = rest.replace(/\s*\|.*$/, '');
  if (!who || !tagline) throw new Error('home: the homepage <title> is not «name — tagline | site»');
  const icons = Object.values(DIRS).map((d) =>
    readFileSync(path.join(root, d, 'seo', 'icon.svg'), 'utf8').replace('<svg ', '<svg width="104" height="104" '),
  );
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await card.setContent(`<!doctype html><html lang="he" dir="rtl"><body style="margin:0;width:1200px;height:630px;background:#046bd2;color:#fff;font-family:system-ui,'Segoe UI',Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px">
    <div style="display:flex;gap:28px">${icons.map((i) => `<div style="border-radius:22px;box-shadow:0 0 0 3px rgba(255,255,255,.35)">${i}</div>`).join('')}</div>
    <div style="font-size:64px;font-weight:700">${esc(who)}</div>
    <div style="font-size:36px;opacity:.95">${esc(tagline)}</div>
    <div style="font-size:28px;opacity:.85" dir="ltr">themathbible.com</div></body></html>`);
  const out = path.join(root, 'deploy', 'homepage', 'og.png');
  writeFileSync(out, await card.screenshot({ type: 'png' }));
  await card.close();
  console.log(`home: ${path.relative(root, out)} (${who})`);
}
await browser.close();
process.exit(failed ? 1 : 0);
