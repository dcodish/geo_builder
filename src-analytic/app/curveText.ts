/**
 * HOW A CURVE READS IN THE PANEL — its EQUATION, and the properties derived from it (#1212).
 *
 * ## The rule
 *
 * **A curve row leads with its equation. Centre, radius, foci and directrix are supporting detail.**
 *
 * That reverses a reasoning this tree carried in a comment over `describeCurve`: *"deliberately
 * DESCRIPTIVE (centre, radius, focus) rather than a restatement of the equation the student just
 * typed"*. Playing it shows the trade it actually makes. A circle can ONLY be stated here by its
 * equation, so `O(3, 4), r = 3` does not avoid a restatement — it takes the student's own statement off
 * the screen and puts a consequence of it there instead, under a heading that promises equations.
 * Avoiding redundancy was the right instinct aimed at the wrong half: the derived form is the redundant
 * one.
 *
 * Operator, 2026-09-18, playing T18: *"the circle equation is not an equation. under equations we
 * should see the equation and then we can have the center and radius. these should be collapsable
 * like i requested for the line equations"*.
 *
 * The values were all there — a circle knows `cx, cy, r`; an ellipse knows `a, b` — so every one of
 * these equations was derivable from what the row already held. Nothing new is computed.
 *
 * ## Why this is a MODULE and not two functions in `App.tsx`
 *
 * It was module-private component code, so the ask lane could only reach it by INJECTION, and every
 * test but one injected a stub (`() => ''`, `() => 'curve'`). A stub agrees with anything: the lock
 * on "«משוואת I» answers the equation" could not have been written against the real formatter, which
 * is exactly the failure [ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053) names. One home,
 * both callers import it, and the locks CALL it.
 *
 * Numbers go through `fmtAnalytic` — this tree's one display formatter (#1029, #1120) — so the panel,
 * the canvas and the ask lane cannot round differently.
 */
import { fmtAnalytic, fractionClearingFactor } from '../format';
import { ellipseFoci, parabolaFocus } from '../engine/curves';
import type { NumCurve } from '../engine/types';
import type { LocusShape } from '../engine/locusFit';

const fmt = (v: number): string => fmtAnalytic(v);

/**
 * `a x + b y + c = 0`, written the way a textbook writes it: no `1x`, no `+ 0`, no `+ -3`. The raw
 * coefficients are arithmetic; this is notation, and the panel is read by a student.
 *
 * Exported so its lock CALLS it (#1119, per [ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)).
 * It was module-private, which left a test only able to reproduce it -- and a reproduction of this
 * function would have carried the same bug in the same shape and agreed with it.
 */
export function lineText(a0: number, b0: number, c0: number): string {
  /**
   * NO FRACTION IS LEFT AS A COEFFICIENT (#1180) — the whole equation is scaled instead.
   *
   * `-4/3x + y = 0` is ambiguous (`4/(3x)`?) and typesets badly; `-4x + 3y = 0` is what a textbook
   * prints. The scaling is decided in `format.ts`, which is where this tree's number presentation
   * lives; when nothing can be cleared — a surd coefficient — the factor is 1 and this is a no-op.
   */
  const k = fractionClearingFactor([a0, b0, c0]) ?? 1;
  const [a, b, c] = [a0 * k, b0 * k, c0 * k];
  const parts = `${term(a, 'x')}${term(b, 'y')}${term(c, '')}`.trim();
  // A leading `+ ` is noise; a leading `- ` is a sign and stays attached.
  const body = parts.startsWith('+ ') ? parts.slice(2) : parts.replace(/^- /, '-');
  return `${body} = 0`;
}

/**
 * One signed term of an equation, or '' when the coefficient is zero.
 *
 * THE MAGNITUDE RULE BELONGS TO THE SYMBOL, NOT TO THE TERM (#1119).
 *
 * Suppressing `1` is correct notation for a COEFFICIENT -- `1x` must print as `x`. The constant
 * term is formatted by this same helper with `sym = ''`, so the rule erased the number itself and
 * «3x - 4y + 1 = 0» printed as «3x - 4y + = 0». It fired for any line whose constant is +/-1, not
 * only the #1093-built ones the DEPLOY-LOG entry described.
 *
 * The test is on the FORMATTED magnitude, not the raw float (#1148). A line through two SOLVED
 * points carries the solve's tolerance -- «B על הישר y=x» lands at y - x ≈ 3e-8, so `AB` has
 * `b = -1.0000000124` -- and `=== 1` then printed «x - 1y = 0» for a coefficient `fmt` was about
 * to round to `1` anyway. The rule is about the number the STUDENT sees, so it asks `fmt`.
 */
function term(k: number, sym: string): string {
  if (Math.abs(k) < 1e-12) return '';
  const shown = fmt(Math.abs(k));
  const mag = shown === fmt(1) && sym !== '' ? '' : shown;
  return `${k < 0 ? '-' : '+'} ${mag}${sym} `;
}

/**
 * `(x - h)` for a centred conic, with the two cases notation actually has: a zero offset writes no
 * bracket at all, and a negative one flips the sign rather than printing `(x - -3)`.
 */
function shifted(sym: string, at: number): string {
  if (fmt(Math.abs(at)) === fmt(0)) return `${sym}²`;
  return `(${sym} ${at < 0 ? '+' : '-'} ${fmt(Math.abs(at))})²`;
}

