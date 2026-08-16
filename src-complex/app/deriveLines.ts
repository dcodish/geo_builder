/**
 * THE SUBMIT PATH — the student's lines become a figure.
 *
 * This is the layer 2-D had to extract later and 3-D never built: a 410-line orchestration living
 * inside a React component, with *"zero direct tests"*, which docs/23 called the biggest hole in the
 * nets. It exists here from the moment there is anything to orchestrate.
 *
 * It is also where the layering puts it. `parser` names what the student said, `replay` folds
 * constraints into a figure, and NEITHER may import the other — the composition is this file's job.
 * The import-direction guard caught the first version doing it inside `replay/` and was right to.
 */

import { parseLineV2 } from '../parser/rules';
import type { BranchFilter, Constraint } from '../model/constraint';
import { type Derived2, type Untranslated, foldConstraints } from '../replay/derive2';

/**
 * Fold the student's LINES through the v2 parser and the exact solver.
 *
 * A line the grammar does not cover yet is REPORTED with its own words and the parser's reason, never
 * skipped: the honesty contract does not change with the source of the input, and a figure that
 * quietly ignored a line would be the silent-drop class arriving by a new route.
 */
export function deriveLines(lines: readonly string[], configIndex = 0, seed = 0): Derived2 {
  const constraints: Constraint[] = [];
  const filters: BranchFilter[] = [];
  const declared: string[] = [];
  const untranslated: Untranslated[] = [];

  lines.forEach((raw, idx) => {
    const r = parseLineV2(raw);
    if (!r.ok) {
      untranslated.push({
        factId: `line-${idx}`,
        src: raw,
        why: r.reason === 'unaccounted' ? `לא הובן: ${r.items.join(', ')}` : 'הדקדוק לא מזהה את השורה הזו',
      });
      return;
    }
    constraints.push(...r.line.constraints);
    filters.push(...r.line.filters);
    declared.push(...r.line.declares);
  });

  return foldConstraints(constraints, filters, declared, new Map(), untranslated, configIndex, seed);
}
