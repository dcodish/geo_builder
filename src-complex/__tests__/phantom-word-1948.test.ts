/**
 * #1948 (ADR-CX-062) — a WORD is a point only when the figure reads it as a number.
 *
 * #1894 (ADR-CX-061) closed this for a one-letter subject: «a ממשי» no longer draws a point «a». But the
 * guard it installed asks «is this a REAL letter?» — `!isComplexName && isDeclarableName` — and
 * `isDeclarableName`'s floor is one letter plus an optional index. So a multi-letter word failed BOTH
 * halves and no rule stopped it: «foo ממשי» / «foo is real» drew a free point «foo» at 2.09 and marked
 * the claim ✓, and so did «foo ברביע הראשון», «arg foo = 45», «arg foo < 45», «90 < arg foo < 180»,
 * «arg foo - arg bar = 90», «foo ו-bar צמודים זה לזה» and «foo מדומה טהור». The same hole swallowed the
 * reserved constants: «i ממשי» drew a point «i» and reported ✓ real, which is false.
 *
 * The fix is ONE subject reader (`readSubjects`), so length stopped mattering and the one-letter and
 * multi-letter forms cannot drift apart again. Refusal reuses #1894's existing key, `not-handled` —
 * one message for one class.
 *
 * Everything runs through the real `submitLine` + `deriveLines`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines, lowerLines } from '../app/deriveLines';
import { activeLines, submitLine } from '../app/submit';
import { CATALOG } from '../parser/catalog';
import { parseLineV2 } from '../parser/rules';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (...lines: string[]): boolean => {
  let ok = false;
  for (const l of lines) ok = submitLine(l);
  return ok;
};
const derived = (seed = 0, asks: string[] = []) => deriveLines(activeLines(), seed, seed, asks);
const pointNames = (seed = 0) => derived(seed).points.map((p) => p.name);

describe('#1948 — a multi-letter subject never becomes a point', () => {
  /** Every spelling that minted a phantom «foo», across every rule that shares the subject reader. */
  const REFUSED: readonly [string, readonly string[]][] = [
    ['typeClaim · real', ['foo ממשי', 'foo מספר ממשי', 'foo הוא מספר ממשי', 'foo is real', 'foo is a real number']],
    ['typeClaim · pure imaginary', ['foo מדומה טהור', 'foo is pure imaginary']],
    ['quadrantGiven', ['foo ברביע הראשון', 'foo is in the first quadrant']],
    ['argumentRelation', ['arg foo = 45', 'arg foo - arg bar = 90', 'arg foo + arg bar = 90']],
    ['argumentInequality', ['arg foo < 45', '90 < arg foo < 180']],
    ['conjugatesClaim', ['foo ו-bar צמודים זה לזה', 'foo and bar are conjugates']],
    ['solutionSelection', ['foo הוא הפתרון ברביע הרביעי']],
  ];

  for (const [rule, lines] of REFUSED) {
    describe(rule, () => {
      it.each(lines)('«%s» is refused with #1894\'s key and draws nothing', (line) => {
        expect(play(line)).toBe(false);
        expect(store().lastError?.key).toBe('not-handled');
        expect(activeLines()).toEqual([]);
        for (const seed of [0, 1, 2]) expect(pointNames(seed)).toEqual([]);
        expect(derived().params).toEqual([]);
        expect(derived().claims).toEqual([]);
      });
    });
  }

  it('«foo הוא הפתרון ברביע הרביעי» after «z^6 = 1» is refused, and the roots are untouched', () => {
    expect(play('z^6 = 1')).toBe(true);
    expect(play('foo הוא הפתרון ברביע הרביעי')).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
    expect(pointNames()).toEqual(['z1', 'z2', 'z3', 'z4', 'z5', 'z6']);
  });

  it('a multi-letter word cannot be introduced as a number at all, so the refusal is the only honest end', () => {
    // the floor `declaration` has always applied — this is what makes «foo ממשי» unreadable, not its length
    expect(play('foo מספר מרוכב')).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
    expect(play('foo = 2')).toBe(false);
  });

  it('a glued capital pair is a distance, not a subject: «AB ממשי» draws no point «ab»', () => {
    expect(play('AB ממשי')).toBe(false);
    expect(store().lastError?.key).toBe('not-handled');
    expect(pointNames()).toEqual([]);
  });

  it.each(['i ממשי', 'o ממשי', 'arg i = 45', 'i ברביע הראשון'])(
    'the reserved constants fell through the same hole: «%s» draws no point and claims nothing',
    (line) => {
      expect(play(line)).toBe(false);
      expect(store().lastError?.key).toBe('not-handled');
      expect(pointNames()).toEqual([]);
      expect(derived().claims).toEqual([]);
    },
  );

  it('«arg foo» stays readable as a question and still declares nothing', () => {
    // asks never enact `declares`, so the ask register is unchanged — only the leak is closed
    expect(play('arg foo')).toBe(true);
    expect(pointNames()).toEqual([]);
    const p = parseLineV2('arg foo');
    expect(p.ok && p.line.declares).toEqual([]);
  });
});

