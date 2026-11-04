/**
 * #2680 ([ADR-AG-391](../../../docs/06c-decisions-analytic.md#adr-ag-391)) — an answer's curve pays the parameters its
 * canonical form leaves implicit.
 *
 * Before (measured at 0d5525a3, `runFallback` with the model mocked): «מעגל שמרכזו (0,0) ורדיוסו 3» answered with the
 * correct «x^2 + y^2 = 9» was refused, naming «0», «0»: the centre is written by having no linear terms, and the gate
 * paid a stated number only by finding it in the answer's text or facts. The same class, measured at pickup: a centre
 * coordinate on an axis, the expanded circle «x^2 - 2x + y^2 - 4y - 4 = 0» (centre (1,2), radius 3), a line's slope of
 * 1 or intercept of 0, a canonical ellipse's or parabola's (0,0). Each is now read off the PARSED curve, never a digit-0
 * exemption, so an answer centred elsewhere still drops the stated centre.
 *
 * **No live call** (standing rule 2): every model answer is a stub.
 */
import { describe, expect, it, vi } from 'vitest';
import { faithfulnessAnalytic } from '../honestyAnalytic';
import { fallbackRefusal, runFallback } from '../../app/fallback';

const dropped = (utterance: string, answer: string[]): string[] => faithfulnessAnalytic(utterance, answer, new Set()).dropped;

describe('#2680 — a correct answer is paid by its curve, though its canonical form leaves the value implicit', () => {
  it.each<[string, string]>([
    // the issue's row and its translated control
    ['מעגל שמרכזו (0,0) ורדיוסו 3', 'x^2 + y^2 = 9'],
    ['מעגל שמרכזו (1,2) ורדיוסו 3', '(x-1)^2 + (y-2)^2 = 9'],
    ['circle with centre (0,0) and radius 3', 'x^2 + y^2 = 9'],
    // one coordinate on an axis
    ['מעגל שמרכזו (0,2) ורדיוסו 3', 'x^2 + (y-2)^2 = 9'],
    ['מעגל שמרכזו (1,0) ורדיוסו 3', '(x-1)^2 + y^2 = 9'],
    // the expanded form spells neither the centre nor the radius
    ['מעגל שמרכזו (1,2) ורדיוסו 3', 'x^2 - 2x + y^2 - 4y - 4 = 0'],
    // a line: a slope of 1, an intercept of 0
    ['ישר ששיפועו 1 וחותך את ציר y ב-3', 'y = x + 3'],
    ['ישר ששיפועו 2 וחותך את ציר y ב-0', 'y = 2x'],
    // a canonical ellipse and parabola: their (0,0), the semi-axes, p
    ['אליפסה שמרכזה (0,0) וחצי צירה הגדול 5 וחצי צירה הקטן 3', 'x^2/25 + y^2/9 = 1'],
    ['פרבולה שקודקודה (0,0) ופרמטר 2', 'y^2 = 4x'],
  ])('«%s» answered «%s» drops nothing', (utterance, answer) => {
    expect(dropped(utterance, [answer])).toEqual([]);
  });
});

describe('#2680 — an answer that really changes a stated value is still refused, naming it', () => {
  it.each<[string, string, string[]]>([
    // the issue's third lock: a genuinely moved centre
    ['מעגל שמרכזו (0,0) ורדיוסו 3', '(x-1)^2 + (y-2)^2 = 9', ['0', '0']],
    ['מעגל שמרכזו (1,2) ורדיוסו 3', 'x^2 + y^2 = 9', ['1', '2']],
    ['מעגל שמרכזו (0,0) ורדיוסו 3', 'x^2 + y^2 = 16', ['3']],
    // a parameter the text already spells pays ONCE: (1,1) answered with centre (1,5)
    ['מעגל שמרכזו (1,1) ורדיוסו 3', '(x-1)^2 + (y-5)^2 = 9', ['1']],
    ['ישר ששיפועו 1 וחותך את ציר y ב-3', 'y = 2x + 3', ['1']],
    ['ישר ששיפועו 1 וחותך את ציר y ב-3', 'y = x + 4', ['3']],
  ])('«%s» answered «%s» drops %j', (utterance, answer, expected) => {
    expect(dropped(utterance, [answer])).toEqual(expected);
  });
});

describe('#2680 — end to end through the model lane (mocked)', () => {
  it('the correct centred circle commits', async () => {
    const ask = vi.fn().mockResolvedValue({ steps: ['x^2 + y^2 = 9'] });
    const out = await runFallback('מעגל שמרכזו (0,0) ורדיוסו 3', [], 0, ask);
    expect(out.kind).not.toBe('unfaithful');
  });

  it('a translated circle commits', async () => {
    const ask = vi.fn().mockResolvedValue({ steps: ['(x-1)^2 + (y-2)^2 = 9'] });
    const out = await runFallback('מעגל שמרכזו (1,2) ורדיוסו 3', [], 0, ask);
    expect(out.kind).not.toBe('unfaithful');
  });

  it('an answer centred elsewhere is refused, naming the stated centre', async () => {
    const utterance = 'מעגל שמרכזו (0,0) ורדיוסו 3';
    const ask = vi.fn().mockResolvedValue({ steps: ['(x-1)^2 + (y-2)^2 = 9'] });
    const out = await runFallback(utterance, [], 0, ask);
    expect(out).toMatchObject({ kind: 'unfaithful', dropped: ['0', '0'] });
    if (out.kind !== 'unfaithful') throw new Error('expected an unfaithful answer');
    expect(fallbackRefusal(out, utterance, { key: 'not-handled', detail: utterance })).toMatchObject({ key: 'llm-dropped' });
  });
});
