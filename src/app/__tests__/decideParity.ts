/**
 * #1395 — THE PARITY HARNESS for extracting `decideDeterministic2D` out of `runSubmit`.
 *
 * The extraction is debt, not behaviour: nothing a student sees may change. The four
 * `decide-parity-1395-N.test.ts` shards replay the whole 2-D scenario corpus (and, in shard 4, every
 * saved fixture) through the REAL `runSubmit` (the model mocked, standing rule 2), step by step, and
 * record everything a student or the store can observe: the notes (message key + params), the rename
 * notes, whether the text cleared, whether a commit handed off to the auto-resolve, whether the model was
 * called, and the final fact list.
 *
 * Each shard's golden file was recorded from the pipeline BEFORE the extraction (at `838b1848`). A shard
 * asserts that the pipeline reproduces it exactly, per scenario. Re-record only with
 * `UPDATE_PARITY_GOLDEN=1`, and only for a change MEANT to alter behaviour, which names itself in its
 * own ADR. Sharded like `scenarios-e2e-*` because the whole corpus is ~8 minutes in one file.
 */
import { beforeAll, describe, expect, it, type Mock } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { parse } from '@/parser';
import { buildParseCtx } from '@/parser/context';
import type { AnyCommand } from '@/engine';
import type { Scenario } from '@/__tests__/scenarios-harness';

const FIXTURES = path.resolve(__dirname, '../../__tests__/fixtures');

interface StepRecord {
  u: string;
  notes: string[];
  renames: string[];
  cleared: number;
  resolved: number;
  llm: number;
}

function makeDeps(rec: StepRecord): SubmitDeps {
  return {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => { if (m) rec.notes.push(m); },
      setRenameNote: (m) => { if (m) rec.renames.push(m); },
      setLlmDropped: () => {},
      clearText: () => { rec.cleared++; },
      setBusy: () => {},
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => { rec.resolved++; },
    llmAbortRef: { current: null },
    explainError: (raw, said) => `explain:${raw ?? ''}|${said ?? ''}`,
  };
}

const factDigest = (facts: readonly Fact[]) =>
  facts.map((f) => `${f.utterance}\u0001${JSON.stringify(f.cmd)}\u0001${f.enabled === false ? 0 : 1}`).join('\n');

/** Replay one step list through the real pipeline; return the per-step record and the final facts. */
async function replaySteps(steps: readonly unknown[], llmParseMock: Mock): Promise<string> {
  useGeoStore.getState().clear();
  const recs: StepRecord[] = [];
  for (const step of steps) {
    if (typeof step === 'string') {
      const rec: StepRecord = { u: step, notes: [], renames: [], cleared: 0, resolved: 0, llm: 0 };
      llmParseMock.mockReset();
      llmParseMock.mockResolvedValue({ built: [], dropped: [] });
      await runSubmit(step, makeDeps(rec));
      rec.llm = llmParseMock.mock.calls.length;
      recs.push(rec);
    } else if (step && typeof step === 'object' && 'llm' in step) {
      // the model's answer, captured from the log: committed exactly as the pipeline would after a clean
      // decomposition, so the figure the NEXT typed step sees is the one the student saw
      const lines = (step as { llm: unknown[] }).llm;
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      const ctx = buildParseCtx(d.construction, d.positions);
      const cmds: AnyCommand[] = lines.flatMap((l) => {
        if (typeof l !== 'string') return [l as AnyCommand];
        const r = parse(l, ctx);
        return r.ok ? r.commands : [];
      });
      if (cmds.length) st.executeMany(cmds, 'llm-step');
    }
    // `edit` steps re-run a prior step through a different seam (commitEdit); out of this lock's reach
  }
  return JSON.stringify({ recs, facts: factDigest(useGeoStore.getState().facts) });
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

interface Case { name: string; steps: readonly unknown[] }

/** A saved fixture's steps: its facts' utterances, in order, one per group. */
export function fixtureCases(): Case[] {
  const files = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((n) => n.endsWith('.geo.json')) : [];
  return files.map((file) => {
    const saved = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { facts: { group: string; utterance: string }[] };
    const seen = new Set<string>();
    const steps: string[] = [];
    for (const fact of saved.facts) {
      if (seen.has(fact.group)) continue;
      seen.add(fact.group);
      steps.push(fact.utterance);
    }
    return { name: `fixture:${file}`, steps };
  });
}

export const scenarioCases = (list: readonly Scenario[]): Case[] => list.map((s) => ({ name: `scenario:${s.id}`, steps: s.steps }));

/** One shard: replay its cases, compare with (or, under UPDATE_PARITY_GOLDEN=1, write) its golden. */
export function parityShard(shard: string, cases: readonly Case[], llmParseMock: Mock): void {
  const GOLDEN = path.join(__dirname, `decide-parity-1395-${shard}.golden.json`);
  describe(`#1395 — shard ${shard}: the extracted pipeline reproduces the recorded one`, () => {
    const actual: Record<string, string> = {};
    const detail: Record<string, string> = {};

    beforeAll(async () => {
      for (const c of cases) {
        const s = await replaySteps(c.steps, llmParseMock);
        actual[c.name] = hash(s);
        detail[c.name] = s;
      }
      if (process.env.UPDATE_PARITY_GOLDEN === '1') writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n');
    }, 900_000);

    it('the shard is not empty, and every case has a unique name', () => {
      expect(cases.length).toBeGreaterThan(0);
      expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    });

    it('every case matches its recorded behaviour', () => {
      const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
      const drift = Object.keys(golden).filter((k) => golden[k] !== actual[k]);
      if (drift.length) {
        const dir = path.resolve(__dirname, '../../../reports');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `decide-parity-drift-${shard}.json`), JSON.stringify(Object.fromEntries(drift.map((k) => [k, JSON.parse(detail[k])])), null, 1));
      }
      expect(drift).toEqual([]);
      expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
    });
  });
}