describe('#1948 — the false-refusal net: a name the figure DOES read as a number still works', () => {
  it.each([
    ['A1 ממשי', ['A1']],
    ['z12 ממשי', ['z12']],
    ['arg A1 = 45', ['A1']],
    ['Z1 ממשי', ['z1']],
  ])('«%s» — length is not the question, the floor is', (line, points) => {
    expect(play(line)).toBe(true);
    expect(pointNames()).toEqual(points);
  });

  it('«a12 ממשי» types a multi-character real parameter: no point, listed, ✓ row', () => {
    expect(play('a12 ממשי')).toBe(true);
    expect(pointNames()).toEqual([]);
    expect(derived().params).toEqual([{ name: 'a12', value: null }]);
    expect(derived().claims.map((c) => c.verdict.status)).toEqual(['holds']);
  });

  it.each([
    ['u ממשי', ['u']],
    ['u2 ממשי', ['u', 'u2']],
    ['u12 ברביע הראשון', ['u', 'u12']],
    ['arg u = 45', ['u']],
  ])('a DECLARED family keeps working: «u מספר מרוכב» · «%s»', (line, points) => {
    expect(play('u מספר מרוכב', line)).toBe(true);
    expect(pointNames().slice().sort()).toEqual(points.slice().sort());
  });

  it('«u מספר מרוכב» · «v מספר מרוכב» · «u ו-v צמודים זה לזה» still claims conjugates', () => {
    expect(play('u מספר מרוכב', 'v מספר מרוכב', 'u ו-v צמודים זה לזה')).toBe(true);
    expect(pointNames().slice().sort()).toEqual(['u', 'v']);
    expect(derived().claims.map((c) => c.claim.kind)).toEqual(['conjugates']);
  });
});

describe('#1948 — #1894\'s cases are unchanged', () => {
  it.each([
    ['a ממשי', 'a'],
    ['a מספר ממשי', 'a'],
    ['a הוא מספר ממשי', 'a'],
    ['r מספר ממשי', 'r'],
    ['a is real', 'a'],
    ['a is a real number', 'a'],
  ])('«%s» still types a real parameter: no point, listed, ✓ row', (line, letter) => {
    expect(play(line)).toBe(true);
    const d = derived();
    expect(d.points.map((p) => p.name)).not.toContain(letter);
    expect(d.params).toEqual([{ name: letter, value: null }]);
    expect(d.claims.map((c) => c.verdict.status)).toEqual(['holds']);
  });

  it.each(['a מדומה טהור', 'a ברביע הראשון', 'arg a = 45', 'arg a < 45', 'a ו-b צמודים זה לזה'])(
    '«%s» is still refused for a real letter',
    (line) => {
      expect(play(line)).toBe(false);
      expect(store().lastError?.key).toBe('not-handled');
      expect(pointNames()).toEqual([]);
    },
  );

  it.each(['z1 ממשי', 'z1 ברביע הראשון', 'arg z1 = 45', 'arg z1 < 45', '90 < arg z1 < 180'])(
    '«%s» still reads z1',
    (line) => {
      expect(play(line)).toBe(true);
      expect(pointNames()).toEqual(['z1']);
    },
  );

  it('«המשולש Az1z2» still declares the vertices the student named', () => {
    expect(play('המשולש Az1z2')).toBe(true);
    expect(pointNames().slice().sort()).toEqual(['A', 'z1', 'z2']);
  });

  it('«z1 ו-a ממשיים» still claims z1 and types a', () => {
    expect(play('z1 ו-a ממשיים')).toBe(true);
    expect(pointNames()).toEqual(['z1']);
    expect(derived().params.map((p) => p.name)).toEqual(['a']);
  });
});

describe('#1948 — the class guard', () => {
  it('no catalog line with a z/w name swapped for a multi-letter word declares that word', () => {
    const leaks: string[] = [];
    let parsed = 0;
    for (const e of CATALOG) {
      for (const line of [e.he, e.en]) {
        const re = /(?<![A-Za-z\d])[zZwW]\d*(?![A-Za-z\d])/g;
        for (let m = re.exec(line); m; m = re.exec(line)) {
          const v = `${line.slice(0, m.index)}foo${line.slice(m.index + m[0].length)}`;
          parsed++;
          if (lowerLines([v]).declared.includes('foo')) leaks.push(v);
        }
      }
    }
    expect(parsed).toBeGreaterThan(30);
    expect(leaks).toEqual([]);
  });

  it('no subject-reading sentence declares a word, a glued pair or a reserved constant', () => {
    const SUBJECTS = ['foo', 'bar2', 'AB', 'i', 'o'];
    const FORMS = [
      (n: string) => `${n} ממשי`,
      (n: string) => `${n} is real`,
      (n: string) => `${n} מדומה טהור`,
      (n: string) => `${n} ברביע הראשון`,
      (n: string) => `${n} is in the first quadrant`,
      (n: string) => `arg ${n} = 45`,
      (n: string) => `arg ${n} < 45`,
      (n: string) => `90 < arg ${n} < 180`,
      (n: string) => `arg ${n} - arg z2 = 90`,
      (n: string) => `${n} ו-z2 צמודים זה לזה`,
      (n: string) => `${n} הוא הפתרון ברביע הרביעי`,
      (n: string) => `arg ${n}`,
    ];
    const leaks: string[] = [];
    for (const n of SUBJECTS) {
      for (const form of FORMS) {
        const line = form(n);
        const declared = lowerLines([line]).declared;
        if (declared.some((d) => d.toLowerCase() === n.toLowerCase())) leaks.push(line);
      }
    }
    expect(leaks).toEqual([]);
  });
});
