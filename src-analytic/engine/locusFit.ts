/**
 * WHAT CURVE IS THAT TRACE? — fit, snap, and the tool's check on ITSELF (#1137).
 *
 * The tracer ([`locus.ts`](./locus.ts)) produces a point cloud; this names it. Two things are being
 * asked, and [ADR-AG-072](../../docs/06c-decisions-analytic.md) rules them separately because they
 * have different answers:
 *
 * - **the KIND** — «מעגל», «פרבולה» — shown whenever it is invariant, *even if the coefficients are
 *   not*. חורף 25's locus is a circle for every value of `a`, and *"show that the locus of P is a
 *   circle"* is precisely what that exam asks.
 * - **the EQUATION** — shown only when the tool is certain. Operator: *"only if we are positive about
 *   the equation we show it. otherwise, we stick to showing the shape."*
 *
 * ## This is NOT `conic.ts`'s fit, and the difference is the whole risk
 *
 * `fitConic` reads six coefficients EXACTLY, from seven lattice probes of an equation the student
 * already wrote. Here there is no equation — only sampled points, each carrying the corrector's
 * residual — so it is least squares, and least squares always returns something. A traced RAY will
 * fit happily as a full line; a short arc will fit as any number of conics through it.
 *
 * ## Which is why the self-check must survive
 *
 * With no student-side validation anywhere in this product (ADR-AG-072 amends ADR-AG-001 D1 — the
 * student never types a claimed equation to be graded), **nothing else stands between a slightly
 * over-eager rational snap and the tool printing a confident wrong equation**, which is the one thing
 * this product may not do. So the pipeline is
 *
 *     fit → snap to rationals → RE-VERIFY the snapped equation against the trace → print, or print nothing
 *
 * and that last step is the tool checking itself. `x² + y² − 32.0000001x − 224.9998 = 0` is not an
 * answer. **If it will not snap, print nothing** — the kind still shows, and that is the honest half.
 */
import { classify, type Conic } from './conic';
import { fractionClearingFactor } from '../format';
import type { NumCurve } from './types';

export interface LocusPt {
  x: number;
  y: number;
}

/** What the trace turned out to be. */
export interface LocusShape {
  /** The canonical curve — what names the row «מעגל», «ישר», «פרבולה», «אליפסה». */
  curve: NumCurve;
  /** The six coefficients, snapped, when they survived the self-check. Absent ⇒ show the kind only. */
  conic?: Conic;
}

/**
 * The largest denominator a coefficient may snap to.
 *
 * Exam loci have small rational coefficients — `x = 4`, `(x−16)² + y² = 625`, `y = −1/(2x)` — so a
 * generous denominator buys nothing and costs the guarantee: with enough denominator every float is
 * "rational", and the snap stops being evidence of anything.
 */
const MAX_DENOM = 64;

/**
 * How close the fitted value must already be to the rational for the snap to be believed —
 * **RELATIVE to the coefficient's own magnitude.**
 *
 * Measured, and an absolute tolerance is simply wrong here: חורף 25's circle fits to
 * `F = −368.99998759` against a true `−369`, an absolute error of `1.2e−5` and a relative one of
 * `3.4e−8`. Held to an absolute `1e−6` that coefficient refuses to snap and a perfectly determinate
 * locus prints nothing — while a coefficient of `0.5` would be accepted at a relative error a hundred
 * times worse. The trace's precision is relative (it comes from a corrector working to `SOLVE_TOL`),
 * so the test must be too.
 */
const SNAP_TOL = 1e-6;

/** Continued-fraction best rational approximation with a bounded denominator. */
function snapRational(v: number, tol = SNAP_TOL): number | null {
  if (!Number.isFinite(v)) return null;
  const bar = tol * Math.max(1, Math.abs(v));
  if (Math.abs(v) < bar) return 0;
  const sign = Math.sign(v);
  const a = Math.abs(v);
  let bestNum = 0;
  let bestDen = 1;
  let bestErr = Infinity;
  for (let den = 1; den <= MAX_DENOM; den += 1) {
    const num = Math.round(a * den);
    if (num === 0) continue;
    const err = Math.abs(a - num / den);
    if (err < bestErr) {
      bestErr = err;
      bestNum = num;
      bestDen = den;
    }
    if (bestErr <= bar) break;
  }
  if (bestErr > bar) return null;
  return (sign * bestNum) / bestDen;
}

