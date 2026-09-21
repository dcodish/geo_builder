/**
 * #1264 ([ADR-536](../../../docs/06-decisions.md#adr-536)) — the DOF accountant subtracts the RANK of the
 * constraint system, not one per constraint row.
 *
 * The operator's figure: «משולש ABC» · «∠ABC = 90» · «AB ⟂ BC». The third line says nothing new — the
 * figure already measures 90.000° at every seed — yet `freeDofCount` read 1 → 0 and the panel claimed
 * «הכל נקבע» while «הציגו תצורה אחרת» went on producing six distinct shapes. The count and the still-varying
 * shape are asserted TOGETHER here, per the ruling: the count can never be "fixed" by freezing the figure.
 *
 * Class, not instance (docs/17 §1): a dependent constraint row — the same relation through another kind,
 * with its operands swapped, a right angle a square already has, equal base angles after equal legs — is
 * one case of "the count is a tally where it should be a rank". Each spelling below is that class's
 * member, and the Jacobian rows are asserted parallel so the lock holds the MECHANISM, not the number.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { firstSatisfyingSeed, replay } from '@/replay/core';
import { freeDofCount, freeDofs } from '@/engine';
import type { Constraint, Construction, Id } from '@/engine';
import { constraintJacobian, constraintRank } from '@/engine/dofRank';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** The figure at its first satisfying seed, plus the BC:AB shape ratio over six seeds (a shape that still
 *  varies has several distinct values; a determined one has exactly one). */
function figureOf(steps: string[]) {
  const facts = factsOf(steps);
  const fig = replay(facts, firstSatisfyingSeed(facts));
  expect(fig.lastError, `${steps.join(' · ')} builds`).toBeNull();
  const ratios = new Set<string>();
  for (let s = 0; s < 6; s++) {
    const f = replay(facts, s);
    if (f.lastError) continue;
    const p = (id: string) => f.positions.get(id)!;
    ratios.add((dist(p('B'), p('C')) / dist(p('A'), p('B'))).toFixed(3));
  }
  return { fig, ratios };
}

/** Every constraint the figure enforces (the checked list + the directives), and its movable carriers. */
function systemOf(c: Construction): { cons: Constraint[]; movable: Id[] } {
  const cons = [...c.constraints];
  for (const o of c.objects) {
    const sv = (o as { solve?: { constraint: Constraint; also?: Constraint[] } }).solve;
    if (sv) cons.push(sv.constraint, ...(sv.also ?? []));
  }
  const movable = c.objects.filter((o) => (o.kind === 'free-point' && !o.pinned) || (o.kind === 'circle' && o.radius.via === 'free') || ['on-segment', 'on-circle', 'on-line', 'perp-offset', 'rotated', 'scaled-offset'].includes(o.kind)).map((o) => o.id);
  return { cons, movable };
}

const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  return dot / (na * nb);
};

