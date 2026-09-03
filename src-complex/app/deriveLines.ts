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

import { type ParsedLine, parseLineV2 } from '../parser/rules';
import { isPointLabel } from '../parser/exprParse';
import type { BranchFilter, Constraint } from '../model/constraint';
import type { Claim as Assertion } from '../model/claim';
import type { FigureObject } from '../model/figure';
import type { ExprQuery, MeasureQuery, MeasureRelation, RatioQuery } from '../model/measure';
import type { SequenceStatement } from '../model/sequence';
import { type RootsMode, rootsMode } from '../model/naming';
import { refsOf } from '../model/expr';
import { type RootsEquation, solutionSetConstraints, solutionSetNames } from '../model/solutionSet';
import { type Derived2, type FoldInput, type ResolvedSelection, type Untranslated, foldConstraints } from '../replay/derive2';

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
    const a = askArtifacts(r.line);
    if (!a) continue;
    queries.push(...a.queries);
    ratios.push(...a.ratios);
    exprQueries.push(...a.exprQueries);
  }
  return { queries, ratios, exprQueries };
}

/**
 * How one PARSED line reads as a question — the one definition (`readAsk`, the lane lowering and
 * the panel's row model all call this, so they cannot disagree).
 *
 * `null` when the line STATES something. `declares` is deliberately uncounted and unenacted: a
 * question never creates a point — a name it mentions must exist from the givens or the answer
 * reads open. One conversion (#791, the operator's «AB» ruling): a bare two-point run — «AB»,
 * «z1z2» — is F6's segment STATEMENT in the givens box, but in the ask register it is the length
 * question about that segment, so here it reads as «אורך AB» does.
 */
export function askArtifacts(l: ParsedLine): {
  queries: MeasureQuery[];
  ratios: RatioQuery[];
  exprQueries: ExprQuery[];
} | null {
  const bareSegment =
    l.objects.length === 1 &&
    l.objects[0].kind === 'segment' &&
    l.constraints.length + l.filters.length + l.assertions.length + l.measures.length +
      l.sequences.length + l.roots.length + l.queries.length + l.ratios.length +
      l.exprQueries.length === 0;
  if (bareSegment) {
    const seg = l.objects[0] as { kind: 'segment'; points: readonly string[]; src: string };
    return { queries: [{ kind: 'length', points: seg.points, src: seg.src }], ratios: [], exprQueries: [] };
  }
  const states =
    l.constraints.length + l.filters.length + l.assertions.length +
    l.objects.length + l.measures.length + l.sequences.length + l.roots.length;
  if (states > 0) return null;
  if (l.queries.length + l.ratios.length + l.exprQueries.length === 0) return null;
  return { queries: [...l.queries], ratios: [...l.ratios], exprQueries: [...l.exprQueries] };
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
  /** #694 — the selections this figure states, each with the set it picks from. */
  const selections: ResolvedSelection[] = [];
  /** #791 — «z1 = A» / «A = z1» bindings, read off the equation shape: number name → label */
  const aliases = new Map<string, string>();

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
  /**
   * #694 — every enumeration by its letter, so a later SELECTION can name the set's members with the
   * SAME function that named them in the first place, never a second naming convention.
   */
  const rootsByLetter = new Map<string, { eq: RootsEquation; mode: RootsMode }>();

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
      rootsByLetter.set(eq.varName, { eq, mode });
    }
    /**
     * #694 — a SELECTION names its candidate set from the enumeration in scope.
     *
     * The parser is stateless per line, so it reports the sentence and this layer supplies the members.
     * Exactly ONE reserved letter is the unambiguous case; with none there is nothing to select from,
     * and the selection carries no candidates — which the fold refuses against the student's own line
     * rather than inventing a set to satisfy it.
     */
    for (const sel of r.line.selections) {
      const enums = [...reserved.keys()];
      const only = enums.length === 1 ? rootsByLetter.get(enums[0]) : undefined;
      selections.push({ ...sel, candidates: only ? solutionSetNames(only.eq, only.mode) : [] });
      mentioned.add(sel.name);
    }
    for (const n of [...r.line.declares, ...r.line.roots.flatMap((e) => refsOf(e.rhs))]) {
      mentioned.add(n);
    }
    /**
     * #791 — a BINDING is an equation of two bare refs, one z/w number and one point label:
     * «z1 = A» (either order). The tie constraint stays — the exact tier makes the two names one
     * value — and the alias records the DISPLAY half: the label node hides, the number shows
     * «A (z₁)». Detected on the parsed shape rather than by a bespoke rule, so every spelling the
     * equation grammar reads is a binding spelling.
     */
    for (const c of r.line.constraints) {
      if ((c.kind ?? 'eq') !== 'eq' || c.lhs.t !== 'ref' || c.rhs.t !== 'ref') continue;
      const names = [c.lhs.name, c.rhs.name];
      const label = names.find((n) => isPointLabel(n));
      const number = names.find((n) => /^[zw]\d*$/.test(n));
      if (label !== undefined && number !== undefined) aliases.set(number, label);
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
    aliases,
    assertions,
    objects,
    measures,
    queries,
    ratios,
    exprQueries,
    sequences,
    selections,
  };
}
