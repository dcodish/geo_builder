/**
 * The honesty-gate BATTERY, as one function both commit seams call (#782, ADR-461).
 *
 * WHY THIS FILE EXISTS. The battery grew inside `submitPipeline.ts` one gate at a time — labels
 * (ADR-089), numbers (ADR-250), relations (ADR-264), verbs (ADR-292), compounds (#153/#145), word
 * relations (ADR-360), comparisons (ADR-390), construct nouns (ADR-430), and finally the total span
 * accountant (ADR-453). Every one of them protects the same invariant: *nothing the student stated is
 * silently dropped.* But it protected it at ONE seam. The ✎ EDIT path — `App.commitEdit` — parses
 * against the prefix context and commits straight to `replaceGroup`, running **none** of them, so an
 * edit to «מרכזו O. שתי נקודות על המעגל A ו B» committed with the two stated points gone: exactly the
 * class the gates exist to refuse, one seam over. ADR-453 even describes enforcement "at both submit
 * seams" — the two it wired were the grammar commit and the LLM second attempt, both inside
 * `runSubmit`; the edit seam was never in that set.
 *
 * So the battery is no longer a block of code a seam may or may not contain. It is a function, and the
 * seams call it. The point is ADR-W-006's: DERIVE, don't duplicate — the next gate added here reaches
 * the edit seam the day it is written, with nobody having to remember that a second seam exists. That
 * is also why the corpus-wide false-positive net (`scenarios-harness.ts`) takes its gate list from
 * {@link CONTEXT_FREE_GATES} below instead of keeping its own copy: a gate the net does not know about
 * is a gate whose generosity nobody measures.
 *
 * WHAT IT DOES NOT COVER. The LLM second attempt in `submitPipeline` runs a deliberate SUPERSET —
 * `droppedRadiusSymbol`, `droppedRegionSubject`, `droppedMidsegment`, `introducedNewLabels` — because
 * those classes are only reachable when a model, not the grammar, produced the commands. That path
 * keeps its own list; this is the battery a DETERMINISTIC parse must clear.
 */
import {
  droppedComparison,
  droppedCompoundRelation,
  droppedConstructNoun,
  droppedGivenNumbers,
  droppedGivenRelations,
  droppedGivenVerbs,
  droppedMidsegment,
  droppedNewLabels,
  droppedRadiusSymbol,
  droppedRegionSubject,
  droppedWordRelations,
} from '@/parser';
import { unaccountedSpans } from '@/parser/spanAccounting';
import type { AnyCommand, Id } from '@/engine';

/**
 * Every gate that is a pure function of `(utterance, commands)`. Exported as a MAP, not as a sequence
 * of calls, so the corpus-wide false-positive net can iterate it: membership is then mechanical and a
 * new gate cannot be born un-netted. `droppedMidsegment` / `droppedRadiusSymbol` /
 * `droppedRegionSubject` appear here because they ARE context-free and the net measures them, even
 * though only the LLM path consults them today.
 *
 * The context-carrying gates (`droppedNewLabels`, `introducedNewLabels`, `unaccountedSpans`) are
 * deliberately out — they need the figure's existing points, which is not this map's input shape.
 */
export const CONTEXT_FREE_GATES: Record<string, (u: string, cmds: AnyCommand[]) => unknown[] | boolean> = {
  droppedComparison,
  droppedCompoundRelation,
  droppedConstructNoun,
  droppedGivenNumbers,
  droppedGivenRelations,
  droppedGivenVerbs,
  droppedMidsegment,
  droppedRadiusSymbol,
  droppedRegionSubject,
  droppedWordRelations,
};

/** The figure context the label gate and the span accountant take their exemptions from. */
export interface GateCtx {
  points?: Id[];
  radiusSymbols?: { name: string }[];
  angleAliases?: { name: string }[];
}

export interface GateReport {
  /** True when the lowering accounts for everything the student stated. */
  clean: boolean;
  dropped: Id[];
  droppedNums: number[];
  droppedRels: string[];
  droppedVerbs: string[];
  droppedCompound: string[];
  droppedWordRels: string[];
  droppedCmp: boolean;
  droppedConstruct: string[];
  unaccounted: { kind: string; text: string }[];
  /**
   * Everything left unread, as the STUDENT'S OWN tokens — never a gate name and never internal state
   * (the honesty invariant: an error names the statement, not the machinery). A seam that refuses
   * inline shows this; a seam that escalates uses it for the debug line.
   */
  items: string[];
}

