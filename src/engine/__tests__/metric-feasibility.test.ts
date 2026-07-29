/**
 * #420 / ADR-417 — a metrically IMPOSSIBLE system of pinned distances is refused honestly and instantly.
 *
 * The operator's figure («AB = 4, BC = 4, AC = 9» on a circle) was reported as a PENDING info state
 * («הנתון נרשם אך לא משפיע בינתיים על הצורה») after 27.8 s, because `constraintIsPending` asks whether
 * the residual MOVES across a few seeds — which it does here (the free radius and placement change |AC|)
 * — rather than whether it can reach ZERO, which the triangle inequality forbids forever.
 *
 * The check is sound in ONE direction: a violation proves impossibility; passing proves nothing. So the
 * tests below come in pairs — the impossible case refuses, and the satisfiable/under-determined sibling
 * must keep behaving exactly as before.
 */

import { describe, expect, it } from 'vitest';
import { metricImpossibility } from '../metricFeasibility';
import { run } from '@/__tests__/scenarios-harness';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import type { Constraint } from '../types';

const t: Translate = (k, o) => i18n.t(k, o) as string;
const d = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });

describe('metricImpossibility — the pure check', () => {
  it('flags a triangle violating the inequality, naming the path', () => {
    const m = metricImpossibility([d('A', 'B', 4), d('B', 'C', 4), d('A', 'C', 9)]);
    expect(m).not.toBeNull();
    expect([m!.a, m!.b].sort()).toEqual(['A', 'C']);
    expect(m!.value).toBe(9);
    expect(m!.sum).toBe(8);
    expect(m!.via).toEqual(['B']);
  });

  it('accepts a REALISABLE triangle (3-4-5) and a flat one (equality is a real, collinear figure)', () => {
    expect(metricImpossibility([d('A', 'B', 3), d('B', 'C', 4), d('A', 'C', 5)])).toBeNull();
    expect(metricImpossibility([d('A', 'B', 4), d('B', 'C', 4), d('A', 'C', 8)]), 'flat is realisable').toBeNull();
  });

  it('is general over n — a 4-side pinned quadrilateral is covered by the same rule', () => {
    const m = metricImpossibility([d('A', 'B', 1), d('B', 'C', 1), d('C', 'D', 1), d('A', 'D', 9)]);
    expect(m).not.toBeNull();
    expect(m!.sum, '1 + 1 + 1 around the other way').toBe(3);
    expect(m!.via, 'the intermediate points in path order').toEqual(['B', 'C']);
    // and the satisfiable sibling
    expect(metricImpossibility([d('A', 'B', 1), d('B', 'C', 1), d('C', 'D', 1), d('A', 'D', 2)])).toBeNull();
  });

  it('says nothing when there is no alternative path to bound the edge', () => {
    expect(metricImpossibility([d('A', 'B', 99), d('C', 'D', 1), d('E', 'F', 1)])).toBeNull();
    expect(metricImpossibility([d('A', 'B', 4), d('B', 'C', 4)]), 'no cycle at all').toBeNull();
  });

  it('reads the TIGHTEST value when one edge is pinned twice, so the bound stays valid', () => {
    // |AC| pinned 9 and 2: the 2 is what any path must respect; the 9-vs-2 clash is the solver's business.
    expect(metricImpossibility([d('A', 'B', 4), d('B', 'C', 4), d('A', 'C', 9), d('A', 'C', 2)])).toBeNull();
  });
});

describe('#420 — end to end', () => {
  const STEPS = ['מעגל O', 'A ו-C נמצאות על המעגל', 'משולש ABC', 'AB = 4', 'BC = 4', 'AC = 9'];

  it('refuses the impossible given, and FAST (was 27.8 s and a pending banner)', () => {
    const t0 = Date.now();
    const fig = run(STEPS);
    const ms = Date.now() - t0;
    const last = Object.entries(fig.status).slice(-1)[0]!;
    expect(last[1], 'the last step is refused').not.toBe('ok');
    expect(String(last[1]), 'and refused as IMPOSSIBLE, naming the bound').toMatch(/^impossible: \|AC\| = 9 exceeds 8/);
    // the whole 6-step sequence, cold — the pre-solve gate replaces the ladder for this class
    expect(ms, `whole sequence took ${ms} ms`).toBeLessThan(8000);
  }, 120_000);

  it('the message reads as impossible in Hebrew, naming the path and the sum', () => {
    const msg = humanizeError('impossible: |AC| = 9 exceeds 8, the distance from A to C via B', t);
    expect(msg).toContain('AC');
    expect(msg).toContain('8');
    expect(msg).toContain('B');
    expect(msg).not.toMatch(/[a-z]{2,}/); // #413's property: no English word survives
    expect(msg, 'not the pending wording').not.toBe(i18n.t('figure.pending'));
  });

  it('is NOT reported as pending — the figure carries a hard error', () => {
    const fig = run(STEPS);
    expect(fig.pending, 'a proven contradiction is never an info state').toBe(false);
  }, 120_000);

  it('the same figure with a REALISABLE third side builds clean (the check never over-refuses)', () => {
    // AC = 5 against 4 and 4 is a real triangle, so nothing about this class may touch it.
    const fig = run(['מעגל O', 'A ו-C נמצאות על המעגל', 'משולש ABC', 'AB = 4', 'BC = 4', 'AC = 5']);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `step ${id}`).toBe('ok');
  }, 120_000);
});
