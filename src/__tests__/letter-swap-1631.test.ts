/**
 * 2-D's thin lock on the shared letter popover's rename + swap (#1631) — the shared checks, this tree's
 * REAL operations (docs/28 §5c rule 3).
 *
 * The rename goes through the store's `rename` and then `letterRename`, the adapter `Figure.tsx` hands
 * the shared popover — the same two calls a click makes. The swap is the store's `swap`, which the
 * popover's offer and the typed «החלף בין A ל-B» both reach.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';
import { letterRename } from '@/render/Figure';
import { letterSwapFaults } from '../../shell/__tests__/fixtures/letter-swap-rows';

const st = () => useGeoStore.getState();
const ctxOf = () => {
  const d = replay(st().facts, st().seed);
  return buildParseCtx(d.construction, d.positions);
};

function build(utterances: string[]) {
  st().clear();
  useGeoStore.temporal.getState().clear();
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    if (!r.ok) throw new Error(`setup failed on «${u}»: ${JSON.stringify(r)}`);
    st().executeMany(r.commands, u);
  }
  useGeoStore.temporal.getState().clear();
}

const subject = (setup: string[], a: string, b: string) => ({
  setup: () => build(setup),
  a,
  b,
  rename: (from: string, to: string) => letterRename(st().rename(from, to)),
  swap: (x: string, y: string) => st().swap(x, y),
  undo: () => useGeoStore.temporal.getState().undo(),
  statements: () => st().facts.map((f) => f.utterance ?? ''),
  points: () => [...replay(st().facts, st().seed).positions.keys()].filter((id) => /^[A-Z]\d*$/.test(id)),
});

beforeEach(() => st().clear());

describe('#1631 — the 2-D builder conforms to the shared letter-swap contract', () => {
  it.each([
    ['a shape vertex and a loose point', ['משולש ABC', 'נקודה D'], 'A', 'D'],
    ['two vertices of one shape', ['מרובע ABCD'], 'A', 'B'],
    ['a point another statement depends on', ['משולש ABC', 'נקודה D', 'AD'], 'B', 'D'],
  ])('%s', (_name, setup, a, b) => {
    expect(letterSwapFaults(subject(setup, a, b))).toEqual([]);
  });
});
