/**
 * Load-time honesty audit for a deserialized figure file (ADR-242).
 *
 * A `.geo.json` stores each step's utterance AND its lowered commands; load replays the COMMANDS
 * (deterministic restore — an LLM step never re-escalates, `cmd.branch` keeps the alternative,
 * ADR-232). The commands are therefore a parser-output snapshot from the machine/version that saved
 * the file, and two things can be wrong with that snapshot TODAY:
 *
 *   - `dropped` — the stored commands never covered a label the utterance names: the save itself was
 *     a partial lowering. The operator's file stated "A ו C נמצאות על המעגל" but carried only
 *     `point-on-circle A` — the step row read ✓ on every machine while C floated off its circle.
 *   - `drift` — the current parser reads the stored utterance differently (a parser fix landed since
 *     the save): the loaded figure faithfully shows the OLD reading.
 *
 * The CI twin is `fixtures.test.ts` (the drift half); `dropped` is the droppedNewLabels differential
 * the fixtures net lacked — a partially-lowered file re-parses IDENTICALLY (same broken commands), so
 * drift alone certifies it healthy. Read-only and budgeted: load itself stays open-exactly-as-saved;
 * the caller decides what to tell the student (the ✎ edit re-reads a step against its prefix context,
 * ADR-241 — that is the manual re-lower path this audit points at).
 */
import type { Fact } from './geoStore';
import { groupKey, replay } from './geoStore';
import { buildParseCtx, droppedNewLabels, parse } from '@/parser';
import type { AnyCommand } from '@/engine';

export interface LoadAuditFinding {
  /** 1-based index of the step group (the fact-list row). */
  step: number;
  utterance: string;
  /** `dropped` — a stated label the stored commands never covered; `drift` — the utterance lowers differently today. */
  kind: 'dropped' | 'drift';
  /** The uncovered labels (`dropped` only; empty for `drift`). */
  labels: string[];
}

/** Consecutive facts sharing a group = one user step (one utterance → possibly many commands). */
function stepsOf(facts: Fact[]): { utterance?: string; cmds: AnyCommand[]; start: number }[] {
  const steps: { utterance?: string; cmds: AnyCommand[]; start: number }[] = [];
  for (let i = 0; i < facts.length; i++) {
    const prev = steps[steps.length - 1];
    if (prev && i > 0 && groupKey(facts[i]) === groupKey(facts[i - 1])) prev.cmds.push(facts[i].cmd);
    else steps.push({ utterance: facts[i].utterance, cmds: [facts[i].cmd], start: i });
  }
  return steps;
}

/**
 * Audit a loaded fact list against the CURRENT parser. Budgeted (each step costs a prefix `replay`;
 * a pathological figure must not freeze the load) — `complete: false` means the budget ran out and
 * later steps went unchecked. A step with no utterance (a direct command) is skipped; a step whose
 * utterance no longer parses is an LLM-escalated step stored as canonical commands — only the
 * `dropped` differential applies to it.
 */
export function auditLoadedFigure(facts: Fact[], budgetMs = 3000): { findings: LoadAuditFinding[]; complete: boolean } {
  const t0 = Date.now();
  const findings: LoadAuditFinding[] = [];
  const steps = stepsOf(facts);
  for (let i = 0; i < steps.length; i++) {
    if (Date.now() - t0 > budgetMs) return { findings, complete: false };
    const step = steps[i];
    if (!step.utterance) continue;
    const prefix = facts.slice(0, step.start);
    const { construction, positions } = replay(prefix);
    const ctx = buildParseCtx(construction, positions);
    const dropped = droppedNewLabels(step.utterance, step.cmds, ctx.points ?? []);
    if (dropped.length > 0) {
      findings.push({ step: i + 1, utterance: step.utterance, kind: 'dropped', labels: dropped });
      continue; // `dropped` subsumes `drift` for the step — one finding per row
    }
    const p = parse(step.utterance, ctx);
    if (p.ok && JSON.stringify(p.commands) !== JSON.stringify(step.cmds))
      findings.push({ step: i + 1, utterance: step.utterance, kind: 'drift', labels: [] });
  }
  return { findings, complete: true };
}
