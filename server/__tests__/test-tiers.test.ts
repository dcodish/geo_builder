/**
 * #484 — the test-tier rule must be MACHINE-INDEPENDENT.
 *
 * Tier membership was "every file measured over 60 s" — an ABSOLUTE threshold over a MACHINE-DEPENDENT
 * measurement. The home PC is faster, so few files crossed it; the work PC is slower, so many did. Both
 * lists were correct for the machine that produced them and wrong for the other, and the committed
 * artifact flip-flopped with every switch (one measured refresh: 14 insertions, 70 deletions, against a
 * refresh from the other PC committed hours earlier). ADR-394's intent — "so the fast tier matches on
 * every machine" — is sound; an absolute wall-clock cutoff simply cannot deliver it.
 *
 * The property that can: the rule is a RATIO (the heaviest files holding a share of total suite time,
 * each at least a multiple of the mean), so a uniform speed difference cannot change the answer. That is
 * asserted here directly — scale every timing and demand the identical membership. The old rule fails
 * this test by construction, which is exactly why it is the test.
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` / `docs-hygiene.test.ts` reason: those tests
 * run in EVERY per-product lane, and the tiering script belongs to no product.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { classifySlow, serializeTiers } from '../../scripts/test-tiers.mjs';
type Timed = { file: string; ms: number };
const names = (fs: Timed[]): string[] => (classifySlow(fs) as Timed[]).map((f) => f.file).sort();

/** A distribution shaped like the real suite: a few heavy files, a long cheap tail. */
const SUITE: Timed[] = [
  { file: 'a.test.ts', ms: 348_000 },
  { file: 'b.test.ts', ms: 346_000 },
  { file: 'c.test.ts', ms: 328_000 },
  { file: 'd.test.ts', ms: 227_000 },
  { file: 'e.test.ts', ms: 222_000 },
  { file: 'f.test.ts', ms: 80_000 },
  ...Array.from({ length: 200 }, (_, i) => ({ file: `t${i}.test.ts`, ms: 300 })),
];

describe('#484 — the tier rule is invariant under a uniform machine speed difference', () => {
  it.each([0.25, 0.5, 2, 3.7, 10])('scaling every timing by ×%s leaves membership identical', (k) => {
    expect(names(SUITE.map((f) => ({ ...f, ms: f.ms * k })))).toEqual(names(SUITE));
  });

  it('the ABSOLUTE rule it replaced would have failed exactly that (the defect, stated)', () => {
    const over60s = (fs: Timed[]) => fs.filter((f) => f.ms > 60_000).map((f) => f.file).sort();
    const fast = SUITE.map((f) => ({ ...f, ms: f.ms / 4 })); // the same suite on a 4× faster machine
    expect(over60s(fast)).not.toEqual(over60s(SUITE)); // ← the flip-flop, reproduced
    expect(names(fast)).toEqual(names(SUITE)); // ← and closed
  });
});

describe('#484 — the rule still picks the heavy few, and degrades honestly', () => {
  it('the heaviest files are selected, the cheap tail is not', () => {
    const slow = names(SUITE);
    expect(slow).toContain('a.test.ts');
    expect(slow).not.toContain('t0.test.ts');
    expect(slow.length).toBeLessThan(10); // a handful, not most of the suite
  });

  it('a FLAT distribution yields an EMPTY slow tier — no file is one of "the heavy few"', () => {
    const flat = Array.from({ length: 50 }, (_, i) => ({ file: `f${i}.test.ts`, ms: 1000 }));
    expect(classifySlow(flat)).toEqual([]);
  });

  it('an empty or zero-time suite is not a crash', () => {
    expect(classifySlow([])).toEqual([]);
    expect(classifySlow([{ file: 'z.test.ts', ms: 0 }])).toEqual([]);
  });

  it('membership does not depend on input ORDER (ties broken by name, so two machines agree)', () => {
    expect(names([...SUITE].reverse())).toEqual(names(SUITE));
  });
});

