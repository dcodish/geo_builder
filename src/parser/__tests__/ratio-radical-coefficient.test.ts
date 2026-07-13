/**
 * Issue #114 / ADR-310 — a RADICAL as a ratio COEFFICIENT (the √() toolbar form).
 *
 * `ratioConstraint` / `segmentRatio` / `measureRatioK` built their coefficient from the older
 * `RCOEF`/`RATVAL` vocabulary, which parsed `(√3)` but NOT `√(3)` — the exact form the √() palette button
 * emits (parens around the RADICAND). So `AC=√(3)CO` and `AC גדול פי √(3) מ CO` escalated to the LLM while
 * the distance/area/radius rules (on the newer shared `NUMEXPR` atom, ADR-298) parsed `CK=√(63)` fine. The
 * ratio rules now use the same `NUMEXPR` atom. Operator prod session `qderonm3` (bagrut Q5).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const S3 = Math.sqrt(3);
const ratioK = (u: string): number | undefined => {
  const r = parse(u, {});
  if (!r.ok) return undefined;
  const sr = r.commands.find((c: AnyCommand) => c.type === 'set-ratio') as { k?: number } | undefined;
  return sr?.k;
};
const areaRatioK = (u: string): number | undefined => {
  const r = parse(u, {});
  if (!r.ok) return undefined;
  const c = r.commands.find((x: AnyCommand) => x.type === 'set-area-ratio') as { k?: number } | undefined;
  return c?.k;
};

describe('#114 — √() radical as a segment-ratio coefficient', () => {
  const cases: [string, number][] = [
    // the operator's forms (all had failed on the √() paren form):
    ['AC=√(3)CO', S3],
    ['AC גדול פי √(3) מ CO', S3],
    ['AC פי √(3) מ CO', S3],
    // the space/no-paren form that already worked stays working:
    ['AC=√3 CO', S3],
    // integer + other radical coefficients:
    ['AB=2CD', 2],
    ['AB = √2·OD', Math.SQRT2],
    ['AB פי √2 מ OD', Math.SQRT2],
    // the `/`-form (segmentRatio) with a √() value:
    ['AE/ED = √(2)/2', Math.SQRT2 / 2],
    ['AE/ED = 2/3', 2 / 3],
    // trailing divisor:
    ['AB = CD/√(2)', 1 / Math.SQRT2],
  ];
  for (const [u, k] of cases) {
    it(`${u} → k=${k.toFixed(4)}`, () => {
      const got = ratioK(u);
      expect(got, `"${u}" should be a set-ratio`).toBeDefined();
      expect(got!).toBeCloseTo(k, 6);
    });
  }

  it('no theft: "AB = √2R" (reserved radius symbol) is NOT a segment ratio', () => {
    const r = parse('AB = √2R', {});
    if (r.ok) expect(r.commands.find((c: AnyCommand) => c.type === 'set-ratio')).toBeUndefined();
  });
  it('no theft: "AB = √2" (concrete length) is NOT a segment ratio', () => {
    const r = parse('AB = √2', {});
    if (r.ok) expect(r.commands.find((c: AnyCommand) => c.type === 'set-ratio')).toBeUndefined();
  });
});

describe('#114 — sibling: radical factor in an AREA ratio', () => {
  it('שטח ABC גדול פי √(2) משטח DEF → area-ratio k=√2', () => {
    expect(areaRatioK('שטח ABC גדול פי √(2) משטח DEF')).toBeCloseTo(Math.SQRT2, 6);
  });
  it('integer area ratio still works (שטח ABC גדול פי 2 משטח DEF)', () => {
    expect(areaRatioK('שטח ABC גדול פי 2 משטח DEF')).toBeCloseTo(2, 6);
  });
});