/** Every coefficient snapped at one tolerance, or `null` if any will not. */
function snapConic(k: Conic, tol: number): Conic | null {
  const out: Partial<Conic> = {};
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const v = snapRational(k[key], tol);
    if (v === null) return null;
    out[key] = v;
  }
  return out as Conic;
}

/** Symmetric 6×6 eigendecomposition by cyclic Jacobi — deterministic, and small enough to be exact
 *  enough. Returns the eigenvector of the SMALLEST eigenvalue, which is the least-squares conic. */
function smallestEigenvector(M: number[][]): number[] {
  const n = M.length;
  const A = M.map((r) => [...r]);
  let V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) off += A[i][j] * A[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(A[p][q]) < 1e-18) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cs = 1 / Math.sqrt(t * t + 1);
        const sn = t * cs;
        for (let k = 0; k < n; k += 1) {
          const akp = A[k][p];
          const akq = A[k][q];
          A[k][p] = cs * akp - sn * akq;
          A[k][q] = sn * akp + cs * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = A[p][k];
          const aqk = A[q][k];
          A[p][k] = cs * apk - sn * aqk;
          A[q][k] = sn * apk + cs * aqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = cs * vkp - sn * vkq;
          V[k][q] = sn * vkp + cs * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < n; i += 1) if (A[i][i] < A[best][best]) best = i;
  return V.map((r) => r[best]);
}

/**
 * Least-squares conic through the traced points.
 *
 * The points are CENTRED AND SCALED before fitting and the coefficients transformed back. Without it
 * the design matrix holds `x⁴` terms — on חורף 25's circle that is `25⁴ ≈ 4·10⁵` against a constant
 * column of 1, and the fit is dominated by conditioning rather than by the data.
 */
export function fitTrace(pts: readonly LocusPt[]): Conic | null {
  if (pts.length < 5) return null;
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const spread = Math.sqrt(pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / n);
  const s = spread > 1e-12 ? spread : 1;

  const M: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (const p of pts) {
    const u = (p.x - cx) / s;
    const v = (p.y - cy) / s;
    const row = [u * u, u * v, v * v, u, v, 1];
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) M[i][j] += row[i] * row[j];
  }
  const e = smallestEigenvector(M);
  if (e.some((v) => !Number.isFinite(v))) return null;
  const [A2, B2, C2, D2, E2, F2] = e;

  // Back out the centring and scaling: u = (x−cx)/s, v = (y−cy)/s, multiplied through by s².
  return {
    A: A2,
    B: B2,
    C: C2,
    D: -2 * A2 * cx - B2 * cy + D2 * s,
    E: -B2 * cx - 2 * C2 * cy + E2 * s,
    F: A2 * cx * cx + B2 * cx * cy + C2 * cy * cy - D2 * s * cx - E2 * s * cy + F2 * s * s,
  };
}

/** The equation's value at a point — what the self-check measures. */
const evalConic = (k: Conic, p: LocusPt) =>
  k.A * p.x * p.x + k.B * p.x * p.y + k.C * p.y * p.y + k.D * p.x + k.E * p.y + k.F;

/**
 * Normalize so two fits are comparable, and so the coefficients are the ones a person would WRITE.
 *
 * **MONIC in the square term wherever there is one** — divide by `A` (or by `C` when the curve has no
 * `x²`), not by the largest coefficient. Measured, and the difference decides whether the equation
 * prints at all: חורף 25's circle `x² + y² − 32x − 225 = 0` normalized by its largest coefficient
 * becomes `A = −1/225 = −0.00444…`, and **1/225 is not a rational with a denominator under 64**, so
 * the snap fails and a perfectly determinate locus prints no equation. Monic gives `1, 1, −32, −225`
 * — integers, which is what exam loci actually have.
 *
 * Sign is fixed by the divisor, since `k` and `−k` are the same curve.
 */
function normalized(k: Conic): Conic | null {
  const vals = [k.A, k.B, k.C, k.D, k.E, k.F];
  const scale = Math.max(...vals.map(Math.abs));
  if (scale < 1e-12) return null;
  // A square coefficient counts as present when it is not negligible against the whole equation —
  // the same relative test `classify` applies, so the two agree about which family this is.
  const sig = (v: number) => Math.abs(v) > 1e-9 * scale;
  // A LINE has no square term, so "monic" there means the first present of `x`, `y` — which is how a
  // line is written: `x − 4 = 0`, not `−0.25x + 1 = 0`. Same rule, one degree down.
  const lead = sig(k.A)
    ? k.A
    : sig(k.C)
      ? k.C
      : sig(k.D)
        ? k.D
        : sig(k.E)
          ? k.E
          : vals.find((v) => Math.abs(v) === scale)!;
  const [A, B, C, D, E, F] = vals.map((v) => v / lead);
  return { A, B, C, D, E, F };
}