/** A curve row: the equation it leads with, and the derived properties folded beneath it. */
export interface CurveParts {
  /** Always an equation. This is what the «משוואות» section — and «משוואת I» — must show. */
  equation: string;
  /** Centre, radius, foci, directrix: true, useful, and secondary. Absent when there are none. */
  details?: string;
}

/**
 * The equation of a resolved curve, plus whatever it also knows about itself.
 *
 * A LINE has no details: it was already nothing but its equation, and #1212 leaves its row exactly
 * as it was. The other three each gain the equation they never printed.
 */
export function curveParts(c: NumCurve): CurveParts {
  switch (c.kind) {
    case 'line':
      return { equation: lineText(c.a, c.b, c.c) };
    case 'circle':
      return {
        equation: `${shifted('x', c.cx)} + ${shifted('y', c.cy)} = ${fmt(c.r * c.r)}`,
        details: `O(${fmt(c.cx)}, ${fmt(c.cy)}), r = ${fmt(c.r)}`,
      };
    case 'parabola': {
      const f = parabolaFocus(c);
      // `y² = 2p·x`, with the same magnitude rule the line terms use: `y² = x`, never `y² = 1x`.
      const k = 2 * c.p;
      const mag = fmt(Math.abs(k)) === fmt(1) ? '' : fmt(Math.abs(k));
      return {
        equation: `y² = ${k < 0 ? '-' : ''}${mag}x`,
        details: `F(${fmt(f.x)}, 0), x = ${fmt(-c.p / 2)}`,
      };
    }
    case 'ellipse': {
      const [f1, f2] = ellipseFoci(c);
      return {
        equation: `x²/${fmt(c.a * c.a)} + y²/${fmt(c.b * c.b)} = 1`,
        details: `a = ${fmt(c.a)}, b = ${fmt(c.b)}, F₁(${fmt(f1.x)}, ${fmt(f1.y)}), F₂(${fmt(f2.x)}, ${fmt(f2.y)})`,
      };
    }
  }
}

/**
 * WHICH LOCALE KEY LABELS A KIND'S FOLDED DETAIL (#1214).
 *
 * Operator, 2026-09-19, playing T19: *"the data panel says נתוני העקום and עקום is mathematically
 * correct but not what a highschool student would expect so we should have נתוני המעגל and then
 * נתוני הישר etc."*
 *
 * It lives here, beside `curveParts`, because this module already decides which kinds HAVE details —
 * so a test can assert the two agree and a fifth conic cannot ship a labelled row with nothing in it,
 * or a detail row with no label.
 *
 * A KEY, not a string: this layer holds no locale (ADR-AG-085). A LINE is absent on purpose — it
 * returns no `details`, so it renders no disclosure and needs no label ([#1219](https://github.com/dcodish/geo_builder/issues/1219)
 * would give it one).
 */
export function curveDetailsKey(kind: NumCurve['kind']): string {
  switch (kind) {
    case 'circle':
      return 'curveDetailsCircle';
    case 'parabola':
      return 'curveDetailsParabola';
    case 'ellipse':
      return 'curveDetailsEllipse';
    case 'line':
      // Unreachable while a line has no details; typed exhaustively so adding one cannot be silent.
      return 'curveDetailsToggle';
  }
}

/** The whole row on one line, named — what a caller with nowhere to fold the detail away shows. */
export function describeCurve(name: string, c: NumCurve): string {
  const { equation, details } = curveParts(c);
  return `${name ? `${name}: ` : ''}${equation}${details ? `, ${details}` : ''}`;
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
    case 'line':
      /**
       * THE PANEL'S PRINTER, NOT A SECOND ONE (#1197).
       *
       * Operator, twice: *"when a line is shown - we always write it as Ax+By+C=0 and not like
       * the image has"*, and again playing T54. The lane had its own line notation — `x = 4`,
       * `4y = -3x + 25` — while the data panel two inches away wrote `3x + 4y - 25 = 0`. Two
       * printers for one object is how one surface drifts from another, and the convention was
       * already written down in `lineText`.
       *
       * The SNAPPED coefficients, not the classified curve's: they are the exact ones the
       * determinacy gate accepted, and `lineText` clears the fractions itself (#1180).
       */
      return lineText(shape.conic.D, shape.conic.E, shape.conic.F);
    case 'circle': {
      /**
       * THE RIGHT-HAND SIDE IS `r²`, WRITTEN AS `r²` (#1187).
       *
       * Operator, playing T31: *"the radius in equation should show as 25^2 and not 625"*. He is
       * right, and it is not a formatting preference — `(x − 16)² + y² = 625` makes the student
       * compute a square root to find the radius the tool already knows, on a row whose whole job is
       * to tell them what the circle IS. The exam writes `= 25²`.
       *
       * Only when the radius is a clean value to square: `fmt(r)` must round-trip, or `= 12.25²`
       * would be a worse row than the number it replaced. Otherwise the square stands as it did.
       */
      const r2 = c.r * c.r;
      const shown = fmt(c.r);
      const exact = Number.parseFloat(shown);
      const clean = Number.isFinite(exact) && Math.abs(exact * exact - r2) < 1e-9;
      return `${shift('x', c.cx)}² + ${shift('y', c.cy)}² = ${clean ? `${shown}²` : fmt(r2)}`;
    }
    case 'parabola':
      return `y² = ${fmt(2 * c.p)}x`;
    case 'ellipse':
      return `x²/${fmt(c.a * c.a)} + y²/${fmt(c.b * c.b)} = 1`;
  }
}
