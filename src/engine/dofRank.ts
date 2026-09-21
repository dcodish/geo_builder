/**
 * The RANK of a figure's constraint system — how many independent scalar equations the constraints
 * actually impose at the figure's configuration (#1264, [ADR-536](docs/06-decisions.md#adr-536)).
 *
 * `freeDofCount` used to subtract one per constraint ROW. A row that is a consequence of the others
 * — «AB ⟂ BC» after «∠ABC = 90», the same perpendicular with its operands swapped, a right angle on a
 * square, a collinear the dependency graph already guarantees — then removed a degree of freedom the
 * figure never lost, and the cue read «הכל נקבע» on a figure whose shape still varied across seeds. The
 * count is the same kind of claim as a printed value — a statement about the student's own givens — and
 * it was false. Each such member had been patched by hand as it was reported (the vacuous-collinear
 * predicate of ADR-424, the radial-toward coincide special case), which is the docs/17 §2.1 signal that a
 * mechanism is missing: the mechanism is the rank, and it makes all of them one case.
 *
 * Mechanism: the numeric Jacobian of the constraint residuals with respect to every RAW MOVABLE parameter
 * (the exact universe `rawMovableDof` counts), taken at the SOLVED configuration — `resolveDriven`'s baked
 * construction, whose `evaluateCore` is the drawn figure. A dependent row is a linear combination of the
 * others there, and an identically-satisfied row has a zero gradient; both add no rank. The 3-D engine
 * already measures its pins this way (`pivot.scalarConsumed`, ADR-3D-248); this is the 2-D port of that
 * discipline, at the one place the 2-D count is decided.
 *
 * Fails OPEN, in the honest direction: a row whose gradient cannot be established (an unresolved operand,
 * a collapsed ray's NaN) is returned in `unranked` and the caller counts it as it did before — as an
 * independent row — and a configuration that does not evaluate returns null so the caller keeps the
 * whole previous count. Over-counting freedom withholds a print; under-counting it asserts one.
 *
 * Cost: 2·(movable parameters) `evaluateCore` calls (no solving — the baked construction has no
 * directives), memoised by the caller per construction identity like `evaluate` itself.
 */

import type { Constraint, Construction, Id, Vec } from './types';
import { isOrderConstraint } from './types';
import { constraintRefs, residualRows } from './solve';
import { carrierParams, evaluateCore, resolveDrivenMemo, setCarrierVals } from './evaluate';

/**
 * A row whose gradient, after projecting out the rows already accepted, keeps less than this fraction of
 * its length is DEPENDENT. Rows are unit-normalised first, so this is an angle: 1e-4 ≈ 0.006°. Measured on
 * the reported figure, a dependent pair (⟂ after ∠=90) projects to ~1e-9 and an independent pair to ~0.5;
 * the margin is what tolerates a driven solve that landed 1e-6 off its manifold, where two rows that are
 * parallel ON the manifold are parallel only to that order.
 */
export const RANK_TOL = 1e-4;
/** A row shorter than this (in u-space gradient units) is identically satisfied — a vacuous restatement. */
export const ZERO_ROW_TOL = 1e-7;
/** Central-difference step in u-space (the carrier's value divided by max(1, |value|)) — the solveLM step. */
const H = 1e-6;

export interface RankResult {
  /** What the stated constraints consume: rank(J) minus the solved-point columns — see `constraintRank`; may be negative. */
  consumed: number;
  /** Constraints whose gradient could not be established — the caller counts these as it always did. */
  unranked: Constraint[];
}

/** One parameter of the Jacobian's column space: which carrier, which component, its current values. */
interface Column {
  id: Id;
  idx: number;
  vals: number[];
}

/**
 * The Jacobian rows of `cons` (equalities only — an order/bound constraint is a region, ADR-039) over the
 * movable carriers `movable`, at `c`'s solved configuration. Exported for the lock, which asserts the
 * reported figure's ⟂ row is parallel to its ∠ row rather than trusting the count that follows from it.
 * Returns null when the configuration does not evaluate. A row of NaN marks an operand the figure could
 * not place or a collapsed ray.
 */
