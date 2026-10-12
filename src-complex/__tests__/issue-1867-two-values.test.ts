/**
 * #1867 (ADR-CX-066) — a value with TWO possibilities shows both, in complex as in every builder.
 *
 * Operator rulings: B12 (2026-10-07) *"complex should also show both values - so it should follow all of the
 * tools"*; #1861 *"up to 2. if there are 3 and more, dont show options and the user can switch between configs"*;
 * W1 (2026-10-08) «x = ±a» when the two are opposites, «x = a או x = b» otherwise.
 *
 * Every case runs the REAL submit path (`submitLine` per line, asks routed to the lane) and the fold at 24 seeds —
 * the configuration index «הציגו תצורה אחרת» walks — then reads the row through the App's own answer function.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { knowledgeAnswerText } from '../replay/scene2';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
const SEEDS = Array.from({ length: 24 }, (_, s) => s);

beforeEach(() => store().resetSession());

const feed = (lines: readonly string[], asks: readonly string[]) => {
  for (const l of [...lines, ...asks]) expect(submitLine(l), `refused «${l}»`).toBe(true);
};
const rowAt = (seed: number, label: string) =>
  deriveLines(store().lines, seed, seed, store().queries).knowledge.find((k) => k.label === label)!;
/** the row's answer exactly as the ask lane prints it after «label =», at every seed */
const answers = (label: string) => new Set(SEEDS.map((s) => knowledgeAnswerText(rowAt(s, label), 'או')));

describe('#1867 — two values over a complete configuration set print both', () => {
  it('opposites read «±»: z1² − 4z1 + 13 = 0 · z2 = 2z1 → Im(z1) = ±3', () => {
    feed(['z1^2-4z1+13=0', 'z2 = 2z1'], ['Im(z1)']);
    expect(answers('Im(z1)')).toEqual(new Set(['±3']));
  });

  it('opposites read «±»: z1² = 2i · z2 = 2z1 → Re(z1) = ±1', () => {
    feed(['z1^2 = 2i', 'z2 = 2z1'], ['Re(z1)']);
    expect(answers('Re(z1)')).toEqual(new Set(['±1']));
  });

  it('two values that are not opposites read «a או label = b», ascending: z1³ = 8 → Re(z1) = -1 או Re(z1) = 2', () => {
    // three configurations, but Re takes only two values across them (2, and −1 twice)
    feed(['z1^3 = 8', 'z2 = 2z1'], ['Re(z1)']);
    expect(rowAt(0, 'Re(z1)').or).toEqual({ value: '2' });
    expect(answers('Re(z1)')).toEqual(new Set(['-1 או Re(z1) = 2']));
  });

  it('the English joiner comes from the caller', () => {
    feed(['z1^3 = 8', 'z2 = 2z1'], ['Re(z1)']);
    expect(knowledgeAnswerText(rowAt(0, 'Re(z1)'), 'or')).toBe('-1 or Re(z1) = 2');
  });
});

describe('#1867 — what keeps printing no value', () => {
  it('THREE values (#1861): z1³ = 8 → Im(z1) (0, ±√3) keeps «differs between the 3 configurations»', () => {
    feed(['z1^3 = 8', 'z2 = 2z1'], ['Im(z1)']);
    for (const s of SEEDS) expect(rowAt(s, 'Im(z1)')).toEqual({ label: 'Im(z1)', value: null, why: { code: 'multi-config', configs: 3 } });
  });

  it('a census FLOOR never lists (it cannot prove there is no third): z1 = 1+i · Im(z2) = 0 · |z2 − z1| = 2', () => {
    feed(['z1 = 1+i', 'Im(z2) = 0', '|z2 - z1| = 2'], ['Re(z2)']);
    for (const s of SEEDS) expect(rowAt(s, 'Re(z2)')).toEqual({ label: 'Re(z2)', value: null, why: { code: 'maybe-multi' } });
  });

  it('one value is unchanged: Re(z1) = 2', () => {
    feed(['z1^2-4z1+13=0', 'z2 = 2z1'], ['Re(z1)']);
    expect(answers('Re(z1)')).toEqual(new Set(['2']));
  });
});

describe('#1867 — the answer text', () => {
  const row = (value: string, extra: object = {}) => ({ label: 'w', value, why: null, ...extra });
  it('a compound complex value under ± is parenthesised; a plain or imaginary one is not', () => {
    expect(knowledgeAnswerText(row('2+3i', { pm: true }), 'או')).toBe('±(2+3i)');
    expect(knowledgeAnswerText(row('2-3i', { pm: true }), 'או')).toBe('±(2-3i)');
    expect(knowledgeAnswerText(row('3i', { pm: true }), 'או')).toBe('±3i');
    expect(knowledgeAnswerText(row('√2', { pm: true }), 'או')).toBe('±√2');
  });
  it('an ≈ second value keeps its own ≈', () => {
    expect(knowledgeAnswerText(row('1', { or: { value: '1.41', approx: true } }), 'או')).toBe('1 או w ≈ 1.41');
  });
});
