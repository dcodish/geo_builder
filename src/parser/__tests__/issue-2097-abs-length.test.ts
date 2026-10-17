/**
 * #2097 ([ADR-719](../../../docs/06-decisions.md#adr-719)) — «|XY|» is the length XY, folded at the parse boundary.
 *
 * Measured at pickup (`de7c221f`, `decideDeterministic2D` + `replay`, the model mocked), after «משולש ABC»:
 * «|AB| = 4», «|AB| = k», «|AB| = |AC|», «|AB|=2|AC|», «|AB| = √2», «|BC| = 2k» and «|AB|:|AC| = 2:3» ESCALATED, while
 * «|AB| + |AC| = 10», «|AB| > |AC|» and «|AB| < 5» committed — four rules stripped the bars locally, the rest did not.
 * The fold in `normalizeUtterance` makes every bar-spelled length read as its bar-less twin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { normalizeUtterance } from '../parse';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const shape = (v: Awaited<ReturnType<typeof decide>>) => ({ kind: v.kind, commands: v.kind === 'commit' ? v.commands : undefined });

const TRIANGLE = ['משולש ABC'];
const SQUARE = ['ריבוע ABCD'];

describe('#2097 — a bar-spelled length reads exactly as its bar-less twin', () => {
  it.each([
    [TRIANGLE, '|AB| = 4', 'AB = 4'],
    [TRIANGLE, '|AB| = k', 'AB = k'],
    [TRIANGLE, '|AB| = |AC|', 'AB = AC'],
    [TRIANGLE, '|AB|=2|AC|', 'AB=2AC'],
    [TRIANGLE, '|AB| = √2', 'AB = √2'],
    [TRIANGLE, '|BC| = 2k', 'BC = 2k'],
    [TRIANGLE, '|AB|:|AC| = 2:3', 'AB:AC = 2:3'],
    [TRIANGLE, '| AB | = 4', 'AB = 4'],
    [SQUARE, '|AC| = 5', 'AC = 5'],
  ])('after %j, «%s» ≡ «%s»', async (prefix, bars, plain) => {
    const a = shape(await decide(prefix, bars));
    expect(a.kind, `«${bars}» commits`).toBe('commit');
    expect(a).toEqual(shape(await decide(prefix, plain)));
  });

  it.each([
    ['|AB| + |AC| = 10', 'set-measure-sum'],
    ['|AB| > |AC|', 'set-length-order'],
    ['|AB| < 5', 'set-length-bound'],
  ])('must-not-change: «%s» still commits %s', async (line, type) => {
    const v = await decide(TRIANGLE, line);
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.commands.map((c) => c.type)).toContain(type);
  });
});

describe('#2097 — the fold is scoped to a two-label bar pair', () => {
  it.each([
    ['|AB| = 4', 'AB = 4'],
    ['|A1B1| = 4', 'A1B1 = 4'],
    ['|AB| + |AC| = 10', 'AB + AC = 10'],
  ])('«%s» folds to «%s»', (raw, out) => {
    expect(normalizeUtterance(raw)).toBe(out);
  });
  it.each([
    '|z| = 4', // not 2-D's vocabulary — left to its current path
    '|ABC| = 4', // three labels — not a length
    'AB || CD || EF', // a doubled bar is never half of an absolute value
  ])('«%s» is untouched', (raw) => {
    expect(normalizeUtterance(raw)).toBe(raw);
  });
});
