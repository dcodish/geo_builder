/**
 * #1697 / #1467 — the commit of a line's batch, moved out of `submitPipeline.ts` (#2890, [ADR-830](../../docs/06-decisions.md#adr-830))
 * so that the geometry worker, which decides and commits a line on its own copy of the store, imports it without the
 * pipeline's UI and model dependencies. The functions are unchanged; the pipeline re-exports them.
 */
import { createdByReference } from './createdPoints';
import { groupKey, nameByUseCommands, replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand, Id } from '@/engine';
import type { CevianHost } from '../../shell/cevianHost';
import type { Verdict2D } from './decideDeterministic';

/** The points a committed line created by reference, and the row that owns them (ADR-769). */
export interface CreatedNotice2D {
  names: Id[];
  groupKey: string;
}

/**
 * #1697 ([ADR-588](../../docs/06-decisions.md#adr-588)) — THE ONE PLACE a deterministic verdict reaches the store.
 *
 * A `commit` is the line's naming by use (`name-by-use` facts) followed by its statements, ONE batch — one group,
 * one row, one undo entry. A `noop` whose naming changed the figure («D ו-F על מעגל O1» when D, F already ride
 * it) is a row that owns that naming; a step-aside alone is invisible and commits nothing. A refusal or an
 * escalation commits nothing here, naming included. The pipeline calls this, and so do the locks that replay a
 * sequence through `decideDeterministic2D` — four of them used to re-apply the binds by hand.
 */
export function commitVerdict(verdict: Verdict2D, utterance: string): CreatedNotice2D | null {
  const st = useGeoStore.getState();
  // #1973 (ADR-797): the shape the line's cevian was resolved in rides on its facts, stamped at accept time
  if (verdict.kind === 'commit') return commitLine([...nameByUseCommands(verdict.binds), ...verdict.commands], verdict.commands, utterance, verdict.host, verdict.restates === true);
  if (verdict.kind === 'noop' && verdict.binds.some((b) => b.op !== 'step-aside')) st.executeMany(nameByUseCommands(verdict.binds), utterance);
  return null;
}

/**
 * #1467 (ADR-769) — commit one line's batch and say which points it created by reference. Both commit paths (the
 * deterministic verdict above and the LLM's decomposition) come through here, so the notice cannot be wired to one.
 * `statements` is the line's own commands, without its naming by use.
 */
export function commitLine(batch: AnyCommand[], statements: readonly AnyCommand[], utterance: string, host?: CevianHost, ownRow = false): CreatedNotice2D | null {
  const st = useGeoStore.getState();
  const before = replay(st.facts, st.seed).construction;
  st.executeMany(batch, utterance, host, ownRow ? { ownRow } : undefined);
  const now = useGeoStore.getState();
  const last = now.facts[now.facts.length - 1];
  if (!last || now.facts.length === st.facts.length) return null;
  const names = createdByReference(before, replay(now.facts, now.seed).construction, statements, utterance);
  return names.length ? { names, groupKey: groupKey(last) } : null;
}

