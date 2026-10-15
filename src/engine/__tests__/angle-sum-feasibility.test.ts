/**
 * #1329 ([ADR-538](../../../docs/06-decisions.md#adr-538)) — A POLYGON'S STATED INTERIOR ANGLES SUMMING
 * PAST (n−2)·180° IS PROVEN IMPOSSIBLE, AND IS NEVER A PENDING FIGURE.
 *
 * Found while fixing #1328: «משולש ABC» · «∠ABC = 100» · «∠ACB = 100» read as PENDING — "add the remaining
 * givens" — for a given set no given can rescue. The solver finds nothing, the step fails on its own, and
 * the classifier's flex probe (does the residual MOVE?) cannot tell that from an under-determined solve.
 * The angle-sum prover beside ADR-417's metric prover proves the excess before the ladder runs.
 */
import { describe, expect, it } from 'vitest';
import { angleSumImpossibility, angleSumImpossibilityError, metricImpossibility } from '../metricFeasibility';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import type { Constraint, GeoObject } from '../types';

const t: Translate = (k, o) => i18n.t(k, o) as string;
const poly = (id: string, vertices: string[]): GeoObject => ({ kind: 'polygon', id, vertices }) as GeoObject;
const ang = (ray1: string, vertex: string, ray2: string, value: number, arcOf?: string): Constraint =>
  ({ type: 'angle', vertex, ray1, ray2, value, ...(arcOf ? { arcOf } : {}) }) as Constraint;
const TRI = [poly('poly-ABC', ['A', 'B', 'C'])];
const QUAD = [poly('poly-ABCD', ['A', 'B', 'C', 'D'])];

describe('angleSumImpossibility — the pure prover', () => {
  it('two angles of a triangle past 180° — the reported member — naming the angles, the sum and the bound', () => {
    const m = angleSumImpossibility(TRI, [ang('A', 'B', 'C', 100), ang('A', 'C', 'B', 100)]);
    expect(m).not.toBeNull();
    expect(m!.polygon).toEqual(['A', 'B', 'C']);
    expect(m!.sum).toBe(200);
    expect(m!.bound).toBe(180);
    expect(m!.angles.map((a) => `${a.ray1}${a.vertex}${a.ray2}`)).toEqual(['ABC', 'ACB']);
    expect(angleSumImpossibilityError(m!)).toBe('impossible: the angles of ABC sum to 200°, exceeding 180°: ∠ABC = 100°, ∠ACB = 100°');
  });

  it('a single angle above the whole sum is the same member', () => {
    expect(angleSumImpossibility(TRI, [ang('A', 'B', 'C', 200)])?.sum).toBe(200);
  });

  it('passing proves nothing: 90° + 89° builds; with EVERY angle stated, equality (60·3) is the flat-polygon gates’ business', () => {
    expect(angleSumImpossibility(TRI, [ang('A', 'B', 'C', 90), ang('A', 'C', 'B', 89)])).toBeNull();
    expect(angleSumImpossibility(TRI, [ang('B', 'A', 'C', 60), ang('A', 'B', 'C', 60), ang('A', 'C', 'B', 60)])).toBeNull();
  });

  // #1936 (ADR-658): an unstated angle is strictly positive, so stated angles that REACH the bound leave it no room —
  // re-based from ADR-538's "equality is not a proof", which held only with every angle stated.
  it('#1936: two right angles of a triangle (90° + 90°, a third angle owed) leave no room — kind no-room', () => {
    const m = angleSumImpossibility(TRI, [ang('A', 'B', 'C', 90), ang('A', 'C', 'B', 90)]);
    expect(m?.kind).toBe('no-room');
    expect(m?.sum).toBe(180);
    expect(angleSumImpossibility(TRI, [ang('A', 'B', 'C', 100), ang('A', 'C', 'B', 80)])?.kind).toBe('no-room');
    expect(angleSumImpossibility(TRI, [ang('A', 'B', 'C', 100), ang('A', 'C', 'B', 100)])?.kind, 'a strict excess keeps its own verdict').toBe('excess');
  });

  it('#1936: a stated ⟂ of the ring’s two edges at a vertex is a 90° interior angle, in any letter order', () => {
    const perp = (a: string, b: string, c: string, d: string, seat?: true): Constraint => ({ type: 'perpendicular', a, b, c, d, ...(seat ? { seat } : {}) }) as Constraint;
    expect(angleSumImpossibility(TRI, [perp('A', 'B', 'B', 'C'), perp('A', 'C', 'B', 'C')])?.kind).toBe('no-room');
    expect(angleSumImpossibility(TRI, [perp('B', 'A', 'C', 'B'), ang('A', 'C', 'B', 90)])?.kind).toBe('no-room');
    expect(angleSumImpossibility(TRI, [perp('A', 'B', 'B', 'C'), ang('A', 'C', 'B', 89)])).toBeNull();
    // the noun's DEFAULT seat is not a statement: it yields (ADR-551 Am. 1) and is never counted
    expect(angleSumImpossibility(TRI, [perp('C', 'A', 'C', 'B', true), ang('A', 'B', 'C', 90)])).toBeNull();
    // a ⟂ to a segment outside the ring is no interior angle
    expect(angleSumImpossibility(TRI, [perp('A', 'B', 'B', 'D'), ang('A', 'C', 'B', 90)])).toBeNull();
  });

  it('#1936: a quadrilateral keeps room for its unstated angle — three right angles build, a concave ring is never refused', () => {
    const perp = (a: string, b: string, c: string, d: string): Constraint => ({ type: 'perpendicular', a, b, c, d }) as Constraint;
    expect(angleSumImpossibility(QUAD, [perp('A', 'B', 'B', 'C'), perp('B', 'C', 'C', 'D'), perp('C', 'D', 'D', 'A')])).toBeNull();
    expect(angleSumImpossibility(QUAD, [perp('A', 'B', 'B', 'C'), perp('B', 'C', 'C', 'D'), perp('C', 'D', 'D', 'A'), perp('D', 'A', 'A', 'B')])).toBeNull();
    expect(angleSumImpossibility(QUAD, [ang('A', 'B', 'C', 200), ang('B', 'C', 'D', 100)])).toBeNull();
    expect(angleSumImpossibility(QUAD, [ang('D', 'A', 'B', 120), ang('A', 'B', 'C', 120), ang('B', 'C', 'D', 120)])?.kind).toBe('no-room');
  });

  it('only INTERIOR angles are summed — a diagonal’s angle and an arc measure say nothing about the ring', () => {
    // ∠ABD on ABCD is between a side and a diagonal; ∠ABC with arcOf is an arc at a centre
    expect(angleSumImpossibility(QUAD, [ang('A', 'B', 'D', 300), ang('B', 'C', 'D', 100)])).toBeNull();
    expect(angleSumImpossibility(TRI, [ang('A', 'B', 'C', 300, 'circle-B')])).toBeNull();
    // the ray order the student wrote does not matter
    expect(angleSumImpossibility(TRI, [ang('C', 'B', 'A', 100), ang('B', 'C', 'A', 100)])?.sum).toBe(200);
  });

  it('not a triangle rule: a quadrilateral is bounded by 360°, and one reflex angle in it is still a figure', () => {
    expect(angleSumImpossibility(QUAD, [ang('A', 'B', 'C', 200)])).toBeNull();
    const m = angleSumImpossibility(QUAD, [ang('D', 'A', 'B', 100), ang('A', 'B', 'C', 100), ang('B', 'C', 'D', 100), ang('C', 'D', 'A', 100)]);
    expect(m?.sum).toBe(400);
    expect(m?.bound).toBe(360);
  });

  it('two values stated for one angle: the smaller is summed, so the verdict stays sound', () => {
    expect(angleSumImpossibility(TRI, [ang('A', 'B', 'C', 100), ang('A', 'B', 'C', 30), ang('A', 'C', 'B', 100)])).toBeNull();
  });

  it('the student reads it in Hebrew, with the curriculum’s sentence for a triangle and the ring’s own bound otherwise', () => {
    const tri = humanizeError('impossible: the angles of ABC sum to 200°, exceeding 180°: ∠ABC = 100°, ∠ACB = 100°', t);
    expect(tri).toContain('180°');
    expect(tri).toContain('∠ABC = 100°');
    expect(tri).toContain('200°');
    const quad = humanizeError('impossible: the angles of ABCD sum to 400°, exceeding 360°: ∠DAB = 100°, ∠ABC = 100°, ∠BCD = 100°, ∠CDA = 100°', t);
    expect(quad).toContain('ABCD');
    expect(quad).toContain('360°');
  });
});

