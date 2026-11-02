/**
 * #2654 idea 3 (ADR-W-171) — 2-D's sibling-phrasing ratchet (`shell/__tests__/fixtures/sibling-phrasings.ts`).
 *
 * Every catalog sentence, typed on the figure its parity row gives it, and every meaning-preserving sibling
 * spelling of it, are DECIDED by `decideDeterministic2D` — the pre-LLM lane `runSubmit` dispatches, the same
 * one the `geo-input-parity` thin lock drives — on the same figure. A sibling whose verdict, code or
 * commands differ from its base's is a failing variant; the known ones are rows of
 * `shell/__tests__/fixtures/sibling-phrasings/known-2d.json`, which only shrinks. An `escalate` is
 * `not-handled`: the model is never asked (standing rule 2).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) }));

import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG } from '@/parser/catalog';
import { PARITY_ROWS, roleOf, stepsFor } from '../../shell/__tests__/fixtures/geo-input-parity';
import { basesFrom, fingerprint, ratchetFaults, sweep, type DecideRunner, type Outcome } from '../../shell/__tests__/fixtures/sibling-phrasings';
import { readKnown, writeKnown, writeMode } from '../../shell/__tests__/fixtures/sibling-phrasings-io';

const st = () => useGeoStore.getState();

function outcomeOf(v: Verdict2D): Outcome {
  switch (v.kind) {
    case 'commit':
      return { verdict: 'builds', shape: fingerprint(v.commands) };
    case 'noop':
      return { verdict: 'builds', code: 'noop' };
    case 'escalate':
      return { verdict: 'not-handled', code: v.parseReason ?? v.weak ?? undefined };
    case 'refuse':
      return { verdict: v.category === 'clarify' ? 'asks' : 'refused', code: 'key' in v.note ? v.note.key : v.note.explain };
    case 'store-op':
      return { verdict: 'builds', code: v.op, shape: `${v.from}>${v.to}` };
  }
}

const run2D: DecideRunner = async (context, lines) => {
  st().clear();
  for (const line of context) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
    if (v.kind === 'store-op') {
      const res = v.op === 'swap' ? st().swap(v.from, v.to) : v.op === 'name-centre' ? st().nameCentre(v.from, v.to) : v.op === 'rename' ? st().rename(v.from, v.to) : st().merge(v.from, v.to);
      if (!res.ok) return null;
      continue;
    }
    if (v.kind !== 'commit' && v.kind !== 'noop') return null;
    commitVerdict(v, line);
  }
  const facts = st().facts;
  const seed = st().seed;
  const d = replay(facts, seed);
  const out: Outcome[] = [];
  for (const line of lines) {
    out.push(outcomeOf(await decideDeterministic2D({ facts, seed, view: { construction: d.construction, positions: d.positions } }, line, 'he')));
  }
  return out;
};

const contexts = PARITY_ROWS.filter((r) => roleOf(r, '2d') !== 'free').map((r) => stepsFor(r, '2d'));
const bases = basesFrom('2d', COMMAND_CATALOG.filter((e) => e.supported).map((e) => e.he), contexts);

describe('#2654 — 2-D reads every sibling phrasing of a catalog sentence as it reads the sentence', () => {
  it('no new failing sibling, and no listed one that agrees now (the list only shrinks)', async () => {
    const report = await sweep('2d', bases, run2D);
    if (writeMode()) writeKnown('2d', report);
    expect(report.skipped).toEqual([]);
    expect(ratchetFaults(report.failing, readKnown('2d'))).toEqual([]);
  }, 600_000);
});
