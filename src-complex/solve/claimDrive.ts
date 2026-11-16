/**
 * #688 — a CLAIM over an undetermined number DRIVES; over a determined one it still only CHECKS.
 *
 * The defect: «z1 מדומה טהור» on its own drew z₁ at 189.12°, nowhere near the imaginary axis, while the
 * panel honestly read `unknown` ("the argument of z1 is not yet determined by the givens"). `verifyClaim`
 * was not at fault — with `arg z1` free there is genuinely nothing to verify, and `unknown` is a
 * first-class answer. The defect is that the tool had no reading for *"the student stated a property of
 * a number that nothing else determines"*, and both readings it did have are wrong:
 *
 *  - as a CLAIM → verdict `unknown`, and the sampler then places z₁ at 189° anyway. That sampled
 *    direction is not neutral: it ASSERTS `arg z1 ≈ 189°`, contradicting what the student just typed.
 *    [ADR-052](../../docs/06-decisions.md#adr-052)'s conformance smell in its worst form — not a default
 *    masquerading as fixed, but a default CONTRADICTING something stated.
 *  - ignoring it → a silently dropped statement.
 *
 * The mechanism already exists in this tree and the claim families never got half of it: `driveOrCheck`.
 * F3/F4 relations do it; ADR-CX-005's roots modes do it (fresh → enumerate, existing free → constrain,
 * determined → verify). The claim families were built check-only. See ADR-CX-029.
 *
 * WHY THE ROWS LOOK LIKE THIS. An argument row carries an integer turn unknown, and that freedom IS the
 * branch set (ADR-CX-006). Squaring the subject is what turns a modular claim into an ordinary row:
 *
 *     imaginary z  ⇒  arg(z²) = arg(−1)  ⇒  2·arg z = ½ + k  ⇒  arg z ∈ {90°, 270°}
 *     real z       ⇒  arg(z²) = arg(1)   ⇒  2·arg z = 0 + k  ⇒  arg z ∈ {0°, 180°}
 *
 * so the two configurations arrive for free and «show another configuration» walks 90° ↔ 270° exactly as
 * it should — no new solver concept, no enumeration of claim kinds inside the solver.
 *
 * THE GUARD IS THE WHOLE SAFETY ARGUMENT: a row is added ONLY where the relevant degree of freedom is
 * free, measured by the tool's own published `freeDof`. If the givens determine the subject, nothing is
 * driven and the claim is verified as before — «z1 = 3+4i» then «z1 מדומה טהור» stays `refuted` and still
 * lands with a ✗. A claim can only move a figure the givens left open, i.e. where there was no answer to
 * get wrong, so *"a claim that could move the figure would make every answer correct"* survives intact.
 */
import type { Claim } from '../model/claim';
import type { Constraint } from '../model/constraint';
import { type Expr, abs, div, num, pow, ref, refsOf, val } from '../model/expr';
import {
  type Rat,
  ZERO,
  add as ratAdd,
  div as ratDiv,
  eq as ratEq,
  isZero as ratIsZero,
  mul as ratMul,
  neg as ratNeg,
  rat,
  sub as ratSub,
} from '../value/rational';
import { gaussianRationalParts } from '../value/cartesian';
import type { AtomBinding } from '../value/gaussian';
import { fromCartesian } from '../value/value';
import { isTurnUnknown, type Tier1Result } from './tier1';

/**
 * Is the subject's direction PINNED by the other lines?
 *
 * Deliberately not `freeDof.includes('arg z1')`: that list is built from the solver's `free` basis, and a
 * name no constraint mentions at all never enters the system, so a LONE claim — «z1 מדומה טהור» with
 * nothing else typed, which is the reported case — would read as "not free" and never drive. Absent is
 * maximally free, not determined.
 *
 * Pinned means: determined, and determined by CONSTANTS — a residual coefficient on some other free
 * argument is not a value. Turn unknowns are exempt because the branch has already chosen them; this
 * mirrors how `knownModulus` is built from the modulus half (`coefs.size === 0`).
 */
const argPinned = (t1: Tier1Result, name: string): boolean => {
  const d = t1.argument.determined.get(name);
  return d !== undefined && [...d.coefs.keys()].every(isTurnUnknown);
};
const argFree = (t1: Tier1Result, name: string): boolean => !argPinned(t1, name);
/** The modulus half's own published notion of "this is a value, not a relation". */
const modFree = (t1: Tier1Result, name: string): boolean => !t1.knownModulus.has(name);

