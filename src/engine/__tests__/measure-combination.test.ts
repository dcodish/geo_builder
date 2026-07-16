/**
 * Compound measure relations — the ENGINE half (#153/#145/#154/#144).
 *
 * Two new constraint kinds, wired the set-perimeter way:
 *  - `measure-sum`     Σ coefᵢ·mᵢ = target over same-unit measures (lengths stride-2 / angles stride-3);
 *  - `length-product`  k·∏|lhs pairs| = ∏|rhs pairs| (log-domain residual, power-of-a-point).
 *
 * Covers: residual values + signs, the log NaN guard, tautology-as-check, drive-vs-check (a free DOF
 * is driven on an under-determined figure; a determined contradiction is refused keep-prior), the
 * degenerate-by-id guard (ADR-202 class), verifier re-derivation, and the similarity-gauge entries.
 */
import { describe, it, expect } from 'vitest';
import { applyStep, build, dist, angleDeg } from '@/engine';
import { residual, constraintScale, residualTolerance, describeConstraint } from '@/engine/solve';
import { freeDofCount } from '@/engine/sample';
import { checkGivens } from '@/engine/verify';
import { evaluate } from '@/engine';
import type { AnyCommand, Command, Constraint, Id, Vec } from '@/engine';

const c = (o: object) => o as unknown as Command;
const pos = (m: Record<string, [number, number]>) => (id: Id): Vec => {
  const p = m[id];
  if (!p) throw new Error(`no position for ${id}`);
  return { x: p[0], y: p[1] };
};

// ── residuals ────────────────────────────────────────────────────────────────

describe('measure-sum residual', () => {
  it('length: Σ coef·|pair| − target, signed', () => {
    const get = pos({ A: [0, 0], B: [3, 0], C: [0, 1], D: [4, 1] });
    // |AB| + |CD| = 10  →  3 + 4 − 10 = −3
    const con: Constraint = { type: 'measure-sum', unit: 'length', coefs: [1, 1], points: ['A', 'B', 'C', 'D'], target: 10 };
    expect(residual(con, get)).toBeCloseTo(-3, 12);
  });

  it('length relative (Σ=Σ as negated coefs, target 0)', () => {
    const get = pos({ A: [0, 0], B: [3, 0], C: [0, 1], D: [4, 1], E: [0, 2], F: [7, 2] });
    // |AB| + |CD| = |EF|  →  3 + 4 − 7 = 0
    const con: Constraint = { type: 'measure-sum', unit: 'length', coefs: [1, 1, -1], points: ['A', 'B', 'C', 'D', 'E', 'F'], target: 0 };
    expect(residual(con, get)).toBeCloseTo(0, 12);
  });

  it('angle: vertex is the MIDDLE id of each stride-3 term (∠ABC reading order)', () => {
    const get = pos({ A: [1, 0], B: [0, 0], C: [0, 1], D: [1, 1] });
    // ∠ABC = 90 here; ∠ABC + ∠ABC = 180 → 0
    const con: Constraint = { type: 'measure-sum', unit: 'angle', coefs: [1, 1], points: ['A', 'B', 'C', 'A', 'B', 'C'], target: 180 };
    expect(angleDeg(get('B'), get('A'), get('C'))).toBeCloseTo(90, 9);
    expect(residual(con, get)).toBeCloseTo(0, 9);
  });

  it('coefficients scale their term', () => {
    const get = pos({ A: [0, 0], B: [3, 0], C: [0, 1], D: [4, 1] });
    // 2·|AB| − |CD| = 0 → 6 − 4 = 2
    const con: Constraint = { type: 'measure-sum', unit: 'length', coefs: [2, -1], points: ['A', 'B', 'C', 'D'], target: 0 };
    expect(residual(con, get)).toBeCloseTo(2, 12);
  });
});

