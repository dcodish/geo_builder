/**
 * #1851 ([ADR-662](../../../docs/06-decisions.md#adr-662)) — «∠ABC = α + 40» IS ACCEPTED AND DRAWN.
 *
 * Operator, 2026-10-07 (playing round #1845, T34): *"∠ABC = α + 40 should be accepted and drawn"*.
 * Measured on `6089a6ba` through `decideDeterministic2D` (model mocked): «∠ABC = α + 40», «2α + 10», «α − 20», «זווית ABC
 * היא α + 40», «זווית B = α + 40» escalated (`not-handled`), while the length rule committed «AB = a + 3». Root cause: two
 * readers of one grammar — the affine tail («± c») lived inline in `measureLength` only — and the angle lowering ignored a
 * constant. Now one tail reader (`AFFINE_TAIL`) serves both, and `measure-angle` lowers its constant the way a length does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
type P = Map<string, { x: number; y: number }>;
const deg = (p: P, v: string, a: string, b: string) => {
  const V = p.get(v)!, A = p.get(a)!, B = p.get(b)!;
  let x = Math.abs(Math.atan2(A.y - V.y, A.x - V.x) - Math.atan2(B.y - V.y, B.x - V.x));
  if (x > Math.PI) x = 2 * Math.PI - x;
  return (x * 180) / Math.PI;
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
  const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
  return { v, said: raw ? stripFormatControls(humanizeError(raw, he, line, otherUtteranceForError(st.facts, raw))) : null };
}

/** Drive every line through the real gate; every line commits, the verifier is clean; the figure at the store's seed. */
function build(lines: string[]) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError).toBeNull();
  expect(fig.violations).toEqual([]);
  return fig;
}

describe('#1851 — a symbol plus a constant is read as the length rule reads it', () => {
  it.each([
    ['∠ABC = α + 40', { coef: 1, var: 'α', const: 40, text: 'α + 40' }], // the operator's sentence
    ['∠ABC = 2α + 10', { coef: 2, var: 'α', const: 10, text: '2α + 10' }],
    ['∠ABC = α - 20', { coef: 1, var: 'α', const: -20, text: 'α − 20' }],
    ['∠ABC = α − 20', { coef: 1, var: 'α', const: -20, text: 'α − 20' }],
    ['∠ABC = 1/2α + 10', { coef: 0.5, var: 'α', const: 10, text: '1/2α + 10' }],
    ['זווית ABC היא α + 40', { coef: 1, var: 'α', const: 40, text: 'α + 40' }],
    ['זוית ABC שווה α + 40', { coef: 1, var: 'α', const: 40, text: 'α + 40' }],
    ['זווית B = α + 40', { coef: 1, var: 'α', const: 40, text: 'α + 40' }],
    ['angle ABC = α + 40', { coef: 1, var: 'α', const: 40, text: 'α + 40' }],
    ['∠ABC = α + 40°', { coef: 1, var: 'α', const: 40, text: 'α + 40' }],
  ])('«%s» commits measure-angle %j', async (line, expr) => {
    const { v } = await decide(['משולש ABC'], line);
    expect(v.kind, line).toBe('commit');
    expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr }]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the arc reads «α + 40»', () => {
    const fig = build(['משולש ABC', '∠ABC = α + 40']);
    expect(fig.labels.angles.map((a) => a.text)).toEqual(['α + 40']);
  });

  it.each([
    [['משולש ABC', '∠ACB = α', '∠ABC = α + 40']],
    [['משולש ABC', '∠ABC = α + 40', '∠ACB = α']], // entry order (docs/17 §6)
    [['משולש ABC', '∠ACB = α', 'זווית B = α + 40']],
  ])('%j — drawn with ∠B − ∠C = 40°', (lines) => {
    const p = build(lines as string[]).positions;
    expect(deg(p, 'B', 'A', 'C') - deg(p, 'C', 'A', 'B')).toBeCloseTo(40, 4);
  });

  it('«2α + 10» against «α»: ∠B = 2∠C + 10', () => {
    const p = build(['משולש ABC', '∠ACB = α', '∠ABC = 2α + 10']).positions;
    expect(deg(p, 'B', 'A', 'C')).toBeCloseTo(2 * deg(p, 'C', 'A', 'B') + 10, 4);
  });

  it('a value for the letter resolves it: «α = 30» draws 70° and the arc reads it', () => {
    const fig = build(['משולש ABC', '∠ABC = α + 40', 'α = 30']);
    expect(deg(fig.positions, 'B', 'A', 'C')).toBeCloseTo(70, 4);
    expect(fig.labels.angles.map((a) => a.text)).toEqual(['70°']);
  });

  it('«∠ABC = 2α» then «∠ABC = α + 40» is the equation it states: α = 40, ∠ABC = 80°', () => {
    const p = build(['משולש ABC', '∠ABC = 2α', '∠ABC = α + 40']).positions;
    expect(deg(p, 'B', 'A', 'C')).toBeCloseTo(80, 4);
  });
});

describe('the same letter and coefficient with another constant contradicts the first line (the #2061 frame)', () => {
  it.each([
    [['משולש ABC', '∠ABC = α'], '∠ABC = α + 40', 'לא ניתן: «∠ABC = α + 40» סותר את «∠ABC = α» — אי אפשר לקיים את שניהם יחד. הסיבה: ∠ABC = α + 40.'],
    [['משולש ABC', '∠ABC = α + 10'], '∠ABC = α + 40', 'לא ניתן: «∠ABC = α + 40» סותר את «∠ABC = α + 10» — אי אפשר לקיים את שניהם יחד. הסיבה: ∠ABC = α + 40.'],
    [['משולש ABC', 'AB = a + 2'], 'AB = a + 3', 'לא ניתן: «AB = a + 3» סותר את «AB = a + 2» — אי אפשר לקיים את שניהם יחד. הסיבה: |AB| = a + 3.'],
  ])('%j then «%s»', async (prefix, line, sentence) => {
    const { v, said } = await decide(prefix as string[], line as string);
    expect(v.kind).toBe('refuse');
    expect(said).toBe(sentence);
  });
});

describe('unchanged', () => {
  it.each([
    ['∠ABC = 90 - α'], // the constant-first form: not read by either reader — a question for the operator, not built
    ['∠ABC = 180 - 2α'],
    ['∠ABC = α + β'], // two letters: the leftover guard declines, nothing is dropped
    ['∠ABC = α1'], // an indexed name (#1850)
  ])('«%s» still escalates', async (line) => {
    expect((await decide(['משולש ABC'], line)).v.kind).toBe('escalate');
  });

  it.each([
    ['∠ABC = 40', { type: 'set-angle', value: 40 }],
    ['∠ABC = α', { type: 'measure-angle', expr: { coef: 1, var: 'α' } }],
    ['AB = a + 3', { type: 'measure-length', expr: { coef: 1, var: 'a', const: 3, text: 'a + 3' } }],
    ['AB = 7a/5', { type: 'measure-length', expr: { coef: 1.4, var: 'a', text: '7a/5' } }],
    ['AB = 2a - 1', { type: 'measure-length', expr: { coef: 2, var: 'a', const: -1, text: '2a − 1' } }],
  ])('«%s» commits as before', async (line, cmd) => {
    const { v } = await decide(['משולש ABC'], line);
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && v.commands).toContainEqual(expect.objectContaining(cmd));
  });
});
