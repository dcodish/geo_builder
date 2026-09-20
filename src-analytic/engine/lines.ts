/**
 * WHAT LINE A NAME DENOTES — the one resolution, for every layer that needs it (#1148, #1201).
 *
 * Two spellings mean two different things and both are legal: «l1» is a curve the student named, and
 * «AB» is the line through two points they placed — which need not have been stated as a line at all.
 *
 * ## Why this is in `engine/` and not only in `app/`
 *
 * #1148 put this resolution in `app/lines.ts`, because the two surfaces that needed it — the ask lane
 * and the click menu — both live there. Then [#1201](https://github.com/dcodish/geo_builder/issues/1201)
 * showed a THIRD caller, one layer down: the **solver**. «המרחק מ-A לישר l1 = 5» is a constraint, and
 * its residual cannot be computed without knowing which line `l1` is.
 *
 * The temptation was to give `solve.ts` its own little resolver. That is precisely the defect #1148
 * was filed against — one object resolved several ways, so a capability added to one reader is
 * missing from the others in silence. So the resolution moved DOWN to where the lowest caller can
 * reach it, and `app/lines.ts` now builds on this rather than beside it.
 *
 * ## It resolves against a CONFIGURATION, not a figure
 *
 * The two dependencies are injected — "which curve is called this" and "where is this point" — because
 * the solver asks at every iterate, where there is no `Figure` yet, only the vector it is currently
 * trying. Taking a `Figure` here would have forced the solver to build one per iteration, which is
 * both slow and circular.
 */
import type { Pt } from './derived';
import type { Id, NumCurve } from './types';

/** A line as `ax + by + c = 0`, normalized so that one line is always one triple. */
export interface NamedLine {
  a: number;
  b: number;
  c: number;
}

/** A name spells a segment when it is two DIFFERENT letters — «AB», never «AA». */
const PAIR = /^([A-Z][0-9]?)([A-Z][0-9]?)$/;

/** The two point ids a name spells, or `null` when the name is not a pair of letters. */
export function asPair(name: string): [Id, Id] | null {
  const m = PAIR.exec(name);
  if (!m || m[1] === m[2]) return null;
  return [m[1], m[2]];
}

/**
 * One line, one triple: divided by its leading coefficient, which is then exactly `1`.
 *
 * A line through two points is built as `a = Δy`, `b = −Δx`, so its raw coefficients scale with how
 * far apart the two points happen to sit. That scale is not part of the line, and leaving it in breaks
 * two things: `A(0,0)`–`B(6,0)` prints «-6y = 0» instead of «y = 0», and `isKnowledge` over raw
 * coefficients calls a perfectly determined line *unknown* merely because its points slid along it.
 *
 * Dividing by `hypot(a, b)` would be the textbook normal form and is the WRONG choice here: it makes
 * `A(0,0)`–`C(3,5)` print «0.86x - 0.51y = 0», because 5/√34 is a surd and ADR-AG-085's fraction
 * clearing cannot clear what is not rational. The leading coefficient keeps a rational line rational.
 *
 * `null` when the "line" is degenerate — two coincident points name no line, and saying so here is
 * what keeps every caller from dividing by zero in its own way.
 */
export function normalizedLine(a: number, b: number, c: number): NamedLine | null {
  if (!(Math.hypot(a, b) > 1e-12)) return null;
  const k = Math.abs(a) > 1e-12 ? a : b;
  return { a: a / k, b: b / k, c: c / k };
}

/**
 * IS THIS DIRECTION VERTICAL — the ONE answer, for every surface that prints one (#1276).
 *
 * **Operator, playing `prod/2026-09-20`:** *"take a look at the equation of AD … the slope there is
 * completely off"*. The panel's slopes list said «אנכי» about `AD` while the working three rows below
 * it printed `m = (0 - 6) / (1 - 1) = -1663960853.8` — a division by a printed zero, in the lane whose
 * purpose is to teach the method.
 *
 * **The cause is units, not logic.** Every printer decided verticality with an ABSOLUTE `|Δx| < 1e-12`,
 * and a solved foot carries the solver's residual: measured on that figure, `D.x − A.x = 3.6e-9` —
 * three and a half orders ABOVE the guard. The same functions are correct on exact input, which is why
 * this never showed in a hand-written test.
 *
 * So the question is asked RELATIVELY, against the direction's own length, exactly as the slopes panel
 * already asked it (`|Δx| / ‖(Δx, Δy)‖`) — the one surface that got it right, and the reason its answer
 * disagreed with every other. `verticality` is 0 for an exactly vertical direction and 1 for an exactly
 * horizontal one, so the tolerance means the same thing at every scale (ADR-AG-021's rule, which this
 * layer had not inherited).
 *
 * The panel needs the RATIO — it feeds `isKnowledge`, which asks whether a quantity is stable across
 * configurations and cannot be handed a boolean — and the printers need the PREDICATE. Both are here so
 * that a caller cannot pick a different threshold, which is precisely what happened.
 */
export const VERTICAL_TOL = 1e-6;

/** How far a direction is from vertical: `0` exactly vertical, `1` exactly horizontal. Scale-free. */
export function verticality(dx: number, dy: number): number {
  return Math.abs(dx) / Math.max(1e-12, Math.hypot(dx, dy));
}

/** A direction is vertical when its horizontal part is negligible RELATIVE to its length. */
export function isVertical(dx: number, dy: number): boolean {
  return verticality(dx, dy) < VERTICAL_TOL;
}

/**
 * The same question for a line given as `ax + by + c = 0`, whose direction is `(−b, a)`.
 *
 * Stated as a call rather than a second threshold: a line is vertical exactly when the direction along
 * it is, and `b` alone cannot answer that — `0.0000001x + 0.00000001y = 0` is not a vertical line, it
 * is a badly scaled one.
 */
export function isVerticalLine(a: number, b: number): boolean {
  return isVertical(-b, a);
}

/**
 * The line `name` denotes in the configuration described by `curveByName` and `at`.
 *
 * A named curve wins over the pair reading, and a curve that is not a LINE falls through to the pair —
 * so a circle called «AB» does not stop `AB` meaning the line through `A` and `B`.
 */
export function lineByName(
  name: string,
  curveByName: (n: string) => NumCurve | null,
  at: (id: Id) => Pt | null,
): NamedLine | null {
  const curve = curveByName(name);
  if (curve && curve.kind === 'line') return normalizedLine(curve.a, curve.b, curve.c);
  const pair = asPair(name);
  if (!pair) return null;
  const p = at(pair[0]);
  const q = at(pair[1]);
  if (!p || !q) return null;
  // Through two points: the line whose normal is perpendicular to P->Q.
  return normalizedLine(q.y - p.y, -(q.x - p.x), (q.x - p.x) * p.y - (q.y - p.y) * p.x);
}
