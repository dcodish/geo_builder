/**
 * WHAT A NAME DENOTES WHEN IT DENOTES A LINE — the ONE resolver every surface calls (#1148, #1139).
 *
 * Operator, 2026-09-16, on `A(0,0)` `B(6,0)` `C(3,5)` + «משולש ABC»: *"now the line is drawn but data
 * panel still refuses"*, and *"the line itself is not clickable in this state and it should be —
 * allowing to show distance, equation, slope."*
 *
 * ## The defect this module exists to make unrepresentable
 *
 * Before it, **each question resolved its own operand its own way**, so a referencing capability
 * added to one was missing from the others — silently. Measured on the triangle above:
 *
 * ```
 * AB                  -> 6          the measure grammar resolves a two-point line
 * שיפוע AB            -> 0          the slope branch resolves a two-point line
 * משוואת AB           -> MISSING    the equation branch does not
 * המרחק מ-C לישר AB   -> 5          the ask lane answers it
 * menu(C)             -> ["C"]      ...and the click menu never offers it
 * ```
 *
 * `AB` is one line. It existed to three resolvers and not to the fourth, and the click menu — a
 * fifth enumeration — could not see it at all. Fixing the equation branch alone would have guaranteed
 * that the next question kind repeats it, which is the class, not the input (standing rule 1).
 *
 * So there are exactly two questions here, and every surface asks THESE:
 *
 * - **resolution** — `lineNamed(figure, name)`: which line is this, in the configuration drawn?
 * - **enumeration** — `lineNamesOf(construction)`: which names denote a line at all?
 *
 * They are tied by an invariant the suite asserts: **every name `lineNamesOf` offers resolves through
 * `lineNamed`.** A menu entry the ask lane would refuse is the menu lying about the figure, and that
 * is now a test failure rather than a report.
 *
 * ## Why the coefficients are NORMALIZED
 *
 * A line through two points is built as `a = Δy`, `b = −Δx`, so its coefficients scale with how far
 * apart the two points happen to sit. That scale is not part of the line: `A(0,0)`–`B(6,0)` would
 * print «-6y = 0» instead of «y = 0», and — worse — `isKnowledge` over raw coefficients would call a
 * perfectly determined line unknown merely because the points slid along it between configurations.
 *
 * A line's identity is its coefficient RATIO, so the triple is divided by its LEADING coefficient.
 * Dividing by `hypot(a, b)` would be the textbook normal form and is the wrong choice here: it makes
 * `A(0,0)`–`C(3,5)` print «0.86x - 0.51y = 0», because 5/√34 is a surd and `fractionClearingFactor`
 * cannot clear what is not rational. Dividing by the leading coefficient keeps a rational line
 * rational — `(5, -3, 0)` → `(1, -0.6, 0)` → cleared back to «5x - 3y = 0» — and fixes the sign for
 * free, since the leading coefficient becomes exactly `1`.
 *
 * Every existing consumer is unaffected by construction: the slope is `-a/b` and the point-line
 * distance divides by `hypot(a, b)`, so both are scale-invariant.
 */
import type { Construction, Id } from '../engine/types';
import type { Figure } from '../engine/evaluate';

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
 * `null` when the "line" is degenerate — two coincident points name no line, and saying so here is
 * what keeps every caller from dividing by zero in its own way.
 */
function normalized(a: number, b: number, c: number): NamedLine | null {
  if (!(Math.hypot(a, b) > 1e-12)) return null;
  const k = Math.abs(a) > 1e-12 ? a : b;
  return { a: a / k, b: b / k, c: c / k };
}

/**
 * The line a NAME refers to, as this configuration drew it (#1048, #1148).
 *
 * Two spellings mean two different things and both are legal: «l1» is a curve the student named, and
 * «AB» is the line through two points they placed — which need not have been stated as a line at all.
 * Resolving both here keeps `lengths.ts` free of any knowledge about objects.
 */
export function lineNamed(f: Figure, name: string): NamedLine | null {
  const curve = f.curves.find((c) => c.label.name === name || c.id === `line-${name}` || c.id === `circle-${name}`);
  if (curve && curve.curve.kind === 'line') return normalized(curve.curve.a, curve.curve.b, curve.curve.c);
  const pair = asPair(name);
  if (!pair) return null;
  const p = f.points.find((q) => q.id === pair[0]);
  const q = f.points.find((r) => r.id === pair[1]);
  if (!p || !q) return null;
  // Through two points: the line whose normal is perpendicular to P->Q.
  return normalized(q.y - p.y, -(q.x - p.x), (q.x - p.x) * p.y - (q.y - p.y) * p.x);
}

/**
 * Every name in this figure that denotes a line, in the order a menu should offer them.
 *
 * Three sources, and the last two are what #1139 was filed about: a triangle's sides are lines the
 * student can see and ask about, and before this they were lines to nobody.
 *
 * An ANONYMOUS curve is deliberately absent: it is referred to by its equation (ADR-AG-056), which is
 * a long menu entry a student rarely wants a distance to. That exclusion is the menu's, and it is why
 * the invariant runs one way — everything offered resolves, not everything that resolves is offered.
 */
export function lineNamesOf(c: Construction): string[] {
  const out: string[] = [];
  const add = (n: string | undefined) => {
    if (n && !out.includes(n)) out.push(n);
  };
  const has = (id: Id) => c.objects.some((o) => o.id === id);

  // 1 — a curve the student named, when its label does not say it is something other than a line.
  for (const o of c.objects) {
    if (o.kind !== 'curve') continue;
    if (o.label.kind && o.label.kind !== 'line') continue;
    add(o.label.name);
  }
  // 2 — every stated segment, and 3 — every side of every polygon.
  for (const o of c.objects) {
    if (o.kind === 'segment') {
      if (has(o.a) && has(o.b)) add(`${o.a}${o.b}`);
    } else if (o.kind === 'polygon') {
      const v = o.vertices;
      for (let i = 0; i < v.length; i++) {
        const p = v[i];
        const q = v[(i + 1) % v.length];
        if (p !== q && has(p) && has(q)) add(`${p}${q}`);
      }
    }
  }
  return out;
}

/**
 * The two-letter name of a DRAWN segment, by the id the renderer reports (#1139).
 *
 * The canvas draws a triangle's sides as individual lines, so a student can see them and click them
 * — but the id that comes back is `poly-ABC-1`, which is a drawing detail, not something anyone can
 * ask about. This turns it back into `BC`, the name the ask lane already answers, so the click menu
 * needs no vocabulary of its own.
 *
 * Resolved STRUCTURALLY, from the objects themselves, rather than by parsing letters out of the id:
 * an id is the renderer's business and this must not become a second place that knows how they are
 * spelled.
 */
export function segmentName(c: Construction, id: Id): string | null {
  for (const o of c.objects) {
    if (o.kind === 'segment' && o.id === id) return `${o.a}${o.b}`;
    if (o.kind === 'polygon') {
      const v = o.vertices;
      for (let i = 0; i < v.length; i++) if (`${o.id}-${i}` === id) return `${v[i]}${v[(i + 1) % v.length]}`;
    }
  }
  return null;
}
