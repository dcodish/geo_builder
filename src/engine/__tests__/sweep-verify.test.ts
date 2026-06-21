/**
 * Broad build+verify SWEEP (hardening Pillar 2). The parser-coverage matrix proves phrasings PARSE;
 * this proves a spanning set of complete, multi-step figures BUILD and SATISFY THEIR GIVENS (the
 * comprehensive ADR-053 verifier). It exercises the constraint vocabulary (distance/angle/equal/ratio/
 * ∥/⟂/angle-ratio/collinear) on real shapes — where a "builds but silently violates" figure would hide.
 *
 * Each entry: a list of utterances parsed independently (no cross-step context — every step here parses
 * standalone), concatenated, built, and asserted: evaluate OK + checkGivens empty. A figure that fails
 * to build, or builds but violates a stated relation, fails the sweep (→ a root-cause work-list item).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate, checkGivens } from '@/engine';
import type { Command } from '@/engine';

/** Spanning set of buildable, constraint-bearing figures (He + En). */
const SWEEP: { name: string; steps: string[] }[] = [
  // ── distance / equal / ratio on a triangle ──
  { name: 'triangle + |AB|=6', steps: ['triangle ABC', 'AB = 6'] },
  { name: 'משולש + |AB|=6', steps: ['משולש ABC', 'AB = 6'] },
  { name: 'isosceles AB=AC', steps: ['triangle ABC', 'AB = AC'] },
  { name: 'שווה-שוקיים AB=AC', steps: ['משולש ABC', 'AB = AC'] },
  { name: 'ratio |AB|=2|AC|', steps: ['triangle ABC', 'AB = 2 AC'] },
  { name: 'two distances |AB|=5,|AC|=5', steps: ['triangle ABC', 'AB = 5', 'AC = 5'] },
  // ── angle / angle-ratio ──
  { name: 'angle ∠BAC=50', steps: ['triangle ABC', 'angle BAC = 50'] },
  { name: 'זווית ∠BAC=50', steps: ['משולש ABC', 'זווית BAC = 50'] },
  { name: 'two angles 40,60', steps: ['triangle ABC', 'angle ABC = 40', 'angle BCA = 60'] },
  { name: 'angle-ratio ∠ABC=2·∠BAC', steps: ['triangle ABC', 'angle BAC = alpha', 'angle ABC = 2alpha'] },
  // ── parallel / perpendicular on a quad ──
  { name: 'quad + AB∥DC', steps: ['quadrilateral ABCD', 'BC parallel to AD'] },
  { name: 'מרובע + BC∥AD', steps: ['מרובע ABCD', 'BC מקביל ל-AD'] },
  { name: 'quad + AB⟂BC', steps: ['quadrilateral ABCD', 'AB perpendicular to BC'] },
  { name: 'מרובע + AB⟂BC', steps: ['מרובע ABCD', 'AB מאונך ל-BC'] },
  // ── chord-length on an inscribed / circle figure ──
  { name: 'inscribed + chord |AB|=5', steps: ['triangle ABC inscribed in circle O', 'AB = 5'] },
  { name: 'circle + two on-circle + chord', steps: ['circle centered at O radius 5', 'A is on circle O', 'B is on circle O', 'AB = 6'] },
  // ── structural shapes (no set-* givens, but must build clean) ──
  { name: 'square', steps: ['square ABCD'] },
  { name: 'rectangle', steps: ['rectangle ABCD'] },
  { name: 'rhombus', steps: ['rhombus ABCD'] },
  { name: 'parallelogram', steps: ['parallelogram ABCD'] },
  { name: 'trapezoid', steps: ['trapezoid ABCD'] },
  { name: 'right triangle', steps: ['right triangle ABC'] },
  { name: 'inscribed square', steps: ['square ABCD inscribed in a circle'] },
  // ── two circles / tangent / secant ──
  { name: 'two circles intersect', steps: ['two circles intersect at A and B'] },
  { name: 'tangent from external', steps: ['circle centered at O radius 5', 'from point E outside circle O two tangents touch the circle at A and B'] },
];

describe('sweep — a spanning set of figures builds and satisfies its givens', () => {
  for (const { name, steps } of SWEEP) {
    it(`[${name}] builds + verifies clean`, () => {
      const cmds = steps.flatMap((u) => {
        const r = parse(u);
        if (!r.ok) throw new Error(`step did not parse (would escalate): "${u}"`);
        return r.commands as Command[];
      });
      const { construction } = build(cmds);
      const ev = evaluate(construction);
      expect(ev.ok, `[${name}] builds: ${ev.ok ? '' : ev.error}`).toBe(true);
      if (!ev.ok) return;
      const v = checkGivens(cmds, ev.positions, ev.circles);
      expect(v, `[${name}] givens not satisfied: ${JSON.stringify(v.map((x) => x.message))}`).toEqual([]);
    });
  }
});