/**
 * IS THE TRACE A STRAIGHT LINE? — asked FIRST, because a line is not a well-posed conic fit.
 *
 * Measured on the perpendicular bisector, which traces `x = 4` exactly: the conic least squares
 * returned a DEGENERATE pair of lines with a cross term, `classify` called it `rotated`, and the most
 * elementary locus in the corpus produced no answer at all. The cause is not the solver — infinitely
 * many conics contain a straight line (`(x−4)·anything = 0`), so the smallest eigenvalue has a
 * multi-dimensional eigenspace and *every* member of it is an equally good fit.
 *
 * The cure is to prefer the LOWEST-DEGREE curve that fits, which is also what a student would write:
 * nobody answers «the locus is `x² − 8x + 16 = 0`». Total least squares through the centroid — the
 * direction of least spread is the normal — so a vertical line is no harder than any other.
 */
function fitLine(pts: readonly LocusPt[]): Conic | null {
  const n = pts.length;
  if (n < 2) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const u = p.x - cx;
    const v = p.y - cy;
    sxx += u * u;
    sxy += u * v;
    syy += v * v;
  }
  // The smaller eigenvalue of [[sxx,sxy],[sxy,syy]]; its eigenvector is the line's NORMAL.
  const tr = sxx + syy;
  if (tr < 1e-18) return null; // every point in one place — not a line
  const disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy * sxy));
  const lo = (tr - disc) / 2;
  // The normal direction: for eigenvalue λ, (sxx−λ)nx + sxy·ny = 0.
  let nx = sxy;
  let ny = lo - sxx;
  if (Math.hypot(nx, ny) < 1e-12) {
    nx = lo - syy;
    ny = sxy;
  }
  const nn = Math.hypot(nx, ny);
  if (nn < 1e-12) return null;
  nx /= nn;
  ny /= nn;

  /**
   * STRAIGHTNESS IS A RATIO, not a distance.
   *
   * The first cut here compared each point's deviation against `1e-7 × extent`, and it was measured
   * wrong: the parameterised bisector `A(0,0)` `B(8a,0)` traces `x = 4a` with a corrector wobble of
   * `1.5e−4` over a span of 230 — unmistakably a straight line, rejected, and then fitted as a
   * degenerate conic that classified as nothing at all. An absolute bar cannot work, because what the
   * corrector leaves behind depends on the figure's conditioning and not on how straight the curve is.
   *
   * So: the spread ACROSS the line against the spread ALONG it — the two eigenvalues. It is
   * scale-free, and the separation is enormous. The parameterised bisector sits at `~2e−12`; a circle
   * of radius 25 traced over a comparable span sits near 1.
   *
   * (A very short arc of a very large circle is genuinely indistinguishable from a line at this or
   * any bar. ADR-AG-072 names that case: a traced ray fits happily as a full line, and the
   * self-check downstream is what keeps an unwarranted equation from being printed.)
   */
  const hi = (tr + disc) / 2;
  if (hi < 1e-18 || lo > 1e-10 * hi) return null;
  return { A: 0, B: 0, C: 0, D: nx, E: ny, F: -(nx * cx + ny * cy) };
}

/**
 * Snap every coefficient to a small rational, then **re-verify the snapped equation against the
 * trace**. Returns `null` when either step fails — which is the honest outcome, not a failure.
 *
 * The verification tolerance is relative to the figure's own scale: the residual of an equation whose
 * `x²` coefficient is 1 grows with the square of the coordinates, so a fixed epsilon would pass every
 * small figure and fail every large one.
 */
