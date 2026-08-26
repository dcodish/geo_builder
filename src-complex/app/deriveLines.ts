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
import type { Claim as Assertion } from '../model/claim';
import type { FigureObject } from '../model/figure';
import type { ExprQuery, MeasureQuery, MeasureRelation, RatioQuery } from '../model/measure';
import type { SequenceStatement } from '../model/sequence';
import { rootsMode } from '../model/naming';
import { refsOf } from '../model/expr';
import { solutionSetConstraints, solutionSetNames } from '../model/solutionSet';
import { type Derived2, type FoldInput, type Untranslated, foldConstraints } from '../replay/derive2';

/**
 * Fold the student's LINES through the v2 parser and the exact solver.
 *
 * A line the grammar does not cover yet is REPORTED with its own words and the parser's reason, never
 * skipped: the honesty contract does not change with the source of the input, and a figure that
 * quietly ignored a line would be the silent-drop class arriving by a new route.
 *
 * ## Why the readings that depend on ORDER are decided here (#680, ADR-CX-024)
 *
 * `parseLineV2(raw)` takes one line and is stateless — deliberately, because span accounting depends on
 * it — so it cannot answer *what did earlier lines establish?* And ADR-CX-005's three readings of
 * `X^n = …` turn on exactly that question: a fresh letter over a grounded right-hand side is the exam's
 * «פתרו את המשוואה» and enumerates; an existing letter is constrained; a letter whose right-hand side
 * this very line invented is relating two numbers, not solving for one.
 *
 * This function is the first layer that sees the lines **in order**, so it is where the question can be
 * asked. It was not asked at all until now: the enumeration lived inside the retiring prototype's
 * bridge, and on this path `z³ = 8` was one point with three configurations while `w = z1 * 2` invented
 * `z1` as a free number and printed a sampled position for it.
 */
export function deriveLines(
  lines: readonly string[],
  configIndex = 0,
  seed = 0,
  asks: readonly string[] = [],
): Derived2 {
  const lowered = lowerLines(lines);
  const lane = lowerAsks(asks);
  return foldConstraints({
    ...lowered,
    queries: [...(lowered.queries ?? []), ...lane.queries],
    ratios: [...(lowered.ratios ?? []), ...lane.ratios],
    exprQueries: [...(lowered.exprQueries ?? []), ...lane.exprQueries],
    configIndex,
    seed,
  });
}

/**
 * The ASK LANE, lowered (#789) — panel questions joining the fold's query channels.
 *
 * A lane entry that does not read as a pure question contributes nothing here: the panel row
 * explains it in place (unreadable / actually-a-statement), and feeding a statement into the fold
 * from the lane would let a "question" constrain the figure — the one thing ADR-3D-057's doctrine
 * exists to forbid. Grammar unchanged: the fact list still lowers query LINES (legacy saved files
 * replay through the router in `submit.ts`, which files them here instead).
 */
export function lowerAsks(asks: readonly string[]): {
  queries: MeasureQuery[];
  ratios: RatioQuery[];
  exprQueries: ExprQuery[];
} {
  const queries: MeasureQuery[] = [];
  const ratios: RatioQuery[] = [];
  const exprQueries: ExprQuery[] = [];
  for (const raw of asks) {
    const r = parseLineV2(raw.trim());
    if (!r.ok) continue;
    const l = r.line;
    // `declares` deliberately uncounted AND unenacted: a question never creates a point (readAsk's
    // doctrine note) — a name it mentions must exist from the givens or the answer reads open
    const states =
      l.constraints.length + l.filters.length + l.assertions.length +
      l.objects.length + l.measures.length + l.sequences.length + l.roots.length;
    if (states > 0) continue;
    queries.push(...l.queries);
    ratios.push(...l.ratios);
    exprQueries.push(...l.exprQueries);
  }
  return { queries, ratios, exprQueries };
}

/**
 * The lines, LOWERED — everything the fold needs, and the only sanctioned way to get it.
 *
 * Exported because it is the one place `X^n = …` is read (see above), and a caller that assembled fold
 * input by concatenating `parsedLine.constraints` itself would silently drop every power equation. That
 * is not hypothetical: `parser/__tests__/rules.test.ts` had exactly such a helper, and it dropped #607's
 * middle line the moment the reading moved here. One accumulator, so there is nothing to forget.
 */
