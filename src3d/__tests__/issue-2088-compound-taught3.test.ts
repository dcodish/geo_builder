/**
 * #2088 ([ADR-3D-370](../../docs/06b-decisions-3d.md#adr-3d-370)) — A TAUGHT HEAD KEEPS ITS NOTE WHEN GIVENS TRAIL IT.
 *
 * Operator ruling 2026-10-14 (card `d14b-found-accept`, A): *"«משולש ABC ישר זווית ב-B ו-AB = 4» is taught in 3-D
 * and analytic as the #1962 ruling says, carrying the trailing givens."* Measured at pickup: every compound row below
 * was `not-understood` in 3-D (it went to the model), because `parse3` fails on the whole line and the lost-part
 * member (ADR-3D-316) only runs on a line it reads.
 *
 * The class: a line whose head 3-D refuses with the one-fact-per-line note, followed by givens that each read
 * alone. Every vertex, both spellings of «זווית», «ו-» or «,», any number of givens, and the isosceles head. The
 * expected lists are 2-D's (`decideDeterministic2D`, measured at 688dfb96), byte for byte. Not reached, on purpose:
 * «שבו», «ו-∠…» and the English compound (2-D quotes fragments there, #2096), and a trailing piece that does not read.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, useGeo3, type Fact3 } from '../store/store3';
import { clausesOf3, trailingGivens3 } from '../store/unreadParts3';

type T = (k: string, o?: Record<string, unknown>) => string;
const render = (lng: string, err: Parameters<typeof errorText3>[1]) =>
  (errorText3(i18n3d.getFixedT(lng) as T, err) ?? '').replace(/[⁦-⁩‎‏]/g, '');

const EMPTY = { facts: [] as Fact3[], seed: 0 };
let n = 0;
const id = () => `f${(n += 1)}`;

const TAUGHT_HE = 'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו בשורות נפרדות: ';
const SPLIT_HE = 'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: ';

/** The numbered items of a rendered list, in order — what a student would type, one per line. */
const itemsOf = (text: string): string[] =>
  text
    .slice(text.indexOf('(1)'))
    .split(/\s*\(\d+\)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

describe('#2088 — the right-angle head, taught with its trailing givens', () => {
  it.each([
    ['משולש ABC ישר זווית ב-B ו-AB = 4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4'],
    ['משולש ABC ישר זווית ב-B ו-AB = 4 ו-BC = 3', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4  (4) BC = 3'],
    ['משולש ABC ישר זווית ב-B, AB = 4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4'],
    ['משולש ABC ישר זווית ב-B ו-AB = 4, BC = 3', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4  (4) BC = 3'],
    ['משולש ABC ישר זווית ב-B ו-AB=4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB=4'],
    ['משולש ABC ישר זוית ב-B ו-AB = 4', '(1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4'],
    ['משולש ABC ישר זווית ב-A ו-AB = 4', '(1) משולש ABC  (2) ∠CAB = 90°  (3) AB = 4'],
    ['משולש ABC ישר זווית ב-C ו-AB = 4', '(1) משולש ABC  (2) ∠BCA = 90°  (3) AB = 4'],
    ['משולש KLM ישר זווית ב-K ו-KL = 5', '(1) משולש KLM  (2) ∠MKL = 90°  (3) KL = 5'],
    ['משולש ABC ישר זווית ב-B ו-D אמצע AC', '(1) משולש ABC  (2) ∠ABC = 90°  (3) D אמצע AC'],
  ])('«%s» → %s (2-D’s list)', (line, list) => {
    const v = decideSubmit3(EMPTY, line, id);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error.code).toBe('right-angle-vertex');
    expect(render('he', v.error)).toBe(TAUGHT_HE + list);
  });

  it('English renders the same list, the trailing given as typed', () => {
    const v = decideSubmit3(EMPTY, 'משולש ABC ישר זווית ב-B ו-AB = 4', id);
    if (v.kind !== 'refused') throw new Error(v.kind);
    expect(render('en', v.error)).toBe(
      'One given per line — that way the tool can build and verify each one separately. Write them on separate lines: (1) triangle ABC  (2) ∠ABC = 90°  (3) AB = 4',
    );
  });

  it('a spaced conjunction («ו- AB») is folded by the shared chokepoint, so the list quotes no fragment', () => {
    const v = decideSubmit3(EMPTY, 'משולש ABC ישר זווית ב-B ו- AB = 4', id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '  (3) AB = 4' });
  });
});

describe('#2088 — the isosceles head keeps 2-D’s parts list, continued', () => {
  it('«משולש ABC שווה שוקיים ב-B ו-AB = 4» → (1) משולש ABC שווה שוקיים  (2) ב-B  (3) AB = 4', () => {
    const v = decideSubmit3(EMPTY, 'משולש ABC שווה שוקיים ב-B ו-AB = 4', id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'split-statements', all: '(1) משולש ABC שווה שוקיים  (2) ב-B  (3) AB = 4' });
    if (v.kind === 'refused') expect(render('he', v.error)).toBe(SPLIT_HE + '(1) משולש ABC שווה שוקיים  (2) ב-B  (3) AB = 4');
  });
});

