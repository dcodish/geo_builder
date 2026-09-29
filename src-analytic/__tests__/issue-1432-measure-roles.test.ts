/**
 * RADIUS, FOCUS, DIRECTRIX, PERIMETER — sayable AND askable (#1432, ADR-AG-169).
 *
 * External review of prod: *"The Ask box is narrow. It can't answer radius, focus, … perimeter."*
 * The values were computed all along (the panel's folded detail, #1212) and no grammar reached
 * them on either surface. One atom per measure, read by the given and the ask — so the two
 * surfaces cannot disagree — with the knowledge gates unchanged.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { fmtAnalytic } from '../format';
import { decideSubmit } from '../app/submit';
import { hostKey, rangeText } from '../app/hostKey';
import { directrixText, roleLineText } from '../app/curveText';
import { analyticI18n } from '../i18n';

const dof = (d: ReturnType<typeof derive>) => reportedDof(d.construction, d.figure.carrierDof);
const answer = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic);

describe('#1432 — the radius as a GIVEN', () => {
  it.each([
    ['נתון מעגל O שרדיוסו 5'],
    ['מעגל שמרכזו O ורדיוסו 5'],
    ['circle O with radius 5'],
  ])('«%s» — a circle born with its radius has 2 degrees of freedom, not 3', (line) => {
    const d = derive([line], 0);
    expect(d.faults).toEqual([]);
    expect(dof(d)).toBe(2);
  });

  it('«רדיוס המעגל הוא 5» after «נתון מעגל O» PINS the free radius — the sym substituted, the param retired', () => {
    const d = derive(['נתון מעגל O', 'רדיוס המעגל הוא 5'], 0);
    expect(d.faults).toEqual([]);
    expect(dof(d)).toBe(2);
    const cv = d.figure.curves.map((c) => c.curve).find((c) => c.kind === 'circle');
    expect(cv && cv.kind === 'circle' ? cv.r : null).toBeCloseTo(5, 9);
  });

  it('on an EQUATION circle the sentence is a restatement: true is known, false refuses by name', () => {
    const t = derive(['נתון מעגל I שמשוואתו x^2+y^2=25', 'רדיוס המעגל הוא 5'], 0);
    expect(t.faults).toEqual([]);
    const f = derive(['נתון מעגל I שמשוואתו x^2+y^2=25', 'רדיוס המעגל הוא 4'], 0);
    expect(f.faults.map((x) => x.code)).toEqual(['conflicting-restatement']);
  });
});

describe('#1432 — the focus and directrix', () => {
  const P = 'נתונה פרבולה שמשוואתה y^2=8x';

  it('«F מוקד הפרבולה» names the focus — a derived point at (2,0), the circle-centre pattern', () => {
    const d = derive([P, 'F מוקד הפרבולה'], 0);
    expect(d.faults).toEqual([]);
    const f = d.figure.points.find((p) => p.id === 'F')!;
    expect(f.x).toBeCloseTo(2, 9);
    expect(f.y).toBeCloseTo(0, 9);
  });

  it('«משוואת המדריך היא x=-2» verifies against the parabola; a wrong directrix refuses by name', () => {
    expect(derive([P, 'משוואת המדריך היא x=-2'], 0).faults).toEqual([]);
    expect(derive([P, 'משוואת המדריך היא x=-3'], 0).faults.map((x) => x.code)).toEqual(['conflicting-restatement']);
  });

  it('with no parabola, or two, the sentences refuse rather than guess', () => {
    expect(derive(['F מוקד הפרבולה'], 0).faults.map((x) => x.code)).toEqual(['ambiguous-shape']);
  });
});

describe('#1432 — the ASKS', () => {
  it.each([
    [['נתון מעגל I שמשוואתו x^2+y^2=25'], 'רדיוס המעגל', '5'],
    [['נתון מעגל I שמשוואתו x^2+y^2=25'], 'מה הרדיוס של המעגל I', '5'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'מוקד הפרבולה', '(2, 0)'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'המוקד', '(2, 0)'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'מדריך הפרבולה', 'x = -2'],
    [['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'], 'מוקדי האליפסה', '(4, 0), (-4, 0)'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)'], 'היקף המשולש ABC', '12'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)'], 'היקף ABC', '12'],
  ])('%j «%s» answers %s', (lines, q, want) => {
    const a = answer(lines as string[], q as string);
    expect(a.unreadable).toBeUndefined();
    expect(a.value).toBe(want);
  });

  it('«היקף ABC» and «AB+BC+CA» are ONE answer — the perimeter delegates to the compound length', () => {
    const lines = ['A(0,0)', 'B(3,0)', 'C(0,4)'];
    expect(answer(lines, 'היקף ABC').value).toBe(answer(lines, 'AB+BC+CA').value);
  });

  it('a PARAMETERISED parabola has no invariant focus — the honest null, never a sampled point', () => {
    const a = answer(['נתונה פרבולה שמשוואתה y^2=2ax'], 'מוקד הפרבולה');
    expect(a.value).toBeNull();
  });

  it('the radius of a FREE circle is not knowledge — null, never the sampled value', () => {
    const a = answer(['נתון מעגל O'], 'רדיוס המעגל');
    expect(a.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Amendment 1 — the pre-played sheet (2026-09-29): every class it found, driven through the REAL
// submit path (`decideSubmit`, what the input box calls) and the real ask.
// ---------------------------------------------------------------------------

/** Submit each line as the input box does; return the verdict of every line. */
function submit(lines: string[]): Array<{ line: string; kind: string; key?: string; host?: unknown; domain?: unknown }> {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, 0) as { kind: string; error?: { key: string; host?: unknown; domain?: unknown } };
    if (v.kind === 'record') accepted.push(line);
    return { line, kind: v.kind, key: v.error?.key, host: v.error?.host, domain: v.error?.domain };
  });
}
const last = (lines: string[]) => submit(lines).at(-1)!;
const heT = analyticI18n.getFixedT('he');
/** The locale's text with the bidi isolates the product's post-processor wraps round each value stripped. */
const he = (k: string, o?: Record<string, unknown>): string => String(heT(k, o)).replace(/[\u2066-\u2069\u200e\u200f]/g, '');

