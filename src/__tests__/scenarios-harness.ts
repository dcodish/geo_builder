/**
 * The scenario CORPUS + harness (issue #60 / ADR-280): every operator-reported bug sequence, replayed
 * end-to-end through the real parse-with-context → fact list → replay path. Moved here — a plain module,
 * NOT a test file — from scenarios.test.ts, so the runner files can shard the corpus across vitest's
 * per-file workers (the one 940 s sequential file used to bound the whole suite's wall clock, issue #60).
 *
 * ADD NEW SCENARIOS TO `SCENARIOS` BELOW (newest first, as before); every scenarios-e2e-*.test.ts slice
 * picks them up automatically (membership is index % N — no per-file registration), and the doc-parity
 * guard in scenarios.test.ts still enforces the docs/test-scenarios.md index. The standing rule
 * ("reported bugs become regression scenarios") is unchanged — only the file layout moved.
 */
/**
 * Reported-scenarios regression suite (end-to-end).
 *
 * Each scenario is the EXACT sequence of utterances the operator typed when a bug was
 * found (harvested from `logs/debug-log.jsonl`). It is replayed through the REAL pipeline —
 * parse-with-figure-context → fact list → `replay` — exactly as the app does, then asserted.
 * This catches PIPELINE-level regressions (parser context threading, rule ordering, the store
 * replay/grouping) that the parser/engine unit tests don't exercise, and gives a single,
 * readable list of the real figures we've validated (mirrored in docs/test-scenarios.md).
 *
 * STANDING RULE (see ../../CLAUDE.md): when the operator reports a bug and it is diagnosed
 * from the debug log, the fix is NOT done until the exact sequence is added here.
 *
 * A `Step` is either an utterance string (parsed deterministically, with the current figure as
 * context) or an LLM step. The LLM is mocked in tests, so an out-of-grammar step is captured from the log
 * in one of two forms:
 *   - `{ llm: ['canonical line', …] }` — the canonical command STRINGS the LLM emitted, RE-PARSED with the
 *     live figure context exactly as `llmParse` does (TST-3). PREFERRED: a parser change that breaks a
 *     canonical form is then caught, not masked by pre-baked commands.
 *   - `{ llm: [...commands] }` — pre-parsed engine commands (legacy; kept for steps whose canonical form
 *     has no clean deterministic re-parse).
 * A string step (or a canonical LLM line) that fails to parse FAILS the scenario (it would have escalated).
 */

import { expect } from 'vitest';
import { parse, buildParseCtx, impliedCircleBinding } from '@/parser';
import { replay, firstSatisfyingSeed, settleVariantDefaults, nameCentreFacts } from '@/store/geoStore';
import type { Derived, Fact } from '@/store/geoStore';
import type { AnyCommand, Id, Vec } from '@/engine';

export type Step =
  | string
  | { llm: AnyCommand[] }
  | { llm: string[] }
  /** ✎ edit of an EARLIER step (1-based index into the typed steps): re-parse the new wording against
   *  the PREFIX context — the figure BEFORE the edited step — and splice the replacement at the step's
   *  position, exactly as the app's commitEdit → replaceGroup does (ADR-241). */
  | { edit: { step: number; to: string } };
export interface Scenario {
  id: string;
  title: string;
  /** The bug this sequence guards against (for the readable record). */
  guards: string;
  steps: Step[];
  check: (fig: Derived) => void;
  /** Opt out of the blanket "the figure satisfies its stated givens" assertion (rare — only when a
   *  scenario intentionally builds a figure the verifier flags, e.g. a documented known-limitation). */
  expectViolations?: boolean;
}

/** The figure context the app feeds the parser — the shared builder (ADR-171), so scenarios can't drift
 *  from App/production. */
export function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

/** Build the ordered fact list for a scenario through the real parse→fact path (no replay yet). Shared by
 *  `run`, the seed-sweep oracle, and the E7 round-trip properties (all in THIS file — importing a .test.ts
 *  from another test would double-register every scenario), so all drive the exact pipeline the app does. */
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
        if (!bind || 'clarify' in bind) break;
        const nc = nameCentreFacts(facts, bind.from, bind.to);
        if (!nc.ok) break;
        facts = nc.facts;
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
        if (!bind || 'clarify' in bind) break;
        const nc = nameCentreFacts(facts, bind.from, bind.to);
        if (!nc.ok) break;
        facts = nc.facts;
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

/** Replay a scenario through the real parse→fact→replay path and return the derived figure. */
export function run(steps: Step[]): Derived {
  const facts = factsOf(steps);
  // Mirror the app: when a figure has free DOFs whose default placement breaks an extension's directional
  // order ("המשך" must reach the far side), the store auto-advances to the first satisfying configuration.
  // `firstSatisfyingSeed` returns 0 for any figure without that issue, so non-extension scenarios are
  // unchanged. (ADR-098.)
  return replay(facts, firstSatisfyingSeed(facts));
}

// ── check helpers ──────────────────────────────────────────────────────────
export const at = (fig: Derived, id: Id): Vec => {
  // An UNNAMED circle's centre is anonymous under ADR-342 ('@ctr-O') — checks written before that may
  // reference it by its token letter; resolve the fallback so geometric asserts keep reading naturally.
  // (The PROMOTION semantics — when the letter becomes a real point — are locked strictly in
  // anon-centre.test.ts, so this fallback can't mask a promotion regression.)
  const v = fig.positions.get(id) ?? fig.positions.get(`@ctr-${id}`);
  if (!v) throw new Error(`no position for "${id}"`);
  return v;
};
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
/** The CENTRE POINT id of a circle — by its reference letter, or the sole circle when omitted. Under
 *  ADR-342 an UNNAMED circle's centre is anonymous ('@ctr-O'), so a check must resolve it from the
 *  construction instead of assuming the literal letter. */
export const centreOf = (fig: Derived, letter?: string): Id => {
  const circles = fig.construction.objects.filter((o): o is Extract<typeof o, { kind: 'circle' }> => o.kind === 'circle' && !(o as { center: string }).center.startsWith('~'));
  const hit = letter
    ? circles.find((c) => (c as { center: string }).center === letter || (c as { center: string }).center === `@ctr-${letter}` || c.id === `circle-${letter}`)
    : circles[0];
  if (!hit) throw new Error(`no circle${letter ? ` for "${letter}"` : ''} in the figure`);
  return (hit as { center: Id }).center;
};
export const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};
/** Every enabled step applied cleanly (no silent drop / over-constraint). */
export const allStepsOk = (fig: Derived) => {
  for (const [id, s] of Object.entries(fig.status)) expect(s, `status of step ${id}`).toBe('ok');
  expect(fig.lastError).toBeNull();
};
/** The quad's named vertices are in convex cyclic order around centre O (none collapsed/crossed). */
export const convexQuad = (fig: Derived, ids: [Id, Id, Id, Id], center: Id, minGapDeg = 15) => {
  const o = at(fig, center);
  const ang = (p: Vec) => (Math.atan2(p.y - o.y, p.x - o.x) + 2 * Math.PI) % (2 * Math.PI);
  const order = ids.map((id) => ang(at(fig, id)));
  for (let i = 0; i < 4; i++) {
    const gap = (order[(i + 1) % 4] - order[i] + 2 * Math.PI) % (2 * Math.PI);
    expect(gap, `gap after vertex ${ids[i]}`).toBeGreaterThan((minGapDeg * Math.PI) / 180);
  }
};

// ── the scenarios (newest first) ───────────────────────────────────────────
