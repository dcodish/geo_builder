/**
 * #2024 ([ADR-668](../../../docs/06-decisions.md#adr-668)) — a symbol letter equal to one of the measured element's own
 * point letters is a VALUE, never a lowercase label.
 *
 * Measured on `main` b0ef3240 through `decideDeterministic2D`: after «משולש ABC», «AB=b» and «זוית B=b» were refused
 * `scope:lowercase-labels` and "corrected" to «AB=B» / «זוית B=B», while «AB=c», «AC=b» and «AB=2b» committed. The
 * parse was right (`measure-length {A,B, var:'b'}`); the commit-seam fold read the coincidence of the symbol `b` with
 * the referenced label B as proof of a folded label. Operator ruling 2026-10-13 (card d4-2024): build it like «AB=c»,
 * the same for «זוית B=b»; the false correction is withdrawn.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { lowercaseLabelFold } from '@/parser';
import type { AnyCommand } from '@/engine';
import { driveThroughGate } from '../../__tests__/submit-gate';

type P = Map<string, { x: number; y: number }>;
const len = (p: P, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he') {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** Every line through the student's own lane — `decideDeterministic2D` then the pipeline's `commitVerdict` — each
 *  must commit (the reduced `driveThroughGate` has no commit-seam fold, so it cannot see this bug). */
async function build(lines: string[]) {
  const st = () => useGeoStore.getState();
  st().clear();
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
    expect(v.kind, line).toBe('commit');
    commitVerdict(v, line);
  }
  const facts = st().facts;
  const fig = replay(facts, st().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return fig;
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2024 — a symbol that shares a letter with the measured element commits like any other symbol', () => {
  it.each([
    ['AB=b', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'b' } }],
    ['AB = a', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'a' } }],
    ['האורך AB=a', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'a' } }],
    ['AB=b+1', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'b', const: 1, text: 'b + 1' } }],
    ['זוית B=b', { type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { coef: 1, var: 'b' } }],
    ['זווית ABC=b', { type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { coef: 1, var: 'b' } }],
    ['זוית A=a', { type: 'measure-angle', vertex: 'A', ray1: 'B', ray2: 'C', expr: { coef: 1, var: 'a' } }],
  ])('«%s» after «משולש ABC» commits its measure, the model never asked', async (line, cmd) => {
    const v = await decide(['משולש ABC'], line);
    expect(v.kind, line).toBe('commit');
    expect(v.kind === 'commit' && v.commands).toEqual([cmd]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the English locale reads it the same', async () => {
    const v = await decide(['triangle ABC'], 'AB=b', 'en');
    expect(v.kind).toBe('commit');
  });

  it.each([[['משולש ABC', 'AB=b']], [['משולש ABC', 'זוית B=b']], [['משולש ABC', 'AB=b', 'b=4']]])('%j builds green and verifies', async (lines) => {
    await build(lines);
  });

  it('the value reaches the figure: «AB=b · b=4» draws |AB| = 4, as «AB=c · c=4» does', async () => {
    expect(len((await build(['משולש ABC', 'AB=b', 'b=4'])).positions, 'A', 'B')).toBeCloseTo(4, 6);
    expect(len((await build(['משולש ABC', 'AB=c', 'c=4'])).positions, 'A', 'B')).toBeCloseTo(4, 6);
  });
});

describe('#2024 — composes with #2101 (a radius letter is a symbol too)', () => {
  it('«מעגל B ברדיוס b» names circle B’s radius b and «b = 3» sizes it', async () => {
    const fig = await build(['מעגל B ברדיוס b', 'b = 3']);
    expect(fig.circles.get('circle-B')!.r).toBeCloseTo(3, 9);
  });

  it('a length sharing the radius letter: «מעגל O ברדיוס b · AB=b · b=3» draws |AB| = 3 = r', async () => {
    const fig = await build(['משולש ABC', 'מעגל O ברדיוס b', 'AB=b', 'b=3']);
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(3, 9);
    expect(len(fig.positions, 'A', 'B')).toBeCloseTo(3, 6);
  });

  it('the uppercase radius letter of #2101 still reads as a value: «מעגל O ברדיוס R · R = 3»', async () => {
    const v = await decide(['מעגל O ברדיוס R'], 'R = 3');
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'set-var', name: 'R', value: 3 }]);
  });
});

describe('#2024 — a genuine lowercase LABEL is still taught (the #779 convention)', () => {
  it.each([
    ['ab = 5', 'AB = 5'],
    ['זוית abc = 40', 'זוית ABC = 40'],
  ])('«%s» is refused and corrected to «%s»', async (line, corrected) => {
    const v = await decide(['משולש ABC'], line);
    expect(v.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.note).toEqual({ key: 'input.scope.lowercase-labels', params: { corrected } });
  });

  it('the fold itself: a symbol slot never proves a label, a label slot does', () => {
    const sym: AnyCommand[] = [{ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'b' } }];
    expect(lowercaseLabelFold('AB=b', sym)).toBeNull();
    const radius: AnyCommand[] = [{ type: 'radius-symbol', circle: 'circle-B', name: 'b' }];
    expect(lowercaseLabelFold('מעגל B ברדיוס b', radius)).toBeNull();
    const label: AnyCommand[] = [{ type: 'segment', a: 'A', b: 'B' }, { type: 'set-distance', a: 'A', b: 'B', value: 5 }];
    expect(lowercaseLabelFold('ab = 5', label)).toEqual({ folded: ['A', 'B'], corrected: 'AB = 5' });
  });
});