describe('#1432 am. 1 — a stated value is checked against its symbol\'s DOMAIN at the one substitution seam', () => {
  it.each([
    [['נתון מעגל O', 'רדיוס המעגל הוא -3']],
    [['נתון מעגל O', 'רדיוס המעגל הוא 0']],
    [['נתון מעגל O שרדיוסו -3']],
    [['נתון מעגל O שרדיוסו 0']],
    [['נתון מעגל O', 'רדיוס המעגל -3']],
    [['a הוא פרמטר', 'a<0', 'נתון מעגל O שרדיוסו a']],
    [['a הוא פרמטר', 'a>0', 'נתון מעגל O שרדיוסו -a']],
  ])('%j is REFUSED out-of-domain, naming the statement — never substituted and the circle silently gone', (lines) => {
    const v = last(lines);
    expect(v.kind).toBe('refused');
    expect(v.key).toBe('out-of-domain');
    expect(v.domain).toMatchObject({ min: 0, minOpen: true });
    // The prior figure keeps its circle.
    const before = derive(lines.slice(0, -1), 0);
    expect(before.faults).toEqual([]);
  });

  it('the refusal WORDS the bound — «גדול מ-0» — and quotes the sentence', () => {
    const msg = he('errOutOfDomain', { detail: 'רדיוס המעגל הוא -3', range: rangeText({ min: 0, minOpen: true }, he) });
    expect(msg).toContain('רדיוס המעגל הוא -3');
    expect(msg).toContain('גדול מ-0');
  });

  it('a lone PARAMETER as the radius inherits the domain: «שרדיוסו a» declares a > 0 and keeps its freedom', () => {
    const d = derive(['נתון מעגל O שרדיוסו a'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.params.find((p) => p.sym === 'a')?.domain).toMatchObject({ min: 0, minOpen: true });
    expect(dof(d)).toBe(3);
  });

  it('a positive radius still pins — creation and post-hoc reach the SAME seam (DOF 2, r = 5)', () => {
    for (const lines of [['נתון מעגל O שרדיוסו 5'], ['נתון מעגל O', 'רדיוס המעגל הוא 5']]) {
      const d = derive(lines, 0);
      expect(d.faults).toEqual([]);
      expect(dof(d)).toBe(2);
      const cv = d.figure.curves.find((c) => c.curve.kind === 'circle')!.curve;
      expect(cv.kind === 'circle' ? cv.r : NaN).toBeCloseTo(5, 9);
    }
  });

  it('the substitution reaches the circle\'s OWN constraints — «משיק לציר ה-x» then «רדיוס … 3» puts the centre at |y| = 3', () => {
    for (const lines of [['נתון מעגל O משיק לציר ה-x', 'רדיוס המעגל הוא 3'], ['נתון מעגל O שרדיוסו 3 משיק לציר ה-x']]) {
      const d = derive(lines, 0);
      expect(d.faults).toEqual([]);
      expect(Math.abs(d.figure.points.find((p) => p.id === 'O')!.y)).toBeCloseTo(3, 6);
      expect(d.construction.params.some((p) => p.sym === 'r_O')).toBe(false);
    }
  });
});

describe('#1432 am. 1 — ONE opener normaliser for the whole ask lane', () => {
  const circle = ['נתון מעגל I שמשוואתו x^2+y^2=25'];
  const parabola = ['נתונה פרבולה שמשוואתה y^2=8x'];
  const ellipse = ['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'];
  const tri = ['A(0,0)', 'B(3,0)', 'C(0,4)', 'משולש ABC'];
  it.each([
    // the role asks, behind every opener and closer
    [circle, 'מהו רדיוס המעגל', '5'],
    [circle, 'מה הוא רדיוס המעגל', '5'],
    [circle, 'מצא את רדיוס המעגל', '5'],
    [circle, 'חשב את רדיוס המעגל', '5'],
    [circle, 'רדיוס המעגל?', '5'],
    [circle, 'רדיוס המעגל = ?', '5'],
    [circle, 'מה הרדיוס?', '5'],
    [circle, 'what is the radius of the circle', '5'],
    [circle, 'find the radius', '5'],
    [parabola, 'מהו מוקד הפרבולה?', '(2, 0)'],
    [parabola, 'מצא את המוקד', '(2, 0)'],
    [parabola, 'מהי משוואת המדריך', 'x = -2'],
    [ellipse, 'מהם מוקדי האליפסה', '(4, 0), (-4, 0)'],
    [tri, 'מה היקף המשולש ABC', '12'],
    [tri, 'היקף המשולש ABC?', '12'],
    [tri, 'מצא את היקף המשולש ABC', '12'],
    [tri, 'what is the perimeter of ABC', '12'],
    // the PRE-EXISTING asks gain the same openers — the class, not the new atoms
    [['A(0,0)', 'B(3,4)'], 'מהו AB', '5'],
    [['A(0,0)', 'B(3,4)'], 'מצא את AB', '5'],
    [['A(0,0)', 'B(3,4)'], 'AB?', '5'],
    [['A(0,0)', 'B(3,4)'], 'AB = ?', '5'],
    [['A(0,0)', 'B(3,4)'], 'what is AB', '5'],
    [['A(0,0)', 'B(3,4)'], 'מה השיפוע של AB', '4/3'],
    [['A(0,0)', 'B(3,4)'], 'מהי משוואת הישר AB', '4x - 3y = 0'],
    [['A(0,0)', 'B(3,4)'], 'מהו B?', '(3, 4)'],
  ])('%j «%s» answers %s', (lines, q, want) => {
    const a = answer(lines as string[], q as string);
    expect(a.unreadable).toBeUndefined();
    expect(a.value).toBe(want);
  });

  it('the locus ask keeps its openers — now from the one normaliser — and gains the «?»', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'נקודה M', 'MA=MB'];
    for (const q of ['מצא את המקום הגיאומטרי של M', 'מהו המקום הגיאומטרי של M?']) {
      expect(answer(lines, q).value).toBe(answer(lines, 'המקום הגיאומטרי של M').value);
    }
  });

  it('an opener alone is not a question — «מהו» stays unreadable, never an empty answer', () => {
    expect(answer(['A(0,0)'], 'מהו').unreadable).toBe(true);
  });
});

