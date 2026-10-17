/**
 * #1947 ([ADR-AG-301](../../docs/06c-decisions-analytic.md#adr-ag-301)) — «משולש ABC ישר זווית ב-B ו-AB = 4» IS
 * TAUGHT, WITH 2-D'S NUMBERED LIST, INSTEAD OF GOING TO THE MODEL.
 *
 * Operator, 2026-10-10 (#1962 / #1947, option A): *"port it to 3-D and analytic"* — one message shape, the taught pair
 * as items (1) and (2), every further given the student typed continuing the same list from (3) (2-D ADR-611,
 * 3-D ADR-3D-331). Analytic declined the line whole because `declinedPart` accepted a rest only when it was nothing
 * but labels and particles; «ב-B ו-AB = 4» holds a digit, so the line reached the model. The bare line was taught,
 * but in the retired «כתבו קודם … ואחר כך …» wording.
 *
 * Every verdict here is the one `App.tsx` dispatches (`decideSubmit`) and every text the one the page renders
 * (`errorText`, the real locale). No model call is reachable: a `not-handled` is only asserted.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

const textOf = (v: SubmitVerdict, t: T) => {
  if (v.kind !== 'refused') throw new Error(`expected a refusal, got ${v.kind}`);
  return errorText(v.error, t);
};

const HEAD_HE = 'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו בשורות נפרדות: ';
const HEAD_EN = 'One given per line — that way the tool can build and verify each one separately. Write them on separate lines: ';

describe('#1947 — the right angle’s vertex with further givens is taught as ONE numbered list', () => {
  const CASES: Array<[string, string, string]> = [
    // the operator's line
    ['משולש ABC ישר זווית ב-B ו-AB = 4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4', 'ABC'],
    // the bare line: the same list, no continuation (replaces «כתבו קודם … ואחר כך …»)
    ['משולש ABC ישר זווית ב-B', '(1) משולש ABC  (2) ∠ABC = 90°', 'ABC'],
    // two further givens
    ['משולש ABC ישר זווית ב-B ו-AB = 4 ו-BC = 3', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4  (4) BC = 3', 'ABC'],
    // any vertex, and the angle its neighbours name
    ['משולש ABC ישר זווית ב-A ו-AB = 4', '(1) משולש ABC  (2) ∠CAB = 90°  (3) AB = 4', 'CAB'],
    ['משולש ABC ישר זווית ב-C ו-AB = 4', '(1) משולש ABC  (2) ∠BCA = 90°  (3) AB = 4', 'BCA'],
    // a further given of another kind: an angle, a coordinate (the trailing-angle row is held here, not by parity: #2106)
    ['משולש ABC ישר זווית ב-A ו-∠ABC = 30', '(1) משולש ABC  (2) ∠CAB = 90°  (3) ∠ABC = 30', 'CAB'],
    ['משולש ABC ישר זווית ב-B ו-A(0,0)', '(1) משולש ABC  (2) ∠ABC = 90°  (3) A(0,0)', 'ABC'],
    // the hyphenated noun and the spaced conjunction (folded by shell/conjunction)
    ['משולש ABC ישר-זווית ב-B ו-AB = 4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4', 'ABC'],
    ['משולש ABC ישר זווית ב-B ו- AB = 4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4', 'ABC'],
  ];
  it.each(CASES)('«%s»', (line, list, angle) => {
    const v = decideSubmit(line, [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toMatchObject({ key: 'split-statements', teach: { triangle: 'ABC', angle } });
    expect(textOf(v, he)).toBe(HEAD_HE + list);
  });

  it('English: "right triangle ABC at B and AB = 4" — the shipped 2-D English string, continued', () => {
    const v = decideSubmit('right triangle ABC at B and AB = 4', [], 0);
    expect(textOf(v, en)).toBe(`${HEAD_EN}(1) triangle ABC  (2) ∠ABC = 90°  (3) AB = 4`);
  });

  it('the operator’s line in the English locale', () => {
    const v = decideSubmit('משולש ABC ישר זווית ב-B ו-AB = 4', [], 0);
    expect(textOf(v, en)).toBe(`${HEAD_EN}(1) triangle ABC  (2) ∠ABC = 90°  (3) AB = 4`);
  });

  it('after «משולש ABC» in the figure, the line is taught the same way', () => {
    const first = decideSubmit('משולש ABC', [], 0);
    expect(first.kind).toBe('record');
    const v = decideSubmit('משולש ABC ישר זווית ב-B ו-AB = 4', ['משולש ABC'], 0);
    expect(textOf(v, he)).toBe(`${HEAD_HE}(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4`);
  });
});

describe('#1947 — a further piece that does not record leaves the line as it was', () => {
  it('«… ו-AB = 4 ו-AB = 5» (the second length contradicts the first) is not taught — it goes on to the model', () => {
    const v = decideSubmit('משולש ABC ישר זווית ב-B ו-AB = 4 ו-AB = 5', [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error.key).toBe('not-handled');
  });
});

describe('#1947 — a taught remedy is a grammar claim (docs/17 §9): every listed line records, in order', () => {
  it.each([
    [['משולש ABC', '∠ABC = 90°', 'AB = 4']],
    [['משולש ABC', '∠ABC = 90°', 'AB = 4', 'BC = 3']],
    [['משולש ABC', '∠CAB = 90°', 'AB = 4']],
    [['triangle ABC', '∠ABC = 90°', 'AB = 4']],
  ])('%j', (lines) => {
    const held: string[] = [];
    for (const line of lines) {
      const v = decideSubmit(line, held, 0);
      expect(v.kind, `«${line}» after ${JSON.stringify(held)}`).toBe('record');
      if (v.kind === 'record') held.push(v.line);
    }
  });
});
