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
import { parse, buildParseCtx, impliedCircleBinding, impliedPointBinding } from '@/parser';
import { autoNamedLabels, replay, firstSatisfyingSeed, settleVariantDefaults, nameCentreFacts, renameFacts } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

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
export function factsOf(steps: Step[]): Fact[] {
  let facts: Fact[] = [];
  let g = 0;
  const push = (group: string, utterance: string, cmd: AnyCommand) =>
    facts.push({ id: `${group}.${facts.length}`, utterance, group, cmd, enabled: true });
  // Mirror the app's per-step commit: a newly-appended cyclable variant's DEFAULT settles to the first
  // cleanly-building configuration (ADR-339) — exactly as `commitCommands`/`replaceGroup` do, so scenarios
  // can't drift from production (the same mirroring `run()` already does for the ADR-098 seed advance).
  const settle = (group: string) => {
    facts = settleVariantDefaults(facts, (f) => f.group === group, 0);
  };
  for (const step of steps) {
    if (typeof step === 'object' && 'edit' in step) {
      // The app's ✎ path (ADR-241): parse against the PREFIX (facts before the edited group — the
      // context the replacement is replayed in), then splice in place. An edit adds no new step group.
      const key = `g${step.edit.step - 1}`;
      const start = facts.findIndex((f) => f.group === key);
      if (start < 0) throw new Error(`edit step: no step group ${key} to edit`);
      let end = start;
      while (end < facts.length && facts[end].group === key) end++;
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
      let r = parse(step, ctxOf(facts));
      // #186 mirror (App.submit's auto-bind): a circle named by a fresh name, with unnamed circles in
      // the figure, binds one of them (shared decision helper + fact core) and re-parses.
      for (let guard = 0; r.ok && guard < 3; guard++) {
        const bind = impliedCircleBinding(r.commands, ctxOf(facts));
        if (bind && 'clarify' in bind) break;
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
