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
import { classifySlow } from '../../scripts/test-tiers.mjs';

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
