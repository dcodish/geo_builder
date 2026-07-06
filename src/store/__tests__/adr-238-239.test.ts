/**
 * ADR-238 (degenerate parking + hoist-from-pending) & ADR-239 (the common-tangent construct's
 * soft pairing) — the two-tangent-circles corpus.
 *
 * Class tests (design-rules §6), sibling to scenario `shared-touch-tangents-sizes-last` /
 * `common-tangent-two-circles` / `common-tangent-at-shared-touch`:
 *  - the anti-collapse RETRY: a driven carrier with manifold slack must not park at its own
 *    constraint's collapse point (N hugging the touch M);
 *  - HOIST runs from the PENDING state: entry order must not change satisfiability (M2/ADR-104);
 *  - the common-tangent softPair: the default touch↔circle pairing yields to a later explicit
 *    membership (M4), is kept when the default is confirmed, and stands when both are stated.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}
function build(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const group = `g${g++}`;
    const r = parse(step, ctxOf(facts));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
}
const P = (fig: ReturnType<typeof replay>, id: string) => {
  const v = fig.positions.get(id);
  if (!v) throw new Error(`no position for ${id}`);
  return v;
};
const dist = (fig: ReturnType<typeof replay>, a: string, b: string) => {
  const p = P(fig, a), q = P(fig, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('ADR-238 — anti-collapse (degenerate parking)', () => {
  it('a tangent-from-N solve does not park N on the touch point M', () => {
    // Sizes first so the figure has a fixed scale, then the tangents from N to circle O1 at M and B.
    // Pre-fix the driven ⟂ solve parked N at the regularised-NEAREST point of its manifold — ON M
    // (the residual's own collapse point), a wedge every later constraint then tripped over.
    const fig = replay(build(['שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M', 'O1M=9', 'O2M=16', 'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B']));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    // Healthy = outside the anti-collapse margin (5% of the local solve extent) — the semantic bound
    // the barrier enforces, not a magic distance. Pre-fix N parked at ~0.4 (≈4.7% — inside).
    const ext = ['O1', 'M', 'N', 'B'].reduce((m, id) => Math.max(m, Math.abs(P(fig, id).x), Math.abs(P(fig, id).y)), 1);
    expect(dist(fig, 'N', 'M'), '|NM| healthy — N escaped the degenerate-parking margin').toBeGreaterThanOrEqual(0.05 * ext);
    expect(dist(fig, 'N', 'B'), 'equal tangents |NB| = |NM|').toBeCloseTo(dist(fig, 'N', 'M'), 2);
  });
});

describe('ADR-238 — hoist runs from the pending state', () => {
  it('sizes typed last build the same figure the sizes-first order builds', () => {
    // Pre-fix the last size ended `deferred-constraint` FOREVER (pending gated HOIST out), with the
    // radius collapsed. The same facts sizes-first build clean — proof it was never under-determined.
    const last = replay(build(['שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M', 'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B', 'מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A', 'O1M=9', 'O2M=16']));
    for (const [id, s] of Object.entries(last.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(last.pending, 'not stuck pending — the complete given set is here').toBe(false);
    expect(dist(last, 'O1', 'M'), 'r1 = 9').toBeCloseTo(9, 2);
    expect(dist(last, 'O2', 'M'), 'r2 = 16').toBeCloseTo(16, 2);
    expect(dist(last, 'O1', 'O2'), 'externally tangent at the stated sizes').toBeCloseTo(25, 2);
  });
});

describe('ADR-239 — common-tangent softPair (M4 defaults yield)', () => {
  const opener = 'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M';
  const ct = 'AB משיק משותף לשני המעגלים';

  it('the rule emits the pairing as softPair, stated order (He + En)', () => {
    for (const utt of [ct, 'AB is a common tangent to the two circles']) {
      const facts = build([opener]);
      const r = parse(utt, ctxOf(facts));
      expect(r.ok, utt).toBe(true);
      if (!r.ok) continue;
      const on = r.commands.filter((c): c is Extract<AnyCommand, { type: 'point-on-circle' }> => c.type === 'point-on-circle');
      expect(on.map((c) => [c.id, c.circle, c.softPair])).toEqual([
        ['A', 'circle-O1', true],
        ['B', 'circle-O2', true],
      ]);
    }
  });

  it('a later explicit membership on the OPPOSITE circle swaps the pair (and its radius-⟂ centres)', () => {
    // "tangents from N to O1 at M and B" states B on O1 — the reverse of the default A→O1.
    const fig = replay(build([opener, ct, 'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B', 'O1M=9', 'O2M=16']));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(dist(fig, 'O1', 'B'), 'B rides O1 (the swap fired)').toBeCloseTo(9, 1);
    expect(dist(fig, 'O2', 'A'), 'A rides O2').toBeCloseTo(16, 1);
  });

  it('an explicit membership CONFIRMING the default keeps the stated order', () => {
    const fig = replay(build([opener, ct, 'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו A', 'O1M=9', 'O2M=16']));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(dist(fig, 'O1', 'A'), 'A stays on O1 (default confirmed, no swap)').toBeCloseTo(9, 1);
    expect(dist(fig, 'O2', 'B'), 'B stays on O2').toBeCloseTo(16, 1);
  });
});
