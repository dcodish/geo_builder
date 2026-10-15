/**
 * The scenario PIPELINE core (#567) — `Step`, `ctxOf`, `factsOf`, `replayFacts`, moved verbatim from
 * scenarios-harness.ts so that HEADLESS tools can drive the exact utterance→fact→figure path the e2e
 * scenarios run WITHOUT importing `vitest` (whose `expect` refuses to load outside the test runner —
 * the harness's other exports genuinely need it). First consumer: the `exercise-sequence` agent's
 * verifier, `.claude/skills/exercise-sequence/run-sequence.mjs`, run under vite-node.
 *
 * The harness re-exports everything here, so every existing test import site is unchanged — this file
 * is a LAYERING split, not a second implementation (the ADR-346 no-mirrors rule).
 */
import { parse, buildParseCtx, impliedCircleBinding, impliedPointBinding, parseNameCenter, typedLabels } from '@/parser';
import { autoNamedLabels, replay, firstSatisfyingSeed, settleVariantDefaults, nameCentreFacts, renameFacts, stepAsideFacts } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import type { ParseResult } from '@/parser';

/**
 * #1288 (ADR-555) — a parse REFUSAL: a deterministic `ok: false` the student sees by name. `not-handled`
 * is excluded on purpose: that is an ESCALATION to the LLM, captured as an `{ llm: … }` step, never a
 * refusal a scenario may declare.
 */
export type Refusal = Exclude<Extract<ParseResult, { ok: false }>, { reason: 'not-handled' }>;

/**
 * #1288 (ADR-555) — a step of the operator's exact sequence that is EXPECTED to be refused. Declared on the
 * scenario (`Scenario.refusedSteps`), asserted by `factsOf` — NON-VACUOUSLY: the listed step must be refused
 * with this `reason` (and every field of `with`), and a step that is refused without a row fails the
 * scenario exactly as before. A listed step that PARSES fails too, so a row can never outlive the ruling it
 * documents (the `KNOWN_GATE_FALSE_BLOCKS` discipline). A refused step commits nothing, as in the app, and
 * the replay continues without it; it still consumes its typed-step number, so an `edit.step` index keeps
 * counting what the student typed.
 */
export interface RefusedStep {
  /** 1-based position of the step in the scenario's `steps` array; it must be a STRING step. */
  step: number;
  /** The refusal the parser must return. */
  reason: Refusal['reason'];
  /** Optional: fields of the refusal payload that must match exactly (e.g. `{ holder: 'B', id: 'D' }`). */
  with?: Record<string, unknown>;
  /** The ruling that makes this a refusal (readable record; required so a row always says why). */
  why: string;
}

/** Check a declared refusal against what the parser returned; returns the failure message, or null. */
function refusalMismatch(row: RefusedStep, step: string, r: ParseResult): string | null {
  const at = `refusedSteps row for step ${row.step} «${step}»`;
  if (r.ok) {
    return `${at}: expected a ${row.reason} refusal, but the step now PARSES (${r.commands.length} command(s)) — the ruling it documents no longer holds; delete the row and assert the built figure instead`;
  }
  if (r.reason !== row.reason) return `${at}: expected reason ${row.reason}, got ${JSON.stringify(r)}`;
  for (const [k, v] of Object.entries(row.with ?? {})) {
    const got = (r as Record<string, unknown>)[k];
    if (JSON.stringify(got) !== JSON.stringify(v)) {
      return `${at}: expected ${k} = ${JSON.stringify(v)}, got ${JSON.stringify(got)} (${JSON.stringify(r)})`;
    }
  }
  return null;
}

export type Step =
  | string
  | { llm: AnyCommand[] }
  | { llm: string[] }
  /** ✎ edit of an EARLIER step (1-based index into the typed steps): re-parse the new wording against
   *  the PREFIX context — the figure BEFORE the edited step — and splice the replacement at the step's
   *  position, exactly as the app's commitEdit → replaceGroup does (ADR-241). */
  | { edit: { step: number; to: string } };

/** The figure context the app feeds the parser — the shared builder (ADR-171), so scenarios can't drift
 *  from App/production. */
export function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