describe('length-product residual (log domain)', () => {
  it('k·∏lhs = ∏rhs → 0 at the root; signed elsewhere', () => {
    const get = pos({ D: [0, 0], M: [2, 0], E: [5, 0], B: [0, 3], R: [0, 7] });
    // |DM|·|ME| = |BM|·? — build a true one: |DM|=2, |ME|=3, so lhs ∏ = 6; rhs: |DB'|… use pairs with ∏ 6:
    // |B R|=4 won't do alone; use rhs = [D,M],[E,M] → same 6 via different listing.
    const con: Constraint = { type: 'length-product', k: 1, lhs: ['D', 'M', 'M', 'E'], rhs: ['M', 'D', 'E', 'M'] };
    expect(residual(con, get)).toBeCloseTo(0, 12);
    const off: Constraint = { type: 'length-product', k: 1, lhs: ['D', 'M', 'M', 'E'], rhs: ['B', 'R', 'D', 'M'] };
    // log(2·3) − log(4·2) = log(6/8) < 0
    expect(residual(off, get)).toBeCloseTo(Math.log(6 / 8), 12);
  });

  it('a collapsed factor returns NaN (never ±∞) — the solver-skip discipline', () => {
    const get = pos({ D: [0, 0], M: [0, 0], E: [5, 0], B: [0, 3], R: [0, 7] });
    const con: Constraint = { type: 'length-product', k: 1, lhs: ['D', 'M', 'M', 'E'], rhs: ['B', 'R', 'B', 'R'] };
    expect(Number.isNaN(residual(con, get))).toBe(true);
  });

  it('k multiplies the LHS: 4·|DM|² = |BM|·|ME| forms', () => {
    const get = pos({ D: [0, 0], M: [1, 0], B: [-3, 0], E: [3, 0] });
    // |DM|=1, |BM|=4, |ME|=2 → 4·1·1 = 8? no: residual = log4 + 2·log1 − log(4·2) = log(4/8) < 0
    const con: Constraint = { type: 'length-product', k: 4, lhs: ['D', 'M', 'D', 'M'], rhs: ['B', 'M', 'M', 'E'] };
    expect(residual(con, get)).toBeCloseTo(Math.log(4 / 8), 12);
  });
});

// ── scale & tolerance ────────────────────────────────────────────────────────

describe('constraintScale / residualTolerance', () => {
  const get = pos({ A: [0, 0], B: [30, 0], C: [0, 1], D: [4, 1] });

  it('absolute length sum scales to |target| (perimeter precedent)', () => {
    const con: Constraint = { type: 'measure-sum', unit: 'length', coefs: [1, 1], points: ['A', 'B', 'C', 'D'], target: 50 };
    expect(constraintScale(con, get)).toBe(50);
  });

  it('relative length sum scales to its LARGEST |coef|·term (max, not mean — anti-gaming)', () => {
    const con: Constraint = { type: 'measure-sum', unit: 'length', coefs: [1, -2], points: ['A', 'B', 'C', 'D'], target: 0 };
    expect(constraintScale(con, get)).toBeCloseTo(30, 9); // max(1·30, 2·4)
  });

  it('angle sum is scale-free (1) with the ANGLE_EPS tolerance', () => {
    const con: Constraint = { type: 'measure-sum', unit: 'angle', coefs: [1, 1], points: ['A', 'B', 'C', 'A', 'B', 'C'], target: 180 };
    expect(constraintScale(con, get)).toBe(1);
    expect(residualTolerance(con, 1)).toBeLessThanOrEqual(0.5); // the degree-family tolerance, not a length one
  });

  it('length-product is scale-free (log residual) with a per-factor budget', () => {
    const con: Constraint = { type: 'length-product', k: 1, lhs: ['A', 'B', 'C', 'D'], rhs: ['A', 'B', 'C', 'D'] };
    expect(constraintScale(con, get)).toBe(1);
    expect(residualTolerance(con, 1)).toBeCloseTo(4 * 2e-4, 9); // (4+4 ids)/2 = 4 factors · 2e-4 per-factor budget
  });
});

// ── describe ─────────────────────────────────────────────────────────────────

describe('describeConstraint', () => {
  it('reassembles the sum equation (negated coefs back on the right, °-suffixed angle target)', () => {
    expect(
      describeConstraint({ type: 'measure-sum', unit: 'length', coefs: [1, 1, -1], points: ['A', 'B', 'C', 'D', 'E', 'F'], target: 0 }),
    ).toBe('|AB| + |CD| = |EF|');
    expect(
      describeConstraint({ type: 'measure-sum', unit: 'angle', coefs: [1, 1], points: ['A', 'B', 'C', 'D', 'E', 'F'], target: 180 }),
    ).toBe('∠ABC + ∠DEF = 180°');
  });

  it('renders the product with · and elides k = 1', () => {
    expect(describeConstraint({ type: 'length-product', k: 1, lhs: ['D', 'M', 'M', 'E'], rhs: ['B', 'M', 'D', 'R'] })).toBe(
      '|DM|·|ME| = |BM|·|DR|',
    );
    expect(describeConstraint({ type: 'length-product', k: 4, lhs: ['D', 'M', 'D', 'M'], rhs: ['B', 'M', 'M', 'E'] })).toBe(
      '4·|DM|·|DM| = |BM|·|ME|',
    );
  });
});