export function snapAndVerify(k: Conic, pts: readonly LocusPt[]): Conic | null {
  const norm = normalized(k);
  if (!norm) return null;
  /**
   * THE SNAP MAY NOT DEMAND PRECISION THE TRACE NEVER PROMISED (#1224).
   *
   * `SNAP_TOL` is ABSOLUTE and the trace's accuracy is RELATIVE to how far it walks, so the snap and
   * the verification below — which has always been relative — disagreed about what precision means.
   * Measured, on `A(0,0)` `B(…)` «נקודה M» «MA = MB», against the TRUE bisector:
   *
   * ```
   *            traced span   worst deviation   snapped?
   * B(8,0)              68          ~0         yes — the solve pins x exactly
   * B(2,0)              40          1.9e−5     NO  — 19× the absolute tolerance
   * B(6,8)            2685          1.5e−2     NO  — four orders past it
   * ```
   *
   * So a slanted bisector — the corpus's commonest locus — drew correctly and printed no equation,
   * while `shapeOfTrace` had the right line in hand the whole time (`a=1, b=4/3, c=−8.327`, which is
   * `3x + 4y = 25` to three figures). Nothing was wrong with the fit, the classifier or the gate.
   *
   * The tolerance is therefore taken FROM the trace: its own worst residual about the fitted curve is
   * the precision this data actually has. Tighter than that can only fail; looser is not a licence,
   * because **the verification below re-checks the snapped equation against every point** and is what
   * keeps a wrong snap from being printed. Never tighter than `SNAP_TOL`, so an exact trace still
   * snaps exactly.
   */
  const scatter = Math.max(0, ...pts.map((p) => Math.abs(evalConic(norm, p))));
  const out = snapConic(norm, Math.max(SNAP_TOL, scatter));
  if (!out) return null; // will not snap ⇒ print nothing
  /**
   * A TOLERANCE WIDE ENOUGH TO ERASE EVERY COEFFICIENT IS NOT AN EQUATION.
   *
   * Caught by this file's own honesty lock while #1224 was being built, which is the reason that lock
   * asserts the refusal directly rather than inferring it from a case that happened to fail the snap.
   *
   * Handed a conic that does not describe the trace at all — `x = 40` against a trace at `x = 4` — the
   * scatter is 36, every coefficient snaps to 0, and `0 = 0` then satisfies the verification below at
   * every point. A wrong-but-NONZERO snap is caught there; the degenerate one is the single case that
   * cannot be, because it is true everywhere.
   */
  if (!normalized(out)) return null;

  const scale = Math.max(1, ...pts.map((p) => Math.hypot(p.x, p.y)));
  const tol = 1e-6 * scale * scale;
  for (const p of pts) if (Math.abs(evalConic(out, p)) > tol) return null;
  return out;
}

/**
 * The whole pipeline for ONE trace: fit, classify, and attach the equation only if it survives.
 *
 * The kind is read from the SNAPPED coefficients when there are any and from the raw fit otherwise,
 * so the row never names one family while the equation beside it describes another.
 */
export function shapeOfTrace(pts: readonly LocusPt[]): LocusShape | null {
  // Lowest degree first — see `fitLine`. A conic fit to a straight line is degenerate, not merely
  // inelegant, and the perpendicular bisector is the corpus's commonest locus.
  const raw = fitLine(pts) ?? fitTrace(pts);
  if (!raw) return null;
  const snapped = snapAndVerify(raw, pts);
  /**
   * NAMING the family and PRINTING the coefficients are different questions, and they get different
   * tolerances (ADR-AG-072 §5 — *the kind is shown whenever the kind is invariant, even if the
   * coefficients are not*).
   *
   * `classify` was built for `fitConic`'s EXACT lattice probes and asks `|A − C| ≤ 1e−9` to call
   * something a circle. A least-squares fit to sampled points does not reach that: חורף 25's circle
   * lands at `C = 0.99999986`, which is a circle by any reading and which `classify` called a
   * translated conic. So the kind is read off a COARSELY snapped copy — a robust question, answered
   * robustly — while `conic` below, the thing actually printed, keeps the tight tolerance and its
   * re-verification against the trace.
   */
  const forKind = snapped ?? snapConic(normalized(raw) ?? raw, 1e-4) ?? normalized(raw);
  if (!forKind) return null;
  const res = classify(forKind);
  if (!res.ok) return null;
  return snapped ? { curve: res.curve, conic: snapped } : { curve: res.curve };
}

/**
 * THE LOCUS'S EQUATION, written the way a student writes it — or `null`.
 *
 * `null` whenever the shape carries no snapped conic, which is the determinacy gate's «shape only»
 * verdict reaching the surface: the row then says «מעגל» and prints no equation, exactly as ruled.
 *
 * The CANONICAL form per family, not the general six-coefficient one: nobody answers
 * «x² + y² − 32x − 369 = 0» when the question asks for a locus — they answer
 * «(x − 16)² + y² = 625». The numbers come from the classified curve, whose values were derived from
 * the snapped coefficients, so they are the exact ones.
 *
 * `fmt` is the CALLER's formatter for the same reason it is everywhere else in this lane: this tree
 * has no private display rounder, and a second one here is how two surfaces of one panel start
 * disagreeing about what `4/3` looks like.
 */