/**
 * Run the battery a deterministic parse must clear before it may be committed.
 *
 * Every gate runs — the report is a full account, not a first-failure short-circuit — because both the
 * debug line and the refusal message want everything left unread, not merely the first thing found.
 */
export function honestyGateReport(utterance: string, commands: AnyCommand[], ctx: GateCtx): GateReport {
  const pts = ctx.points ?? [];
  const radiusSymbols = (ctx.radiusSymbols ?? []).map((x) => x.name);
  // The accountant's context — the same exemptions the label gate takes (an EXISTING point, a bound
  // radius symbol, an angle alias are all legitimately unclaimed by a new command).
  const actx = { existingPoints: pts, radiusSymbols, angleAliases: (ctx.angleAliases ?? []).map((x) => x.name) };

  // A typo in a keyword (e.g. "מנוקדה" for "מנקודה") can make a rule match PARTIALLY, silently dropping
  // a NEW label it introduced ("from D …") — committing a wrong/partial figure (ADR-089). An EXISTING
  // label a command doesn't re-name is fine (context).
  const dropped = droppedNewLabels(utterance, commands, pts, radiusSymbols);
  // The NUMERIC sibling (ADR-250): a stated magnitude the commands don't account for means the rule
  // consumed only part of the utterance (usually a typo'd keyword mid-sentence).
  const droppedNums = droppedGivenNumbers(utterance, commands);
  // The RELATION sibling (ADR-264): a stated `AB=CD`/`AB⊥CD`/`AB∥CD` between points that all already
  // appear on the shape trips neither older gate.
  const droppedRels = droppedGivenRelations(utterance, commands);
  // The VERB sibling (ADR-292, the #82 P1): a stated tangency/bisection/… verb entirely absent from the
  // lowering means a rule claimed a compound and dropped a given.
  const droppedVerbs = droppedGivenVerbs(utterance, commands);
  // The STRUCTURAL sibling (#153/#145): a compound measure relation whose lowering doesn't carry the
  // FULL term list was truncated to a different, wrong constraint.
  const droppedCompound = droppedCompoundRelation(utterance, commands);
  // The WORD sibling (ADR-360, #210): a relation stated as a word between circle nouns.
  const droppedWordRels = droppedWordRelations(utterance, commands);
  // The COMPARISON sibling (ADR-390, the #277 P1): a measure compared to a NUMBER states a REGION, and a
  // lowering with no bound/order constraint read it as the EQUALITY at the bound.
  const droppedCmp = droppedComparison(utterance, commands);
  // The OBJECT sibling (ADR-430, #456): the utterance states a shape AND a construct on it, and the rule
  // that recognised its own noun emitted only the shape.
  const droppedConstruct = droppedConstructNoun(utterance, commands);
  // SPAN ACCOUNTING (ADR-453, docs/24 §4.2) — the TOTAL mechanism the gates above approximate one
  // category at a time. It JOINS the family rather than replacing it until the retirement differential
  // proves it reproduces each exemption set (#758).
  const unaccounted = unaccountedSpans(utterance, commands, actx);

  const clean =
    unaccounted.length === 0 &&
    dropped.length === 0 &&
    droppedNums.length === 0 &&
    droppedRels.length === 0 &&
    droppedVerbs.length === 0 &&
    droppedCompound.length === 0 &&
    droppedWordRels.length === 0 &&
    !droppedCmp &&
    droppedConstruct.length === 0;

  const items = [
    ...dropped.map(String),
    ...droppedNums.map(String),
    ...droppedRels,
    ...droppedVerbs,
    ...droppedCompound,
    ...droppedWordRels,
    ...droppedConstruct,
    ...unaccounted.map((x) => x.text),
  ].filter((s, i, a) => s.trim().length > 0 && a.indexOf(s) === i);

  return {
    clean,
    dropped,
    droppedNums,
    droppedRels,
    droppedVerbs,
    droppedCompound,
    droppedWordRels,
    droppedCmp,
    droppedConstruct,
    unaccounted,
    items,
  };
}
