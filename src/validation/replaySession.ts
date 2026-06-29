/**
 * Headless session-replay harness (Option A — turn production sessions into reproducible cases).
 *
 * A production student only generates the LEAN `events.jsonl` (utterance + outcome, no figure
 * snapshots — see `server/eventLog.ts`). To understand *why* a session failed we re-run its exact
 * ordered utterances through the REAL pipeline (`parse → dryRun → commit → replay`), mirroring
 * `App.tsx`'s `submit` decision tree step-for-step, and classify each step. The output is a
 * machine-readable triage a loop agent (or a human) can act on:
 *
 *   - `ok`            — parser committed and the figure verifies (green).
 *   - `ok-amber`      — parser committed but the verifier flags an unsatisfied given → a REAL engine bug.
 *   - `deferred`      — a constraint parked until later givens pin the figure (ADR-104) — fine.
 *   - `empty`         — parsed but built NOTHING because its objects already exist (collision with prior
 *                       state, e.g. "square ABCD" after ABCD was already a parallelogram). DATA-ENTRY /
 *                       error-message issue, not an engine bug — `alreadyDefined` lists the colliding ids.
 *   - `coverage-gap`  — the grammar didn't match at all (prod would escalate to the LLM). A phrasing the
 *                       deterministic parser arguably should cover — the loop agent's parser worklist.
 *   - `edit`          — a rename/merge/swap store op (applied as a label rewrite; best-effort).
 *
 * The LLM second-attempt is NOT invoked here (operator policy: no autonomous API calls). A step that
 * would escalate does NOT commit — exactly what happens in prod when the LLM also fails (built-nothing).
 * Where prod's LLM *succeeded*, the harness diverges (the step won't commit), which is acceptable: the
 * goal is to surface the deterministic-parser + engine failures, which is where fixes belong.
 *
 * Pure + deterministic (no I/O). The ingest side (`eventsToSessions`) lives in `sessionsFromLog.ts`.
 */

import { parse, droppedNewLabels } from '@/parser';
import { replay, dryRunOutcome, hasDeferrableConstraint, introducedIds, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact, Derived } from '@/store/geoStore';
import { isGeoPoint, circleMembers, pointNeighbors } from '@/engine';
import type { AnyCommand, Id } from '@/engine';

export type StepCategory = 'ok' | 'ok-amber' | 'deferred' | 'empty' | 'coverage-gap' | 'edit';

export interface StepResult {
  utterance: string;
  category: StepCategory;
  /** Prod-equivalent outcome label, matching the dashboard buckets (`parser-ok`, `weak:empty`, …). */
  outcome: string;
  /** Whether the step committed facts to the figure. */
  committed: boolean;
  /** For `empty`: the introduced ids that already existed (the collision that produced nothing). */
  alreadyDefined?: Id[];
  /** Raw engine detail (a failing status / error string), when present. */
  detail?: string;
}

export interface SessionReport {
  steps: StepResult[];
  /** The final derived figure after all committed steps. */
  final: Derived;
  /** Roll-up counts by category, for quick triage scanning. */
  totals: Record<StepCategory, number>;
}

/** The figure context the app feeds the parser (mirrors `App.parseCtx` / scenarios `ctxOf`), derived
 *  from an already-computed figure so the caller reuses one `replay` for both context and `before`. */
function ctxFrom(before: Derived) {
  const { construction } = before;
  return {
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction),
    neighbors: pointNeighbors(construction),
    lines: construction.objects.flatMap((o) => (o.kind === 'line' ? [o.id] : [])),
  };
}

/** Replace label `from`→`to` everywhere in a fact's command + utterance (token-aware, for rename/swap). */
function relabelFact(f: Fact, map: Record<string, string>): Fact {
  let json = JSON.stringify(f.cmd);
  for (const [from, to] of Object.entries(map)) {
    json = json.replace(new RegExp(`"${from}(\\d*)"`, 'g'), `"${to}$1"`).replace(new RegExp(`-${from}\\b`, 'g'), `-${to}`);
  }
  return { ...f, cmd: JSON.parse(json) as AnyCommand };
}

