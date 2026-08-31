#!/usr/bin/env node
/**
 * VISUAL SMOKE — the session looks at the app before the operator has to.
 *
 * The operator's requirement (2026-08-17, playing #699): *"why can't you use playwright to see this
 * for yourself? why do I need to manually test?"* — and the standing evidence for it (2026-08-31):
 * a bidi fix that did not work and the #841 placeholder collision both shipped because the session
 * verified THE MECHANISM IT CHANGED and never looked at THE SURFACE A STUDENT SEES. Every utterance
 * in a play sheet is already run headlessly through the real `parse → replay → dataView` path, so
 * what reaches the operator is visual placement and product judgement — but only if the mechanical
 * breakage (a blank canvas, a refused line, a thrown exception, a reversed row) was caught first.
 * This script is that first line of defence.
 *
 *   npm run dev                                   # the script does NOT start a server
 *   node scripts/visual-smoke.mjs                 # all three products
 *   node scripts/visual-smoke.mjs --app 3d        # one product
 *   node scripts/visual-smoke.mjs --base http://localhost:5273   # a PR's own port (#783)
 *
 * Writes `reports/screens/<app>/NN-<name>.png` + `manifest.json`, then READS the images back and
 * fails on anything that makes them untrustworthy evidence. Exit 0 = the captures are real and the
 * sequence built; exit 1 = look at the named shot before reporting anything ready.
 *
 * NOT CI (ADR-W-005): a browser download is heavy and CI here is best-effort. This is a LOCAL gate,
 * like `check:siblings` — cheap enough to run before every UI-touching report.
 *
 * Screenshots are per-machine artifacts and stay gitignored (ADR-W-008); the manifest is the part
 * worth quoting in a PR body.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

/**
 * One descriptor per product. The utterance sequences are the products' OWN example lines
 * (`examples` in each locale) rather than invented input, so a sequence that stops building is a
 * real signal about shipped copy and not about this file drifting from the app.
 *
 * `inputHint` is a distinctive substring of the product's input placeholder. Matching the
 * placeholder — rather than a CSS position — is deliberate: the main input carries no `type`
 * attribute and no `aria-label`, so every structural selector for it is a guess that would silently
 * pick the figure-name box instead.
 */
export const APPS = {
  '2d': {
    urlPath: '/',
    inputHint: 'תארו צעד',
    // CLAUDE.md's defining interaction: free shape → point-on-object (1 DOF) → a constraint that
    // slides it. If any product sequence is going to catch a solver surfacing bug, it is this one.
    sequence: ['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37'],
  },
  '3d': {
    urlPath: '/3d.html',
    inputHint: 'הקלידו נתון',
    // he.json examples.ex1 / ex3 / ex5 — a solid, a derived point on it, and the vector notation.
    sequence: ['קובייה ABCD', "M אמצע BB'", "נסמן: AB = u, AD = v, AA' = w"],
  },
  complex: {
    urlPath: '/complex.html',
    inputHint: 'z1 = 3+4i',
    // The #701 repro — enumerated roots are the worst labelling case in any product: five labels on
    // one ring plus a point far enough out to clip. If label placement breaks, it breaks here first.
    sequence: ['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2', 'z^5 = w^2'],
  },
};

/** Buttons that dismiss a first-load modal. Matched by substring, both locales. */
const ACKNOWLEDGE = ['הבנתי', 'Got it', 'אפשר להתחיל'];

function parseArgs(argv) {
  const out = { apps: Object.keys(APPS), base: 'http://localhost:5173' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--app') {
      const v = argv[++i];
      if (!APPS[v]) fail(`unknown --app ${JSON.stringify(v)}; expected one of ${Object.keys(APPS).join(', ')}`);
      out.apps = [v];
    } else if (a === '--base') {
      out.base = argv[++i].replace(/\/$/, '');
    } else if (a === '--help' || a === '-h') {
      console.log('usage: node scripts/visual-smoke.mjs [--app 2d|3d|complex] [--base URL]');
      process.exit(0);
    } else {
      fail(`unknown argument ${JSON.stringify(a)}`);
    }
  }
  return out;
}

function fail(msg) {
  console.error(`visual-smoke: ${msg}`);
  process.exit(1);
}

/**
 * Wait until the drawing has stopped changing. The apps solve constraints after a submit, so a
 * fixed sleep either flakes or wastes seconds; this polls the serialized figure and returns once it
 * has been identical for `quiet` ms. Returns the time it took, which the manifest records — a step
 * that suddenly takes much longer is worth seeing.
 */
