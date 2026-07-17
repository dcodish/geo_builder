/**
 * ADR-346 — the anti-drift guard for the log-triage verifier.
 *
 * `.claude/skills/log-triage/triage.mjs` MIRRORS `App.tsx#submit` so that "is this still a gap?" is
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
const triageSrc = readFileSync(path.join(root, '.claude/skills/log-triage/triage.mjs'), 'utf8');

/** The literal category set of a `new Set([...])` assigned to `name`. */
const setLiteral = (src: string, name: string): string[] => {
  const m = src.match(new RegExp(String.raw`const ${name} = new Set\(\[([^\]]*)\]`));
  if (!m) throw new Error(`no ${name} set literal found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
};

describe('ADR-346 — log-triage mirrors the App submit path', () => {
  it('the pre-LLM out-of-scope register is identical in both', () => {
    // App.tsx short-circuits these categories with a guided message BEFORE paying for an LLM call
    // (ADR-289). If the harness misses one, that category's utterances are reported as grammar gaps
    // although the tool answers them on purpose — the 2026-07-17 `orientation` / `ui-command` rows.
    expect(setLiteral(triageSrc, 'PRE_LLM')).toEqual(setLiteral(appSrc, 'PRE_LLM'));
  });

  it('every honesty gate the App submit path calls is also called by the harness', () => {
    // A gate the harness skips = a partial parse the App would escalate but the harness reports as
    // `built` — i.e. a real gap silently marked "already fixed". The inverse of the #35 defect, and
    // strictly worse (it hides work rather than inventing it).
    const GATES = [
      'droppedNewLabels',       // ADR-089
      'droppedGivenNumbers',    // ADR-250
      'droppedGivenRelations',  // ADR-264
      'droppedGivenVerbs',      // ADR-292
      'droppedCompoundRelation', // #153/#145
    ];
    // Guard the guard: if App.tsx stops calling one of these, this list is stale and must be revisited
    // (a silently-shrinking expectation would pass forever while proving nothing).
    for (const g of GATES) expect(appSrc, `App.tsx no longer calls ${g} — update this guard + the harness`).toContain(`${g}(`);
    for (const g of GATES) expect(triageSrc, `triage.mjs must mirror the App's ${g} gate (ADR-346)`).toContain(`${g}(`);
  });

  it('the harness derives its parse context from the shared builder, never a local copy', () => {
    // The ADR-169 instance: the harness had its OWN ctx builder, missing `parallels`, so every
    // trapezoid-altitude utterance read as a gap. `context.ts` was centralized to end that class —
    // which only works if the harness actually calls it.
    expect(triageSrc).toContain('buildParseCtx');
    expect(triageSrc).toMatch(/import\s*\{[^}]*buildParseCtx[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/src\/parser\/index\.ts'/s);
  });

  it('the harness parses WITH context and replays a session prefix (not a lone standalone parse)', () => {
    // The #35 defect itself: `parse(u)` with no second argument, one utterance at a time.
    expect(triageSrc).toContain('parse(u, pctx)');
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

  it('all-time counts survive the incremental split (the ranking rule the operator kept)', () => {
    // The rejected design was a watermark that only counted new events — it would reset distinct-user
    // counts each window and bury a cluster hit by 3 users over 3 months. Stats/candidates must stay over
    // the FULL `submits` list; only the worklist may split new vs carried-over.
    expect(triageSrc).toContain('const total = submits.length');
    expect(triageSrc).toMatch(/for \(const e of submits\) \(byBucket\[classify\(a, e\)\]/);
    expect(triageSrc).toMatch(/liveNew|liveOld/);
  });
});