describe('end to end — the reported sequence through the real parse → replay path', () => {
  it('«∠ABC = 100» · «∠ACB = 100» is a hard refusal naming the angles and the bound, never pending, and the prior triangle stands', () => {
    const fig = replay(factsOf(['משולש ABC', '∠ABC = 100', '∠ACB = 100'] as never));
    expect(fig.lastError).toBe('impossible: the angles of ABC sum to 200°, exceeding 180°: ∠ABC = 100°, ∠ACB = 100°');
    expect(fig.pending).toBe(false);
    const p = (id: string) => fig.positions.get(id)!;
    const A = p('A'), B = p('B'), C = p('C');
    const ux = A.x - B.x, uy = A.y - B.y, vx = C.x - B.x, vy = C.y - B.y;
    expect((Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))) * 180) / Math.PI).toBeCloseTo(100, 1);
  });

  it('a single «∠ABC = 200» on a triangle is refused the same way, not pending', () => {
    const fig = replay(factsOf(['משולש ABC', '∠ABC = 200'] as never));
    expect(fig.lastError).toMatch(/^impossible: the angles of ABC sum to 200°, exceeding 180°/);
    expect(fig.pending).toBe(false);
  });

  it('«∠ABC = 90» · «∠ACB = 89» still builds — the 1° apex is a figure', () => {
    const fig = replay(factsOf(['משולש ABC', '∠ABC = 90', '∠ACB = 89'] as never));
    expect(fig.lastError).toBeNull();
    expect(fig.pending).toBe(false);
  });

  it('«∠ABC = 90» · «∠ACB = 90» is refused as the new statement’s over-constraint — #1936: the prover now proves it (no room)', () => {
    const fig = replay(factsOf(['משולש ABC', '∠ABC = 90', '∠ACB = 90'] as never));
    expect(fig.lastError).toMatch(/^over-constrained: ∠ACB = 90° cannot hold/);
    expect(fig.pending).toBe(false);
  });

  it('ADR-417’s own prover is untouched beside it', () => {
    const d = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });
    expect(metricImpossibility([d('A', 'B', 4), d('B', 'C', 4), d('A', 'C', 9)])?.sum).toBe(8);
  });
});