describe('#1264 — a dependent constraint removes no degree of freedom, and the shape still varies', () => {
  const TRIANGLE_RIGHT = ['משולש ABC', '∠ABC = 90'];

  it("the operator's sequence: «AB ⟂ BC» after «∠ABC = 90» leaves the count at 1 — and the shape genuinely varies", () => {
    const before = figureOf(TRIANGLE_RIGHT);
    const after = figureOf([...TRIANGLE_RIGHT, 'AB ⟂ BC']);
    expect(freeDofCount(before.fig.construction)).toBe(1);
    // the count and the freedom, asserted together: the count may never be "fixed" by freezing the figure
    expect(freeDofCount(after.fig.construction), 'a restatement removes nothing').toBe(1);
    expect(after.ratios.size, 'a right triangle up to similarity still has its one shape parameter').toBeGreaterThan(1);
    expect(freeDofs(after.fig.construction).length, 'and the cue is honest: something is samplable').toBeGreaterThan(0);
  });

  it('the mirror order («AB ⟂ BC» then «∠ABC = 90») reads the same', () => {
    const { fig, ratios } = figureOf(['משולש ABC', 'AB ⟂ BC', '∠ABC = 90']);
    expect(freeDofCount(fig.construction)).toBe(1);
    expect(ratios.size).toBeGreaterThan(1);
  });

  it('the same relation with swapped operands («BC ⟂ AB» after «AB ⟂ BC») reads the same', () => {
    const { fig, ratios } = figureOf(['משולש ABC', 'AB ⟂ BC', 'BC ⟂ AB']);
    expect(freeDofCount(fig.construction)).toBe(1);
    expect(ratios.size).toBeGreaterThan(1);
  });

  it('equal base angles after equal legs — a dependence that holds only ON the manifold — reads 1, not 0', () => {
    const { fig, ratios } = figureOf(['משולש ABC', 'AB = AC', '∠ABC = ∠ACB']);
    expect(freeDofCount(fig.construction), 'an isosceles triangle up to similarity has one shape parameter').toBe(1);
    expect(ratios.size).toBeGreaterThan(1);
  });

  it('a right angle stated on a square is a ZERO row — identically satisfied, no rank, count stays 0 without the clamp', () => {
    const { fig } = figureOf(['ריבוע ABCD', '∠ABC = 90']);
    const { cons, movable } = systemOf(fig.construction);
    const jac = constraintJacobian(fig.construction, movable, cons);
    expect(jac).not.toBeNull();
    for (const row of jac!.rows) expect(Math.hypot(...row.grad), 'the angle of a square does not respond to any parameter').toBeLessThan(1e-7);
    expect(constraintRank(fig.construction, movable, cons)!.consumed).toBe(0);
    expect(freeDofCount(fig.construction)).toBe(0);
  });

  it('the mechanism: the ⟂ row and the ∠ row are PARALLEL at the solved configuration', () => {
    const { fig } = figureOf([...TRIANGLE_RIGHT, 'AB ⟂ BC']);
    const { cons, movable } = systemOf(fig.construction);
    const jac = constraintJacobian(fig.construction, movable, cons)!;
    const angle = jac.rows.find((r) => r.con.type === 'angle')!.grad;
    const perp = jac.rows.find((r) => r.con.type === 'perpendicular')!.grad;
    expect(Math.abs(cosine(angle, perp)), 'one direction, two spellings').toBeCloseTo(1, 6);
    expect(constraintRank(fig.construction, movable, cons)!.consumed, 'two rows, rank one').toBe(1);
  });

  it('the other direction, byte-identical: a GENUINE second constraint still reduces the count', () => {
    const { fig, ratios } = figureOf([...TRIANGLE_RIGHT, 'AB = BC']);
    expect(freeDofCount(fig.construction), 'a right isosceles triangle is determined up to similarity').toBe(0);
    expect(ratios.size, 'and it is: one shape at every seed').toBe(1);
    const { cons, movable } = systemOf(fig.construction);
    expect(constraintRank(fig.construction, movable, cons)!.consumed).toBe(2);
  });

  it('a RIGID figure whose solved points are coupled still reads 0 — the closed form is a column and a row, never differentiated through', () => {
    // Congruent right triangles CBA ≅ EBD (AB ⟂ CD, BC = BE, ∠ACB = ∠BED) with CD = 14 and BD = 8: every
    // length is forced (BC = 6, BA = 8, AC = 10) and six seeds draw one shape. B is solved on CD by the
    // angle equality and E on AB by BC = BE — a COUPLED pair `resolveDriven` promotes and bakes — and
    // read THROUGH the closed form the derivative of B's t with respect to A vanishes at the symmetric
    // solution, so |BD| = 8 read as a multiple of |CD| = 14 and the first full suite counted 1 here.
    const steps = ['AB אנך ל CD', 'B על CD', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED', 'CD=14', 'BD=8'];
    const facts = factsOf(steps);
    const shapes = new Set<string>();
    for (let s = 0; s < 6; s++) {
      const f = replay(facts, s);
      if (f.lastError) continue;
      const p = (id: string) => f.positions.get(id)!;
      shapes.add([dist(p('A'), p('B')), dist(p('B'), p('C')), dist(p('A'), p('C'))].map((x) => x.toFixed(3)).join(','));
    }
    expect(shapes.size, 'rigid: one shape at every seed').toBe(1);
    expect(freeDofCount(replay(facts, firstSatisfyingSeed(facts)).construction)).toBe(0);
  });

  it('a step that leaves the feasible set is differenced one-sided — the #432 figure counts 1 at seeds 1 and 2 too, not only at 0', () => {
    // At seeds 1 and 2 a 1e-6 step of one coordinate leaves the secant with no second crossing; a voided
    // Jacobian fell back to the per-row tally, which is the very lie ADR-424 had patched around.
    const facts = factsOf(['AB', 'מנקודה A יוצא חותך למעגל בנקודות C ו B', 'מנקודה A יוצא חותך למעגל בנקודות D ו E', 'CD', 'BE', 'AB=10a', 'AE=8a', 'ישר ADE', 'ישר ACB', 'BC=2DE']);
    for (const seed of [0, 1, 2]) {
      const fig = replay(facts, seed);
      expect(fig.lastError, `seed ${seed} builds`).toBeNull();
      expect(freeDofCount(fig.construction), `seed ${seed}: the inter-secant angle is the one DOF left`).toBe(1);
    }
  });

  it('an empty system has rank 0 and nothing unranked', () => {
    const { fig } = figureOf(['משולש ABC']);
    expect(constraintRank(fig.construction, systemOf(fig.construction).movable, [])).toEqual({ consumed: 0, unranked: [] });
  });
});
