/**
 * #1649 (ADR-W-108) — 2-D's thin lock on the cross-product geometry-input parity rows
 * (`shell/__tests__/fixtures/geo-input-parity.ts`, docs/28 §5c).
 *
 * 2-D is the REFERENCE (operator ruling 2026-10-02: «analytics and 2d should have same user experience»):
 * each row's `expect` is 2-D's measured verdict, and this lock is what keeps it true. The analytic and 3-D
 * thin locks assert the same `expect`, so the builders agree transitively.
 *
 * The runner is the real pre-LLM decision `runSubmit` dispatches — `decideDeterministic2D` — with every
 * accepted line applied to the store exactly as the pipeline applies it (its auto-binds, then the one
 * batch commit, or the store operation), so the next line sees the figure. An `escalate` is
 * `not-handled`: the model is never asked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG } from '@/parser/catalog';
import {
  catalogCoverageFaults,
  parityFaults,
  type StepRunner,
  type StepVerdict,
} from '../../shell/__tests__/fixtures/geo-input-parity';

const st = () => useGeoStore.getState();

/** One verdict of the deterministic lane, in the rows' vocabulary. */
function verdictOf2D(v: Verdict2D): StepVerdict {
  switch (v.kind) {
    case 'commit':
      return { verdict: 'builds' };
    case 'noop':
      return { verdict: 'builds', code: 'noop' };
    case 'escalate':
      return { verdict: 'not-handled', code: v.parseReason ?? v.weak ?? undefined };
    case 'refuse':
      return { verdict: v.category === 'clarify' ? 'asks' : 'refused', code: 'key' in v.note ? v.note.key : v.note.explain };
    case 'store-op':
      return { verdict: 'builds', code: v.op };
  }
}

const run2D: StepRunner = async (steps) => {
  st().clear();
  const out: StepVerdict[] = [];
  for (const line of steps) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
    if (v.kind === 'store-op') {
      const res =
        v.op === 'swap' ? st().swap(v.from, v.to)
        : v.op === 'name-centre' ? st().nameCentre(v.from, v.to)
        : v.op === 'rename' ? st().rename(v.from, v.to)
        : st().merge(v.from, v.to);
      out.push(res.ok ? verdictOf2D(v) : { verdict: 'refused', code: `${v.op}:${res.reason}` });
      continue;
    }
    for (const b of v.binds) {
      if (b.op === 'name-centre') st().nameCentre(b.from, b.to);
      else if (b.op === 'step-aside') st().reletterHidden(b.from, b.to);
      else st().rename(b.from, b.to);
    }
    if (v.kind === 'commit') st().executeMany([...v.commands], line);
    out.push(verdictOf2D(v));
  }
  return out;
};

describe('#1649 — 2-D gives the reference verdict on every plane-geometry parity row', () => {
  it('every row through decideDeterministic2D', async () => {
    expect(await parityFaults({ '2d': run2D })).toEqual([]);
  }, 120_000);

  it('every sentence of the 2-D catalog is a parity step (or on the shrinking allowlist)', () => {
    const sentences = COMMAND_CATALOG.filter((e) => e.supported).map((e) => e.he);
    expect(catalogCoverageFaults('2d', sentences)).toEqual([]);
  });
});
