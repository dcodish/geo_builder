/**
 * ADR-346 — the anti-drift guard for the log-triage verifier.
 *
 * `.claude/skills/log-triage/triage.mjs` MIRRORS the submit pipeline (`src/app/submitPipeline.ts#runSubmit`,
 * extracted from App.tsx by S0.4 of docs/24) so that "is this still a gap?" is
 * answered the way the product actually answers a student. That mirror has now drifted THREE times, each
 * time silently, each time turning the instrument we measure prod with into a source of confident false
 * signal (issue #35; the ADR-169 `parallels` drift documented in `src/parser/context.ts`'s header; the
 * 2026-07-17 run where ~90% of "LIVE gaps" were noise and the top-ranked items already shipped).
 *
 * A green triage run proves TODAY's mirror. It cannot prevent TOMORROW's drift — which is the real failure
 * mode. This guard makes the specific divergence that caused all three instances LOUD instead of silent:
 * when the App's pre-LLM scope register or its honesty-gate call-list changes, the harness must follow.
 *
 * It compares TEXT, not behaviour: the harness is a side-effecting script (it fetches logs and writes a
 * report on import), so the suite must never import it. Same precedent as the docs byte-guards /
 * `integrity.test.ts`. It cannot prove semantic equivalence — it only pins the two lists that drifted.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const appSrc = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
// The submit path itself lives in the extracted pipeline (S0.4 of docs/24) — the mirror contract
// follows the code: routing/gates are checked against submitPipeline.ts, UI-side logging against App.tsx.
const pipeSrc = readFileSync(path.join(root, 'src/app/submitPipeline.ts'), 'utf8');
const triageSrc = readFileSync(path.join(root, '.claude/skills/log-triage/triage.mjs'), 'utf8');

/** The literal category set of a `new Set([...])` assigned to `name`. */
const setLiteral = (src: string, name: string): string[] => {
  const m = src.match(new RegExp(String.raw`const ${name} = new Set\(\[([^\]]*)\]`));
  if (!m) throw new Error(`no ${name} set literal found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
};

describe('ADR-346 — log-triage mirrors the App submit path', () => {
  /**
   * #1395 — THE 2-D MIRROR IS GONE: triage CALLS the App's decision instead of copying it.
   *
   * The checks that stood here compared hand-copied lists — the PRE_LLM set, the pre-parse guards
   * (#501), the post-parse seams (#829), the honesty-gate call list, the format guards, the #186
   * auto-bind — because the harness re-implemented the submit path and each list could drift. Five
   * instances did. The whole pre-LLM lane is now `decideDeterministic2D`, which `runSubmit` dispatches
   * and `session2d` calls, so there is nothing left to compare: a gate added to the App reaches the
   * report the day it is written. These checks pin that structure, so a later edit cannot quietly
   * reintroduce a copy.
   */
  it('#1395 — session2d decides through decideDeterministic2D, the function runSubmit dispatches', () => {
    expect(triageSrc).toMatch(/import\s*\{\s*decideDeterministic2D\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/src\/app\/decideDeterministic\.ts'/);
    const s2 = triageSrc.slice(triageSrc.indexOf('async function session2d'), triageSrc.indexOf('/* 3-D: #1692'));
    expect(s2, 'session2d must call the App decision').toContain('decideDeterministic2D(');
    expect(pipeSrc, 'runSubmit must dispatch the same decision').toContain('decidePreParse(');
    expect(pipeSrc, 'runSubmit must dispatch the same decision').toContain('decideFromParse(');
  });

  it('#1395 — no hand mirror of the 2-D lane survives in triage.mjs', () => {
    for (const copy of ['const PRE_LLM', 'function droppedBy', 'function guidedAtSeam', 'impliedCircleBinding(', 'parse(u, pctx)', 'classifyOutOfScope(']) {
      expect(triageSrc, `triage.mjs re-implements part of the 2-D decision again (${copy}) — call decideDeterministic2D instead`).not.toContain(copy);
    }
  });

  it('#1395 — the submit pipeline decides nothing before the model itself: no parse, no refusal branch', () => {
    // Everything up to the LLM call lives in `decideDeterministic.ts`. A branch added back into
    // `runSubmit` would be invisible to triage and to #1358's register, which ask the decision.
    const beforeLlm = pipeSrc.slice(pipeSrc.indexOf('export async function runSubmit('), pipeSrc.indexOf('llmParse(utterance'));
    expect(beforeLlm).not.toMatch(/\bparse\(utterance/);
    expect(beforeLlm).not.toMatch(/r\.reason === '/);
  });

  it('the #189 followable actions are followed, and the App logs them', () => {
    // clear/undo/redo are logged so a session replay can follow them instead of degrading. If the App
    // stops logging one (or the harness stops following), reported sessions silently lose their tail.
    for (const a of ['clear', 'undo', 'redo']) {
      expect(appSrc, `App.tsx must log the '${a}' action (#189)`).toContain(`action: '${a}'`);
      expect(triageSrc, `triage.mjs must follow the '${a}' action (#189)`).toContain(`e.action === '${a}'`);
    }
  });

  it('the 2-D decision reads the parse context from the shared builder, never a local copy', () => {
    // The ADR-169 instance: the harness had its OWN ctx builder, missing `parallels`, so every
    // trapezoid-altitude utterance read as a gap. The decision now builds the context, from the one builder.
    const decideSrc = readFileSync(path.join(root, 'src/app/decideDeterministic.ts'), 'utf8');
    expect(decideSrc).toContain('buildParseCtx(');
  });

  it('the harness replays a session PREFIX (not a lone standalone parse), and hands the decision that figure', () => {
    // The #35 defect itself: one utterance at a time, with no figure. session2d threads the facts forward
    // and passes the figure it built as the decision's view.
    expect(triageSrc).toMatch(/decideDeterministic2D\(\{ facts, seed: 0, view: \{ construction: fig\.construction, positions: fig\.positions \} \}/);
    expect(triageSrc).toMatch(/session2d|session3d/);
    // A degraded prefix must never be promoted to a gap (the false-signal class this ADR removes).
    expect(triageSrc).toContain('degraded');
  });

  it('the session cache can never serve a stale verdict for a still-open row (ADR-346 Am. 2)', () => {
    // The incremental cache trades away regression-detection on ALREADY-BUILDING input (that's the test
    // suite's job) — but it must NEVER cache away the "did we fix it since?" question, which is the entire
    // point of the tool. Any OPEN verdict forces a re-replay; `--reverify` forces everything.
    const open = setLiteral(triageSrc, 'OPEN');
    for (const v of ['not-handled', 'would-escalate', 'refused', 'error', 'unverified']) {
      expect(open, `'${v}' must force a re-replay — caching it would hide a fix (or a real gap) forever`).toContain(v);
    }
    // The reuse predicate must consult OPEN and the event count; losing either silently freezes verdicts.
    expect(triageSrc).toMatch(/reusable\s*=\s*!reverify\s*&&\s*prior\s*&&\s*prior\.n === evs\.length\s*&&\s*!prior\.outs\.some\(\(o\) => OPEN\.has\(o\.now\)\)/);
  });

  it('#182 — the 3-D sink logs what the 3-D session replay follows (the #84/#189 mirror, 3-D edition)', () => {
    // The 3-D app must log the LLM's committed canonical lines (`commands`) and its store actions, and
    // the 3-D replay must FOLLOW them — else 3-D permanently stays the weaker instrument (28% of its sessions
    // held an unfollowable llm-built step before #182). Same textual-guard discipline as the 2-D checks.
    const app3Src = readFileSync(path.join(root, 'src3d/App3.tsx'), 'utf8');
    const sink3Src = readFileSync(path.join(root, 'src3d/debug/sessionLog3.ts'), 'utf8');
    expect(app3Src, 'App3 must log the LLM canonical lines as `commands` (#182)').toMatch(/source: 'llm'[^}]*commands: steps/s);
    for (const a of ['delete', 'show-another', 'undo', 'redo', 'clear', 'load']) {
      expect(app3Src, `App3 must log the '${a}' action (#182)`).toContain(`action: '${a}'`);
    }
    expect(sink3Src, 'the lean 3-D sink must forward `action` events').toContain("event.kind === 'action'");
    expect(sink3Src, 'the lean 3-D sink must forward llm `commands`').toContain("event.source === 'llm' && event.commands");
    // #1692: the replay lives in the product tree. It follows clear/undo/redo via its history, and llm
    // steps through `decideSteps3` — the decision the store's `submitSteps` dispatches. Its behaviour is
    // locked in src3d/__tests__/issue-1692-triage-replay3.test.ts; this pins only the wiring.
    const r3Src = readFileSync(path.join(root, 'src3d/app/triageReplay3.ts'), 'utf8');
    for (const a of ['clear', 'undo', 'redo']) expect(r3Src, `the 3-D replay must follow '${a}'`).toContain(`a === '${a}'`);
    expect(r3Src, 'the 3-D replay must follow the logged canonical lines through the LLM lane decision').toContain('decideSteps3(');
  });

  it('#1692 — the 3-D replay CALLS the decision App3 dispatches; nothing re-implements it', () => {
    // The 5th drift instance (after #35, #243, #829 and the #1395 2-D cut): #1666 put the proof-target
    // refusal in the store, the hand mirror in triage.mjs called `parse3` directly, and «הוכיחו כי AB ⊥ AC»
    // was listed as a LIVE 3-D gap. The pre-LLM lane — store decision, lowercase nudge, guidance register —
    // is now ONE pure function, `decideDeterministic3`; App3 dispatches it and triageReplay3 calls it.
    const app3Src = readFileSync(path.join(root, 'src3d/App3.tsx'), 'utf8');
    const r3Src = readFileSync(path.join(root, 'src3d/app/triageReplay3.ts'), 'utf8');
    // (two halves, so this file never carries an import-shaped string the isolation scanner would read)
    expect(triageSrc).toContain('import { replay3dSession }');
    expect(triageSrc).toContain("/src3d/app/triageReplay3.ts';");
    expect(triageSrc).toContain("session: (evs) => replay3dSession(evs, sessionBudgetMs)");
    expect(r3Src).toContain('decideDeterministic3(');
    expect(app3Src, 'App3 must dispatch the shared decision').toContain('decideDeterministic3(');
    expect(app3Src).toContain('dispatchVerdict(v)');
    for (const copy of ['parse3(', 'classifyGuidance3(', 'upperCasedLabelCandidate3(', 'derive3(']) {
      expect(triageSrc, `triage.mjs re-implements part of the 3-D decision again (${copy}) — call replay3dSession`).not.toContain(copy);
      expect(r3Src, `triageReplay3 re-implements part of the 3-D decision (${copy}) — call decideDeterministic3`).not.toContain(copy);
    }
    for (const copy of ['parse3(', 'classifyGuidance3(', 'upperCasedLabelCandidate3(']) {
      expect(app3Src, `App3 decides part of the pre-LLM lane itself again (${copy}) — put it in decideDeterministic3`).not.toContain(copy);
    }
  });

  it('all-time counts survive the incremental split (the ranking rule the operator kept)', () => {
    // The rejected design was a watermark that only counted new events — it would reset distinct-user
    // counts each window and bury a cluster hit by 3 users over 3 months. Stats/candidates must stay over
    // the FULL `submits` list; only the worklist may split new vs carried-over.
    expect(triageSrc).toContain('const total = submits.length');
    expect(triageSrc).toMatch(/for \(const e of submits\) \(byBucket\[classify\(a, e\)\]/);
    expect(triageSrc).toMatch(/liveNew|liveOld/);
  });
});