async function waitForSettle(page, { quiet = 450, timeout = 15000 } = {}) {
  const started = Date.now();
  let last = null;
  let lastChange = Date.now();
  for (;;) {
    const now = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const canvas = document.querySelector('canvas');
      // For an SVG renderer the markup IS the figure. For a canvas one there is nothing to
      // serialize, so fall back to its size — the settle then rests on the quiet window alone.
      return svg ? svg.innerHTML.length + '|' + svg.innerHTML.slice(0, 4000)
           : canvas ? `canvas:${canvas.width}x${canvas.height}`
           : 'none';
    });
    if (now !== last) { last = now; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quiet) return Date.now() - started;
    if (Date.now() - started > timeout) return Date.now() - started;
    await page.waitForTimeout(100);
  }
}

/** Geometry actually present in the figure — the DOM-level answer to "did anything draw?". */
async function figureStats(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg');
    const geom = svg ? svg.querySelectorAll('circle,line,path,polygon,polyline,rect,ellipse').length : 0;
    const labels = svg ? svg.querySelectorAll('text').length : 0;
    return { geom, labels, hasCanvas: !!document.querySelector('canvas') };
  });
}

/**
 * Rows the app has marked as failed. A refusal is the #841 class exactly — the mechanism changed,
 * every test passed, and the surface the student sees went amber. The harness reads the app's own
 * error copy rather than guessing at CSS: `role=alert` is what the apps use for a conflict row.
 */
async function refusals(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role=alert]')]
      .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 10),
  );
}

async function dismissModal(page) {
  const dialog = page.locator('[role=dialog]');
  if ((await dialog.count()) === 0) return false;
  for (const label of ACKNOWLEDGE) {
    const btn = dialog.getByText(label, { exact: false }).first();
    if ((await btn.count()) > 0) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(350);
      if ((await page.locator('[role=dialog]').count()) === 0) return true;
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  return (await page.locator('[role=dialog]').count()) === 0;
}

/**
 * Read the captured PNGs back and judge them. Chromium decodes them — it is already running, and
 * an extra image dependency to answer "is this blank?" would be the wrong trade.
 *
 * "Empty" means what it looks like: effectively one colour. A capture of a white page and a capture
 * of a page that failed to paint are the same file, and only this check separates them from a real
 * screenshot of the app.
 */
async function auditImages(browser, files) {
  const page = await browser.newPage();
  const verdicts = [];
  for (const file of files) {
    const buf = await readFile(file);
    const bytes = buf.length;
    // A data: URI, not a file:// one — a page has no file-system origin, so handing it a path
    // fails to decode and would read as "blank" for the wrong reason.
    const url = 'data:image/png;base64,' + buf.toString('base64');
    const measured = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      try { await img.decode(); } catch { return { error: 'decode failed' }; }
      const w = Math.min(img.naturalWidth, 480);
      const h = Math.min(img.naturalHeight, 480);
      if (!w || !h) return { error: 'zero dimensions' };
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        // Quantize to 3 bits per channel: antialiasing must not read as "content".
        const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const total = (data.length / 4);
      const dominant = Math.max(...counts.values());
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        distinctColors: counts.size,
        dominantShare: +(dominant / total).toFixed(4),
      };
    }, url);
    verdicts.push({ file, bytes, ...measured });
  }
  await page.close();
  return verdicts;
}

export const BYTE_FLOOR = 3000;      // a real 1600×950 app screenshot is tens of KB
export const UNIFORM_SHARE = 0.995;  // ≥99.5% one quantized colour = nothing rendered

/**
 * The verdict on ONE capture, as a pure function of its measurements — the gate's actual decision,
 * split out from the browser that produces them so it can be tested without one. Returns the problem
 * string, or `null` when the capture is trustworthy evidence.
 *
 * This is the lock the issue asks for: "exits non-zero when a screenshot is missing/empty".
 */
export function judgeCapture(name, m) {
  if (!m || m.error) return `${name}: unreadable (${m?.error ?? 'no measurement'})`;
  if (!(m.bytes >= BYTE_FLOOR)) return `${name}: only ${m.bytes} bytes — the capture is not a real screenshot`;
  if (m.dominantShare >= UNIFORM_SHARE) return `${name}: BLANK — ${(m.dominantShare * 100).toFixed(1)}% one colour`;
  return null;
}

