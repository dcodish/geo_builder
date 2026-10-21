/**
 * #2426 ([ADR-AG-324](../../docs/06c-decisions-analytic.md#adr-ag-324)) — A FREE PARAMETER IS SAMPLED IN THE FIGURE'S
 * OWN UNITS.
 *
 * Operator, round #2414 T9: *"before i write MN = 9, all different configs have a<13"*. Ruling 2026-10-20 ("accept
 * recommendations"): a half-bounded or unbounded free parameter ranges up to 1.5× the largest number stated (2-D's
 * ADR-526), and a free point's sampling box follows the same rule. Mechanism (orchestrator, on the #2426 escalation):
 * only what no given reaches widens; anything a constraint solves keeps the window the solve starts from. Seed 0 is
 * byte-identical.
 *
 * Every behavioural assertion calls the decision: `anotherConfiguration` (the button's own function) and `derive`.
 */
import { describe, expect, it } from 'vitest';
import { anotherConfiguration } from '../app/another';
import { derive } from '../engine/derive';
import { evaluate, sampleParam } from '../engine/evaluate';
import { reachedByGivens } from '../engine/carriers';
import { panelKnowledge } from '../app/panelRows';
import { statedScale } from '../engine/pinRoots';
import tangents from './fixtures/exam-2379-q2-two-tangents-2395.analytic.json';

/** The values of `sym` over `n` presses of «הציגו תצורה אחרת» from seed 0. */
function presses(lines: readonly string[], sym: string, n = 30): number[] {
  let seed = 0;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    seed = anotherConfiguration(lines, seed).seed;
    out.push(derive(lines, seed).figure.env[sym]);
  }
  return out;
}

describe('#2426 — the operator\'s T9 lines reach a > 13 before MN = 9 is stated', () => {
  it('«a הוא פרמטר חיובי» · «M(a,0)» · «N(13,0)»: 30 presses draw M on both sides of N', () => {
    const vs = presses(['a הוא פרמטר חיובי', 'M(a,0)', 'N(13,0)'], 'a');
    expect(vs.some((v) => v > 13), 'M beyond N').toBe(true);
    expect(vs.some((v) => v > 0 && v < 13), 'M before N').toBe(true);
    expect(vs.every((v) => v >= 1 && v < 19.5)).toBe(true);
  });

  it('the range scales with the figure: «M(a,0)» · «N(130,0)» reaches |a| > 40, both signs', () => {
    const vs = presses(['M(a,0)', 'N(130,0)'], 'a');
    expect(vs.some((v) => Math.abs(v) > 40)).toBe(true);
    expect(vs.some((v) => v < 0) && vs.some((v) => v > 0)).toBe(true);
    expect(vs.every((v) => Math.abs(v) >= 1 && Math.abs(v) < 195)).toBe(true);
  });

  it('a free vertex beside N(13,0) reaches the origin\'s side', () => {
    const xs = Array.from({ length: 30 }, (_, s) => derive(['N(13,0)', 'נקודה M'], s).figure.points.find((p) => p.id === 'M')!.x);
    expect(Math.min(...xs)).toBeLessThan(0);
  });
});

describe('#2426 — seed 0 is the first drawing it always was', () => {
  it('sampleParam at seed 0 ignores the scale; a scale ≤ 8/3 changes nothing at any seed', () => {
    for (const d of [{}, { min: 0, minOpen: true }, { max: 2 }]) {
      for (const salt of [1, 2, 3]) expect(sampleParam(d, 0, salt, 1, 100)).toBe(sampleParam(d, 0, salt, 1, 1));
      for (let s = 0; s < 30; s += 1) expect(sampleParam(d, s, 1, 1, 2.5)).toBe(sampleParam(d, s, 1, 1, 1));
    }
  });

  it.each([
    [['a הוא פרמטר חיובי', 'M(a,0)', 'N(13,0)']],
    [['M(a,0)', 'N(130,0)']],
    [['N(13,0)', 'נקודה M']],
  ])('%j: seed 0 draws a in [1, 4) and the free vertex in the old box', (lines) => {
    const d = derive(lines, 0);
    if (d.figure.env.a !== undefined) expect(Math.abs(d.figure.env.a)).toBeLessThan(4);
    const m = d.figure.points.find((p) => p.id === 'M')!;
    if (lines.includes('נקודה M')) expect(m.x).toBeGreaterThanOrEqual(7);
  });
});

describe('#2426 — what a given reaches is solved, and keeps the solve\'s window', () => {
  it('reachedByGivens: a lone M(a,0) is unreached; MN = 9 reaches a; a tangency reaches the line\'s m and n', () => {
    expect(reachedByGivens(derive(['M(a,0)', 'N(13,0)'], 0).construction).syms.has('a')).toBe(false);
    expect(reachedByGivens(derive(['M(a,0)', 'N(13,0)', 'MN = 9'], 0).construction).syms.has('a')).toBe(true);
    const c = derive(tangents.lines, 0).construction;
    for (const s of ['m', 'n', 'p', 'q']) expect(reachedByGivens(c).syms.has(s), s).toBe(true);
  });

  it('Q2 ד (two common tangents by equation): every configuration 0–23 holds, and the panel keeps both tangents', () => {
    const c = derive(tangents.lines, 0).construction;
    expect(statedScale(c.objects, c.constraints)).toBe(13);
    for (let s = 0; s < 24; s += 1) {
      const d = derive(tangents.lines, s);
      expect(d.faults, `seed ${s}`).toEqual([]);
      expect(d.figure.unsatisfied, `seed ${s}`).toEqual([]);
      expect(Math.abs(evaluate(c, s).env.m ?? 0)).toBeLessThan(5);
    }
    const m = panelKnowledge(derive(tangents.lines, 0)).params.find((p) => p.sym === 'm');
    expect(m?.k.known ?? false).toBe(false);
  });

  it('«MN = 9» after the T9 lines still reaches both roots, a = 4 and a = 22', () => {
    const vs = presses(['a הוא פרמטר חיובי', 'M(a,0)', 'N(13,0)', 'MN = 9'], 'a', 12);
    expect(vs.some((v) => Math.abs(v - 4) < 1e-6)).toBe(true);
    expect(vs.some((v) => Math.abs(v - 22) < 1e-6)).toBe(true);
  });
});
