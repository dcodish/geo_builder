/**
 * #1778 (ADR-W-125) — `shell/sentences`: where a paste's sentences are, and the chain that submits them.
 * The per-builder wiring is locked by `fixtures/paste-paragraph-rows.ts`; this is the mechanism itself.
 */
import { describe, expect, it } from 'vitest';
import { joinSentences, splitSentences, submitSentences, submitTyped, type SentenceOutcome } from '../sentences';

const LRM = '‎';
const texts = (s: string) => splitSentences(s)?.map((x) => x.text) ?? null;

describe('#1778 — splitSentences: a sentence end, and only a sentence end', () => {
  it.each([
    ['משולש ABC. M אמצע BC.', ['משולש ABC', 'M אמצע BC']],
    ['משולש ABC. M אמצע BC', ['משולש ABC', 'M אמצע BC']],
    ['AB = 5. BC = 6. CA = 7.', ['AB = 5', 'BC = 6', 'CA = 7']],
    ['z = 2.5 + i. w = 1.5 - i.', ['z = 2.5 + i', 'w = 1.5 - i']],
    ['A(2.5, 1). B(0. 5, 2).', ['A(2.5, 1)', 'B(0. 5, 2)']],
    ['מהו AB? מהו BC?', ['מהו AB?', 'מהו BC?']],
    ['משולש ABC! M אמצע BC.', ['משולש ABC!', 'M אמצע BC']],
    ['משולש ABC... M אמצע BC.', ['משולש ABC', 'M אמצע BC']],
    [
      `דרך הנקודה ${LRM}P${LRM} מעבירים אנך לישר ${LRM}AB${LRM}. האנך חותך את הישר ${LRM}y = 7${LRM} בנקודה ${LRM}C${LRM}.`,
      ['דרך הנקודה P מעבירים אנך לישר AB', 'האנך חותך את הישר y = 7 בנקודה C'],
    ],
    [`AB${LRM}.${LRM} BC = 4`, ['AB', 'BC = 4']],
  ])('%s', (input, expected) => {
    expect(texts(input)).toEqual(expected);
  });

  it.each([
    'משולש ABC',
    'משולש ABC.',
    'AB = 2.5',
    'AB = 2.5.',
    'A(2.5, 1)',
    'A(2.5, 1).',
    'מהו AB?',
    'AB = AC, i.e. the triangle is isosceles.',
    'AB = AC, e.g. 5.',
    'M אמצע BC.N אמצע AC',
    '   ',
    '. . .',
    // ADR-W-107: the exam's mixed line is refused WHOLE by every builder's proof gate, so it is never split
    'נתון AB = AC. הוכיחו כי AB ⊥ AC.',
    'משולש ABC. AB = AC. Prove that angle B = angle C.',
  ])('one sentence (or none) is not a split: %s', (input) => {
    expect(splitSentences(input)).toBeNull();
  });

  it('each sentence carries the paste from it on, as typed: what the box holds when the chain stops there', () => {
    const s = splitSentences(`משולש ${LRM}ABC${LRM}. שלום. M אמצע BC.`)!;
    expect(s.map((x) => x.rest)).toEqual([`משולש ${LRM}ABC${LRM}. שלום. M אמצע BC.`, 'שלום. M אמצע BC.', 'M אמצע BC.']);
  });
});

describe('#1778 — submitSentences: one sentence at a time, stopping at the first one not taken', () => {
  const run = async (input: string, answer: (t: string) => SentenceOutcome) => {
    const seen: string[] = [];
    const box = await submitSentences(splitSentences(input)!, (t) => {
      seen.push(t);
      return answer(t);
    });
    return { seen, box };
  };

  it('every sentence taken: every sentence submitted in order, the box empties', async () => {
    expect(await run('a1. a2. a3.', () => 'consumed')).toEqual({ seen: ['a1', 'a2', 'a3'], box: '' });
  });

  it('a sentence kept: nothing after it is submitted, the box holds it and the rest as typed', async () => {
    expect(await run('a1. bad. a3.', (t) => (t === 'bad' ? 'kept' : 'consumed'))).toEqual({ seen: ['a1', 'bad'], box: 'bad. a3.' });
  });

  it('a sentence taught: the box holds the canonical, its sentence end restored, then the rest', async () => {
    expect(await run('a1. teach me. a3.', (t) => (t === 'teach me' ? { prefill: 'taught' } : 'consumed'))).toEqual({
      seen: ['a1', 'teach me'],
      box: 'taught. a3.',
    });
    expect(await run('a1. teach me', (t) => (t === 'teach me' ? { prefill: 'taught' } : 'consumed'))).toEqual({
      seen: ['a1', 'teach me'],
      box: 'taught',
    });
  });

  it('async submits are awaited one by one: the next never starts before the previous answered', async () => {
    const order: string[] = [];
    await submitSentences(splitSentences('a1. a2.')!, async (t): Promise<SentenceOutcome> => {
      order.push(`start ${t}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end ${t}`);
      return 'consumed';
    });
    expect(order).toEqual(['start a1', 'end a1', 'start a2', 'end a2']);
  });

  it('joinSentences keeps a canonical that already ends a sentence', () => {
    expect(joinSentences('מהו AB?', 'BC = 4.')).toBe('מהו AB? BC = 4.');
    expect(joinSentences('x', '')).toBe('x');
  });
});

describe('#1778 — submitTyped: one sentence is the one-element case', () => {
  const box = async (raw: string, outcome: SentenceOutcome) => {
    let b: string | null = null;
    const seen: string[] = [];
    await submitTyped(
      raw,
      (t) => {
        seen.push(t);
        return outcome;
      },
      (t) => {
        b = t;
      },
    );
    return { seen, box: b };
  };

  it('taken: box emptied; kept: box untouched; taught: the canonical', async () => {
    expect(await box('משולש ABC', 'consumed')).toEqual({ seen: ['משולש ABC'], box: '' });
    expect(await box('משולש ABC.', 'kept')).toEqual({ seen: ['משולש ABC.'], box: null });
    expect(await box('מעבירים X', { prefill: 'X' })).toEqual({ seen: ['מעבירים X'], box: 'X' });
  });

  it('a paragraph: each sentence, and the box set once to what the chain left', async () => {
    expect(await box('a1. a2.', 'consumed')).toEqual({ seen: ['a1', 'a2'], box: '' });
  });
});
