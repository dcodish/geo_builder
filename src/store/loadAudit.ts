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
  /** The group key of the audited step — a stable handle so the note's lifetime can be tied to the row it
   *  flags (the row survives deletion/undo/re-lower by group, not by index). See {@link liveAuditFindings}. */
  group: string;
  /** The commands the step held WHEN audited — the note drops once the row's commands change (a ✎ re-lower,
   *  which is exactly the re-read the note asked for). Compared by value against the row's current commands. */
  cmds: AnyCommand[];
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
/**
 * Auto-re-lower a loaded fact list against the CURRENT parser (ADR-232 Am. / issue #120). Load replays
 * SAVED commands (ADR-232), so an old file faithfully shows the reading from the version that saved it —
 * a parser/engine fix that landed since never reaches it (the operator's #119 K stayed misplaced on a
 * pre-fix save). This adopts the fresh lowering for the DETERMINISTIC steps, so an old save picks up
 * fixes on load, while preserving ADR-232's guarantee for LLM steps:
 *
 *   - A step whose utterance RE-PARSES deterministically (`parse(...).ok`, offline — no LLM) AND whose
 *     result DIFFERS from the saved commands → replace the saved commands with the fresh parse. A
 *     deterministic re-parse involves no LLM, so ADR-232's real concern (never re-escalate on load) holds.
 *   - A step whose utterance does NOT re-parse = an LLM-escalated step stored as canonical commands →
 *     keep it byte-for-byte (no re-escalation).
 *   - A step with no utterance (a direct command) → kept as-is.
 *
 * Re-parsing threads the ALREADY-refreshed prefix (a later step sees earlier refreshes). Budgeted like
 * {@link auditLoadedFigure}; on budget exhaustion the remaining steps are kept as saved (never partially
 * corrupt). Returns the (possibly rebuilt) fact list + the 1-based indices of the steps that changed.
 */
export function refreshLoadedFigure(facts: Fact[], budgetMs = 4000): { facts: Fact[]; refreshed: number[] } {
  const t0 = Date.now();
  const steps = stepsOf(facts);
  const out: Fact[] = [];
  const refreshed: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const end = steps[i + 1]?.start ?? facts.length;
    const groupFacts = facts.slice(step.start, end);
    if (!step.utterance || Date.now() - t0 > budgetMs) {
      out.push(...groupFacts);
      continue;
    }
    // Re-parse against the prefix built from the ALREADY-refreshed earlier steps (`out`).
    const { construction, positions } = replay(out);
    const p = parse(step.utterance, buildParseCtx(construction, positions));
    if (p.ok && JSON.stringify(p.commands) !== JSON.stringify(step.cmds)) {
      const group = groupFacts[0].group;
      const enabled = groupFacts[0].enabled; // a step toggles enabled as a unit
      refreshed.push(i + 1);
      p.commands.forEach((cmd, j) => {
        out.push({
          id: groupFacts[j]?.id ?? `${step.start}r${j}`,
          utterance: step.utterance,
          ...(group !== undefined ? { group } : {}),
          cmd,
          enabled,
        });
      });
    } else {
      out.push(...groupFacts);
    }
  }
  return { facts: out, refreshed };
}

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
    const group = groupKey(facts[step.start]);
    const dropped = droppedNewLabels(step.utterance, step.cmds, ctx.points ?? []);
    if (dropped.length > 0) {
      findings.push({ step: i + 1, utterance: step.utterance, kind: 'dropped', labels: dropped, group, cmds: step.cmds });
      continue; // `dropped` subsumes `drift` for the step — one finding per row
    }
    const p = parse(step.utterance, ctx);
    if (p.ok && JSON.stringify(p.commands) !== JSON.stringify(step.cmds))
      findings.push({ step: i + 1, utterance: step.utterance, kind: 'drift', labels: [], group, cmds: step.cmds });
  }
  return { findings, complete: true };
}

/**
 * The subset of audit findings that STILL apply to the current fact list (issue #24). The ADR-242 load-audit
 * note names suspect rows; it must disappear the moment the condition it describes is gone. Rather than a
 * one-shot string with no exit path, the App keeps the findings and derives the visible note from these live
 * ones — a finding drops when the row it flags is DELETED / cleared / undone past the load (its group no
 * longer exists), TOGGLED OFF (the student excluded it), or RE-READ via ✎ (its commands changed — exactly
 * the re-lower the note asked for). No re-audit: a cheap group-existence + commands-equality check per render.
 */
export function liveAuditFindings(facts: Fact[], findings: LoadAuditFinding[]): LoadAuditFinding[] {
  if (findings.length === 0) return findings;
  const steps = stepsOf(facts);
  const byGroup = new Map(steps.map((s) => [groupKey(facts[s.start]), { start: s.start, cmds: s.cmds }]));
  const same = (a: AnyCommand[], b: AnyCommand[]) => JSON.stringify(a) === JSON.stringify(b);
  return findings.filter((f) => {
    const step = byGroup.get(f.group);
    if (!step) return false; // row deleted / cleared / undone past the load
    if (!facts[step.start].enabled) return false; // row toggled off (excluded from the figure)
    return same(step.cmds, f.cmds); // unchanged since the audit → still suspect; a ✎ re-lower changed them
  });
}
