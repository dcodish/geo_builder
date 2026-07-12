/**
 * Issue #54 — per-circle RADIUS SYMBOLS as first-class measures (the ADR-034 reserved-R auto-bind
 * generalized): bind at creation ("מעגל O שרדיוסו R" — the binding post-pass, ADR-119 chokepoint
 * pattern, so every circle rule gains the clause at once), bind after the fact ("רדיוס מעגל P הוא r"
 * — the operator's requested form), and relations between bound letters — order "R > r" (lowered to
 * the ADR-244 `set-radius-order` requirement, independent-circles edition), ratio "R = 1.5r" /
 * "R/r = 2√7/5" (lowered to `set-radius-ratio` → an ordinary `ratio` over (centre, witness) pairs,
 * zero new solver code). R and r are DISTINCT (bagrut convention); an UNBOUND R/r still falls back to
 * the legacy single-circle bind (ADR-071), so old figures are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed, meetsRequirements, dryRunOutcome } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (got ${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const radii = (facts: Fact[]) => {
  const fig = replay(facts, firstSatisfyingSeed(facts));
  expect(fig.lastError).toBeNull();
  expect(fig.violations).toEqual([]);
  return { fig, r: (id: string) => fig.circles.get(id)!.r };
};

describe('issue #54 — radius symbols', () => {
  it.each([
    ['He creation', ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r']],
    ['En creation', ['circle O with radius R', 'circle P with radius r']],
    ['He after-the-fact', ['מעגל O', 'מעגל P', 'רדיוס מעגל O הוא R', 'רדיוס מעגל P הוא r']],
    ['En after-the-fact', ['circle O', 'circle P', 'radius of circle O is R', 'radius of circle P is r']],
  ])('%s binds each letter to ITS circle (case-sensitive)', (_t, lines) => {
    const facts = runLines(lines);
    const binds = facts.filter((f) => f.cmd.type === 'radius-symbol').map((f) => f.cmd as Extract<AnyCommand, { type: 'radius-symbol' }>);
    expect(binds).toEqual([
      expect.objectContaining({ circle: 'circle-O', name: 'R' }),
      expect.objectContaining({ circle: 'circle-P', name: 'r' }),
    ]);
    // the context exposes the bindings for later relations
    const ctx = ctxOf(facts);
    expect(ctx.radiusSymbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'R', circle: 'circle-O' }), expect.objectContaining({ name: 'r', circle: 'circle-P' })]),
    );
  });

  it('any letter binds, not only R/r ("שרדיוסו T")', () => {
    const facts = runLines(['מעגל O שרדיוסו T']);
    expect(facts.some((f) => f.cmd.type === 'radius-symbol' && (f.cmd as { name?: string }).name === 'T')).toBe(true);
  });

  it('"R = 1.5r" DRIVES the ratio between the two radii', () => {
    const facts = runLines(['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R = 1.5r']);
    const { r } = radii(facts);
    expect(r('circle-O') / r('circle-P')).toBeCloseTo(1.5, 4);
  });

  it('"R/r = 2√7/5" (radical quotient k) drives too', () => {
    const facts = runLines(['circle O with radius R', 'circle P with radius r', 'R/r = 2√7/5']);
    const { r } = radii(facts);
    expect(r('circle-O') / r('circle-P')).toBeCloseTo((2 * Math.sqrt(7)) / 5, 4);
  });

  it('"R > r" lowers to the radius-order REQUIREMENT (independent circles, no concentric marker)', () => {
    const facts = runLines(['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R > r']);
    const ord = facts.find((f) => f.cmd.type === 'set-radius-order')!.cmd as Extract<AnyCommand, { type: 'set-radius-order' }>;
    expect(ord).toMatchObject({ outer: 'circle-O', inner: 'circle-P' });
    // independent circles: the concentric-pair marker must NOT be stamped (no qualifier-redirect side effects)
    const fig = replay(facts);
    expect(fig.construction.objects.some((o) => o.kind === 'circle' && o.innerOf)).toBe(false);
    // and the app's config search can find a satisfying config (meetsRequirements gates on the verifier)
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some((s) => meetsRequirements(facts, s))).toBe(true);
  });

  it('"r < R" (mirrored slots) lowers to the SAME order', () => {
    const facts = runLines(['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r']);
    const r = parse('r < R', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'set-radius-order', outer: 'circle-O', inner: 'circle-P' }]);
  });

  it('a measure "AB = 2R" couples to the BOUND circle, not "the first" circle', () => {
    const facts = runLines(['מעגל P שרדיוסו r', 'מעגל O שרדיוסו R', 'A על מעגל O', 'B על מעגל O', 'AB = 2R']);
    const { fig, r } = radii(facts);
    // |AB| = 2·radius(circle-O) — the R-bound circle, even though circle-P was created first
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!;
    expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeCloseTo(2 * r('circle-O'), 4);
  });

  it('the data-statement gate: an after-the-fact binding and a bare "R > r" are PRODUCED, never "empty"', () => {
    const facts = runLines(['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r']);
    const bind = parse('רדיוס מעגל O הוא T', ctxOf(facts));
    expect(bind.ok).toBe(true);
    if (bind.ok) expect(dryRunOutcome(facts, bind.commands).produced).toBe(true);
    const ord = parse('R > r', ctxOf(facts));
    expect(ord.ok).toBe(true);
    if (ord.ok) expect(dryRunOutcome(facts, ord.commands).produced).toBe(true);
  });

  it('defers honestly: a relation over UNBOUND letters is not a radius statement', () => {
    expect(parse('R = 1.5r', {}).ok).toBe(false);
    expect(parse('R > r', {}).ok).toBe(false);
    const oneCircle = runLines(['מעגל O שרדיוסו R']);
    expect(parse('R = 1.5r', ctxOf(oneCircle)).ok).toBe(false); // r unbound — escalate, never guess
  });

  it('no-theft: numeric radius forms are untouched', () => {
    const facts = runLines(['מעגל O']);
    const r = parse('רדיוס מעגל O הוא 4', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'set-radius', circle: 'circle-O', value: 4 }]);
  });

  it('legacy: a single unbound-R circle + "AB = 2R" behaves as before (couples to the one circle)', () => {
    const facts = runLines(['נתון מעגל שרדיוסו R', 'מנקודה A יוצא משיק למעגל בנקודה B', 'AB = 2R']);
    const { fig, r } = radii(facts);
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!;
    expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeCloseTo(2 * r('circle-O'), 4);
  });
});