export function locusEquation(shape: LocusShape, fmt: (v: number) => string): string | null {
  if (!shape.conic) return null;
  const c = shape.curve;
  // `x`, `x − 3`, `x + 3` — the bracketed term of a translated conic, with the no-op omitted.
  const shift = (v: string, k: number) =>
    Math.abs(k) < 1e-12 ? v : `(${v} ${k > 0 ? '−' : '+'} ${fmt(Math.abs(k))})`;
  switch (c.kind) {
    case 'line': {
      const { D, E, F } = shape.conic;
      // `x = 4/3` and `y = 4/3` are STANDALONE values — nothing follows them, nothing to misread.
      if (Math.abs(E) < 1e-12) return `x = ${fmt(-F / D)}`;
      if (Math.abs(D) < 1e-12) return `y = ${fmt(-F / E)}`;
      /**
       * …but a SLOPE is a COEFFICIENT, and `y = 4/3x + 2` carries #1180's ambiguity exactly: it reads
       * as `4/(3x)` at least as naturally as `(4/3)x`. Reported against the panel's curve row and
       * ruled there — *clear the fractions from the whole equation* — so the same treatment applies
       * here rather than leaving one surface ambiguous because nobody happened to look at it.
       *
       * `fractionClearingFactor` is the helper that ruling produced, and it returns 1 when there is
       * nothing to clear, so an integer slope is untouched.
       */
      const k = fractionClearingFactor([D, E, F]) ?? 1;
      const [d, e, f] = [D * k, E * k, F * k];
      const yPart = Math.abs(e) === 1 ? 'y' : `${fmt(Math.abs(e))}y`;
      const lhs = e < 0 ? `−${yPart}` : yPart;
      // `dx + ey + f = 0` → `ey = −dx − f`, signs folded as they are written.
      const xMag = Math.abs(d) === 1 ? '' : fmt(Math.abs(d));
      const rhs = `${d > 0 ? '−' : ''}${xMag}x`;
      const konst = Math.abs(f) < 1e-12 ? '' : ` ${f > 0 ? '−' : '+'} ${fmt(Math.abs(f))}`;
      return `${lhs} = ${rhs}${konst}`;
    }
    case 'circle':
      return `${shift('x', c.cx)}² + ${shift('y', c.cy)}² = ${fmt(c.r * c.r)}`;
    case 'parabola':
      return `y² = ${fmt(2 * c.p)}x`;
    case 'ellipse':
      return `x²/${fmt(c.a * c.a)} + y²/${fmt(c.b * c.b)} = 1`;
  }
}

/**
 * THE DETERMINACY GATE — a two-seed SET comparison, and it is the honesty gate (ADR-AG-072 §4).
 *
 * This is the set-level sibling of `isKnowledge`. That predicate asks *is this value invariant across
 * every admissible parameter* — and a locus point is by definition **not** invariant, which is why it
 * needs its own: the *set* is invariant even though the point on it is not.
 *
 * It falls out correctly with no special-casing for parameters:
 *
 * - the bisector carries none, so both seeds trace `x = 4` → same set → the equation prints;
 * - חורף 25 with `A(−9a,0)`, `B(41a,0)` traces a circle of radius `25a` about `(16a, 0)`, so the two
 *   seeds trace DIFFERENT sets → shape only, «מעגל», no equation. Reaching `(x−16a)² + y² = 625a²`
 *   would mean recognising a symbolic dependence across samples, which is the CAS boundary
 *   (`src-analytic/CLAUDE.md` rule 2).
 *
 * Side effect, and a good one: «הציגו תצורה אחרת» then makes that circle GROW with `a` on screen.
 */
export function agreeingShape(a: readonly LocusPt[], b: readonly LocusPt[]): LocusShape | null {
  const sa = shapeOfTrace(a);
  if (!sa) return null;
  const sb = shapeOfTrace(b);
  // The KIND must agree, or nothing is invariant and there is nothing honest to say.
  if (!sb || sb.curve.kind !== sa.curve.kind) return null;
  if (!sa.conic || !sb.conic) return { curve: sa.curve };
  // Both snapped. Same set ⇒ the equation is knowledge; different ⇒ the kind alone.
  const same = (['A', 'B', 'C', 'D', 'E', 'F'] as const).every(
    (k) => Math.abs(sa.conic![k] - sb.conic![k]) < 1e-6,
  );
  return same ? sa : { curve: sa.curve };
}