describe('#2088 — every taught line is one the tool accepts, in the order listed (docs/17 §9)', () => {
  it.each(['משולש ABC ישר זווית ב-B ו-AB = 4 ו-BC = 3', 'משולש KLM ישר זווית ב-K ו-KL = 5', 'משולש ABC ישר זווית ב-A ו-AB = 4'])(
    '«%s»: its list, typed line by line, records each line',
    (line) => {
      const v = decideSubmit3(EMPTY, line, id);
      if (v.kind !== 'refused') throw new Error(v.kind);
      const items = itemsOf(render('he', v.error));
      expect(items.length).toBeGreaterThanOrEqual(3);
      let cur = EMPTY;
      for (const item of items) {
        const step = decideSubmit3(cur, item, id);
        expect(step.kind, item).toBe('record');
        if (step.kind === 'record') cur = { facts: step.facts, seed: step.seed };
      }
    },
  );
});

describe('#2088 — not reached, on purpose: the line keeps its verdict', () => {
  it.each([
    'משולש ABC ישר זווית ב-B שבו AB = 4', // «שבו» is no clause boundary (2-D quotes a fragment there, #2096)
    'משולש ABC ישר זווית ב-B ו-∠BAC = 30', // «ו-∠» is no boundary either
    'triangle ABC right-angled at B and AB = 4', // the English head is not refused with the note in 3-D
    'משולש ABC ישר זווית ב-B ו-שלום עולם', // a trailing piece that does not read is never taught
  ])('«%s» stays not-understood', (line) => {
    expect(decideSubmit3(EMPTY, line, id).kind).toBe('not-understood');
  });

  it('a line the grammar reads whole is not re-cut (the fallback runs only where parse3 fails)', () => {
    expect(decideSubmit3(EMPTY, 'משולש ABC ישר זווית ב-B', id)).toMatchObject({ kind: 'refused', error: { more: '' } });
    expect(decideSubmit3(EMPTY, 'משולש ABC', id).kind).toBe('record');
  });
});

describe('#2088 — the clause cut, 2-D’s `clausesOf` ported', () => {
  it('cuts at «ו-», «,» and the folded spaced spellings, and keeps an operand pair whole', () => {
    expect(clausesOf3('משולש ABC ישר זווית ב-B ו-AB = 4, BC = 3')).toEqual(['משולש ABC ישר זווית ב-B', 'AB = 4', 'BC = 3']);
    expect(clausesOf3('משולש ABC ישר זווית ב-B ו - AB = 4')).toEqual(['משולש ABC ישר זווית ב-B', 'AB = 4']);
    expect(clausesOf3('AC ו-BD נפגשים בנקודה E')).toEqual(['AC ו-BD נפגשים בנקודה E']);
    expect(clausesOf3('AB = 4.5')).toEqual(['AB = 4.5']);
  });

  it('trailingGivens3 is null when there is no trailing clause or one does not read', () => {
    expect(trailingGivens3('משולש ABC ישר זווית ב-B')).toBeNull();
    expect(trailingGivens3('משולש ABC ישר זווית ב-B ו-שלום עולם')).toBeNull();
    expect(trailingGivens3('משולש ABC ישר זווית ב-B ו-AB = 4')).toEqual({ head: 'משולש ABC ישר זווית ב-B', trailing: ['AB = 4'] });
  });
});

describe('#2088 — the ✎ edit seam reaches the same note', () => {
  it('editing a fact into the compound refuses it with the continued list and keeps the old statement', () => {
    useGeo3.getState().submit('משולש ABC');
    const fid = useGeo3.getState().facts[0].id;
    expect(useGeo3.getState().replaceFact(fid, 'משולש ABC ישר זווית ב-B ו-AB = 4')).toBe(false);
    expect(useGeo3.getState().lastError).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '  (3) AB = 4' });
    expect(useGeo3.getState().facts[0].utterance).toBe('משולש ABC');
  });
});
