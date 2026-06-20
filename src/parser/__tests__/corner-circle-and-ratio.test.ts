/**
 * Parser fixes from a manual-testing session (operator questions, 2026-06-20):
 *  Q1 — "AB ו-AD משיקים למעגל" with NO circle named must still build a corner-tangent circle
 *       (auto-named centre), not depend on a pre-named circle — and spacing around the "ו" is
 *       irrelevant (the real trigger of the earlier failure was the missing circle name, not a space).
 *  Q3 — "EB/AE=√2/2" is a segment RATIO whose value is √2/2 ≈ 0.707 — it used to fragment-misparse to
 *       "AE = √2" (a wrong length). `segmentRatio` now reads a √ in the value; an RHS it still can't
 *       read fails cleanly (the measure rules no longer grab a fragment of a ratio).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const cmds = (u: string, ctx: Parameters<typeof parse>[1] = {}): AnyCommand[] => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`parse failed: ${u} (${r.reason})`);
  return r.commands;
};

describe('corner-tangent circle — Q1: works with NO circle named, spacing-independent', () => {
  for (const u of ['AB ו AD משיקים למעגל', 'AB וAD משיקים למעגל', 'ABו AD משיקים למעגל', 'AB and AD are tangent to a circle']) {
    it(`auto-names the circle: "${u}"`, () => {
      const c = cmds(u, { circles: [], points: ['A', 'B', 'C', 'D'] });
      // a bisector + the centre on it + a circle-through (the 5-command corner-tangent construct)
      expect(c.some((x) => x.type === 'bisector')).toBe(true);
      const circle = c.find((x) => x.type === 'circle-through');
      expect(circle, 'a circle is created even though none was named').toBeDefined();
      // the auto-named centre dodges the figure's existing labels (A–D)
      expect(['A', 'B', 'C', 'D']).not.toContain((circle as { center: string }).center);
    });
  }

  it('still honours an explicitly named circle', () => {
    const c = cmds('AB ו AD משיקים למעגל O', { circles: [], points: ['A', 'B', 'C', 'D'] });
    expect((c.find((x) => x.type === 'circle-through') as { center: string }).center).toBe('O');
  });
});

describe('segment ratio with a √ value — Q3', () => {
  const ratio = (u: string) => cmds(u)[0] as Extract<AnyCommand, { type: 'set-ratio' }>;

  it('"EB/AE=√2/2" ⇒ k = √2/2 ≈ 0.707 (not a "AE=√2" fragment)', () => {
    const r = ratio('EB/AE=√2/2');
    expect(r.type).toBe('set-ratio');
    expect([r.a, r.b, r.c, r.d]).toEqual(['E', 'B', 'A', 'E']);
    expect(r.k).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('"EB/AE=√2" ⇒ k = √2', () => {
    expect(ratio('EB/AE=√2').k).toBeCloseTo(Math.SQRT2, 6);
  });

  it('"EB/AE=1/√2" ⇒ k = 1/√2 (√ in the denominator)', () => {
    expect(ratio('EB/AE=1/√2').k).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('plain numeric ratios are unchanged', () => {
    expect(ratio('AE/ED=2/3').k).toBeCloseTo(2 / 3, 6);
    expect(ratio('AE/ED=2').k).toBe(2);
  });

  it('an RHS the ratio rule cannot read FAILS cleanly — no fragment misparse to a length', () => {
    const r = parse('EB/AE=(√2)/2');
    expect(r.ok, 'escalates to the LLM rather than silently parsing "AE=√2"').toBe(false);
  });

  it('a plain length with a √ (no ratio LHS) is untouched', () => {
    const c = cmds('AB = √2')[0] as Extract<AnyCommand, { type: 'measure-length' }>;
    expect(c.type).toBe('measure-length');
  });
});

describe('spelled-out Greek letters normalise to symbols (alpha → α)', () => {
  const angle = (u: string) => cmds(u).find((c) => c.type === 'measure-angle') as Extract<AnyCommand, { type: 'measure-angle' }> | undefined;

  it('"∠ABC=2alpha" reads as 2·α (was misparsed to the NUMBER 2 — a 2° angle)', () => {
    const a = angle('∠ABC=2alpha');
    expect(a, 'a symbolic measure, not a numeric set-angle').toBeDefined();
    expect(a!.expr).toEqual({ coef: 2, var: 'α' });
  });

  it('"∠BAC=alpha" reads as α (was not-handled)', () => {
    expect(angle('∠BAC=alpha')!.expr).toEqual({ coef: 1, var: 'α' });
  });

  it('"theta", "2omega" etc. also normalise', () => {
    expect(angle('∠XYZ=theta')!.expr).toEqual({ coef: 1, var: 'θ' });
    expect(angle('∠XYZ=2omega')!.expr).toEqual({ coef: 2, var: 'ω' });
  });

  it('does NOT touch an uppercase point pair ("MU", "XI") or a longer word ("alphabet")', () => {
    expect(cmds('MU')[0]).toMatchObject({ type: 'segment', a: 'M', b: 'U' }); // not μ
    expect(parse('∠X=alphabet').ok, '"alphabet" is not the letter alpha').toBe(false);
  });
});
