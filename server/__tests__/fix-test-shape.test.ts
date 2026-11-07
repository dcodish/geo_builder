/**
 * #2739 ([ADR-W-191](../../docs/06w-decisions-workspace.md#adr-w-191)) — A FIX'S OWN TEST IS A UNIT TEST.
 *
 * Operator, 2026-11-07: a fix's own test is a real unit test of the module that was fixed, and the figure is
 * locked once, in a fixture or the scenario corpus; the existing whole-figure fix files are folded away.
 *
 * A CASE FILE is a test file named after one fix (`issue-1234-…`, `…-1234.test.ts`) that enters its builder's
 * "sentences in, figure out" route (`scripts/lib/test-kind.mjs` lists those front doors, once). Each one replays a
 * whole figure in its own cold worker. On 2026-11-07 there were 945 of them, 55% of the suite's files, and they were
 * the only failing kind in 3 of 86 recorded full-suite failures.
 *
 * The baseline (`fixtures/fix-case-files-baseline.json`) lists the case files that existed when the rule was made.
 * It only shrinks:
 *   - a case file that is not in the baseline fails, unless its source says why a shared net cannot make its
 *     check: `pipeline-lock: <why>`;
 *   - a baseline row whose file is gone or no longer a case file prints a reminder;
 *   - `UPDATE_BASELINE=1` drops those rows. It never adds one: a new case file states its reason instead.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { entersFrontDoor, isFixNamed, PIPELINE_LOCK, testKind } from '../../scripts/lib/test-kind.mjs';

// server/ may not import shell/ (BOUNDARIES.json), so the ratchets' three small conventions are restated here.
const REPO_ROOT = join(__dirname, '..', '..');
const repoPath = (abs: string): string => relative(REPO_ROOT, abs).split(sep).join('/');
const UPDATE_BASELINE = process.env.UPDATE_BASELINE === '1';
const lowerTheBaseline = (baseline: string, what: string): string =>
  `ratchet: ${what} — lower the baseline (UPDATE_BASELINE=1 regenerates ${baseline}) so it only tightens`;
const BASELINE_PATH = 'server/__tests__/fixtures/fix-case-files-baseline.json';
const ROOTS = ['src', 'src3d', 'src-analytic', 'src-complex', 'shell', 'server', 'scripts'];

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(abs);
      } else if (/\.test\.tsx?$/.test(e.name)) out.push(repoPath(abs));
    }
  };
  for (const r of ROOTS) if (existsSync(join(REPO_ROOT, r))) walk(join(REPO_ROOT, r));
  return out.sort();
}

describe('#2739 — what kind of test a file is (scripts/lib/test-kind.mjs)', () => {
  it('a file is named after a fix by an issue number in its name', () => {
    expect(isFixNamed('src/app/__tests__/issue-1918-right-trapezoid-circle.test.ts')).toBe(true);
    expect(isFixNamed('src/app/__tests__/decide-parity-1395-4.test.ts')).toBe(true);
    expect(isFixNamed('src-complex/__tests__/message-floor-2028.test.ts')).toBe(true);
    expect(isFixNamed('src/engine/__tests__/geometry.test.ts')).toBe(false);
    expect(isFixNamed('src/__tests__/scenarios-e2e-1.test.ts')).toBe(false);
  });
  it('a front door, or a parser and a replay together, is the whole sentences-in, figure-out route', () => {
    expect(entersFrontDoor("import { decideDeterministic2D } from '../decideDeterministic';")).toBe(true);
    expect(entersFrontDoor("import { factsOf } from '../../__tests__/scenario-pipeline';")).toBe(true);
    expect(entersFrontDoor("import { useGeo3 } from '../../store/store3';")).toBe(true);
    expect(entersFrontDoor("import { derive } from '../engine/derive';")).toBe(true);
    expect(entersFrontDoor("import { parse } from '@/parser';\nimport { replay } from '@/store/geoStore';")).toBe(true);
    expect(entersFrontDoor("import { parse } from '@/parser';\nimport type { Command } from '@/engine';")).toBe(false);
    expect(entersFrontDoor("import { solve } from '../solve';")).toBe(false);
  });
  it('a case file is both; a unit test of one module is neither', () => {
    const door = "import { derive } from '../engine/derive';";
    expect(testKind('src-analytic/__tests__/issue-1556-freerank.test.ts', door)).toBe('case');
    expect(testKind('src-analytic/__tests__/geo-input-parity.test.ts', door)).toBe('pipeline');
    expect(testKind('src-analytic/__tests__/issue-1556-freerank.test.ts', "import { rank } from '../engine/rank';")).toBe('unit');
  });
});

describe('#2739 — a fix adds a unit test, not another whole-figure file', () => {
  const unexplained = new Set<string>();
  for (const f of testFiles()) {
    const src = readFileSync(join(REPO_ROOT, f), 'utf8');
    if (testKind(f, src) === 'case' && !PIPELINE_LOCK.test(src)) unexplained.add(f);
  }
  const abs = join(REPO_ROOT, BASELINE_PATH);
  const baseline: string[] = existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : [];
  if (UPDATE_BASELINE) {
    // Only ever drops rows: a new case file is never grandfathered by a regeneration.
    writeFileSync(abs, JSON.stringify(baseline.filter((f) => unexplained.has(f)), null, 1) + '\n');
  }

  it('every whole-figure file named after a fix is grandfathered or says why it must be one', () => {
    const known = new Set(baseline);
    const added = [...unexplained]
      .filter((f) => !known.has(f))
      .map(
        (f) =>
          `${f} replays a whole figure. Test the module that was fixed instead, and lock the figure once: a fixture ` +
          `(it builds green and verifies) or a scenario in the corpus (a bespoke check). If neither can make this ` +
          `check, say why in the file: \`pipeline-lock: <why>\`.`,
      );
    expect(added).toEqual([]);
  });

  it('a folded case file is reported, so the baseline shrinks', () => {
    const gone = baseline.filter((f) => !unexplained.has(f)).map((f) => lowerTheBaseline(BASELINE_PATH, `${f} is no longer a case file`));
    // A reminder, not a failure: the suite got smaller. The baseline catches up on the next UPDATE_BASELINE run.
    for (const s of gone) console.warn(s);
    expect(baseline.length).toBeGreaterThanOrEqual(0);
  });
});
