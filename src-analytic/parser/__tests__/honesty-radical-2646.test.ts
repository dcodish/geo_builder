/**
 * #2646 (ADR-AG-384) — a stated root is paid by its VALUE, and a square or a root pays only ACROSS an equation.
 *
 * Before: the model-lane gate read «√2» as its radicand 2 and «5√2» as a 5 and a 2, and let every stated number be
 * paid by its square or its root from any line. So «AB = √2» answered «AB = 2», and «AB = 3» answered «AB = 9», each
 * committed as if faithful. The one real lowering the square rule exists for, a radius stated as r and written as r²
 * in a circle's equation (and the converse), still pays.
 *
 * **No live call** (standing rule 2): every model answer is a stub.
 */
import { describe, expect, it, vi } from 'vitest';
import { faithfulnessAnalytic } from '../honestyAnalytic';
import { fallbackRefusal, runFallback } from '../../app/fallback';
import type { InputError } from '../../store/useAnalyticStore';

const dropped = (utterance: string, answer: string[]): string[] => faithfulnessAnalytic(utterance, answer, new Set()).dropped;

describe('#2646 — an answer that replaces a stated root or number is flagged, naming it as typed', () => {
  it.each<[string, string, string[]]>([
    ['AB = √2', 'AB = 2', ['√2']],
    ['AB = √2', 'AB = 4', ['√2']],
    ['AB = 3', 'AB = 9', ['3']],
    ['AB = 3', 'AB = √3', ['3']],
    ['AB = 5√2', 'AB = 5', ['5√2']],
    ['AB = 2√3', 'AB = 3', ['2√3']],
    ['A(√2, 1)', 'A(2, 1)', ['√2']],
    ['AB = 5', 'AB = 5√2', ['5']],
    ['AB = 2/√3', 'AB = 2', ['2/√3']],
  ])('«%s» answered «%s»', (utterance, answer, expected) => {
    expect(dropped(utterance, [answer])).toEqual(expected);
  });
});

describe('#2646 — the controls: a faithful answer, and a radius across an equation, still pay', () => {
  it.each<[string, string]>([
    ['AB = √2', 'AB = √2'],
    ['AB = 5√2', 'AB = 5√2'],
    ['AB = 5√2', 'AB = 5·√2'],
    ['AB = √(3/4)', 'AB = √(3/4)'],
    ['AB = 2/√3', 'AB = 2/√3'],
    ['A(√2, 1)', 'A(√2, 1)'],
    ['AB = 3', 'AB = 3'],
    ['AB = sqrt(2)', 'AB = √2'],
    ['מעגל שמרכזו (1,2) ורדיוסו 3', '(x-1)^2 + (y-2)^2 = 9'],
    ['מעגל שמרכזו (1,2) ורדיוסו √2', '(x-1)^2 + (y-2)^2 = 2'],
    ['מעגל שמשוואתו (x-1)^2+(y-2)^2=9', 'מעגל שמרכזו (1,2) ורדיוסו 3'],
  ])('«%s» answered «%s»', (utterance, answer) => {
    expect(dropped(utterance, [answer])).toEqual([]);
  });
});

describe('#2646 — end to end through the model lane (mocked)', () => {
  it('«AB = √2» on a triangle ABC, answered «AB = 2», is refused naming «√2»', async () => {
    const ask = vi.fn().mockResolvedValue({ steps: ['AB = 2'] });
    const out = await runFallback('AB = √2', ['משולש ABC'], 0, ask);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['√2'] });
    const original: InputError = { key: 'not-handled', detail: 'AB = √2' };
    if (out.kind !== 'unfaithful') throw new Error('expected an unfaithful answer');
    expect(fallbackRefusal(out, 'AB = √2', original)).toMatchObject({ key: 'llm-dropped', labels: '√2' });
  });

  it('the same answer to «AB = √2» answered «AB = √2» commits', async () => {
    const ask = vi.fn().mockResolvedValue({ steps: ['AB = √2'] });
    const out = await runFallback('AB = √2', ['משולש ABC'], 0, ask);
    expect(out.kind).not.toBe('unfaithful');
  });
});