export function constraintJacobian(
  c: Construction,
  movable: Id[],
  cons: Constraint[],
): { rows: { con: Constraint; grad: number[] }[]; /** embedded rows of unbaked solved points, appended last */ embedded: number } | null {
  const solvedBaked = resolveDrivenMemo(c);
  const base0 = evaluateCore(solvedBaked, { skipConstraints: true });
  if (!base0.ok) return null;
  /**
   * A closed-form SOLVED point (`on-segment-solved`: its `t` is the root of an embedded constraint,
   * found inside `evaluateCore`) is UNBAKED into a plain on-segment parameter at its solved `t`, and its
   * embedded constraint joins the rows. Differencing THROUGH the closed form instead reads the reduced
   * map t*(params), whose derivative vanishes wherever the embedded residual is stationary in the other
   * parameters — measured on the congruent-triangles figure «AB אנך ל CD» · «BC=BE» · «∠ACB=∠BED» ·
   * «CD=14» · «BD=8», where the derivative of t* with respect to A is 0 at the symmetric solution, which made |BD| read as a multiple of |CD|
   * and a rigid figure count 1. In the unreduced system the row ∂g/∂t ≠ 0 carries the rank the reduction
   * hid. The caller subtracts these rows back out (`embedded`), so a solved point still nets zero in
   * the tally, as its 0-DOF classification says.
   */
  const solvedIds = new Set<Id>();
  const embeddedRows: Constraint[] = [];
  // The solved points are read off the ORIGINAL construction: `resolveDriven` promotes a COUPLED pair of
  // them («BC=BE» solving E while «∠ACB=∠BED» solves B, each referencing the other) to numeric
  // on-segment carriers and bakes their solved `t` with the directive cleared — so in the baked
  // construction such a point is a plain on-segment with no trace of the constraint that placed it.
  // Its column is already there; its row is recovered from the original object.
  const origSolved = new Map(c.objects.filter((o) => o.kind === 'on-segment-solved').map((o) => [o.id, o] as const));
  const baked: Construction = {
    ...solvedBaked,
    objects: solvedBaked.objects.map((o) => {
      const orig = origSolved.get(o.id);
      if (!orig || orig.kind !== 'on-segment-solved') return o;
      if (o.kind === 'on-segment') {
        solvedIds.add(o.id);
        embeddedRows.push(orig.constraint);
        return o;
      }
      if (o.kind !== 'on-segment-solved') return o;
      const p = base0.positions.get(o.id);
      const a = base0.positions.get(o.a);
      const b = base0.positions.get(o.b);
      if (!p || !a || !b) return o;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const den = dx * dx + dy * dy;
      if (den < 1e-18) return o;
      solvedIds.add(o.id);
      embeddedRows.push(o.constraint);
      return { kind: 'on-segment' as const, id: o.id, a: o.a, b: o.b, t: ((p.x - a.x) * dx + (p.y - a.y) * dy) / den };
    }),
  };
  const eqs = [...cons, ...embeddedRows].filter((k) => !isOrderConstraint(k));
  const byId = new Map(baked.objects.map((o) => [o.id, o] as const));
  const cols: Column[] = [];
  for (const id of [...movable, ...solvedIds]) {
    const o = byId.get(id);
    const vals = o ? carrierParams(o) : null;
    if (!vals) continue;
    for (let i = 0; i < vals.length; i++) cols.push({ id, idx: i, vals });
  }
  const rowsAt = (pos: Map<Id, Vec>): number[][] =>
    eqs.map((k) => (constraintRefs(k).every((id) => pos.has(id)) ? residualRows(k, (id) => pos.get(id)!) : [NaN]));
  const base = solvedIds.size ? evaluateCore(baked, { skipConstraints: true }) : base0;
  if (!base.ok) return null;
  const r0 = rowsAt(base.positions);
  // grads[k][i] = the gradient (over every column) of constraint k's i-th residual row
  const grads = r0.map((rs) => rs.map(() => new Array<number>(cols.length).fill(NaN)));
  for (let j = 0; j < cols.length; j++) {
    const { id, idx, vals } = cols[j];
    const s = Math.max(1, Math.abs(vals[idx]));
    const h = H * s;
    const shifted = (d: number) => {
      const v = vals.slice();
      v[idx] += d;
      // An unbaked solved point is written directly: `setCarrierVals` clamps an on-segment `t` to its
      // segment, and a solved foot may legitimately sit beyond it.
      const next = solvedIds.has(id)
        ? { ...baked, objects: baked.objects.map((o) => (o.id === id && o.kind === 'on-segment' ? { ...o, t: v[0] } : o)) }
        : setCarrierVals(baked, new Map([[id, v]]));
      return evaluateCore(next, { skipConstraints: true });
    };
    const plus = shifted(h);
    const minus = shifted(-h);
    // A step that leaves the figure's feasible set — a secant whose sampled seat is so near tangency
    // that 1e-6 past it has no second crossing (measured on the #432 figure at seeds 1 and 2) — is
    // differenced ONE-SIDED from the other step rather than voiding the whole Jacobian: a void falls
    // back to the per-row tally, which is the lie this module exists to retire. Both sides infeasible
    // is the genuine unknown, and the caller keeps its previous count.
    if (!plus.ok && !minus.ok) return null;
    const rp = plus.ok ? rowsAt(plus.positions) : r0;
    const rm = minus.ok ? rowsAt(minus.positions) : r0;
    const span = plus.ok && minus.ok ? 2 * H : H;
    for (let k = 0; k < eqs.length; k++) {
      for (let i = 0; i < r0[k].length; i++) {
        // d/du with u = v/s: (r(v+h) − r(v−h)) / (2h) · s = Δr / (2·H); one-sided: Δr / H
        grads[k][i][j] = (rp[k]?.[i] - rm[k]?.[i]) / span;
      }
    }
  }
  return { rows: eqs.flatMap((con, k) => grads[k].map((grad) => ({ con, grad }))), embedded: embeddedRows.length };
}

