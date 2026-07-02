/**
 * Area reference of a polygon whose FIRST vertex is "S" ([docs/15-hardening-plan.md] C8 / PAR-6).
 *
 * `areaReferences` had a `seen` Set that was declared but never populated, so the compact S-notation scan
 * re-read the tail of a verbose S-cornered polygon name: "שטח מרובע SABC הוא 20" produced a phantom SECOND
 * reference (marker-S + polygon "ABC"), turning a lone area into a bogus `set-area-ratio {SABC : ABC = 20}`
 * that drove the solver into nonsense. S is in the auto-label pools, so this arises without the student
 * choosing it. Fix: populate `seen` with the position of a verbose polygon's first vertex when it is "S",
 * so the compact scan skips it.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const ctx = { points: ['A', 'B', 'C', 'D', 'S', 'N', 'E'] } as const;
const cmds = (u: string) => {
  const r = parse(u, ctx as never);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)} → ${JSON.stringify(r)}`);
  return r.commands;
};

describe('PAR-6 — a verbose area of an S-leading polygon is ONE area, not a phantom ratio', () => {
  it('"שטח מרובע SABC הוא 20" → measure-area of the quad SABC (no phantom ABC ratio)', () => {
    const c = cmds('שטח מרובע SABC הוא 20');
    expect(c.some((x) => x.type === 'set-area-ratio'), 'no bogus area-RATIO').toBe(false);
    const area = c.find((x) => x.type === 'measure-area' || x.type === 'set-area') as { ids: string[] } | undefined;
    expect(area, 'a single area measure').toBeTruthy();
    expect(area!.ids).toEqual(['S', 'A', 'B', 'C']);
  });

  it('"שטח SABC = 20" (marker + S-leading polygon, no shape word) → area of SABC', () => {
    const c = cmds('שטח SABC = 20');
    expect(c.some((x) => x.type === 'set-area-ratio')).toBe(false);
    const area = c.find((x) => x.type === 'measure-area' || x.type === 'set-area') as { ids: string[] } | undefined;
    expect(area!.ids).toEqual(['S', 'A', 'B', 'C']);
  });
});

describe('PAR-6 — no regression to the intended compact / verbose / ratio forms', () => {
  it('compact "SABC = 20" (S is the area MARKER) → area of polygon ABC', () => {
    const c = cmds('SABC = 20');
    const area = c.find((x) => x.type === 'measure-area') as { ids: string[] } | undefined;
    expect(area!.ids).toEqual(['A', 'B', 'C']);
  });

  it('verbose non-S polygon "שטח מרובע ABCD הוא 20" → area of ABCD', () => {
    const c = cmds('שטח מרובע ABCD הוא 20');
    const area = c.find((x) => x.type === 'measure-area') as { ids: string[] } | undefined;
    expect(area!.ids).toEqual(['A', 'B', 'C', 'D']);
  });

  it('a genuine ratio between two compact refs "SABC = 4 SNCE" still builds a ratio', () => {
    const c = cmds('SABC = 4 SNCE');
    const r = c.find((x) => x.type === 'set-area-ratio') as { ids1: string[]; ids2: string[]; k: number } | undefined;
    expect(r, 'the two-ref ratio is preserved').toBeTruthy();
    expect(r!.ids1).toEqual(['A', 'B', 'C']);
    expect(r!.ids2).toEqual(['N', 'C', 'E']);
  });
});
