/**
 * #2518 ([ADR-784](../../docs/06-decisions.md#adr-784), operator rulings 2026-11-04) — THE reversed-extension verdict
 * every commit seam asks: the submit decision, the ✎ edit and the LLM lane (ADR-W-006: derive, don't duplicate).
 *
 * A typed «המשך AO …» whose stated side no configuration has ({@link impossibleExtensionSide}) is refused, and the
 * refusal offers the same sentence with the two letters reversed. The offer is a grammar claim (docs/17 §9, "a taught
 * remedy"): the reversed line is parsed and dry-run against the same figure, and offered only if it reads as the
 * reversed extension and builds. When it does not (the point lies between the two letters, so neither extension reaches
 * it), the refusal stands alone.
 *
 * A later line that makes a STANDING extension impossible (judge ruling on #2518, option B) is refused here too, naming
 * the extension's line and the statement that broke it. It offers nothing: the line to change is another row.
 */
import { impossibleExtensionSide, type ExtensionSide } from '@/replay/core';
import { dryRunOutcome, type Fact } from '@/store/geoStore';
import { parse, type ParseContext } from '@/parser';
import type { AnyCommand } from '@/engine';

export interface ExtensionSideVerdict {
  messageKey: 'input.extensionSideImpossible' | 'input.extensionSideImpossibleNoStep' | 'input.extensionSideBroken';
  params: Record<string, string>;
  /** the logged result */
  result: string;
}

/** `text` with the extension's two letters swapped, read as one label pair; null when the pair is not spelled in it. */
function reversedSentence(side: ExtensionSide, text: string): string | null {
  const pair = new RegExp(String.raw`(?<![A-Za-z\d])${side.a}[\s,-]*${side.b}(?![A-Za-z\d])`);
  const line = text.trim().replace(pair, `${side.b}${side.a}`);
  return line === text.trim() ? null : line;
}

/** Does this line read as the reversed extension, and build on this figure? */
function reversedBuilds(side: ExtensionSide, line: string, ctx: ParseContext, facts: Fact[], seed: number): boolean {
  const r = parse(line, ctx);
  if (!r.ok) return false;
  if (!r.commands.some((c) => c.type === 'extend-onto-circle' && c.a === side.b && c.b === side.a && c.id === side.id)) return false;
  return impossibleExtensionSide(facts, r.commands, seed) === null && dryRunOutcome(facts, r.commands, seed).produced;
}

/**
 * The refusal for this line, or null when every extension it states can hold.
 *
 * @param utterance what the student typed, quoted back
 * @param sentence the sentence the offer is built from: the student's own line, or the LLM's canonical line that lowered it
 */
export function extensionSideVerdict(utterance: string, sentence: string, commands: readonly AnyCommand[], ctx: ParseContext, facts: Fact[], seed: number): ExtensionSideVerdict | null {
  const side = impossibleExtensionSide(facts, [...commands], seed);
  if (!side) return null;
  if (side.standing !== undefined) {
    return {
      messageKey: 'input.extensionSideBroken',
      params: { detail: utterance.trim(), extension: side.standing, id: side.id, second: side.b },
      result: `extension-side-broken:${side.a}${side.b}`,
    };
  }
  const line = reversedSentence(side, sentence);
  const step = line !== null && reversedBuilds(side, line, ctx, facts, seed) ? line : null;
  const params = { detail: utterance.trim(), id: side.id, second: side.b };
  const result = `extension-side-impossible:${side.a}${side.b}`;
  return step
    ? { messageKey: 'input.extensionSideImpossible', params: { ...params, step }, result }
    : { messageKey: 'input.extensionSideImpossibleNoStep', params, result };
}
