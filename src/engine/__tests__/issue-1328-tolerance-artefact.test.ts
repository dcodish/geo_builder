/**
 * #1328 ([ADR-537](../../../docs/06-decisions.md#adr-537)) — A POLYGON THINNER THAN ITS TOLERANCE IS NOT A
 * SOLUTION. P1, from the operator's play of the #1264 sheet (T4 on T3's figure, 2026-09-21).
 *
 * «משולש ABC» · «AB = AC» · «∠ABC = ∠ACB» · «∠ABC = 90» has no triangle in it — two right base angles and
 * a 0° apex — and the tool drew a needle (BC at 0.6% of AB, apex 0.35°) with every row green and
 * «✓ נקבע במלואו». The solver had satisfied both right angles WITHIN `ANGLE_EPS` (0.5°): the thinness
 * was the tolerance's, not the geometry's. The accept gate now re-solves a figure whose declared polygon
 * came out thin under a tightened degree tolerance; a needle bought with slack cannot survive it.
 *
 * Every case below was measured on the pre-change tree first (see the ADR's table): the refusals were
 * green figures, the legitimate thin triangles and the ADR-513 notice figures are unchanged by design.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { findValidConfig, firstSatisfyingSeed, meetsRequirements, replay } from '@/replay/core';
import { applyStep, buildSymTab, degeneratePolygons, lowerOne, residualTolerance, THIN_POLYGON_RATIO, TIGHT_TOLERANCE_FACTOR, withToleranceFactor } from '@/engine';
import type { Command } from '@/engine';
import { buildParseCtx, parse } from '@/parser';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const angleAt = (fig: ReturnType<typeof replay>, v: string, a: string, b: string) => {
  const p = (id: string) => fig.positions.get(id)!;
  const ux = p(a).x - p(v).x, uy = p(a).y - p(v).y, vx = p(b).x - p(v).x, vy = p(b).y - p(v).y;
  return (Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))) * 180) / Math.PI;
};
const flatnessOf = (fig: ReturnType<typeof replay>) => degeneratePolygons(fig.construction, fig.positions, 1)[0]?.ratio ?? NaN;

describe('#1328 — a contradiction satisfiable only in the degenerate limit is REFUSED, never drawn within tolerance', () => {
  const T3 = ['משולש ABC', 'AB = AC', '∠ABC = ∠ACB'];

  it("the operator's sequence: the fourth line is refused as over-constrained naming «∠ABC = 90», and it is a hard error, not a pending state", () => {
    const facts = factsOf([...T3, '∠ABC = 90']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toMatch(/^over-constrained: ∠ABC = 90° cannot hold/);
    expect(fig.pending, 'a contradiction is never «add the remaining givens»').toBe(false);
    // the T3 figure before it is untouched: every earlier row green, the triangle a real one
    for (const [id, s] of Object.entries(fig.status)) {
      if (id.startsWith('g3')) expect(s, id).not.toBe('ok');
      else expect(s, id).toBe('ok');
    }
    expect(flatnessOf(fig), 'the drawn figure is the prior isosceles triangle, not a needle').toBeGreaterThan(0.1);
    expect(fig.degeneracies).toEqual([]);
  });

  it('the direct control «∠ABC = 90» · «∠ACB = 90» is refused on the second right angle', () => {
    const facts = factsOf(['משולש ABC', '∠ABC = 90', '∠ACB = 90']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toMatch(/^over-constrained: ∠ACB = 90° cannot hold/);
    expect(fig.pending).toBe(false);
    expect(Math.abs(angleAt(fig, 'B', 'A', 'C') - 90), 'the first right angle stands').toBeLessThan(1e-6);
  });

  it('the step result carries the reason: the ladder found a solution and refused it as not a figure', () => {
    const prefix = factsOf(['משולש ABC', '∠ABC = 90']);
    const fig = replay(prefix);
    const r = parse('∠ACB = 90', buildParseCtx(fig.construction, fig.positions));
    if (!r.ok) throw new Error('no parse');
    const symtab = buildSymTab([...prefix.map((f) => f.cmd), ...r.commands]);
    const cmds = r.commands.flatMap((c) => lowerOne(c, symtab)) as Command[];
    let cur = fig.construction;
    let refusal: ReturnType<typeof applyStep> | null = null;
    for (const cmd of cmds) {
      const s = applyStep(cur, cmd);
      if (s.ok) cur = s.construction;
      else { refusal = s; break; }
    }
    expect(refusal, 'the right-angle row is the one refused').not.toBeNull();
    expect(refusal!.ok).toBe(false);
    if (!refusal!.ok) expect(refusal!.degenerate, 'a solution existed and was not a figure').toBe(true);
  });
});

describe('#1328 — the other direction, byte-identical: thin figures that are EXACT solutions still build', () => {
  it('89° + 90° — a 1° apex — builds, determined, with no notice (ADR-513 measured it above the band)', () => {
    const facts = factsOf(['משולש ABC', 'זווית BAC = 89', 'זווית ABC = 90']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    expect(flatnessOf(fig)).toBeLessThan(THIN_POLYGON_RATIO); // inside the trigger band — it was re-solved and survived
    expect(fig.degeneracies).toEqual([]);
  });

  it('a stated 1° apex builds', () => {
    const facts = factsOf(['משולש ABC', 'זווית BAC = 1']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(Math.abs(angleAt(fig, 'A', 'B', 'C') - 1)).toBeLessThan(0.01);
  });

  it('the ADR-513 notice figures — 5·3·8 and a stated 0.1° — keep their NOTICE and are never refused: a flat exact solution is a real configuration', () => {
    for (const seq of [
      ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'],
      ['משולש ABC', 'זווית BAC = 0.1'],
    ]) {
      const facts = factsOf(seq);
      const fig = replay(facts, 0);
      expect(fig.lastError, seq.join(' · ')).toBeNull();
      expect(fig.degeneracies.map((d) => d.object), seq.join(' · ')).toEqual(['ABC']);
    }
  });

  it('5·3·7.9 — an ordinary triangle above the trigger band — is untouched', () => {
    const fig = replay(factsOf(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9']), 0);
    expect(fig.lastError).toBeNull();
    expect(fig.degeneracies).toEqual([]);
    expect(flatnessOf(fig)).toBeGreaterThan(THIN_POLYGON_RATIO);
  });
});

describe('#1328 — the mechanism, on its own', () => {
  it('the tightened tolerance reaches the degree family only, and is always restored', () => {
    const angle = { type: 'angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 90 } as const;
    const length = { type: 'distance', a: 'A', b: 'B', value: 5 } as const;
    const perp = { type: 'perpendicular', a: 'A', b: 'B', c: 'B', d: 'C' } as const;
    const base = { angle: residualTolerance(angle), length: residualTolerance(length, 10), perp: residualTolerance(perp) };
    withToleranceFactor(TIGHT_TOLERANCE_FACTOR, () => {
      expect(residualTolerance(angle)).toBeCloseTo(base.angle * TIGHT_TOLERANCE_FACTOR, 12);
      expect(residualTolerance(length, 10), 'the length family sits below the coincidence floor already').toBe(base.length);
      expect(residualTolerance(perp), 'so does ∥/⟂/collinear').toBe(base.perp);
    });
    expect(residualTolerance(angle), 'restored').toBe(base.angle);
  });

  it('the seat tier still rescues a figure whose DEFAULT seat admits only the needle (ADR-445): the corpus arc-equality figure builds honestly at seat B', () => {
    // «משולש ישר זווית ABC» seats the right angle at C, where «קשת AB = קשת BC» holds only degenerately —
    // before this fix the collapse was ACCEPTED at apply (flatness 7.5e-4, every row green, the corpus
    // lock satisfied by it). Now the default seat is refused and the config search's seat tier finds
    // the isosceles right triangle at B, which is the figure the sentence meant.
    const steps = ['משולש ישר זווית ABC', 'משולש ABC חסום במעגל', 'מעגל חסום במשולש ABC', 'משיק למעגל בנקודה B', 'קשת AB = קשת BC', 'מיתר AB'];
    const facts = factsOf(steps);
    expect(meetsRequirements(facts, 0), 'the default seat no longer passes as a figure').toBe(false);
    const found = findValidConfig(facts);
    expect(found, 'the search rescues it').not.toBeNull();
    const rt = found!.facts.find((f) => f.cmd.type === 'right-triangle')!.cmd as { rot?: number };
    expect(rt.rot, 'reseated').toBe(2);
    const fig = replay(found!.facts, found!.seed);
    expect(fig.lastError).toBeNull();
    const p = (id: string) => fig.positions.get(id)!;
    expect(Math.abs(dist(p('A'), p('B')) - dist(p('B'), p('C'))), 'equal arcs ⇒ equal chords, on a real triangle').toBeLessThan(1e-4);
    expect(Math.abs(angleAt(fig, 'B', 'A', 'C') - 90)).toBeLessThan(1e-6);
  });
});
