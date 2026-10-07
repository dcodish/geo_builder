#!/usr/bin/env node
/**
 * PRE-PLAYED PLAY SHEETS — the browser half (#1509, ADR-W-092).
 *
 * Drives EVERY case of a play sheet in a real browser before the operator sees it: types the
 * utterances, asks the asks, presses «הציגו תצורה אחרת», captures screenshots, audits them, and
 * writes `report.html` — the sheet the operator receives, with the evidence embedded and each
 * case classed 🎮 (play) / 👁 (look) / ✅ (verified). A case that fails mechanically is reported
 * loudly and the run exits non-zero: it goes back to the fix, never to the operator.
 *
 *   node scripts/play-sheet-drive.mjs --sheet scripts/playsheets/<name>.json
 *
 * The heavy lifting is shared with `visual-smoke.mjs` (settle, refusal read, modal dismissal,
 * capture audit) — one browser harness, two entry points, per the third-copy rule. Output goes to
 * `reports/playsheets/<name>/` (gitignored, per-machine evidence like `reports/screens/`); the
 * SPECS are tracked in `scripts/playsheets/`. Not CI (ADR-W-005): a local gate, like its sibling.
 */
import { chromium } from 'playwright';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { APPS, auditImages, dismissModal, judgeCapture, refusals, waitForSettle } from './visual-smoke.mjs';
import { caseVerdict, renderReport, validateSheet } from './lib/play-sheet-core.mjs';

/** Where each product's ASK box lives — a distinctive substring of its placeholder, like
 *  `APPS[*].inputHint`. Read from the locales on 2026-09-28; a copy change fails loudly. */
// complex: the placeholder wraps its examples in bidi ISOLATES («שטח ⁦Oz1z2⁩»), so a hint that
// spans an isolate never substring-matches — keep each hint inside ONE run (round #1510, first contact).
const ASK_HINTS = { '2d': '∠GBC', '3d': 'שאלה', complex: 'שטח', analytic: 'שאלו' };

/** The configuration-cycling button, one label across the products. */
const CYCLE_LABEL = 'הציגו תצורה אחרת';

/** The products as the SHEET sees them: url path + input hint from the smoke descriptors, ask
 *  hints from here. `validateSheet` takes this, so a case naming an unknown product fails early. */
export const PRODUCTS = Object.fromEntries(
  Object.entries(APPS).map(([k, v]) => [k, { urlPath: v.urlPath, inputHint: v.inputHint, askHint: ASK_HINTS[k] }]),
);