describe('#1432 am. 1 — ONE role reader: every spelling of radius, focus, directrix and perimeter', () => {
  it.each([
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'משוואת המדריך', 'x = -2'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'משוואת מדריך הפרבולה', 'x = -2'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'ישר המדריך', 'x = -2'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'שיעורי המוקד', '(2, 0)'],
    [['נתונה פרבולה שמשוואתה y^2=8x'], 'שיעורי מוקד הפרבולה', '(2, 0)'],
    [['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'], 'מוקד האליפסה', '(4, 0), (-4, 0)'],
    [['נתון מעגל I שמשוואתו x^2+y^2=25'], 'אורך הרדיוס', '5'],
    [['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)', 'מלבן ABCD'], 'היקף המלבן ABCD', '14'],
    [['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)', 'מלבן ABCD'], 'היקף המלבן', '14'],
    [['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(0,3)', 'מלבן ABCD'], 'היקף המצולע ABCD', '14'],
    [['A(0,0)', 'B(2,0)', 'C(2,2)', 'D(0,2)', 'ריבוע ABCD'], 'היקף הריבוע', '8'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)', 'משולש ABC'], 'היקף המשולש', '12'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)', 'משולש ABC'], 'ההיקף', '12'],
    [['A(0,0)', 'B(3,0)', 'C(0,4)'], 'perimeter ABC', '12'],
  ])('%j «%s» answers %s', (lines, q, want) => {
    const a = answer(lines as string[], q as string);
    expect(a.unreadable).toBeUndefined();
    expect(a.value).toBe(want);
  });

  it.each([
    ['רדיוס המעגל 5'],
    ['רדיוס המעגל שווה 5'],
    ['רדיוס המעגל = 5'],
    ['אורך הרדיוס הוא 5'],
    ['המעגל ברדיוס 5'],
    ['המעגל O ברדיוס 5'],
    ['רדיוס המעגל O הוא 5'],
    ['the radius of the circle is 5'],
  ])('post-hoc radius «%s» pins the circle (DOF 3 → 2) and reads back 5', (line) => {
    const lines = ['נתון מעגל O', line];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    const d = derive(lines, 0);
    expect(dof(d)).toBe(2);
    expect(ask(d, 'רדיוס המעגל', fmtAnalytic).value).toBe('5');
  });

  it.each([
    ['נתון מעגל O ברדיוס 5', 2],
    ['נתון מעגל O שאורך רדיוסו 5', 2],
    ['נתון מעגל O שרדיוסו הוא 5', 2],
    ['מעגל שמרכזו O ורדיוסו 5', 2],
    ['נתון מעגל שמרכזו O(2,3) ורדיוסו 5', 0],
    ['נתון מעגל שמרכזו (2,3) ורדיוסו 5', 0],
    ['נתון מעגל שמרכזו בנקודה (2,3) ורדיוסו 5', 0],
    ['circle O with radius 5', 2],
  ])('creation «%s» records with r = 5 and DOF %i', (line, want) => {
    expect(submit([line]).map((v) => v.kind)).toEqual(['record']);
    const d = derive([line], 0);
    expect(dof(d)).toBe(want);
    expect(ask(d, 'רדיוס המעגל', fmtAnalytic).value).toBe('5');
  });

  it('a coordinate centre is a real point: «שמרכזו (2,3)» draws the centre there, named by the tool', () => {
    const d = derive(['נתון מעגל שמרכזו (2,3) ורדיוסו 5'], 0);
    const c = d.figure.curves.find((q) => q.curve.kind === 'circle')!.curve;
    expect(c.kind === 'circle' ? [c.cx, c.cy] : null).toEqual([2, 3]);
    expect(d.minted.length).toBe(1);
  });

  it('«R=5» / «r=5» are deliberately NOT radius givens — a single letter collides with a point R or a parameter r', () => {
    expect(last(['נתון מעגל O', 'R=5']).key).toBe('not-handled');
    expect(last(['נתון מעגל O', 'r=5']).key).toBe('not-handled');
  });

  it.each([
    ['מדריך הפרבולה הוא x=-2'],
    ['ישר המדריך x=-2'],
    ['משוואת מדריך הפרבולה היא x=-2'],
    ['משוואת המדריך היא x=-2'],
    ['the directrix is x=-2'],
  ])('directrix «%s» is a true restatement — already known', (line) => {
    expect(last(['נתונה פרבולה שמשוואתה y^2=8x', line]).kind).toBe('already-known');
  });

  it('a wrong directrix refuses by name, whatever its orientation', () => {
    for (const eq of ['x=-3', 'y=-2']) {
      expect(last(['נתונה פרבולה שמשוואתה y^2=8x', `משוואת המדריך היא ${eq}`]).key).toBe('conflicting-restatement');
    }
  });

  it.each([
    ['מוקד הפרבולה הוא F'],
    ['הנקודה F היא מוקד הפרבולה'],
    ['F הוא מוקד הפרבולה'],
    ['F מוקד הפרבולה'],
    ['F is the focus of the parabola'],
  ])('focus «%s» names F at (2,0)', (line) => {
    const lines = ['נתונה פרבולה שמשוואתה y^2=8x', line];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    expect(answer(lines, 'F').value).toBe('(2, 0)');
  });

  it('focus with COORDINATES: a fixed parabola accepts the true one and refuses a false one by name', () => {
    expect(last(['נתונה פרבולה שמשוואתה y^2=8x', 'מוקד הפרבולה הוא (2,0)']).kind).toBe('record');
    expect(last(['נתונה פרבולה שמשוואתה y^2=8x', 'מוקד הפרבולה הוא (3,0)']).key).toBe('unsatisfiable');
  });

  it('focus with coordinates PINS a parameterised parabola: y²=2px with focus (2,0) answers the focus and closes the DOF', () => {
    const lines = ['נתונה פרבולה שמשוואתה y^2=2px', 'מוקד הפרבולה הוא (2,0)'];
    expect(submit(lines).map((v) => v.kind)).toEqual(['record', 'record']);
    const d = derive(lines, 0);
    expect(dof(d)).toBe(0);
    expect(ask(d, 'מוקד הפרבולה', fmtAnalytic).value).toBe('(2, 0)');
    expect(ask(d, 'מדריך הפרבולה', fmtAnalytic).value).toBe('x = -2');
  });

  it('«F מוקד האליפסה» is understood and refused out-of-scope (the ellipse focus point is not built)', () => {
    expect(last(['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1', 'F מוקד האליפסה']).key).toBe('out-of-scope');
  });
});

