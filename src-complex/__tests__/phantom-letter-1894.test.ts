/**
 * #1894 (ADR-CX-061) — a letter is a point only when the figure reads it as a number.
 *
 * «a ממשי» drew a free point «a» on the real axis; «r = 2 · r ממשי» drew a point «r» at 1.63 beside the
 * panel's r = 2; «a ברביע הראשון», «arg a = 45», «arg a < 45», «a ו-b צמודים זה לזה» each drew a free
 * point a; and «מצולע I z1…z6» read the polygon's NAME as a seventh vertex. Operator rulings 2026-10-08:
 * «a ממשי» is accepted, draws no point, lists a under parameters and KEEPS its ✓ claim row; the four
 * other sentences refuse a real letter; «מצולע I …» is refused naming «I» until #623's G5-1.
 * Everything runs through the real `submitLine` + `deriveLines`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines, lowerLines } from '../app/deriveLines';
import { activeLines, submitLine } from '../app/submit';
import { CATALOG } from '../parser/catalog';
import { isComplexName } from '../parser/exprParse';
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

describe('#1894 — «a ממשי» types a real parameter: no point, listed, and the ✓ row stays', () => {
  it.each([
    ['a ממשי', 'a'],
    ['a מספר ממשי', 'a'],
    ['a הוא מספר ממשי', 'a'],
    ['r מספר ממשי', 'r'],
    ['a is real', 'a'],
    ['a is a real number', 'a'],
  ])('«%s»', (line, letter) => {
    expect(play(line)).toBe(true);
    const d = derived();
    expect(d.points.map((p) => p.name)).not.toContain(letter);
    expect(d.params).toEqual([{ name: letter, value: null }]);
    expect(d.claims.map((c) => [c.claim.kind, 'name' in c.claim ? c.claim.name : '', c.verdict.status])).toEqual([
      ['real', letter, 'holds'],
    ]);
  });

  it('«r = 2» · «r ממשי» draws no point r; the panel reads r = 2', () => {
    expect(play('r = 2', 'r ממשי')).toBe(true);
    for (const seed of [0, 1, 2]) expect(pointNames(seed)).not.toContain('r');
    const d = derived();
    expect(d.params).toEqual([{ name: 'r', value: '2' }]);
    expect(d.claims.map((c) => c.verdict.status)).toEqual(['holds']);
  });

  it('«a ו-b ממשיים» types both letters; «z1 ו-a ממשיים» claims z1 and types a', () => {
    expect(play('a ו-b ממשיים')).toBe(true);
    expect(pointNames()).toEqual([]);
    expect(derived().params.map((p) => p.name)).toEqual(['a', 'b']);
    store().resetSession();
    expect(play('z1 ו-a ממשיים')).toBe(true);
    expect(pointNames()).toEqual(['z1']);
    expect(derived().params.map((p) => p.name)).toEqual(['a']);
  });

  const EXAM = [
    'z1 = (2a^2+5a+4) + (2a^2+3a+2)i',
    'z2 = (a^2+8a+8) + (2-a^2+2a)i',
    'z1 ו-z2 צמודים זה לזה',
    'a = -1',
  ];
  it.each(['a ממשי', 'a מספר ממשי'])('the 2022 exam with «%s» first derives what it derives without it', (typing) => {
    const strip = (d: ReturnType<typeof deriveLines>) =>
      JSON.stringify({
        points: d.points.map((p) => [p.name, p.z.re.toFixed(9), p.z.im.toFixed(9)]),
        configCount: d.configCount,
        freeDof: d.freeDof,
        params: d.params,
        knowledge: d.knowledge,
      });
    for (let seed = 0; seed < 24; seed++) {
      const without = deriveLines(EXAM, seed, seed, ['מהו z1']);
      const withIt = deriveLines([typing, ...EXAM], seed, seed, ['מהו z1']);
      expect(strip(withIt), `seed ${seed}`).toBe(strip(without));
      expect(withIt.points.map((p) => p.name)).not.toContain('a');
    }
  });

  it('the English mirror «a is real» before the exam lines draws no a', () => {
    expect(play('a is real', ...EXAM)).toBe(true);
    expect(pointNames()).not.toContain('a');
  });
});

describe('#1894 — the four other sentences refuse a real letter', () => {
  it.each(['a מדומה טהור', 'a ברביע הראשון', 'arg a = 45', 'arg a < 45', 'a ו-b צמודים זה לזה'])(
    '«%s» is refused (not-handled), and reads as before once declared complex',
    (line) => {
      expect(play(line)).toBe(false);
      expect(store().lastError?.key).toBe('not-handled');
      expect(store().lines).toEqual([]);
      expect(pointNames()).toEqual([]);
      store().resetSession();
      // the conjugates line names b too, so both letters are declared
      const decl = line.includes('b') ? 'a ו-b מספרים מרוכבים' : 'a מספר מרוכב';
      expect(play(decl, line)).toBe(true);
      expect(pointNames()).toContain('a');
    },
  );
});

describe('#1894 — unchanged controls', () => {
  it('«z1 ממשי» is a claim on z1, drawn', () => {
    expect(play('z1 ממשי')).toBe(true);
    expect(pointNames()).toEqual(['z1']);
  });
  it('«a מספר מרוכב» · «a ממשי» is a claim on the complex number a, drawn on the real axis', () => {
    expect(play('a מספר מרוכב', 'a ממשי')).toBe(true);
    const d = derived();
    const a = d.points.find((p) => p.name === 'a');
    expect(a?.z.im).toBeCloseTo(0, 9);
    expect(d.claims.map((c) => c.verdict.status)).toEqual(['holds']);
    expect(d.params).toEqual([]);
  });
  it('«z1 = 1» · «z2 = i» · «המשולש Az1z2» still declares the named vertex A', () => {
    expect(play('z1 = 1', 'z2 = i', 'המשולש Az1z2')).toBe(true);
    expect(pointNames()).toContain('A');
  });
});

describe('#1894 — a polygon NAME is never a vertex (refused until #623 G5-1 reads it)', () => {
  it.each([
    ['מצולע I z1z2z3z4z5z6', 'I'],
    ['המצולע I z1z2z3z4z5z6', 'I'],
    ['מצולע II z1z2z3z4z5z6', 'II'],
    ['polygon I z1z2z3z4z5z6', 'I'],
    ['היקף המצולע I z1z2z3z4z5z6 = 6', 'I'],
  ])('after «z^6 = 1», «%s» is refused naming «%s», and no point I is drawn', (line, name) => {
    expect(play('z^6 = 1')).toBe(true);
    expect(play(line)).toBe(false);
    expect(store().lastError).toEqual({ key: 'unaccounted', detail: name });
    expect(store().lines).toEqual(['z^6 = 1']);
    expect(pointNames()).not.toContain('I');
  });

  it('the question «שטח המצולע I …» does not parse; «שטח המצולע z1…z6» still answers', () => {
    expect(parseLineV2('שטח המצולע I z1z2z3z4z5z6')).toMatchObject({ ok: false, reason: 'unaccounted', items: ['I'] });
    play('z^6 = 1');
    const k = derived(0, ['שטח המצולע z1z2z3z4z5z6']).knowledge;
    expect(k.map((r) => r.value)).toEqual(['2.6']);
  });

  it('«המצולע z1z2z3z4z5z6» still draws the hexagon', () => {
    expect(play('z^6 = 1', 'המצולע z1z2z3z4z5z6')).toBe(true);
    const d = derived();
    expect(d.points.map((p) => p.name)).toEqual(['z1', 'z2', 'z3', 'z4', 'z5', 'z6']);
  });
});

describe('#1894 — the class guard', () => {
  const scopeOK = (lines: string[]) => {
    const low = lowerLines(lines);
    return low.declared.filter((n) => !isComplexName(n));
  };

  it('no catalog statement with a z/w name swapped for a real letter declares that letter', () => {
    const leaks: string[] = [];
    let parsed = 0;
    for (const e of CATALOG) {
      for (const line of [e.he, e.en]) {
        const re = /(?<![A-Za-z\d])[zZwW]\d*(?![A-Za-z\d])/g;
        for (let m = re.exec(line); m; m = re.exec(line)) {
          const v = line.slice(0, m.index) + 'a' + line.slice(m.index + m[0].length);
          const p = parseLineV2(v);
          if (!p.ok || p.line.selections.length) continue; // a selection binds its new name to a root
          parsed++;
          if (scopeOK([v]).includes('a')) leaks.push(v);
        }
      }
    }
    expect(parsed).toBeGreaterThan(30);
    expect(leaks).toEqual([]);
  });

  it('no shape sentence reads «I» after the polygon noun as a vertex', () => {
    const lines = [
      'מצולע I z1z2z3z4', 'המצולע I z1 z2 z3 z4', 'polygon I z1z2z3z4', 'שטח המצולע I z1z2z3',
      'היקף המצולע I z1z2z3 = 6', 'המעגל החוסם את המצולע I z1z2z3', 'היחס בין שטח המצולע I z1z2z3 לשטח Oz1z2',
    ];
    for (const l of lines) {
      const p = parseLineV2(l);
      expect(p.ok, l).toBe(false);
      if (!p.ok) expect(p.reason === 'unaccounted' && p.items, l).toEqual(['I']);
    }
  });
});
