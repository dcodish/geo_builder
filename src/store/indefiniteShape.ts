/**
 * #2127 ([ADR-654](../../docs/06-decisions.md#adr-654)) — AN INDEFINITE SHAPE IS A NEW SHAPE, UNLESS IT IS ALREADY THERE.
 *
 * «משולש חסום במעגל O» (no article, no letters) says that a triangle inscribed in circle O exists. The parser reads an
 * unnamed shape noun against the figure's one polygon of that size (ADR-029's implicit reference), which is right for
 * the definite «המשולש …» and wrong for the indefinite noun: after «משולש חוסם את מעגל O», the student's second triangle
 * was lowered as a statement about the first and refused as contradicting it.
 *
 * The decision, one implementation for submit, the ✎ edit seam, the load refresh and audit, and the scenario harness: when the parser reports that an
 * indefinite noun was bound to an existing polygon (`indefiniteShape`), the sentence is a RESTATEMENT only if it already
 * holds of that polygon — said of it, it adds nothing (`dryRunOutcome` empty or implied) and breaks no given (the givens
 * verifier finds no new violation). Then it stays bound, and the caller answers «כבר קיים» as before. Otherwise it is a
 * new shape: re-read with that polygon out of the reference set, so the rule mints the next free letters, exactly as it
 * does when no polygon of that size exists.
 */
import { parse, type ParseContext, type ParseResult } from '@/parser';
import { withSolveBudget } from '@/engine';
import { dryRunOutcome, getFoldFor, replay, trialFacts, type Fact } from './geoStore';

/**
 * Does the bound reading already hold of the existing shape? (Adds nothing, breaks nothing.)
 *
 * #2480 ([ADR-757](../../docs/06-decisions.md#adr-757)): a restatement is already TRUE of the drawn figure, so its
 * trial builds without the failure path — it never needs the recruit ladder, which only runs when a fact does not
 * hold. The probe therefore runs with that ladder spent (a solve budget that is already over: deterministic, never
 * machine-dependent), so a reading that is false of the figure is answered at once instead of paying the whole
 * ladder for a "no" (55 s for «ריבוע חסום במעגל O» after a square drawn around O). Only when the figure's own fold
 * resumes cleanly as a prefix: a fold whose creating fact landed on a retry pass is re-folded whole by the trial, and
 * then the ladder may be the figure's own (ADR-577), so the probe runs unbudgeted as before.
 */
export function restatesExistingShape(facts: Fact[], commands: readonly unknown[], seed: number): boolean {
  const cmds = commands as Parameters<typeof trialFacts>[1];
  const before = replay(facts, seed);
  const node = getFoldFor(facts);
  const probe = () => {
    const o = dryRunOutcome(facts, cmds, seed);
    if (o.produced || (o.reason !== 'empty' && o.reason !== 'implied')) return false;
    return replay(trialFacts(facts, cmds), seed).violations.length <= before.violations.length;
  };
  return node && !node.retriedCreating ? withSolveBudget(0, probe) : probe();
}

/** The reading of `utterance` an indefinite shape noun calls for: `r` itself, or the new-shape re-read. */
export function indefiniteShapeReading(r: ParseResult, utterance: string, ctx: ParseContext, facts: Fact[], seed: number): ParseResult {
  if (!r.ok || !r.indefiniteShape) return r;
  if (restatesExistingShape(facts, r.commands, seed)) return r;
  const key = r.indefiniteShape.join(',');
  const polygons = (ctx.polygons ?? []).filter((v) => v.map((p) => p.toUpperCase()).join(',') !== key);
  const fresh = parse(utterance, { ...ctx, polygons });
  return fresh.ok ? { ...fresh, indefiniteShape: undefined } : r;
}
