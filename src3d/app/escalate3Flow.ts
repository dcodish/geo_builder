/**
 * #2231 ([ADR-W-189](../../docs/06w-decisions-workspace.md#adr-w-189)) — THE 3-D ESCALATION, out of the component.
 *
 * What the App does with a line the grammar did not read: ask the model, ask once more when the answer loses a label the
 * student typed (*"Retry once. If K is still missing, keep today's refusal naming K."*, operator, 2026-10-18), and restore
 * the student's point runs (#555, ADR-3D-173: applied to the canonical lines BEFORE the re-parse, so the tested grammar
 * derives the semantics from what the student wrote). It lived inline in `App3`, where no test could reach the decision.
 *
 * Pure over the injected transport: it commits nothing. The App hands the steps to `submitSteps`, whose `decideSteps3` runs
 * the full battery, so a label still lost is the `dropped-given` refusal that names it.
 */
import { ingestTypedText } from '../../shell/bidi';
import { askKeepingNames, type NameRetry } from '../../shell/llm/retryLostNames';
import { derive3, type Fact3 } from '../store/store3';
import { droppedNewLabels3, restoreStatedSequences3 } from '../parser/honesty3';
import { parse3 } from '../parser/parse3';
import type { Command3 } from '../engine/types';

export interface Escalation3 {
  /** The canonical lines for `submitSteps`, the sequence gate applied. `null`: no usable answer. */
  steps: string[] | null;
  restored: string[];
  retry?: NameRetry;
}

type Figure3 = { facts: Fact3[]; seed: number };
type Ask3 = (utterance: string, context: string, keep?: readonly string[]) => Promise<string[] | null>;

/** The labels the answer's re-parsed commands lose: the same call as the battery's (`lostGivens3`). */
function lostLabels3(st: Figure3, raw: string, steps: readonly string[]): string[] {
  const prior = derive3(st.facts, st.seed).construction;
  const lines = restoreStatedSequences3(raw, [...steps]).lines;
  const commands: Command3[] = lines.flatMap((line) => {
    const p = parse3(line);
    return p.ok ? p.commands : [];
  });
  return droppedNewLabels3(ingestTypedText(raw), commands, [...prior.points.keys()], [...prior.vectors.keys()]);
}

export async function escalate3Flow(st: Figure3, raw: string, ask: Ask3): Promise<Escalation3> {
  const context = `Existing points: ${[...derive3(st.facts, st.seed).construction.points.keys()].join(', ') || '(none)'}.`;
  const { answer, retry } = await askKeepingNames(
    (keep) => (keep ? ask(raw, context, keep) : ask(raw, context)),
    (steps) => lostLabels3(st, raw, steps),
    (steps) => steps.length > 0,
  );
  const seq = answer ? restoreStatedSequences3(raw, answer) : null;
  return { steps: seq ? seq.lines : null, restored: seq?.restored ?? [], ...(retry ? { retry } : {}) };
}