// ── apply: drive vs check, tautology, degenerate guard ──────────────────────

/** A square ABCD with a FREE rider E on CB — one drivable DOF. */
function squareWithRider(): AnyCommand[] {
  return [c({ type: 'square', ids: ['A', 'B', 'C', 'D'] }), c({ type: 'point-on-segment', id: 'E', a: 'C', b: 'B' })];
}

describe('drive vs check', () => {
  it('an under-determined figure is DRIVEN: |CE| + |EB| = |AB| holds by construction; 2·|CE| = |EB| moves E', () => {
    const { construction } = build([
      ...squareWithRider(),
      c({ type: 'set-measure-sum', unit: 'length', coefs: [2, -1], points: ['C', 'E', 'E', 'B'], target: 0 }),
    ]);
    const r = evaluate(construction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ce = dist(r.positions.get('C')!, r.positions.get('E')!);
    const eb = dist(r.positions.get('E')!, r.positions.get('B')!);
    expect(2 * ce).toBeCloseTo(eb, 6); // E driven to t = 1/3
  });

  it('a length-product drives the same DOF: |CE|·|CB| = |EB|·|EB| (E lands at the golden-section t)', () => {
    const { construction } = build([
      ...squareWithRider(),
      c({ type: 'set-length-product', k: 1, lhs: ['C', 'E', 'C', 'B'], rhs: ['E', 'B', 'E', 'B'] }),
    ]);
    const r = evaluate(construction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ce = dist(r.positions.get('C')!, r.positions.get('E')!);
    const cb = dist(r.positions.get('C')!, r.positions.get('B')!);
    const eb = dist(r.positions.get('E')!, r.positions.get('B')!);
    expect(ce * cb).toBeCloseTo(eb * eb, 6); // t² = 1·(1−t) → t = (√5−1)/2 of CB from B side
  });

  it('a DETERMINED contradiction is refused keep-prior (check path, honest over-constraint)', () => {
    const { construction } = build([c({ type: 'square', ids: ['A', 'B', 'C', 'D'] })]);
    // |AB| + |BC| = |CD| is impossible on any square (s + s = s).
    const r = applyStep(construction, c({ type: 'set-measure-sum', unit: 'length', coefs: [1, 1, -1], points: ['A', 'B', 'B', 'C', 'C', 'D'], target: 0 }));
    expect(r.ok).toBe(false);
  });

  it('an angle-sum drives a shape DOF: ∠BAD + ∠ABC = 180 on a QUADRILATERAL flexes it (AD ∥ BC follows)', () => {
    const { construction } = build([
      c({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }),
      c({ type: 'set-measure-sum', unit: 'angle', coefs: [1, 1], points: ['B', 'A', 'D', 'A', 'B', 'C'], target: 180 }),
    ]);
    const r = evaluate(construction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a1 = angleDeg(r.positions.get('A')!, r.positions.get('B')!, r.positions.get('D')!);
    const a2 = angleDeg(r.positions.get('B')!, r.positions.get('A')!, r.positions.get('C')!);
    expect(a1 + a2).toBeCloseTo(180, 3);
  });
});

describe('tautology guard (the equal/ratio "DF = DF" sibling)', () => {
  it('«AB + CD = CD + AB» is a passing CHECK, not a driven collapse', () => {
    const { construction } = build([
      ...squareWithRider(),
      c({ type: 'set-measure-sum', unit: 'length', coefs: [1, 1, -1, -1], points: ['A', 'B', 'C', 'D', 'C', 'D', 'B', 'A'], target: 0 }),
    ]);
    const r = evaluate(construction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // E untouched at its default (not slid to a degenerate root-of-everything placement).
    const e = r.positions.get('E')!;
    const cAt = r.positions.get('C')!;
    const b = r.positions.get('B')!;
    expect(dist(e, cAt)).toBeGreaterThan(1e-6);
    expect(dist(e, b)).toBeGreaterThan(1e-6);
  });

  it('«DM·ME = ME·DM» passes as a check; k≠1 on the same sides honestly fails', () => {
    const base = squareWithRider();
    const ok = evaluate(build([...base, c({ type: 'set-length-product', k: 1, lhs: ['A', 'B', 'C', 'D'], rhs: ['C', 'D', 'A', 'B'] })]).construction);
    expect(ok.ok).toBe(true);
    const bad = applyStep(
      build(base).construction,
      c({ type: 'set-length-product', k: 2, lhs: ['A', 'B', 'C', 'D'], rhs: ['C', 'D', 'A', 'B'] }),
    );
    expect(bad.ok).toBe(false); // 2·x = x has no non-degenerate solution
  });
});

describe('degenerate-by-id guard (ADR-202 class)', () => {
  it('a repeated-point length pair in a sum is rejected fast', () => {
    const { construction } = build(squareWithRider());
    const t0 = Date.now();
    const r = applyStep(construction, c({ type: 'set-measure-sum', unit: 'length', coefs: [1, -1], points: ['A', 'A', 'C', 'D'], target: 0 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/distinct points/);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('an angle term repeating its vertex is rejected', () => {
    const { construction } = build(squareWithRider());
    const r = applyStep(construction, c({ type: 'set-measure-sum', unit: 'angle', coefs: [1, 1], points: ['A', 'A', 'B', 'C', 'B', 'A'], target: 90 }));
    expect(r.ok).toBe(false);
  });

  it('a repeated-point product factor (NaN-everywhere log residual) is rejected fast', () => {
    const { construction } = build(squareWithRider());
    const t0 = Date.now();
    const r = applyStep(construction, c({ type: 'set-length-product', k: 1, lhs: ['A', 'A', 'C', 'D'], rhs: ['A', 'B', 'C', 'D'] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/distinct points/);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

// ── verifier & DOF gauge ─────────────────────────────────────────────────────

describe('verifier re-derivation (ADR-053)', () => {
  it('a satisfied driven sum verifies clean; green means VERIFIED', () => {
    const cmds: AnyCommand[] = [
      ...squareWithRider(),
      c({ type: 'set-measure-sum', unit: 'length', coefs: [2, -1], points: ['C', 'E', 'E', 'B'], target: 0 }),
    ];
    const { construction } = build(cmds);
    const r = evaluate(construction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = checkGivens(cmds as Command[], r.positions, r.circles ?? new Map());
    expect(v.filter((x) => x.relation === 'measure-sum')).toHaveLength(0);
  });

  it('the verifier catches a sum the coordinates do NOT satisfy (no silent blindness)', () => {
    // Assemble a figure, then verify a WRONG sum against it directly — must be flagged.
    const base: AnyCommand[] = [c({ type: 'square', ids: ['A', 'B', 'C', 'D'] })];
    const { construction } = build(base);
    const r = evaluate(construction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const wrong: Command[] = [c({ type: 'set-measure-sum', unit: 'length', coefs: [1, 1, -1], points: ['A', 'B', 'B', 'C', 'C', 'D'], target: 0 })];
    const v = checkGivens(wrong, r.positions, r.circles ?? new Map());
    expect(v.some((x) => x.relation === 'measure-sum')).toBe(true);
  });
});

describe('similarity gauge (DOF cue honesty)', () => {
  it('an ABSOLUTE length sum pins the scale (like a perimeter): lone square reads 0 either way', () => {
    const withAbs = build([
      c({ type: 'square', ids: ['A', 'B', 'C', 'D'] }),
      c({ type: 'set-measure-sum', unit: 'length', coefs: [1, 1], points: ['A', 'B', 'B', 'C'], target: 20 }),
    ]).construction;
    expect(freeDofCount(withAbs)).toBe(0);
  });

  it('a RELATIVE sum / a product does NOT double-count the scale gauge', () => {
    const rel = build([
      ...squareWithRider(),
      c({ type: 'set-measure-sum', unit: 'length', coefs: [2, -1], points: ['C', 'E', 'E', 'B'], target: 0 }),
    ]).construction;
    // square (0 shape DOF) + rider E (1) − the driving sum (1) = 0
    expect(freeDofCount(rel)).toBe(0);
  });
});