/**
 * The constraint rows the claims may contribute, given what the other lines already established.
 *
 * Returns `[]` when every subject is determined — which is the ordinary case, and the reason this is
 * cheap: `foldConstraints` re-solves tier 1 only when this is non-empty.
 */
export function claimDriveRows(assertions: readonly Claim[], t1: Tier1Result): Constraint[] {
  /**
   * A subject some OTHER lane can pin is not open, whatever tier 1 thinks.
   *
   * Tier 1 only sees MONOMIAL rows: «z1 = 1+i» is an `add` on the right, so it is DEFERRED to the
   * residual tier and tier 1 never learns that z1 is fixed. Gating on tier 1 alone therefore read a
   * fully-stated number as free and let the claim drive it onto the imaginary axis — a claim
   * overriding a given, which is the one thing this must never do. (Caught by
   * `acceptance-gate.test.ts`, which noticed the refusal reason change from `incompatible` to
   * `impossible` — the system had become contradictory rather than merely disagreeing with a claim.)
   *
   * So: a name mentioned anywhere in a deferred constraint is treated as determined. Conservative on
   * purpose — the cost of a false "determined" is the old behaviour (a claim that checks instead of
   * driving, verdict `unknown`), while the cost of a false "free" is a figure that contradicts a
   * stated given.
   */
  const deferredNames = new Set(t1.deferred.flatMap((c) => [...refsOf(c.lhs), ...refsOf(c.rhs)]));
  const open = (name: string): boolean => !deferredNames.has(name);
  const out: Constraint[] = [];
  for (const a of assertions) {
    switch (a.kind) {
      case 'real':
      case 'imaginary': {
        // `forall-power` / `minimal-power` are deliberately absent: they answer «prove/find n», and
        // driving them would let a guess reshape the figure.
        if (!argFree(t1, a.name) || !open(a.name)) break;
        out.push({
          kind: 'arg',
          lhs: pow(ref(a.name), rat(2)),
          rhs: num(rat(a.kind === 'real' ? 1 : -1)),
          src: a.src,
        });
        break;
      }
      case 'conjugates': {
        // equal moduli AND opposite arguments — the two halves are gated independently, because the
        // givens may have pinned one and left the other open.
        if (!open(a.a) || !open(a.b)) break;
        if (modFree(t1, a.a) || modFree(t1, a.b)) {
          out.push({ kind: 'mod', lhs: abs(ref(a.b)), rhs: abs(ref(a.a)), src: a.src });
        }
        if (argFree(t1, a.a) || argFree(t1, a.b)) {
          // arg b = −arg a, written as the direction of 1/a (a reciprocal has the opposite argument)
          out.push({ kind: 'arg', lhs: ref(a.b), rhs: div(num(rat(1)), ref(a.a)), src: a.src });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// #2802/#2801 (ADR-CX-100, LADDER-CX stage 1a″) — a GIVEN line through the origin is a direction
// ---------------------------------------------------------------------------

/** A Gaussian rational `re + im·i`: the constants a one-name real-linear row is read over. */
interface Gauss {
  readonly re: Rat;
  readonly im: Rat;
}
const G0: Gauss = { re: ZERO, im: ZERO };
const gIsZero = (a: Gauss): boolean => ratIsZero(a.re) && ratIsZero(a.im);
const gAdd = (a: Gauss, b: Gauss): Gauss => ({ re: ratAdd(a.re, b.re), im: ratAdd(a.im, b.im) });
const gSub = (a: Gauss, b: Gauss): Gauss => ({ re: ratSub(a.re, b.re), im: ratSub(a.im, b.im) });
const gNeg = (a: Gauss): Gauss => ({ re: ratNeg(a.re), im: ratNeg(a.im) });
const gConj = (a: Gauss): Gauss => ({ re: a.re, im: ratNeg(a.im) });
const gMul = (a: Gauss, b: Gauss): Gauss => ({
  re: ratSub(ratMul(a.re, b.re), ratMul(a.im, b.im)),
  im: ratAdd(ratMul(a.re, b.im), ratMul(a.im, b.re)),
});
/** |a|², exact */
const gNorm = (a: Gauss): Rat => ratAdd(ratMul(a.re, a.re), ratMul(a.im, a.im));
const gDiv = (a: Gauss, b: Gauss): Gauss | null => {
  const d = gNorm(b);
  if (ratIsZero(d)) return null;
  const p = gMul(a, gConj(b));
  return { re: ratDiv(p.re, d), im: ratDiv(p.im, d) };
};

/** The constant an expression with no unknown and no parameter is, when it is a Gaussian rational. */
function gaussOf(e: Expr): Gauss | null {
  switch (e.t) {
    case 'num':
      return { re: e.v, im: ZERO };
    case 'i':
      return { re: ZERO, im: rat(1) };
    case 'val':
      if (e.v.kind === 'zero') return G0;
      return e.v.kind === 'exact' ? gaussianRationalParts(e.v.mod, e.v.arg) : null;
    default:
      return null;
  }
}

/**
 * A REAL-LINEAR form in one complex unknown: `a·z + b·z̄ + k`, every coefficient a Gaussian rational.
 * `name` is null while the form is a constant.
 */
export interface RealLinear {
  readonly name: string | null;
  readonly a: Gauss;
  readonly b: Gauss;
  readonly k: Gauss;
}
const isConstant = (f: RealLinear): boolean => gIsZero(f.a) && gIsZero(f.b);

/**
 * Read `e` as a real-linear form in ONE complex unknown, exactly — or `null`.
 *
 * Bounded linear algebra over the Gaussian rationals (ADR-CX-006: no CAS): sums, differences, negation,
 * conjugation, and a product or quotient by a CONSTANT. A product of two unknown terms, a power of the
 * unknown, a parameter, an `|·|` or a second unknown answers null: the row is not a line, or not one
 * this reader can prove is one, and it stays the numeric tier's.
 */
export function realLinearOf(e: Expr): RealLinear | null {
  const c = gaussOf(e);
  if (c) return { name: null, a: G0, b: G0, k: c };
  const join = (x: string | null, y: string | null): string | null | undefined =>
    x === null ? y : y === null || x === y ? x : undefined;
  switch (e.t) {
    case 'ref':
      return { name: e.name, a: { re: rat(1), im: ZERO }, b: G0, k: G0 };
    case 'add':
    case 'sub': {
      const l = realLinearOf(e.l);
      const r = realLinearOf(e.r);
      if (!l || !r) return null;
      const name = join(l.name, r.name);
      if (name === undefined) return null;
      const op = e.t === 'add' ? gAdd : gSub;
      return { name, a: op(l.a, r.a), b: op(l.b, r.b), k: op(l.k, r.k) };
    }
    case 'neg': {
      const f = realLinearOf(e.e);
      return f && { name: f.name, a: gNeg(f.a), b: gNeg(f.b), k: gNeg(f.k) };
    }
    case 'conj': {
      const f = realLinearOf(e.e);
      return f && { name: f.name, a: gConj(f.b), b: gConj(f.a), k: gConj(f.k) };
    }
    case 'mul': {
      const l = realLinearOf(e.l);
      const r = realLinearOf(e.r);
      if (!l || !r) return null;
      const [s, f] = isConstant(l) ? [l.k, r] : isConstant(r) ? [r.k, l] : [null, null];
      if (!s || !f) return null;
      return { name: f.name, a: gMul(s, f.a), b: gMul(s, f.b), k: gMul(s, f.k) };
    }
    case 'div': {
      const l = realLinearOf(e.l);
      const r = realLinearOf(e.r);
      if (!l || !r || !isConstant(r)) return null;
      const [a, b, k] = [gDiv(l.a, r.k), gDiv(l.b, r.k), gDiv(l.k, r.k)];
      return a && b && k ? { name: l.name, a, b, k } : null;
    }
    default:
      return null;
  }
}

/**
 * The unit `u` with "the row's solutions other than 0 are exactly `arg(z²) = arg(u)`" — or null when
 * the row is not a line through the origin.
 *
 *  - an `eq` row `a·z + b·z̄ + k = 0` is a line through 0 exactly when k = 0 and |a| = |b| ≠ 0
 *    («Re(z) = 0», «Im(z) = 0», «Re(z) = Im(z)», «z + conj(z) = 0»); then z/z̄ = −b/a, so u = −b/a.
 *  - a `mod` row `|p·z + a| = |q·z + b|` with |p| = |q| is the perpendicular bisector of a′ = −a/p and
 *    b′ = −b/q (|z − a′|² − |z − b′|² = −2·Re(z·conj(a′ − b′)) + |a′|² − |b′|²): through 0 exactly when
 *    |a′| = |b′| and a′ ≠ b′ («|z − 1| = |z + 1|», «|z − 1| = |z − i|»); its direction is i·(a′ − b′),
 *    so u = −c/c̄ with c = a′ − b′.
 */
export function lineThroughOrigin(c: Constraint): { name: string; u: Gauss } | null {
  const kind = c.kind ?? 'eq';
  if (kind === 'eq') {
    const f = realLinearOf({ t: 'sub', l: c.lhs, r: c.rhs });
    if (!f || f.name === null || !gIsZero(f.k) || gIsZero(f.a)) return null;
    if (!ratEq(gNorm(f.a), gNorm(f.b))) return null;
    const u = gDiv(gNeg(f.b), f.a);
    return u && { name: f.name, u };
  }
  if (kind !== 'mod' || c.lhs.t !== 'abs' || c.rhs.t !== 'abs') return null;
  /** `|p·z + a|` as the point it measures from and the scale |p|², reading `|z̄ − a|` as `|z − ā|` */
  const side = (e: Expr): { name: string; centre: Gauss; scale: Rat } | null => {
    let f = realLinearOf(e);
    if (!f || f.name === null) return null;
    if (gIsZero(f.a)) f = { name: f.name, a: gConj(f.b), b: G0, k: gConj(f.k) };
    if (!gIsZero(f.b)) return null;
    const centre = gDiv(gNeg(f.k), f.a);
    return centre && { name: f.name as string, centre, scale: gNorm(f.a) };
  };
  const l = side(c.lhs.e);
  const r = side(c.rhs.e);
  if (!l || !r || l.name !== r.name || !ratEq(l.scale, r.scale)) return null;
  if (!ratEq(gNorm(l.centre), gNorm(r.centre))) return null;
  const d = gSub(l.centre, r.centre);
  if (gIsZero(d)) return null;
  const u = gDiv(gNeg(d), gConj(d));
  return u && { name: l.name, u };
}

/**
 * STAGE 1a″ — every deferred row that is a LINE THROUGH THE ORIGIN, lowered to its exact direction row.
 *
 * The defect (#2802): «Re(z) = 0» on its own drew z at ≈1e-6·i at every seed. A line through 0 reaches
 * the numeric tier as a residual ∝ |z| in the (|z|, θ) basis, so the descent shrinks |z| onto its bound
 * instead of turning θ, the solve never reaches tolerance and the fold draws its fallback: an unstated
 * modulus drawn at zero (ADR-052). And because where a descent stops depends on the ROWS, not on the set,
 * the same line typed in another spelling moved z (#2801).
 *
 * The set {z ≠ 0 : the row} is exactly `arg(z²) = arg(u)` — the row the imaginary/real claims already
 * drive with (ADR-CX-029) — so the line becomes that row, solved exactly by tier 1: its two branches are
 * the two sides of the origin, and |z| stays a free, sampled modulus. «Re(z) = 0», «|z − 1| = |z + 1|»
 * and «z מדומה טהור» are then one row, which is what keeps a restatement still.
 *
 * Returns the rows with each lifted row REPLACED in place, the atom bindings a direction needed, and how
 * many rows were lifted. The caller withdraws the lift where it leaves the figure unsolvable — the one
 * solution a direction cannot carry is z = 0 («Re(z) = 0» · «Im(z) = 0»).
 */
export function liftDirectionRows(
  rows: readonly Constraint[],
  deferred: readonly Constraint[],
): { rows: Constraint[]; atoms: readonly AtomBinding[]; lifted: number } {
  const deferredSet = new Set(deferred);
  const atoms: AtomBinding[] = [];
  let lifted = 0;
  const out = rows.map((c): Constraint => {
    if (!deferredSet.has(c)) return c;
    const line = lineThroughOrigin(c);
    if (!line) return c;
    let rhs: Expr;
    if (ratIsZero(line.u.im)) rhs = num(line.u.re);
    else {
      const lit = fromCartesian(line.u.re, line.u.im);
      atoms.push(...lit.atomBindings);
      rhs = val(lit.value);
    }
    lifted++;
    return { kind: 'arg', lhs: pow(ref(line.name), rat(2)), rhs, src: c.src };
  });
  return { rows: out, atoms, lifted };
}