/** A store-op intent recognised before the parser (rename/merge/swap). Returns null for a geometry step. */
function storeOp(u: string): { kind: 'rename' | 'merge' | 'swap'; from: string; to: string } | null {
  // Lean recognisers — the harness only needs to keep downstream label references resolvable, not
  // reproduce the store's exact guards. Hebrew + English forms.
  let m = u.match(/(?:rename|שנה(?:\s*שם)?)\s+([A-Z])\d*\s*(?:to|ל-?)\s*([A-Z])/i);
  if (m) return { kind: 'rename', from: m[1].toUpperCase(), to: m[2].toUpperCase() };
  m = u.match(/(?:merge|מזג)\s+([A-Z])\d*\s*(?:into|ל-?)\s*([A-Z])/i);
  if (m) return { kind: 'merge', from: m[1].toUpperCase(), to: m[2].toUpperCase() };
  m = u.match(/(?:swap|החלף)(?:\s*בין)?\s+([A-Z])\d*\s*(?:and|ל-?)\s*([A-Z])/i);
  if (m) return { kind: 'swap', from: m[1].toUpperCase(), to: m[2].toUpperCase() };
  return null;
}

export interface ReplayOpts {
  /** Auto-advance to the first directional-extension-satisfying seed (ADR-098) — matches the app, but
   *  costs up to ~120 replays on coupled figures. Off for batch triage (seed 0). Default true. */
  satisfyingSeed?: boolean;
}

/** Replay one session's ordered utterances through the real pipeline and classify each step. */
export function replaySession(utterances: string[], opts: ReplayOpts = {}): SessionReport {
  const { satisfyingSeed = true } = opts;
  let facts: Fact[] = [];
  const steps: StepResult[] = [];
  let g = 0;

  for (const utterance of utterances) {
    const op = storeOp(utterance);
    if (op) {
      // Best-effort label rewrite so later steps resolve; we don't model merge's point-folding.
      if (op.kind === 'rename' || op.kind === 'swap') {
        const map = op.kind === 'swap' ? { [op.from]: op.to, [op.to]: op.from } : { [op.from]: op.to };
        facts = facts.map((f) => relabelFact(f, map));
      }
      steps.push({ utterance, category: 'edit', outcome: op.kind, committed: true });
      continue;
    }

    const before = replay(facts);
    const ctx = ctxFrom(before);
    const r = parse(utterance, ctx);
    if (!r.ok) {
      steps.push({ utterance, category: 'coverage-gap', outcome: 'not-handled', committed: false });
      continue;
    }

    const dropped = droppedNewLabels(utterance, r.commands, ctx.points);
    if (dropped.length) {
      steps.push({ utterance, category: 'coverage-gap', outcome: `weak:dropped:${dropped.join(',')}`, committed: false });
      continue;
    }

    const outcome = dryRunOutcome(facts, r.commands);
    if (outcome.produced) {
      const group = `g${g++}`;
      r.commands.forEach((c) => facts.push({ id: `${group}.${facts.length}`, group, cmd: c, enabled: true, utterance }));
      steps.push({ utterance, category: 'ok', outcome: 'parser-ok', committed: true });
      continue;
    }
    if (outcome.reason === 'error' && hasDeferrableConstraint(r.commands)) {
      const group = `g${g++}`;
      r.commands.forEach((c) => facts.push({ id: `${group}.${facts.length}`, group, cmd: c, enabled: true, utterance }));
      steps.push({ utterance, category: 'deferred', outcome: 'deferred-constraint', committed: true, detail: outcome.detail });
      continue;
    }
    // Parsed but built nothing → did every id it would introduce already exist? (the "ABCD already defined"
    // collision) — that's a data-entry / error-message issue, distinct from a true engine fault.
    const introduced = r.commands.flatMap(introducedIds);
    const alreadyDefined = [...new Set(introduced)].filter((id) => before.positions.has(id));
    steps.push({
      utterance,
      category: 'empty',
      outcome: `weak:${outcome.reason}`,
      committed: false,
      alreadyDefined: alreadyDefined.length ? alreadyDefined : undefined,
      detail: outcome.detail,
    });
  }

  // Mirror the app's auto-advance to the first configuration that satisfies directional extensions (ADR-098).
  const final = replay(facts, satisfyingSeed ? firstSatisfyingSeed(facts) : 0);
  // A committed-but-amber figure (verifier violations) is the strongest "built the wrong thing" signal —
  // promote the most recent committed `ok` step to `ok-amber` when the final figure has violations.
  if (final.violations.length) {
    const lastOk = [...steps].reverse().find((s) => s.category === 'ok');
    if (lastOk) {
      lastOk.category = 'ok-amber';
      lastOk.detail = final.violations.map((v) => v.message).join('; ');
    }
  }

  const totals = { ok: 0, 'ok-amber': 0, deferred: 0, empty: 0, 'coverage-gap': 0, edit: 0 } as Record<StepCategory, number>;
  for (const s of steps) totals[s.category]++;

  return { steps, final, totals };
}