/** Build the ordered fact list for a scenario through the real parse→fact path (no replay yet). Shared by
 *  `run`, the seed-sweep oracle, and the E7 round-trip properties (all via the harness — importing a
 *  .test.ts from another test would double-register every scenario), so all drive the exact pipeline the
 *  app does. */
export function factsOf(steps: Step[], refused: readonly RefusedStep[] = []): Fact[] {
  let facts: Fact[] = [];
  let g = 0;
  // #1288: the declared refusals, by 1-based step position. A row beyond `steps` is ignored HERE so a
  // PREFIX of a scenario (`steps.slice(0, i)`) replays with the scenario's own rows; `scenarioFacts` in the
  // harness is the whole-scenario entry point and rejects an out-of-range row there.
  const refusedAt = new Map<number, RefusedStep>();
  for (const row of refused) {
    if (refusedAt.has(row.step)) throw new Error(`refusedSteps: step ${row.step} is listed twice`);
    refusedAt.set(row.step, row);
    if (row.step >= 1 && row.step <= steps.length && typeof steps[row.step - 1] !== 'string') {
      throw new Error(`refusedSteps: step ${row.step} is not a typed (string) step — only a typed sentence can be refused`);
    }
  }
  let index = 0;
  const push = (group: string, utterance: string, cmd: AnyCommand) =>
    facts.push({ id: `${group}.${facts.length}`, utterance, group, cmd, enabled: true });
  // Mirror the app's per-step commit: a newly-appended cyclable variant's DEFAULT settles to the first
  // cleanly-building configuration (ADR-339) — exactly as `commitCommands`/`replaceGroup` do, so scenarios
  // can't drift from production (the same mirroring `run()` already does for the ADR-098 seed advance).
  const settle = (group: string) => {
    facts = settleVariantDefaults(facts, (f) => f.group === group, 0);
  };
  for (const step of steps) {
    index++;
    if (typeof step === 'object' && 'edit' in step) {
      // The app's ✎ path (ADR-241): parse against the PREFIX (facts before the edited group — the
      // context the replacement is replayed in), then splice in place. An edit adds no new step group.
      const key = `g${step.edit.step - 1}`;
      const start = facts.findIndex((f) => f.group === key);
      if (start < 0) throw new Error(`edit step: no step group ${key} to edit`);
      let end = start;
      while (end < facts.length && facts[end].group === key) end++;
      facts = stepAsideFacts(facts, typedLabels(step.edit.to)).facts; // #1673 mirror (ADR-565): the hidden token steps aside
      let er = parse(step.edit.to, ctxOf(facts.slice(0, start)));
      // #186 mirror (the App's commitEdit auto-bind): a fresh circle name in an edit binds an unnamed
      // circle via the shared decision helper + fact core, then re-parses against the renamed prefix.
      for (let guard = 0; er.ok && guard < 3; guard++) {
        const bind = impliedCircleBinding(er.commands, ctxOf(facts.slice(0, start)));
        if (bind && 'clarify' in bind) break;
        if (bind) {
          const nc = nameCentreFacts(facts, bind.from, bind.to);
          if (!nc.ok) break;
          facts = nc.facts;
        } else {
          // #539 mirror (the App's point auto-bind): a fresh set-line label binds an auto-named point.
          const pbind = impliedPointBinding(er.commands, ctxOf(facts.slice(0, start)), autoNamedLabels(facts));
          if (!pbind) break;
          const rn = renameFacts(facts, pbind.from, pbind.to);
          if (!rn.ok) break;
          facts = rn.facts;
        }
        er = parse(step.edit.to, ctxOf(facts.slice(0, start)));
      }
      const r = er;
      if (!r.ok) throw new Error(`edited step did not parse: ${JSON.stringify(step.edit.to)}`);
      const replacement: Fact[] = r.commands.map((cmd, i) => ({
        id: `${key}e.${i}`,
        utterance: step.edit.to,
        group: key,
        cmd,
        enabled: true,
      }));
      facts.splice(start, end - start, ...replacement);
      settle(key);
      continue;
    }
    const group = `g${g++}`;
    if (typeof step === 'string') {
      // The app's store-op naming (decidePreParse → `nameCentre`): «מרכז המעגל הימני הוא O» renames a hidden centre and
      // adds no fact of its own (a size qualifier also locks the order, #178). Mirrored so a scenario can name its circles.
      const nc = parseNameCenter(step, ctxOf(facts));
      if (nc) {
        const res = nameCentreFacts(facts, nc.from, nc.to);
        if (!res.ok) throw new Error(`scenario naming step was refused (${res.reason}): ${JSON.stringify(step)}`);
        facts = res.facts;
        if (nc.assert) push(group, step, { type: 'set-radius-order', outer: nc.assert.outer, inner: nc.assert.inner });
        settle(group);
        continue;
      }
      // #1673 mirror (decideFromParse, ADR-565): a hidden circle token the student types steps aside first
      facts = stepAsideFacts(facts, typedLabels(step)).facts;
      let r = parse(step, ctxOf(facts));
      // #186 mirror (App.submit's auto-bind): a circle named by a fresh name, with unnamed circles in
      // the figure, binds one of them (shared decision helper + fact core) and re-parses.
      for (let guard = 0; r.ok && guard < 3; guard++) {
        const bind = impliedCircleBinding(r.commands, ctxOf(facts));
        // the app ASKS which circle (#186); committing the implied creation here was a silent divergence (#1673)
        if (bind && 'clarify' in bind) throw new Error(`scenario step ASKS which circle (unknown-circle ${bind.center}): ${JSON.stringify(step)}`);
        if (bind) {
          const nc = nameCentreFacts(facts, bind.from, bind.to);
          if (!nc.ok) break;
          facts = nc.facts;
        } else {
          // #539 mirror (App.submit's point auto-bind): a fresh set-line label whose slot an auto-named
          // drawn point structurally occupies renames that point instead of minting a duplicate.
          const pbind = impliedPointBinding(r.commands, ctxOf(facts), autoNamedLabels(facts));
          if (!pbind) break;
          const rn = renameFacts(facts, pbind.from, pbind.to);
          if (!rn.ok) break;
          facts = rn.facts;
        }
        r = parse(step, ctxOf(facts));
      }
      const row = refusedAt.get(index);
      if (row) {
        // #1288: a DECLARED refusal — asserted, then skipped: a refused sentence never becomes a fact.
        const bad = refusalMismatch(row, step, r);
        if (bad) throw new Error(bad);
        continue;
      }
      if (!r.ok && r.reason !== 'not-handled') {
        throw new Error(
          `scenario step was REFUSED (${JSON.stringify(r)}): ${JSON.stringify(step)} — if the refusal is the behaviour under test, declare it in the scenario's refusedSteps (#1288)`,
        );
      }
      if (!r.ok) throw new Error(`scenario step did not parse (would escalate to the LLM): ${JSON.stringify(step)}`);
      for (const cmd of r.commands) push(group, step, cmd);
    } else if (step.llm.length && typeof step.llm[0] === 'string') {
      // Canonical LLM STRINGS — re-parse each with the live figure context, incrementally (a later line may
      // reference a point an earlier line of the SAME step introduced), exactly as `llmParse` does (TST-3).
      for (const line of step.llm as string[]) {
        const r = parse(line, ctxOf(facts));
        if (!r.ok) throw new Error(`scenario LLM line did not parse (canonical form drifted): ${JSON.stringify(line)}`);
        for (const cmd of r.commands) push(group, line, cmd);
      }
    } else {
      for (const cmd of step.llm as AnyCommand[]) push(group, '(llm step)', cmd);
    }
    settle(group);
  }
  return facts;
}

/** Replay an ALREADY-BUILT fact list at the seed the app would display (ADR-098 auto-advance). Split out
 *  of `run` so a caller that needs the facts for a further oracle (the co-located seed sweep, the
 *  round-trip properties — ADR-394) builds them ONCE and every later replay of the same content is a
 *  fold-memo hit rather than a fresh solve. */
export function replayFacts(facts: Fact[]): Derived {
  // Mirror the app: when a figure has free DOFs whose default placement breaks an extension's directional
  // order ("המשך" must reach the far side), the store auto-advances to the first satisfying configuration.
  // `firstSatisfyingSeed` returns 0 for any figure without that issue, so non-extension scenarios are
  // unchanged. (ADR-098.)
  return replay(facts, firstSatisfyingSeed(facts));
}