function fail(msg) {
  console.error(`play-sheet-drive: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { sheet: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sheet') out.sheet = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: node scripts/play-sheet-drive.mjs --sheet <spec.json> [--out <dir>]');
      process.exit(0);
    } else fail(`unknown argument ${JSON.stringify(a)}`);
  }
  if (!out.sheet) fail('--sheet is required');
  return out;
}

/** Drive ONE case; returns everything `caseVerdict` measures plus the shots taken. */
async function driveCase(browser, spec, outDir, prefix) {
  const product = PRODUCTS[spec.product];
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const shots = [];
  let n = 0;
  const shoot = async (label) => {
    const file = `${prefix}-${String(++n).padStart(2, '0')}-${label.replace(/[^\w-]+/g, '_')}.png`;
    await page.screenshot({ path: path.join(outDir, file) });
    shots.push({ file, label });
  };

  const steps = [];
  const askSteps = [];
  try {
    await page.goto(spec.base + (spec.path ?? product.urlPath), { waitUntil: 'networkidle', timeout: 20000 });
    await waitForSettle(page);
    await dismissModal(page);

    const input = page.getByPlaceholder(product.inputHint).first();
    if ((await input.count()) === 0) {
      steps.push({ line: '(open page)', refusals: [`no input matching placeholder ${JSON.stringify(product.inputHint)}`] });
    } else {
      const seen = new Set(await refusals(page));
      /** One step's refusals: what is NEW on the page after it, read the ruled way (below). */
      const freshRefusals = async () => {
        let fresh = (await refusals(page)).filter((r) => !seen.has(r));
        if (fresh.length) {
          // The ruled "accept the flash" transaction shape (ADR-510, operator 2026-09-11): a commit
          // may show its error banner for a beat while the off-thread rescue lands. A refusal is what
          // the student is LEFT looking at — so a seen refusal gets one settle-and-re-read, and only
          // the ones still standing count (round #1510, sheet case T11).
          await page.waitForTimeout(2500);
          const still = new Set(await refusals(page));
          fresh = fresh.filter((r) => still.has(r));
        }
        fresh.forEach((r) => seen.add(r));
        return fresh;
      };
      const typeLine = async (line) => {
        await input.fill(line);
        await input.press('Enter');
        await waitForSettle(page);
        const fresh = await freshRefusals();
        steps.push({ line, refusals: fresh });
        if (fresh.length) await shoot(`refused-${steps.length}`);
      };
      for (const line of spec.lines) await typeLine(line);
      await shoot('built');

      /**
       * #1548 — steps AFTER the lines: a fact-list row's checkbox (1-based, the shared chrome's
       * `li > input[type=checkbox]`), or one more utterance. A toggle that is refused (an un-mute the
       * figure contradicts) reports like a refused line, so `expectRefusal` can match it.
       */
      for (const st of spec.after ?? []) {
        if (st.type !== undefined) {
          await typeLine(st.type);
          continue;
        }
        const box = page.locator('li > input[type="checkbox"]').nth(st.toggle - 1);
        if ((await box.count()) === 0) {
          steps.push({ line: `(toggle row ${st.toggle})`, refusals: [`no checkbox on fact-list row ${st.toggle}`] });
          break;
        }
        await box.click();
        await waitForSettle(page);
        const fresh = await freshRefusals();
        steps.push({ line: `(toggle row ${st.toggle})`, refusals: fresh });
        await shoot(`toggle-row-${st.toggle}`);
      }

      for (const ask of spec.asks ?? []) {
        const box = page.getByPlaceholder(product.askHint).first();
        if ((await box.count()) === 0) {
          askSteps.push({ ask, unread: true, note: `no ask box matching ${JSON.stringify(product.askHint)}` });
          continue;
        }
        const unreadBefore = ((await page.evaluate(() => document.body.innerText)) .match(/לא הבנתי את השאלה/g) ?? []).length;
        await box.fill(ask);
        await box.press('Enter');
        await waitForSettle(page);
        const unreadAfter = ((await page.evaluate(() => document.body.innerText)).match(/לא הבנתי את השאלה/g) ?? []).length;
        askSteps.push({ ask, unread: unreadAfter > unreadBefore });
        await shoot(`ask-${askSteps.length}`);
      }

      for (let k = 1; k <= (spec.cycles ?? 0); k++) {
        const btn = page.getByRole('button', { name: CYCLE_LABEL }).first();
        if ((await btn.count()) === 0) {
          steps.push({ line: `(cycle ${k})`, refusals: [`no «${CYCLE_LABEL}» button on this page`] });
          break;
        }
        await btn.click();
        await waitForSettle(page);
        await shoot(`config-${k}`);
      }
    }
  } catch (e) {
    steps.push({ line: '(driver)', refusals: [`driver error: ${e.message}`] });
  }

  const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
  await page.close();
  return { steps, askSteps, bodyText, pageErrors, shots };
}

async function run() {
  const { sheet: sheetPath, out } = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const sheet = JSON.parse(await readFile(sheetPath, 'utf8'));

  const specProblems = validateSheet(sheet, PRODUCTS);
  if (specProblems.length) fail(`sheet is not drivable:\n  ${specProblems.join('\n  ')}`);

  // Every named server must be RUNNING — a sheet pointing at a dead port is not a finished report.
  for (const base of new Set(sheet.cases.map((c) => c.base))) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      fail(`no server at ${base} (${e.message}) — every case's server must be up before the sheet ships`);
    }
  }

  const outDir = out ?? path.join(repoRoot, 'reports', 'playsheets', sheet.name);
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  for (const spec of sheet.cases) {
    const drive = await driveCase(browser, spec, outDir, spec.id);
    // Read the captures back before anything is claimed — evidence produced is not evidence read.
    const audit = await auditImages(browser, drive.shots.map((s) => path.join(outDir, s.file)));
    drive.captureProblems = audit.map((v) => judgeCapture(path.basename(v.file), v)).filter(Boolean);
    const problems = caseVerdict(spec, drive);
    results.push({ id: spec.id, problems, shots: drive.shots, steps: drive.steps, askSteps: drive.askSteps });
    console.log(`${problems.length === 0 ? '✓' : '✗'} ${spec.id} · ${spec.title}${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
  }
  await browser.close();

  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  await writeFile(path.join(outDir, 'report.html'), renderReport({ sheet, results, generatedAt }));
  await writeFile(
    path.join(outDir, 'manifest.json'),
    // `shots` lets `round-event.mjs sheet` join each case to its uploaded screenshots (#1853).
    JSON.stringify(
      { sheet: sheet.name, generatedAt, results: results.map((r) => ({ id: r.id, problems: r.problems, shots: r.shots })) },
      null,
      2,
    ),
  );

  const failed = results.filter((r) => r.problems.length > 0);
  console.log(`\nwrote ${path.relative(repoRoot, path.join(outDir, 'report.html')).replace(/\\/g, '/')}`);
  if (failed.length) {
    console.error(`PLAY-SHEET DRIVE FAILED — ${failed.length} case(s) failed mechanically. Fix them; the operator never sees a red sheet.`);
    process.exit(1);
  }
  console.log('PLAY-SHEET DRIVE PASSED — now READ the screenshots (the gate proves they are real, not that they are right), then publish the report.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => fail(e.stack || e.message));
}
