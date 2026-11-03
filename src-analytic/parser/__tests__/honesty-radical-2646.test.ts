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

/**
 * #2646 amendment 1 (found in round #2678) — a UNIT word after the value is not a counted noun.
 *
 * Before: the count blank («2 משיקים», "3 circles") read any plural after a number as a count, so «√2 יחידות» lost its
 * 2 (the root became nothing), «5 מטרים» lost its 5, and «30 מעלות» its 30: an answer that changed the value committed.
 * The singular and abbreviated units never matched a plural and were already refused; they are locked here as the
 * same class.
 */
describe('#2646 am. 1 — a value followed by a unit word is still a stated value', () => {
  it.each<[string, string, string[]]>([
    ['הצלע AB היא באורך של √2 יחידות', 'AB = 2', ['√2']],
    ['the side AB measures √2 units', 'AB = 2', ['√2']],
    ['AB = √2 ס"מ', 'AB = 2', ['√2']],
    ['AB = 5√2 יחידות', 'AB = 5', ['5√2']],
    ['AB = 2/√3 יחידות', 'AB = 2', ['2/√3']],
    ['AB = 3/4 יחידות', 'AB = 3', ['3/4']],
    ['AB = 1.5 units', 'AB = 1', ['1.5']],
    ['AB = 5 יחידות', 'AB = 7', ['5']],
    ['AB = 5 יחידה', 'AB = 7', ['5']],
    ["AB = 5 יח'", 'AB = 7', ['5']],
    ['AB = 5 ס"מ', 'AB = 7', ['5']],
    ['AB = 5 ס״מ', 'AB = 7', ['5']],
    ["AB = 5 מ'", 'AB = 7', ['5']],
    ['AB = 5 מטרים', 'AB = 7', ['5']],
    ['AB = 5 סנטימטרים', 'AB = 7', ['5']],
    ['AB = 5 מילימטרים', 'AB = 7', ['5']],
    ['AB = 5 units', 'AB = 7', ['5']],
    ['AB = 5 cm', 'AB = 7', ['5']],
    ['AB = 5 mm', 'AB = 7', ['5']],
    ['AB = 5 meters', 'AB = 7', ['5']],
    ['AB = 5 centimetres', 'AB = 7', ['5']],
    ['זווית ABC = 30 מעלות', 'זווית ABC = 40', ['30']],
    ['angle ABC = 30 degrees', 'angle ABC = 40', ['30']],
  ])('«%s» answered «%s»', (utterance, answer, expected) => {
    expect(dropped(utterance, [answer])).toEqual(expected);
  });

  it.each<[string, string]>([
    ['הצלע AB היא באורך של √2 יחידות', 'AB = √2'],
    ['the side AB measures √2 units', 'AB = √2'],
    ['AB = 5 יחידות', 'AB = 5'],
    ['AB = √2', 'AB = √2 יחידות'],
    ['זווית ABC = 30 מעלות', 'זווית ABC = 30'],
    // the count blank itself still stands: «2 משיקים» counts tangents, it states no magnitude
    ['מנקודה A יוצאים 2 משיקים למעגל', 'משיק מ-A למעגל'],
  ])('control: «%s» answered «%s» pays', (utterance, answer) => {
    expect(dropped(utterance, [answer])).toEqual([]);
  });

  it.each(['הצלע AB היא באורך של √2 יחידות', 'the side AB measures √2 units'])(
    'end to end (mocked): «%s» on a triangle ABC, answered «AB = 2», is refused naming «√2»',
    async (utterance) => {
      const ask = vi.fn().mockResolvedValue({ steps: ['AB = 2'] });
      const out = await runFallback(utterance, ['משולש ABC'], 0, ask);
      expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['√2'] });
      if (out.kind !== 'unfaithful') throw new Error('expected an unfaithful answer');
      expect(fallbackRefusal(out, utterance, { key: 'not-handled', detail: utterance })).toMatchObject({ key: 'llm-dropped', labels: '√2' });
    },
  );

  it('end to end (mocked): the faithful answer «AB = √2» commits', async () => {
    const ask = vi.fn().mockResolvedValue({ steps: ['AB = √2'] });
    const out = await runFallback('הצלע AB היא באורך של √2 יחידות', ['משולש ABC'], 0, ask);
    expect(out.kind).not.toBe('unfaithful');
  });
});
