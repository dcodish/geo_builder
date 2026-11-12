/**
 * #2823 ([ADR-W-208](../../docs/06w-decisions-workspace.md#adr-w-208), the operator's ruling ADR-W-203 and his
 * 2026-11-12 axis-letter ruling) — the shared reading of a lowercase point label: a slot where only a point can stand
 * folds to capitals; anything else is left to the ask.
 */
import { describe, expect, it } from 'vitest';
import { askCandidate, certainLabelFold, lowercaseNamesIn, lowercaseNamesInCommands } from '../labelCase';

const fold = (line: string, opts: Parameters<typeof certainLabelFold>[1] = {}) => certainLabelFold(line, opts)?.text ?? null;
const AXES_2 = { axes: ['x', 'y'] };
const AXES_3 = { axes: ['x', 'y', 'z'] };

describe('#2823 — a certain slot folds to capitals', () => {
  it.each([
    // S1 — a point noun (Hebrew and English), lists, vertices, primes
    ['נקודה j', 'נקודה J'],
    ['הנקודה d', 'הנקודה D'],
    ['נתונה נקודה t', 'נתונה נקודה T'],
    ['הנקודות a ו-b', 'הנקודות A ו-B'],
    ["הקודקוד c'", "הקודקוד C'"],
    ['point j', 'point J'],
    ['points a and b', 'points A and B'],
    // S2 — a shape noun before its vertex run, with its modifiers
    ['משולש abc', 'משולש ABC'],
    ['ריבוע abcd', 'ריבוע ABCD'],
    ['מחומש abcde', 'מחומש ABCDE'],
    ['משולש ישר-זווית abc', 'משולש ישר-זווית ABC'],
    ['triangle abc', 'triangle ABC'],
    // S3 — a midpoint's subject
    ['m אמצע AB', 'M אמצע AB'],
    ['m היא אמצע AB', 'M היא אמצע AB'],
    ['m is the midpoint of AB', 'M is the midpoint of AB'],
    // S4 — an angle's vertex triple
    ['∠abc = 40', '∠ABC = 40'],
    ['זווית sdb = 30', 'זווית SDB = 30'],
    ['angle abc = 40', 'angle ABC = 40'],
    // S5 — a coordinate head
    ['c(4,7)', 'C(4,7)'],
    ['c(1,2,3)', 'C(1,2,3)'],
    ['A(1,2), b(3,4)', 'A(1,2), B(3,4)'],
  ])('«%s» → «%s»', (line, want) => {
    expect(fold(line, AXES_2)).toBe(want);
  });

  it('the operator ruling of 2026-11-12: an axis letter after «נקודה» is the capital point', () => {
    expect(fold('נקודה x', AXES_2)).toBe('נקודה X');
    expect(fold('נקודה y', AXES_2)).toBe('נקודה Y');
    expect(fold('נקודה z', AXES_3)).toBe('נקודה Z');
    // #1594: an axis is never a midpoint, so the subject folds too
    expect(fold('x אמצע SA', AXES_3)).toBe('X אמצע SA');
  });

  it('a solid noun the caller passes is a vertex slot of any arity', () => {
    const solids = { ...AXES_3, solidNouns: 'תיב[הות]+|פירמיד[הות]+|box(?:es)?' };
    expect(fold("תיבה abcda'b'c'd'", solids)).toBe("תיבה ABCDA'B'C'D'");
    expect(fold('פירמידה sabcd', solids)).toBe('פירמידה SABCD');
    expect(fold('תיבה abcd', AXES_3)).toBeNull(); // not a slot unless the product says so
  });

  it('an axis named as an axis is notation, not a run that blocks the line', () => {
    expect(fold('הקודקוד c נמצא על החלק החיובי של ציר ה-x', AXES_3)).toBe('הקודקוד C נמצא על החלק החיובי של ציר ה-x');
  });

  it('reports the folded labels', () => {
    expect(certainLabelFold('הנקודות a ו-b1')?.folded).toEqual(['A', 'B1']);
  });
});

describe('#2823 — never certain: the line is left to the ask', () => {
  it.each([
    // unanchored positions
    ['d על AB'],
    ['ab = 5'],
    ['AC ⊥ bd'],
    // a mixed line: one certain run, one not
    ['נקודה d על ab'],
    ['m היא נקודת האמצע של ab'],
    // a single letter after the angle sign can be the angle's own name
    ['∠b = 40'],
    ['זווית x = 2y'],
    // axis letters outside S1/S3
    ['משולש xyz'],
    ['∠axb = 40'],
    ['x(4,7)'],
    // a run of the wrong arity, or with a repeated letter
    ['משולש abcd'],
    ['ריבוע abca'],
    // English prose
    ['the triangle has sides 3, 4, 5'],
    ['the angle between the planes'],
    ['the point of intersection'],
  ])('«%s» → null', (line) => {
    expect(fold(line, AXES_2)).toBeNull();
  });

  it('a letter the figure already uses is not folded (a parameter, a measure, a line, a vector)', () => {
    expect(fold('נקודה k', { ...AXES_2, used: new Set(['k']) })).toBeNull();
    expect(fold('k אמצע AB', { ...AXES_2, used: new Set(['k']) })).toBeNull();
    expect(fold('משולש abc', { ...AXES_2, used: new Set(['b']) })).toBeNull();
    expect(fold('c(4,7)', { ...AXES_2, used: lowercaseNamesIn(['הישר y = cx + 1']) })).toBeNull();
    expect(fold('נקודה u', { ...AXES_3, used: lowercaseNamesInCommands([{ type: 'name-vector', name: 'u', from: 'A', to: 'B' }]) })).toBeNull();
    // an axis after «נקודה» is the ruling's, even when an equation uses it
    expect(fold('נקודה x', { ...AXES_2, used: lowercaseNamesIn(['y = 2x + 1']) })).toBe('נקודה X');
  });

  it('a line with no lowercase label has nothing to fold', () => {
    expect(fold('משולש ABC')).toBeNull();
    expect(fold('AB = 5 cm')).toBeNull();
  });
});

describe('#2823 — the ask: 2-D\'s lift, moved unchanged (#779 / #2195)', () => {
  it.each([
    ['d על AB', 'D על AB'],
    ['נקודה d על ab', 'נקודה D על AB'],
    ['ab = 5', 'AB = 5'],
    ['AB = 5 cm', null],
    ['the triangle abc', 'the triangle ABC'],
    ['a point d on ab', 'a point D on AB'],
  ])('«%s» → %s', (line, want) => {
    expect(askCandidate(line)).toBe(want);
  });

  it('a caller keeps its own lowercase names', () => {
    expect(askCandidate('נקודה d על הישר y = 2x + 1', (run) => /^[xy]$/.test(run))).toBe('נקודה D על הישר y = 2x + 1');
  });
});

describe('#2823 — the names a figure uses', () => {
  it('reads a command tree, never `type`', () => {
    const used = lowercaseNamesInCommands([{ type: 'radius-symbol', name: 'r' }, { type: 'set-var', name: 'a1' }, { type: 'segment', a: 'A', b: 'B' }]);
    expect([...used].sort()).toEqual(['a', 'a1', 'r']);
  });

  it('reads typed lines as ADR-AG-423 did: an equation whole, a sentence\'s words not', () => {
    expect([...lowercaseNamesIn(['k הוא פרמטר'])]).toEqual(['k']);
    expect(lowercaseNamesIn(['y = ax + 1']).has('a')).toBe(true);
    expect(lowercaseNamesIn(['circle O']).has('c')).toBe(false);
  });
});
