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