/**
 * #750 — "is the suite green?" must be answerable MECHANICALLY.
 *
 * The exit status was never the defect: `test-tiers.mjs` has always called `process.exit(status)` on every
 * path (round #768 measured `EXIT_CODE=1` on a red suite end-to-end). It is destroyed at the CALL SITE — a
 * POSIX pipeline reports its LAST command's status, so `npm run test:full 2>&1 | tail -40` reads `tail`'s 0
 * whatever the suite did. That form gated a real deploy on 2026-08-25; the `;`-instead-of-`&&` sibling had
 * already burned a session before it. Discipline has now failed twice at the same seam.
 *
 * So the run records a verdict instead, and claiming green means READING it. These assert the RECORD — not
 * the printed summary (which was always correct, and is exactly what made the hole invisible) and not the
 * exit code (which nobody kept).
 */
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { buildVerdict, writeVerdict } from '../../scripts/test-tiers.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type Assertion = { status: string; fullName: string };
const suite = (name: string, assertions: Assertion[]) => ({
  name: join(process.cwd(), name),
  startTime: 0,
  endTime: 10,
  assertionResults: assertions,
});
const PASSING = suite('src/engine/__tests__/ok.test.ts', [{ status: 'passed', fullName: 'a' }]);
const FAILING = suite('src/render/__tests__/shadow-matrix3.test.ts', [{ status: 'failed', fullName: 'b' }]);

// A SKIPPED file: no failures, every assertion pending. Vitest prints these on the "Test Files" line.
const SKIPPED = suite('src/__tests__/parked.test.ts', [{ status: 'pending', fullName: 'c' }]);

// `num*TestSuites` counts `describe` BLOCKS, not files — deliberately absurd here (99) so the
// assertions below prove the verdict reads FILES from `testResults` and ignores it. On the real suite
// that field read 2085 against 520 files, which is what made the first draft of this artifact wrong.
const REPORT_RED = {
  testResults: [PASSING, FAILING, SKIPPED],
  numPassedTestSuites: 99, numFailedTestSuites: 99, numPendingTestSuites: 99,
  numPassedTests: 99, numFailedTests: 99, numPendingTests: 99,
};
const REPORT_GREEN = { testResults: [PASSING, SKIPPED] };
const at = '2026-08-26T00:00:00.000Z';

