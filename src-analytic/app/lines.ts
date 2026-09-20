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
 * ## Where the pieces live
 *
 * The RESOLUTION (and the normalization it needs) sits in `engine/lines.ts`, because #1201 found a
 * third caller below this layer — the solver, computing the residual of «המרחק מ-A לישר l1 = 5».
 * This module keeps what only the surfaces need: the figure-shaped lookups, and the ENUMERATION.
 */
import type { Construction, Id } from '../engine/types';
import type { Figure } from '../engine/evaluate';
import { asPair, lineByName, type NamedLine } from '../engine/lines';

export { asPair, type NamedLine };

/**
 * The line a NAME refers to, as this configuration drew it (#1048, #1148).
 *
 * The resolution itself lives in `engine/lines.ts` (#1201): the SOLVER needs the same answer at every
 * iterate, one layer below this one, and a second copy here would be the very defect #1148 retired.
 * What this adds is only the two lookups a `Figure` can answer.
 */
export function lineNamed(f: Figure, name: string): NamedLine | null {
  return lineByName(
    name,
    (n) => f.curves.find((c) => c.label.name === n || c.id === `line-${n}` || c.id === `circle-${n}`)?.curve ?? null,
    (id) => f.points.find((q) => q.id === id) ?? null,
  );
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
