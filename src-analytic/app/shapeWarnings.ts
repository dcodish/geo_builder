/**
 * A DECLARED SHAPE THE DRAWING NO LONGER IS — said while it holds (#1627, ADR-AG-189 Amendment 1).
 *
 * **Operator ruling, 2026-10-01:** givens that force a trapezoid into a rectangle or a parallelogram are
 * *"drawn with warning"* — the 2-D sibling's [ADR-165](../../docs/06-decisions.md#adr-165) (allow, flag
 * amber; `src/engine/verify.ts` `trapezoidMorph`). Nothing is refused: the figure the givens describe is a
 * valid quadrilateral, and the student may have meant to discover exactly this. What may not happen is
 * the tool presenting it as the trapezoid they declared.
 *
 * **A statement about what is ON SCREEN, not about a search.** The warning is read off the DRAWN
 * configuration — `d.figure.ringFaults`, which `evaluate` computed on the very positions the canvas draws
 * — so "the search found no trapezoid" is never the claim (#1071). The configuration search keeps the
 * exclusion as a PREFERENCE (`drawableAt`'s `whole()`): wherever a real trapezoid configuration exists it
 * is the one drawn, and then there is no fault and no warning. A real trapezoid never shows it.
 *
 * **Which line forced it.** The latest line without which the drawn figure (same seed, same seed names)
 * is not a parallelogram under that noun: walk the active list backwards, re-deriving each prefix, and
 * stop at the first prefix that is clean. Most often that is one re-derivation (the line just typed);
 * corners typed first and the noun last name the noun line, because before it there was no trapezoid.
 * Paid only on a figure that carries the fault — every other figure returns `[]` without deriving.
 *
 * Pure over `(lines, d)`: derived on every render like everything else on the page, so deleting or
 * muting the forcing line, or «הציגו תצורה אחרת» onto a true trapezoid, clears it with no state to reset.
 */
import { derive, type Derivation } from '../engine/derive';
import type { Translate } from './errorText';

export interface ShapeWarning {
  code: 'trapezoid-is-parallelogram';
  /** The polygon as the student named it — its vertices in declared order («ABCO»). */
  shape: string;
  /** The ACTIVE index of the line that forced it. */
  forcedBy: number;
  /** That line, as typed. */
  line: string;
}

/** Does this derivation DRAW polygon `id` as a parallelogram under a one-parallel-pair noun? */
const drawnAsParallelogram = (d: Derivation, id: string): boolean =>
  d.figure.ringFaults.some((f) => f.id === id && f.violation === 'trapezoid-is-parallelogram');

export function shapeWarningsOf(lines: readonly string[], d: Derivation): ShapeWarning[] {
  const out: ShapeWarning[] = [];
  const seedNames = d.construction.seedNames ?? {};
  for (const rf of d.figure.ringFaults) {
    if (rf.violation !== 'trapezoid-is-parallelogram') continue;
    const poly = d.construction.objects.find((o) => o.id === rf.id);
    if (!poly || poly.kind !== 'polygon') continue;
    let forcedBy = lines.length - 1;
    for (let k = lines.length - 1; k >= 0; k -= 1) {
      forcedBy = k;
      if (!drawnAsParallelogram(derive(lines.slice(0, k), d.seed, seedNames), rf.id)) break;
    }
    out.push({ code: rf.violation, shape: poly.vertices.join(''), forcedBy, line: lines[forcedBy] ?? '' });
  }
  return out;
}

/** The warning as a sentence about the student's own statement, in the page's language. */
export const shapeWarningText = (w: ShapeWarning, t: Translate, line = w.line, shape = w.shape): string =>
  t('warnTrapezoidIsParallelogram', { shape, line });