describe('#750 — the suite verdict is the machine-readable answer', () => {
  it('a RED run reads green:false and NAMES the failing file', () => {
    const v = buildVerdict({ mode: 'full', status: 1, report: REPORT_RED, at, sha: '13edd1d', dirty: false });
    expect(v.green).toBe(false);
    expect(v.failingFiles).toEqual(['src/render/__tests__/shadow-matrix3.test.ts']);
    expect(v.files).toEqual({ passed: 1, failed: 1, skipped: 1 });
    expect(v.tests).toEqual({ passed: 1, failed: 1, skipped: 1 });
  });

  it('a GREEN run reads green:true with nothing failing', () => {
    const v = buildVerdict({ mode: 'full', status: 0, report: REPORT_GREEN, at, sha: 'cdd8150', dirty: false });
    expect(v.green).toBe(true);
    expect(v.failingFiles).toEqual([]);
  });

  it('a run against a DIRTY tree says so — a verdict over a modified tree is not a verdict about what would be committed', () => {
    expect(buildVerdict({ mode: 'full', status: 0, report: REPORT_GREEN, at, sha: 'cdd8150', dirty: true }).dirty).toBe(true);
  });

  it('the sha it ran against is stamped — an EARLIER tree\u2019s verdict cannot pass as this one\u2019s', () => {
    expect(buildVerdict({ mode: 'full', status: 0, report: REPORT_GREEN, at, sha: 'cdd8150', dirty: false }).sha).toBe('cdd8150');
  });

  it('a CRASHED run (no JSON report) is green:false with details marked unavailable — never a missing file reading as "no news"', () => {
    const v = buildVerdict({ mode: 'full', status: 1, report: null, at, sha: 'cdd8150', dirty: false });
    expect(v.green).toBe(false);
    expect(v.files).toBeNull();
    expect(v.tests).toBeNull();
    expect(v.failingFiles).toBeNull();
    expect(v.note).toMatch(/exit status/);
  });

  it('the MODE is stamped, so a `fast` verdict can never be mistaken for the gate', () => {
    expect(buildVerdict({ mode: 'fast', status: 0, report: REPORT_GREEN, at, sha: 'cdd8150', dirty: false }).mode).toBe('fast');
    expect(buildVerdict({ mode: 'full', status: 0, report: REPORT_GREEN, at, sha: 'cdd8150', dirty: false }).mode).toBe('full');
  });

  it('it lands on DISK as parseable JSON — the whole point is that another process can read it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-verdict-'));
    const dest = join(dir, 'suite-verdict.json');
    try {
      writeVerdict(buildVerdict({ mode: 'full', status: 1, report: REPORT_RED, at, sha: '13edd1d', dirty: false }), dest);
      const onDisk = JSON.parse(readFileSync(dest, 'utf8'));
      expect(onDisk.green).toBe(false);
      expect(onDisk.mode).toBe('full');
      expect(onDisk.sha).toBe('13edd1d');
      expect(onDisk.failingFiles).toEqual(['src/render/__tests__/shadow-matrix3.test.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('FILE counts come from testResults, never from `num*TestSuites` — that field counts describe BLOCKS', () => {
    // The fixture sets every `num*` field to 99. A verdict reading them would print numbers that do not
    // match the `Test Files` line a human reads — which is exactly how the first draft shipped 2085.
    const v = buildVerdict({ mode: 'full', status: 1, report: REPORT_RED, at, sha: '13edd1d', dirty: false });
    expect(v.files.passed + v.files.failed + v.files.skipped).toBe(REPORT_RED.testResults.length);
    expect(v.files.failed).toBe(1);
    expect(v.files.skipped).toBe(1); // the all-pending file
  });

  it('writing is BEST-EFFORT — an unwritable destination must never fail the suite run itself', () => {
    const v = buildVerdict({ mode: 'full', status: 0, report: REPORT_GREEN, at, sha: 'cdd8150', dirty: false });
    expect(() => writeVerdict(v, join(tmpdir(), 'geo-verdict-nope', 'a', '\u0000bad'))).not.toThrow();
  });
});

import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo root, from this file's own location — no cwd assumption (the lanes run from anywhere). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * #812 (ADR-W-037) — THE TRACKED ARTIFACT CARRIES SHARED STATE AND NOTHING ELSE.
 *
 * #484 (above) made the RULE machine-independent; the FILE was not. It still recorded `slow[].ms` and
 * `measuredCutoffMs` — the writing machine's wall clock — and no consumer read either back. So the one
 * legitimate one-line change (a test joining the tier) arrived wrapped in a full column of numbers that
 * differed on every machine, and every parallel PR in a fix round conflicted on exactly this file and
 * nothing else. Round #800 stacked four PRs to route around it, and that stack's own failure mode cost a
 * recovery session.
 *
 * These assert the SERIALIZED bytes — what is actually committed — because the shape one layer above
 * them is not what git merges.
 */