const norm = (v: number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0);

/**
 * The rank of the constraint system at the figure's configuration, plus the constraints it could not
 * rank. Null when the configuration itself does not evaluate — the caller keeps its previous count.
 */
export function constraintRank(c: Construction, movable: Id[], cons: Constraint[]): RankResult | null {
  const eqs = cons.filter((k) => !isOrderConstraint(k));
  if (eqs.length === 0) return { consumed: 0, unranked: [] };
  const jac = constraintJacobian(c, movable, cons);
  if (!jac) return null;
  const unranked = new Set<Constraint>();
  const given = new Set(eqs);
  for (const { con, grad } of jac.rows) if (given.has(con) && grad.some((x) => !Number.isFinite(x))) unranked.add(con);
  // Modified Gram–Schmidt over unit-normalised rows, two projection passes for numerical hygiene: a row
  // whose remainder after the accepted basis is below RANK_TOL is dependent; a row that is (near) zero to
  // begin with is identically satisfied. Rank never exceeds the column count.
  // The embedded rows of unbaked solved points go FIRST: they are structural (their point is 0-DOF by
  // classification), so they must never be the row judged dependent on a stated given — the stated
  // given is the one that then reads as adding nothing, which is the honest attribution.
  const basis: number[][] = [];
  for (const { con, grad } of jac.rows) {
    if (unranked.has(con) || grad.some((x) => !Number.isFinite(x))) continue;
    const n0 = norm(grad);
    if (n0 < ZERO_ROW_TOL) continue;
    let v = grad.map((x) => x / n0);
    for (let pass = 0; pass < 2; pass++) for (const b of basis) { const p = dot(v, b); v = v.map((x, i) => x - p * b[i]); }
    const n = norm(v);
    if (n < RANK_TOL) continue;
    basis.push(v.map((x) => x / n));
  }
  // The UNREDUCED count is shape DOF = (raw + solved columns) − rank(J) − gauge. The caller counts raw
  // and the gauge, so what it subtracts is rank(J) − (solved columns): a solved point whose embedded
  // equation is independent nets zero, as its 0-DOF classification says, and one whose equation is
  // REDUNDANT — two solved points on one shared equation (the tangent-quad figure «מרובע GCHF חסום
  // במעגל» · «AB משיק למעגל בנקודה F», where F's |OF| = r IS G's concyclicity) — nets a genuine
  // hidden freedom the figure draws one member of, which is why this can be NEGATIVE.
  return { consumed: basis.length - jac.embedded, unranked: [...unranked] };
}
