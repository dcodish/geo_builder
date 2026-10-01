/**
 * #1637 group G2 (ADR-AG-198) — what a sentence draws, the extent it states, and the spellings the frame reads.
 *
 * - #1639: a sentence whose subject is a NAMED PAIR draws that pair, by its noun — «הישר BC» the line, «הקטע /
 *   הצלע BC» and the bare «BC» the segment — through the declaration the bare «BC» line makes.
 * - #1640 + #1636: the EXTENT BELONGS TO THE STATEMENT. A bare «BC» typed to see it draws the segment and never
 *   narrows an earlier statement about the line BC; an incidence on «הצלע/הקטע BC» is on the segment, on «הישר
 *   BC» on the line, and on a bare «BC» it inherits the extent of what the figure draws over B–C at that moment.
 * - #1641: a point list in every spelling («A, B, C», «A, B ו-C», with or without the noun, the verb dropped
 *   before «על»), and «ציר ה- x» with a space.
 * - #1643: what a paste carries (bidi isolates, a leading bullet), the copula form of centre naming, and the
 *   no-circle message.
 * - Operator rulings of 2026-10-01: (a) on #1554 — «טרפז ישר זווית ABCD חסום במעגל» is refused naming both nouns;
 *   (b) on #1619 — a tangency sentence with no circle in the figure CREATES the circle, its centre unnamed.
 *
 * Every lock calls the real path (`decideSubmit` line by line, `derive`, `parseLine`), never a reproduction.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import type { Figure } from '../engine/evaluate';
import { analyticI18n } from '../i18n';
import { distributeClauses } from '../parser/frameAnalytic';
import { parseLine } from '../parser/parseAnalytic';
import type { InputError } from '../store/useAnalyticStore';

type P = { x: number; y: number };
type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);
const CORPUS: { id: string; lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const corpus = (id: string) => CORPUS.find((q) => q.id === id)!.lines;

/** The student's session: each line submitted in turn through the real gate; a recorded line joins the list. */
function play(lines: readonly string[], seed = 0): { verdicts: string[]; kept: string[] } {
  const kept: string[] = [];
  const verdicts = lines.map((l) => {
    const v = decideSubmit(l, kept, seed);
    if (v.kind === 'record') kept.push(l);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
  return { verdicts, kept };
}
const refusal = (line: string, lines: string[]): InputError => {
  const v = decideSubmit(line, lines, 0);
  if (v.kind !== 'refused') throw new Error(`${line}: ${v.kind}`);
  return v.error;
};
const pts = (f: Figure): Record<string, P> => Object.fromEntries(f.points.map((p) => [p.id, p]));
const objectIds = (lines: string[]) => derive(lines, 0).construction.objects.map((o) => o.id);
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
/** The facts, with every `src` (nested ones included) blanked — the lock compares what a line STATES. */
const factsOf = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return JSON.parse(JSON.stringify(r.facts, (k, v) => (k === 'src' ? '' : v)));
};
const canonical = (...lines: string[]) => lines.flatMap(factsOf);

// ---------------------------------------------------------------------------------------------------------------
describe('#1639 — a sentence that names a pair draws it', () => {
  it('T11: «BC משיק למעגל בנקודה B» draws the segment BC, and the bare «BC» afterwards answers «כבר ידוע»', () => {
    const lines = ['נתון מעגל שמרכזו M', 'BC משיק למעגל בנקודה B'];
    expect(play(lines).verdicts).toEqual(['record', 'record']);
    expect(objectIds(lines)).toContain('seg-BC');
    expect(decideSubmit('BC', lines, 0).kind).toBe('already-known');
  });

  it('«הישר BC משיק למעגל בנקודה B» draws the LINE BC (the noun decides), and «הישר BC» afterwards is known', () => {
    const lines = ['נתון מעגל שמרכזו M', 'הישר BC משיק למעגל בנקודה B'];
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves.some((c) => c.id === 'line-BC' && c.curve.kind === 'line')).toBe(true);
    expect(objectIds(lines)).not.toContain('seg-BC');
    expect(decideSubmit('הישר BC', lines, 0).kind).toBe('already-known');
  });

  it('T6: «נתון: AC הוא קוטר במעגל» draws AC, and the bare «AC» afterwards answers «כבר ידוע»', () => {
    const lines = ['מעגל M', 'הנקודות A, B ו-C נמצאות על המעגל', 'נתון: AC הוא קוטר במעגל'];
    expect(play(lines).verdicts).toEqual(['record', 'record', 'record']);
    expect(objectIds(lines)).toContain('seg-AC');
    expect(decideSubmit('AC', lines, 0).kind).toBe('already-known');
  });

  it('a diameter still REFERS to its ends: with no A and C it is refused, never introducing them', () => {
    expect(refusal('AC הוא קוטר במעגל', ['נתון מעגל שמרכזו M']).key).toBe('unknown-reference');
  });

  it('the audit: a relation, a side on an axis and the converse incidence draw their pairs, by noun', () => {
    const base = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'D(4,3)'];
    expect(objectIds([...base, 'AC ⊥ AB'])).toEqual(expect.arrayContaining(['seg-AC', 'seg-AB']));
    expect(objectIds([...base, 'הישרים AC ו-BD מקבילים זה לזה'])).toEqual(expect.arrayContaining(['line-AC', 'line-BD']));
    expect(objectIds(['הצלע AO נמצאת על ציר ה-x'])).toContain('seg-AO');
    expect(objectIds([...base, 'P(0,1)', 'הישר AC עובר דרך P'])).toContain('line-AC');
    expect(objectIds([...base, 'P(0,1)', 'AC עובר דרך P'])).toContain('seg-AC');
  });

  it('a pair the figure already draws as a side is that side: «AB ∥ CD» in a parallelogram draws nothing new', () => {
    expect(decideSubmit('AB ∥ CD', ['מקבילית ABCD'], 0).kind).toBe('already-known');
    expect(objectIds(['משולש ABC', 'AB'])).not.toContain('seg-AB');
  });

  it('«משוואת הישר BC היא …» after the drawn line BC states THAT line’s equation — one object, not two', () => {
    const lines = ['B(0,0)', 'C(2,2)', 'הישר BC', 'משוואת הישר BC היא y=x'];
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.filter((o) => o.id === 'line-BC')).toHaveLength(1);
    expect(d.construction.objects.find((o) => o.id === 'line-BC')?.kind).toBe('curve');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('#1640 + #1636 — the extent belongs to the statement', () => {
  it('#1640: the operator’s 13/5 lines — «BC» draws the segment, and O stays on the LINE BC beyond B', () => {
    const lines = [
      'מעגל M',
      'הנקודות A, B ו-C נמצאות על המעגל',
      'המשיק למעגל בנקודה A חותך את הישר BC בראשית הצירים O',
      'נתון: AC הוא קוטר במעגל',
      'נתון: OC = 15, BC = 3',
      'נתון: M(9, 10½)',
      'AB',
      'AC',
      'BC',
    ];
    const { verdicts, kept } = play(lines);
    expect(verdicts).toEqual(['record', 'record', 'record', 'record', 'record', 'record', 'record', 'already-known', 'record']);
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(kept, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const q = pts(d.figure);
      // O, B, C collinear, O OUTSIDE B–C (the line reading the crossing was stated with), |OC| = 15, |BC| = 3.
      expect(near(Math.hypot(q.C.x, q.C.y), 15, 1e-6) && near(Math.hypot(q.C.x - q.B.x, q.C.y - q.B.y), 3, 1e-6)).toBe(true);
      expect(near(Math.hypot(q.B.x, q.B.y), 12, 1e-6)).toBe(true);
    }
  });

  it('#1636: 12/5 — «CD עובר דרך מרכז המעגל» with CD the altitude SEGMENT puts the centre between C and D → C(4,3)', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive(corpus('12/5'), seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const q = pts(d.figure);
      expect([q.C.x, q.C.y].map((v) => Number(v.toFixed(6)) + 0), `seed ${seed}`).toEqual([4, 3]);
    }
  });

  it('#1636: an incidence on a segment-only pair with the point outside it is refused, naming the line', () => {
    const base = ['A(0,0)', 'B(4,0)', 'AB', 'P(6,0)'];
    expect(refusal('P על AB', base)).toMatchObject({ key: 'unsatisfiable', detail: 'P על AB' });
  });

  it('the four spellings, with the segment drawn and without it (the parity lock)', () => {
    const drawn = ['A(0,0)', 'B(4,0)', 'AB', 'P(6,0)'];
    const bare = ['A(0,0)', 'B(4,0)', 'P(6,0)'];
    const kind = (line: string, lines: string[]) => {
      const v = decideSubmit(line, lines, 0);
      return v.kind === 'refused' ? v.error.key : v.kind;
    };
    // The noun decides when there is one; a bare pair takes what the figure draws.
    expect(['P על הצלע AB', 'P על הקטע AB', 'P על הישר AB', 'P על AB'].map((l) => kind(l, drawn))).toEqual([
      'unsatisfiable',
      'unsatisfiable',
      'already-follows',
      'unsatisfiable',
    ]);
    expect(['P על הצלע AB', 'P על הקטע AB', 'P על הישר AB', 'P על AB'].map((l) => kind(l, bare))).toEqual([
      'unsatisfiable',
      'unsatisfiable',
      'already-follows',
      'already-follows',
    ]);
  });

  it('a segment drawn LATER never narrows an earlier statement about the line', () => {
    expect(play(['A(0,0)', 'B(4,0)', 'P(6,0)', 'P על AB', 'AB']).verdicts).toEqual(['record', 'record', 'record', 'already-follows', 'record']);
    expect(play(['A(0,0)', 'B(4,0)', 'נקודה P', 'P על הישר AB', 'P(6,0)', 'AB']).verdicts.at(-1)).toBe('record');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('#1641 — a point list in every spelling, and «ציר ה- x»', () => {
  const three = canonical('A על המעגל', 'B על המעגל', 'C על המעגל');
  it.each(['A, B, C על המעגל', 'נקודות A, B, C על המעגל', 'הנקודות A, B, C נמצאות על המעגל', 'הנקודות A, B ו-C נמצאות על המעגל', 'הנקודות A, B, ו-C נמצאות על המעגל', 'A, B ו-C על המעגל'])(
    '«%s» ≡ A, B, C each on the circle',
    (line) => expect(factsOf(line)).toEqual(three),
  );

  it.each([
    ['AO על ציר ה- x', 'AO על ציר ה-x'],
    ['הצלע AO על ציר ה- x', 'הצלע AO על ציר ה-x'],
    ['הצלע AO נמצאת על ציר ה- x', 'הצלע AO נמצאת על ציר ה-x'],
    ['A על ציר ה- y', 'A על ציר ה-y'],
  ])('«%s» ≡ «%s»', (spaced, joined) => expect(factsOf(spaced)).toEqual(factsOf(joined)));

  it('a relation BETWEEN the subjects never distributes', () => {
    expect(distributeClauses('A ו-B סימטריות')).toBeNull();
    expect(distributeClauses('A, B ו-C סימטריות')).toBeNull();
  });

  it('the operator’s lines through the real gate, on the circle', () => {
    expect(play(['מעגל M', 'A, B, C על המעגל']).verdicts).toEqual(['record', 'record']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('#1643 — what a paste carries, the copula centre, and the no-circle message', () => {
  it('pasted bidi isolates are stripped', () => {
    expect(factsOf('הצלע AO ⁦נמצאת על ציר ה-⁦y⁩')).toEqual(factsOf('הצלע AO נמצאת על ציר ה-y'));
  });

  it.each(['·', '•', '*', '- '])('a leading «%s» is a list mark, not a word', (mark) => {
    expect(factsOf(`${mark}הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה`)).toEqual(
      factsOf('הצלעות AO, BO ו-AB משיקות למעגל בנקודות D, E ו-F בהתאמה'),
    );
  });

  it('a leading minus with no space is still an equation', () => {
    expect(parseLine('-2x+y=0').ok).toBe(true);
  });

  it.each(['מרכז המעגל הוא M', 'מרכז המעגל היא M', 'M הוא מרכז המעגל', 'the centre of the circle is M'])('«%s» ≡ «M מרכז המעגל»', (line) => {
    expect(factsOf(line)).toEqual(factsOf(line.startsWith('the') ? 'M is the centre of the circle' : 'M מרכז המעגל'));
  });

  it('a circle reference with NO circle says there is no circle — never "which one"', () => {
    const e = refusal('A על המעגל', []);
    expect(errorText(e, t)).toContain('אין בשרטוט מעגל');
    expect(errorText(e, tEn)).toContain('There is no circle');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ruling (a) on #1554 — a right trapezoid inscribed in a circle is refused, naming both nouns', () => {
  it.each(['טרפז ישר זווית ABCD חסום במעגל', 'טרפז ישר-זווית ABCD חסום במעגל שמרכזו M', 'טרפז ישר זווית ABCD בר חסימה', 'right trapezoid ABCD is inscribed in a circle'])(
    '«%s»',
    (line) => {
      const e = refusal(line, []);
      expect(e.key).toBe('inscribed-contradicts-noun');
      expect(errorText(e, t)).toContain('טרפז ישר זווית');
      expect(errorText(e, t)).toContain('מלבן');
      expect(errorText(e, tEn)).toContain('right trapezoid');
      expect(errorText(e, tEn)).toContain('rectangle');
    },
  );

  it('the nouns a circle CAN pass around still record', () => {
    for (const l of ['טרפז ABCD חסום במעגל', 'מלבן ABCD חסום במעגל', 'טרפז שווה שוקיים ABCD חסום במעגל']) {
      expect(decideSubmit(l, [], 0).kind, l).toBe('record');
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ruling (b) on #1619 — a tangency with no circle creates it, its centre unnamed', () => {
  it('6/4 typed exactly as printed builds A(2,−1), C(−4,5) or the mirror', () => {
    const { verdicts, kept } = play(corpus('6/4'));
    expect(verdicts).toEqual(['record', 'record', 'record', 'record']);
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive(kept, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const q = pts(d.figure);
      const got = [q.A.x, q.A.y, q.C.x, q.C.y].map((v) => Number(v.toFixed(6)) + 0);
      expect([[2, -1, -4, 5], [-4, 5, 2, -1]], `seed ${seed}`).toContainEqual(got);
      expect([q.O.x, q.O.y, q.B.x, q.B.y, q.K.x, q.K.y].map((v) => Number(v.toFixed(6)) + 0)).toEqual([-2, 1, 8, 11, -1, 2]);
    }
  });

  it('the touch line alone creates ONE circle and names no centre — no tool-chosen letter', () => {
    const d = derive(['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves.filter((c) => c.curve.kind === 'circle')).toHaveLength(1);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('«הצלעות AO, BO ו-AB משיקות למעגל …» typed BEFORE the incircle line builds the exam’s 3/5 figure', () => {
    const printed = corpus('3/5');
    const touchFirst = [...printed.slice(0, 3), printed[4], printed[3], ...printed.slice(5)];
    const { verdicts, kept } = play(touchFirst);
    expect(verdicts).toEqual(Array(touchFirst.length).fill('record'));
    const d = derive(kept, 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves.filter((c) => c.curve.kind === 'circle')).toHaveLength(1);
    const q = pts(d.figure);
    for (const [p, x, y] of [['A', -8, 0], ['B', 0, 6], ['C', -2, 2], ['D', -2, 0], ['E', 0, 2], ['F', -3.2, 3.6]] as const) {
      expect(near(q[p].x, x, 1e-6) && near(q[p].y, y, 1e-6), p).toBe(true);
    }
  });

  it('with one circle the touch binds to it; with several it is refused as ambiguous, never a pick', () => {
    expect(derive(['נתון מעגל שמרכזו O', 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה'], 0).figure.curves.filter((c) => c.curve.kind === 'circle')).toHaveLength(1);
    const e = refusal('AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', ['נתון מעגל שמרכזו O', 'נתון מעגל שמרכזו M']);
    expect(e).toMatchObject({ key: 'ambiguous-shape', host: { kind: 'circle', found: 2 } });
  });
});
