/**
 * TANGENT TO A SIDE — the bounded noun bounds the tangency (#1503, amending ADR-AG-165).
 *
 * Operator, playing PR #1502 (2026-09-28): *"מעגל M משיק לישר AB — circle is tangent to the line.
 * but when i say מעגל M משיק לצלע AB — it still treats it as the line."*
 *
 * Measured then (PR branch @ e112f86d): «מעגל M משיק לצלע AB» over A(0,0)–B(4,0) built with
 * `faults: []` at every seed while the tangency foot sat OFF the side at 8 of 12 seeds — the
 * figure claimed tangency to the side while touching only its extension. The noun was stripped in
 * the same alternation as «ישר» and discarded (the #1168 class: the noun decides the extent).
 *
 * For tangency the bound is HARD — a circle tangent to the extension is not tangent to the side —
 * so the residual gains extent rows on the foot, and a seed where only the extension touches is a
 * fault, never a green figure.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { segmentParam } from '../engine/extent';
import { canonicalConstraint } from '../engine/solve';

const SEEDS = 12;

const build = (lines: string[], seed: number) => {
  const d = derive(lines, seed);
  const pt = (id: string) => d.figure.points.find((p) => p.id === id) ?? null;
  return { d, pt };
};

/** The projection parameter of the centre onto A→B — where the tangency touches the line. */
const foot = (f: ReturnType<typeof build>) => segmentParam(f.pt('A')!, f.pt('B')!, f.pt('M')!)!;

describe('#1503 — «משיק לצלע AB» touches the SIDE, at every drawn configuration', () => {
  it("the operator's exact sequence: the foot lies within the side at EVERY green seed", () => {
    let drawn = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['A(0,0)', 'B(4,0)', 'מעגל M משיק לצלע AB'], seed);
      if (f.d.faults.length > 0) continue; // an unsatisfied seed reports, it does not draw
      drawn += 1;
      const t = foot(f);
      expect(t, `seed ${seed}: foot at t=${t}`).toBeGreaterThanOrEqual(-1e-6);
      expect(t, `seed ${seed}: foot at t=${t}`).toBeLessThanOrEqual(1 + 1e-6);
    }
    // The lock must not pass by refusing everything — most seeds have room to satisfy the side.
    expect(drawn).toBeGreaterThanOrEqual(8);
  });

  it('«משיק לקטע AB» and the contextual «המעגל משיק לצלע AB» read the same bound', () => {
    for (const line of ['מעגל M משיק לקטע AB', 'המעגל משיק לצלע AB']) {
      const preamble = line.startsWith('המעגל') ? ['A(0,0)', 'B(4,0)', 'נתון מעגל M'] : ['A(0,0)', 'B(4,0)'];
      let drawn = 0;
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const f = build([...preamble, line], seed);
        if (f.d.faults.length > 0) continue;
        drawn += 1;
        const t = foot(f);
        expect(t, `«${line}» seed ${seed}: foot at t=${t}`).toBeGreaterThanOrEqual(-1e-6);
        expect(t, `«${line}» seed ${seed}: foot at t=${t}`).toBeLessThanOrEqual(1 + 1e-6);
      }
      expect(drawn, `«${line}»`).toBeGreaterThanOrEqual(8);
    }
  });

  it('English: «circle M is tangent to side AB»', () => {
    let drawn = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['A(0,0)', 'B(4,0)', 'circle M is tangent to side AB'], seed);
      if (f.d.faults.length > 0) continue;
      drawn += 1;
      const t = foot(f);
      expect(t, `seed ${seed}: foot at t=${t}`).toBeGreaterThanOrEqual(-1e-6);
      expect(t, `seed ${seed}: foot at t=${t}`).toBeLessThanOrEqual(1 + 1e-6);
    }
    expect(drawn).toBeGreaterThanOrEqual(8);
  });
});

describe('#1503 — «משיק לישר AB» is UNCHANGED: the line reading keeps its extension', () => {
  it('builds green at every seed, and the foot is FREE to leave the segment', () => {
    let offSide = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['A(0,0)', 'B(4,0)', 'מעגל M משיק לישר AB'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      // Tangent to the LINE: distance from M to the x-axis is the radius, wherever the foot sits.
      const t = foot(f);
      if (t < 0 || t > 1) offSide += 1;
    }
    // The regression guard BOTH ways: a fix that quietly bounded the line reading would push every
    // foot inside — measured before the fix, 8 of 12 seeds sat off the side.
    expect(offSide).toBeGreaterThan(0);
  });
});

describe('#1503 — bounded and unbounded are different GIVENS', () => {
  it('canonicalConstraint keys «לישר AB» and «לצלע AB» apart, and keeps the pair undirected', () => {
    const r = { kind: 'sym' as const, name: 'r_M' };
    const line = canonicalConstraint({ t: 'tangent-line', centre: 'M', r, line: { kind: 'points', a: 'A', b: 'B' } });
    const side = canonicalConstraint({
      t: 'tangent-line',
      centre: 'M',
      r,
      line: { kind: 'points', a: 'A', b: 'B', bounded: true },
    });
    const sideBA = canonicalConstraint({
      t: 'tangent-line',
      centre: 'M',
      r,
      line: { kind: 'points', a: 'B', b: 'A', bounded: true },
    });
    expect(side).not.toBe(line);
    expect(sideBA).toBe(side);
  });
});