describe('#1432 am. 1 — the PERIMETER as a given: a real constraint that consumes a DOF', () => {
  const base = ['A(0,0)', 'B(3,0)', 'נקודה C'];
  it.each([
    ['היקף המשולש ABC הוא 12'],
    ['היקף המשולש ABC 12'],
    ['היקף ABC = 12'],
    ['היקף המשולש ABC שווה 12'],
    ['the perimeter of triangle ABC is 12'],
  ])('«%s» records, DOF 2 → 1, and asking it back answers 12', (line) => {
    expect(dof(derive(base, 0))).toBe(2);
    const lines = [...base, line];
    expect(submit(lines).at(-1)!.kind).toBe('record');
    const d = derive(lines, 0);
    expect(dof(d)).toBe(1);
    expect(ask(d, 'היקף ABC', fmtAnalytic).value).toBe('12');
  });

  it('with the vertices, the named triangle is drawn (the #1080 ruling: naming a shape draws it)', () => {
    const d = derive([...base, 'היקף המשולש ABC הוא 12'], 0);
    expect(d.construction.objects.some((o) => o.kind === 'polygon')).toBe(true);
  });

  it.each([['היקף המשולש הוא 12'], ['ההיקף הוא 12']])('contextual «%s» resolves the ONE triangle', (line) => {
    const lines = [...base, 'משולש ABC', line];
    expect(submit(lines).at(-1)!.kind).toBe('record');
    expect(dof(derive(lines, 0))).toBe(1);
  });

  it('a false perimeter on a determined triangle is refused naming the statement', () => {
    expect(last(['A(0,0)', 'B(3,0)', 'C(0,4)', 'היקף המשולש ABC הוא 13']).key).toBe('unsatisfiable');
    // A TRUE perimeter still records — it names (and so draws) the triangle — and adds no constraint the figure lacked.
    expect(last(['A(0,0)', 'B(3,0)', 'C(0,4)', 'היקף המשולש ABC הוא 12']).kind).toBe('record');
  });
});

