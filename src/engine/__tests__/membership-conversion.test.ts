/**
 * Membership CONVERSION at the M1 boundary (issue #236, ADR-384 — M2 law (i), the on-segment edition
 * of apply's on-circle (c2)/ADR-140): «E על AB» about an existing FREE point converts E to the
 * 1-DOF rider the statement declares — t seeded at E's projection, a solve directive E already owns
 * carried whole — instead of keeping a phantom 2-DOF E plus a generic collinear claiming ANOTHER
 * carrier. The class symptom was entry-order dependence: «BC=BE» then «E על AB» wedged
 * over-constrained where the reverse order built (book exercise 74, prod session ne810woo).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, GeoObject } from '@/engine';

const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
const factsOf = (steps: string[]): Fact[] => {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const r = parse(step, ctxOf(facts));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
};
const D = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const objOf = (facts: Fact[], id: string): GeoObject => {
  const o = replay(facts).construction.objects.find((x) => x.id === id);
  if (!o) throw new Error(`no object ${id}`);
  return o;
};

// The #236 book figure (exercise 74): AB⊥CD, B on CD, E on AB, BC=BE, ∠ACB=∠BED, CD=14, BD=8 ⇒ |BC|=|BE|=6.
const AS_TYPED = ['AB אנך ל CD', 'B על CD', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED', 'CD=14', 'BD=8'];
const E_FIRST = ['AB אנך ל CD', 'B על CD', 'E על AB', 'BC=BE', 'ED', 'AC', '∠ACB=∠BED', 'CD=14', 'BD=8'];
const SIZES_EARLY = ['AB אנך ל CD', 'B על CD', 'CD=14', 'BD=8', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED'];
const NO_SIZES = ['AB אנך ל CD', 'B על CD', 'BC=BE', 'E על AB', 'ED', 'AC', '∠ACB=∠BED'];

const bookValues = (steps: string[]) => {
  const facts = factsOf(steps);
  const fig = replay(facts, firstSatisfyingSeed(facts));
  for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
  expect(fig.lastError).toBeNull();
  expect(fig.violations).toEqual([]);
  const P = (id: string) => fig.positions.get(id)!;
  expect(D(P('C'), P('D'))).toBeCloseTo(14, 1);
  expect(D(P('B'), P('D'))).toBeCloseTo(8, 1);
  expect(D(P('B'), P('C'))).toBeCloseTo(6, 1);
  expect(D(P('B'), P('E'))).toBeCloseTo(6, 1);
};

describe('membership conversion (#236, ADR-384)', () => {
  it('the conversion itself: «E על AB» on a busy free E yields a rider carrying the equality directive', () => {
    const facts = factsOf(['AB', 'CD', 'BC=BE', 'E על AB']);
    const e = objOf(facts, 'E') as Extract<GeoObject, { kind: 'on-segment' }>;
    expect(e.kind).toBe('on-segment');
    expect([e.a, e.b].sort()).toEqual(['A', 'B']);
    expect(e.free).toBe(true);
    expect((e as { solve?: { constraint: { type: string } } }).solve?.constraint.type, 'the ADR-140 carry').toBe('equal');
  });

  it('the operator order «BC=BE» → «E על AB» builds to the exact book values (the reported failure)', () => {
    bookValues(AS_TYPED);
  });

  it('the membership-first order builds to the same values (order-independence, M2 law (i))', () => {
    bookValues(E_FIRST);
  });

  it('the no-sizes prefix (part א) builds clean', () => {
    const facts = factsOf(NO_SIZES);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.lastError).toBeNull();
  });

  it('sizes-early builds without a false over-constraint — KNOWN RESIDUAL #258: the equality may settle amber', () => {
    // Before ADR-384 this order hard-failed «over-constrained: E, A, B collinear cannot hold». Now every
    // step applies; the |BC|=|BE| equality can still SETTLE unsatisfied (amber) because an amber-settled
    // driven constraint never re-enters the order-independence machinery (deferral/HOIST fire on
    // failed/pending only) — filed as #258. Asserted as-is so the #258 fix flips this test.
    const facts = factsOf(SIZES_EARLY);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.lastError).toBeNull();
    expect(fig.violations.length, 'KNOWN RESIDUAL #258 — flip to 0 when the amber-settled re-fold lands').toBeLessThanOrEqual(1);
  });

  // ── the conversion's fences ──
  it('a NEW «E על AB» is untouched (plain rider path, no conflict)', () => {
    const facts = factsOf(['AB', 'E על AB']);
    const e = objOf(facts, 'E') as Extract<GeoObject, { kind: 'on-segment' }>;
    expect(e.kind).toBe('on-segment');
    expect(e.free).toBe(true);
  });

  it('a SECOND membership on an existing rider keeps the constraint path — never a silent host swap', () => {
    // The conversion is scoped to FREE-POINT kinds: a rider stays a rider on its FIRST host, and the
    // second membership goes the constraint route. Today that route CONCLUDES over-constrained at the
    // default placement (pre-existing, filed as #260 — the crossing-statement family, rider edition);
    // what this fence locks is the boundary: the kind/host are never silently rewritten, and the
    // failure is an honest error, not a wrong figure.
    const facts = factsOf(['AB', 'P על AB', 'CD', 'P על CD']);
    const p = objOf(facts, 'P');
    expect(p.kind, 'P stays a rider on its first host').toBe('on-segment');
    expect((p as Extract<GeoObject, { kind: 'on-segment' }>).a + (p as Extract<GeoObject, { kind: 'on-segment' }>).b).toBe('AB');
    const fig = replay(facts);
    const bad = Object.values(fig.status).filter((s) => s !== 'ok');
    expect(bad.length === 0 || bad.every((s) => String(s).includes('collinear')), 'built clean OR refused honestly (#260 flips this to clean)').toBe(true);
  });

  it('a PINNED point is never converted — the membership stays a constraint on the stated stretch', () => {
    const facts = factsOf(['AB', 'נקודה E ב-(2,3)', 'E על AB']);
    expect(objOf(facts, 'E').kind, 'a stated coordinate is a given (ADR-052)').toBe('free-point');
    const fig = replay(facts);
    expect(fig.construction.constraints.some((c) => c.type === 'collinear')).toBe(true);
  });

  it('the EXTENSION form keeps the constraint path (an extension rider is not a free-sampled DOF)', () => {
    const facts = factsOf(['BC', 'נקודה D', 'AD', 'D על המשך BC']);
    const fig = replay(facts);
    expect(objOf(facts, 'D').kind).toBe('free-point');
    expect(fig.construction.constraints.some((c) => c.type === 'collinear-order'), 'the beyond-order is kept (ADR-054)').toBe(true);
  });
});