export function lowerLines(lines: readonly string[]): Omit<FoldInput, 'configIndex' | 'seed'> {
  const constraints: Constraint[] = [];
  const filters: BranchFilter[] = [];
  const declared: string[] = [];
  const assertions: Assertion[] = [];
  const objects: FigureObject[] = [];
  const measures: MeasureRelation[] = [];
  const queries: MeasureQuery[] = [];
  const ratios: RatioQuery[] = [];
  const exprQueries: ExprQuery[] = [];
  const sequences: SequenceStatement[] = [];
  const atoms = new Map<string, number>();
  const untranslated: Untranslated[] = [];

  /**
   * Every name an EARLIER line mentioned — defined, constrained, or merely referred to.
   *
   * "Mentioned, not defined" is the whole test, and it is ADR-CX-021 Decision 3: «|z₁| = 9r» introduces
   * z₁ through a relation, and a student who wrote that has plainly stated z₁. Read BEFORE each line is
   * lowered, so a line sees its predecessors and never itself — a number cannot ground the statement
   * that invented it.
   */
  const mentioned = new Set<string>(['o']);

  /**
   * A RESERVED letter, and the statement that reserved it: `z` after `z³ = 8` stands for the solution
   * SET, not for a number.
   *
   * Enforced rather than merely declared, because reserving without enforcing only moves the phantom.
   * A later «z = 1+i» has no honest reading — `z` is already three points — and left alone the fold
   * auto-creates a fourth, free `z` and draws it at a sampled position. That is the same silent
   * invention #680 was filed about, one name along, so it is refused here with the statement that owns
   * the letter named, which is what the prototype did.
   */
  const reserved = new Map<string, string>();

  lines.forEach((raw, idx) => {
    const r = parseLineV2(raw);
    if (!r.ok) {
      untranslated.push({
        factId: `line-${idx}`,
        src: raw,
        why:
          r.reason === 'unaccounted'
            ? { code: 'line-unaccounted', items: r.items.join(', ') }
            : { code: 'line-unrecognized' },
      });
      return;
    }
    const clash = r.line.declares.find((n) => reserved.has(n));
    if (clash !== undefined) {
      untranslated.push({
        factId: `line-${idx}`,
        src: raw,
        why: { code: 'reserved-letter', letter: clash, equation: reserved.get(clash)! },
      });
      return;
    }
    // `X^n = …`: ask the mode from what came before, then emit the one lowering both engines share.
    // The letter itself is declared only in `constrain` mode — otherwise it is RESERVED, standing for
    // the whole set, and drawing a point for it would plot the sampler's guess at "the solutions".
    for (const eq of r.line.roots) {
      const grounded = refsOf(eq.rhs).every((n) => mentioned.has(n));
      const mode = rootsMode(eq.varName, eq.n, mentioned, grounded);
      constraints.push(...solutionSetConstraints(eq, mode));
      declared.push(...solutionSetNames(eq, mode));
      // the bare letter stays reserved in every mode: `z` is related to `z₁..zₙ`
      mentioned.add(eq.varName);
      for (const n of solutionSetNames(eq, mode)) mentioned.add(n);
      // …but only an ENUMERATION makes the letter mean the set rather than a number. In `constrain`
      // mode `z` IS the number the equation is about, and a later line may say more about it.
      if (mode !== 'constrain') reserved.set(eq.varName, eq.src);
    }
    for (const n of [...r.line.declares, ...r.line.roots.flatMap((e) => refsOf(e.rhs))]) {
      mentioned.add(n);
    }
    constraints.push(...r.line.constraints);
    filters.push(...r.line.filters);
    declared.push(...r.line.declares);
    assertions.push(...r.line.assertions);
    objects.push(...r.line.objects);
    measures.push(...r.line.measures);
    queries.push(...r.line.queries);
    ratios.push(...r.line.ratios);
    exprQueries.push(...r.line.exprQueries);
    sequences.push(...r.line.sequences);
    for (const [k, v] of r.line.atoms) atoms.set(k, v);
  });

  return {
    constraints,
    filters,
    declared,
    atoms,
    untranslated,
    assertions,
    objects,
    measures,
    queries,
    ratios,
    exprQueries,
    sequences,
  };
}