describe('#1432 am. 1 — the remedy follows the HOST, not the kite example', () => {
  it.each([
    [['A(0,0)', 'רדיוס המעגל הוא 5'], { kind: 'circle', found: 0 }],
    [['נתון מעגל I שמשוואתו x^2+y^2=25', 'נתון מעגל II שמשוואתו (x-10)^2+y^2=4', 'רדיוס המעגל הוא 5'], { kind: 'circle', found: 2 }],
    [['נתון מעגל I שמשוואתו x^2+y^2=25', 'F מוקד הפרבולה'], { kind: 'parabola', found: 0 }],
    [['A(0,0)', 'משוואת המדריך היא x=-2'], { kind: 'parabola', found: 0 }],
    [['A(0,0)', 'B(3,0)', 'ההיקף הוא 12'], { kind: 'polygon', found: 0 }],
    [['A(0,0)', 'המעגל משיק לציר ה-x'], { kind: 'circle', found: 0 }],
    [['A(0,0)', 'הנקודה A נמצאת על האליפסה'], { kind: 'ellipse', found: 0 }],
  ])('%j refuses ambiguous-shape carrying host %j — and its message names that host, never «דלתון»', (lines, host) => {
    const v = last(lines as string[]);
    expect(v.key).toBe('ambiguous-shape');
    expect(v.host).toMatchObject(host);
    const msg = he(hostKey('errHost', v.host as { kind: string; found: number }), { detail: (lines as string[]).at(-1), found: 0 });
    expect(msg).not.toBe(hostKey('errHost', v.host as { kind: string; found: number })); // the key resolves
    expect(msg).not.toContain('דלתון');
    expect(msg).toContain((lines as string[]).at(-1));
  });

  it('the KITE case the old message was written for keeps it', () => {
    const v = last(['A(0,0)', 'שטח הדלתון הוא 24']);
    expect(v.key).toBe('ambiguous-shape');
    expect(v.host).toBeUndefined();
    expect(he('errAmbiguousShape', { detail: 'x' })).toContain('שטח הדלתון ABCD הוא 24');
  });

  it.each([
    [['A(0,0)'], 'מוקד הפרבולה', { kind: 'parabola', found: 0 }],
    [['A(0,0)'], 'מדריך הפרבולה', { kind: 'parabola', found: 0 }],
    [['A(0,0)'], 'מוקדי האליפסה', { kind: 'ellipse', found: 0 }],
    [['A(0,0)'], 'רדיוס המעגל', { kind: 'circle', found: 0 }],
    [['A(0,0)'], 'ההיקף', { kind: 'polygon', found: 0 }],
    [['נתון מעגל I שמשוואתו x^2+y^2=25', 'נתון מעגל II שמשוואתו (x-10)^2+y^2=4'], 'רדיוס המעגל', { kind: 'circle', found: 2 }],
  ])('the ASK twin: %j «%s» answers host %j with a worded sentence', (lines, q, host) => {
    const a = answer(lines as string[], q as string);
    expect(a.host).toEqual(host);
    const key = hostKey('askHost', a.host!);
    expect(he(key)).not.toBe(key);
  });

  it('a named circle the figure lacks is MISSING, not open', () => {
    expect(answer(['נתון מעגל I שמשוואתו x^2+y^2=25'], 'רדיוס המעגל III').missing).toEqual({ name: 'III', kind: 'curve' });
  });
});

describe('#1432 am. 1 — the directrix is DERIVED, never assumed vertical', () => {
  it('the ask and the panel print the directrix through one role-line formatter over the directrix LINE', () => {
    // A vertical directrix prints x = …; any other line prints its explicit form — no `-c/a` shortcut.
    expect(roleLineText(1, 0, 2)).toBe('x = -2');
    expect(roleLineText(0, 1, 2)).toBe('y = -2');
    expect(directrixText({ kind: 'parabola', p: 4 })).toBe('x = -2');
    expect(directrixText({ kind: 'parabola', p: -4 })).toBe('x = 2');
  });

  it('the given is judged line against line: a proportional restatement is the same line', () => {
    expect(last(['נתונה פרבולה שמשוואתה y^2=8x', 'משוואת המדריך היא 2x+4=0']).kind).toBe('already-known');
  });
});