describe('#812 — the tier artifact holds no per-machine state', () => {
  const SAMPLE = [
    { file: 'z/late.test.ts', ms: 900_000 },
    { file: 'a/early.test.ts', ms: 100_000 },
  ];

  it('the serialized artifact carries no timing field', () => {
    const text = serializeTiers(SAMPLE);
    const parsed = JSON.parse(text) as { slow: unknown[]; measuredCutoffMs?: unknown };
    expect(parsed.measuredCutoffMs, 'measuredCutoffMs was written and never read').toBeUndefined();
    expect(parsed.slow, 'membership is file PATHS').toEqual(['a/early.test.ts', 'z/late.test.ts']);
    // Belt and braces on the bytes: no number outside the rule block can be a timing.
    expect(text.replace(/"(share|minMeanMult)": [\d.]+/g, ''), 'no stray ms').not.toMatch(/"ms"/);
  });

  it('entries are sorted by PATH, not by measured time', () => {
    // The measurement order is a machine's speed ranking: keeping it would move a file that merely got
    // faster, which is the same churn one field over.
    const byTime = serializeTiers(SAMPLE);
    const byName = serializeTiers([...SAMPLE].reverse());
    expect(byTime).toBe(byName);
  });

  it('every entry is exactly ONE line — so a membership change is an insertion', () => {
    const lines = serializeTiers(SAMPLE).split('\n').filter((l) => l.includes('.test.ts'));
    expect(lines).toHaveLength(SAMPLE.length);
  });

  /**
   * The merge-shaped regression the issue asked for, run through git's OWN 3-way merge rather than a
   * proxy for it — this is the property the whole change exists to buy.
   *
   * Measured, and stated exactly: two branches that each add a slow file merge cleanly, INCLUDING when
   * their own timings for the shared files differ wildly (the real cross-machine situation, and the case
   * that conflicted on every parallel PR before). The one residue is two additions that BOTH sort to the
   * very end of the list — JSON's trailing comma makes each of them rewrite the previous last line — and
   * the issue's plan called that out in advance: the conflict then MEANS something (two real membership
   * changes) and resolves by keeping both lines, instead of being a choice between two machines' clocks.
   */
  const mergeStatus = (base: string[], ours: string[], theirs: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'tiers-merge-'));
    // Each side reports its OWN timings for every file — different machines, as in the real case.
    const w = (name: string, files: string[], ms: number) => {
      const p = join(dir, name);
      writeFileSync(p, serializeTiers(files.map((file, i) => ({ file, ms: ms + i }))));
      return p;
    };
    const r = spawnSync(
      'git',
      ['merge-file', '-p', w('ours.json', ours, 900_000), w('base.json', base, 100_000), w('theirs.json', theirs, 5_000)],
      { encoding: 'utf8' },
    );
    rmSync(dir, { recursive: true, force: true });
    return r;
  };
  const BASE = ['m/aa.test.ts', 'm/mm.test.ts', 'm/zz.test.ts'];

  it.each([
    ['both insertions in the middle', [...BASE, 'm/bb.test.ts'], [...BASE, 'm/nn.test.ts']],
    ['one in the middle, one at the end', [...BASE, 'm/bb.test.ts'], [...BASE, 'm/zzz.test.ts']],
  ])('two branches merge cleanly — %s', (_name, ours, theirs) => {
    const r = mergeStatus(BASE, ours, theirs);
    expect(r.status, `git merge-file conflicted:\n${r.stdout}`).toBe(0);
    const merged = JSON.parse(r.stdout) as { slow: string[] };
    expect(merged.slow).toEqual([...new Set([...ours, ...theirs])].sort());
  });

  it('the ONE residual conflict is about membership, never about a machine', () => {
    // Two additions that both sort to the very end: JSON's trailing comma makes each rewrite the
    // previous last line. Asserted rather than hidden — and asserted to be RESOLVABLE by keeping both
    // lines, which is the whole difference from the timing churn this replaces.
    const r = mergeStatus(BASE, [...BASE, 'm/zz1.test.ts'], [...BASE, 'm/zz2.test.ts']);
    expect(r.status, 'the tail case is the known residue').not.toBe(0);
    const conflicted = r.stdout.split('\n').filter((l) => /^[<=>]{7}/.test(l) || l.includes('.test.ts'));
    expect(conflicted.join('\n'), 'no timing ever appears in a conflict').not.toMatch(/\d{4,}/);
    expect(r.stdout).toContain('m/zz1.test.ts');
    expect(r.stdout).toContain('m/zz2.test.ts');
  });

  it('the artifact ON DISK is in the new shape (it can never regress to timings)', () => {
    const onDisk = JSON.parse(readFileSync(join(ROOT, 'reports', 'test-tiers.json'), 'utf8')) as {
      slow: unknown[];
      measuredCutoffMs?: unknown;
    };
    expect(onDisk.measuredCutoffMs).toBeUndefined();
    expect(onDisk.slow.every((s) => typeof s === 'string'), 'every entry is a path').toBe(true);
    expect([...(onDisk.slow as string[])].sort()).toEqual(onDisk.slow);
  });
});