async function run() {
  const { apps, base } = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

  // Fail with the command to fix it, not with a stack trace from goto().
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    fail(`no dev server at ${base} (${e.message}). Start one first:  npm run dev`);
  }

  const browser = await chromium.launch();
  const manifest = { base, capturedAt: new Date().toISOString(), apps: {} };
  const problems = [];
  const allFiles = [];

  for (const app of apps) {
    const spec = APPS[app];
    const outDir = path.join(repoRoot, 'reports', 'screens', app);
    if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

    const record = { steps: [], pageErrors, consoleErrors, shots: [] };
    manifest.apps[app] = record;

    let n = 0;
    const shoot = async (name) => {
      const file = path.join(outDir, `${String(++n).padStart(2, '0')}-${name}.png`);
      await page.screenshot({ path: file });
      record.shots.push(path.relative(repoRoot, file).replace(/\\/g, '/'));
      allFiles.push(file);
      return file;
    };

    await page.goto(base + spec.urlPath, { waitUntil: 'networkidle' });
    await waitForSettle(page);
    record.dismissedModal = await dismissModal(page);
    await shoot('empty');

    const input = page.getByPlaceholder(spec.inputHint).first();
    if ((await input.count()) === 0) {
      problems.push(`${app}: no input matching placeholder ${JSON.stringify(spec.inputHint)} — the app's copy moved, or it failed to render`);
    } else {
      const before = new Set(await refusals(page));
      for (const line of spec.sequence) {
        await input.fill(line);
        await input.press('Enter');
        const settleMs = await waitForSettle(page);
        const stats = await figureStats(page);
        const now = (await refusals(page)).filter((r) => !before.has(r));
        const step = { line, settleMs, ...stats, refusals: now };
        record.steps.push(step);
        await shoot(`step-${record.steps.length}`);
        if (now.length) problems.push(`${app}: «${line}» was REFUSED — ${now[0]}`);
        if (!stats.geom && !stats.hasCanvas) problems.push(`${app}: «${line}» left the figure with no geometry`);
      }
    }

    // The chrome the operator would otherwise be the first to open.
    const about = page.getByRole('button', { name: /אודות|About/ }).first();
    if ((await about.count()) > 0) {
      await about.click().catch(() => {});
      await page.waitForTimeout(500);
      await shoot('about');
      await dismissModal(page);
    } else {
      problems.push(`${app}: no About button — the shared frame's privacy surface is unreachable`);
    }

    // The ⋯ overflow exists only where the shell frame is adopted (2-D/3-D adopt in Track B), so
    // its absence is recorded, not treated as a failure.
    const menu = page.getByRole('button', { name: /⋯|…/ }).first();
    record.hasOverflowMenu = (await menu.count()) > 0;
    if (record.hasOverflowMenu) {
      await menu.click().catch(() => {});
      await page.waitForTimeout(400);
      await shoot('menu');
      await page.keyboard.press('Escape').catch(() => {});
    }

    if (pageErrors.length) problems.push(`${app}: ${pageErrors.length} uncaught page error(s) — first: ${pageErrors[0]}`);
    await page.close();
  }

  // Every capture is read back before anything is reported.
  const verdicts = await auditImages(browser, allFiles);
  await browser.close();

  for (const v of verdicts) {
    const rel = path.relative(repoRoot, v.file).replace(/\\/g, '/');
    const problem = judgeCapture(rel, v);
    if (problem) problems.push(problem);
  }
  manifest.imageAudit = verdicts.map((v) => ({
    file: path.relative(repoRoot, v.file).replace(/\\/g, '/'),
    bytes: v.bytes, distinctColors: v.distinctColors, dominantShare: v.dominantShare,
  }));

  const screensRoot = path.join(repoRoot, 'reports', 'screens');
  await writeFile(path.join(screensRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const app of apps) {
    const r = manifest.apps[app];
    console.log(`\n${app}: ${r.shots.length} shots${r.dismissedModal ? ' (first-load modal dismissed)' : ''}`);
    for (const s of r.steps) {
      console.log(`  «${s.line}» → ${s.geom} geometry, ${s.labels} labels, ${s.settleMs}ms${s.refusals.length ? '  ⚠ REFUSED' : ''}`);
    }
    if (r.consoleErrors.length) console.log(`  console errors: ${r.consoleErrors.length} (see manifest)`);
  }
  console.log(`\nwrote ${allFiles.length} screenshots + ${path.relative(repoRoot, path.join(screensRoot, 'manifest.json')).replace(/\\/g, '/')}`);

  if (problems.length) {
    console.error(`\nVISUAL SMOKE FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('\nLook at the named screenshots before reporting anything ready.');
    process.exit(1);
  }
  console.log('\nVISUAL SMOKE PASSED — every capture is non-blank and every line built.');
  console.log('Now LOOK at the screenshots: this gate proves they are real, not that they are right.');
}

// Only when invoked as a command. Without this guard, importing `judgeCapture` from a test would
// launch a browser and drive three apps as a side effect of collecting the suite.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => fail(e.stack || e.message));
}
