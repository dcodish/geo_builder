/**
 * #1481 (ADR-CX-057) — THE CLASS LOCK: a true relation between typed literals is never decided as a
 * contradiction, and a claim over exactly-typed numbers is decided exactly.
 *
 * Reported: «z1 = 2+3i · z2 = -2+3i · z1*z2 = -13» refused as «אינו מתיישב» although true. Root cause:
 * each typed literal's angle was an atom of its own, and the tier-1 decision read any surviving atom
 * as "not a whole number of turns" — assuming every atom independent. The fix mints every Gaussian-
 * rational literal in ONE basis (the canonical Gaussian primes, which ARE independent), and decides
 * an opaque atom three-valued. Driven through the real gate (`acceptLine`) and the real fold.
 *
 * The lock is two-sided on purpose: a fix that "passed" by accepting everything would fail the
 * refusal half (a false product refused on the ARGUMENT, a wrong modulus refused on the MODULUS).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { acceptLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

beforeEach(() => useComplexStore.getState().clearAll());

/** Every line accepted in order through the real gate, and the fold clean at the end. */
const buildsGreen = (lines: readonly string[]) => {
  for (let i = 0; i < lines.length; i++) {
    expect(acceptLine(lines.slice(0, i), lines[i], 0), `line ${i + 1}: «${lines[i]}»`).toMatchObject({ ok: true });
  }
  const d = deriveLines(lines);
  expect(d.contradiction).toBeNull();
  expect(d.unsatisfied).toEqual([]);
  return d;
};

describe('#1481 — true relations between literals are accepted (the measured rows 1–10)', () => {
  it.each([
    ['the report: a product', ['z1 = 2+3i', 'z2 = -2+3i', 'z1*z2 = -13']],
    ['conjugate product 3±4i', ['z1 = 3+4i', 'z2 = 3-4i', 'z1*z2 = 25']],
    ['conjugate product 2±3i', ['z1 = 2+3i', 'z2 = 2-3i', 'z1*z2 = 13']],
    ['a product of two different primes', ['z1 = 1+2i', 'z2 = 3+i', 'z1*z2 = 1+7i']],
    ['a product with a diagonal', ['z1 = 2+3i', 'z2 = 1+i', 'z1*z2 = -1+5i']],
    ['a quotient', ['z1 = 2+3i', 'z2 = -2+3i', 'z1/z2 = (5-12i)/13']],
    ['a power', ['z1 = 2+3i', 'z1^2 = -5+12i']],
    ['a rational rescale', ['z1 = 2+3i', 'z2 = 4+6i', 'z2 = 2*z1']],
    ['a rotation of the conjugate', ['z1 = 2+3i', 'z2 = 3+2i', 'z2 = i*conj(z1)']],
    ['through a named number', ['z1 = 2+3i', 'z2 = -2+3i', 'z3 = -13', 'z1*z2 = z3']],
  ])('%s', (_label, lines) => {
    const d = buildsGreen(lines);
    expect(d.undecided).toEqual([]);
  });

  it('entry order does not matter: the relation stated FIRST', () => {
    buildsGreen(['z1*z2 = -13', 'z1 = 2+3i', 'z2 = -2+3i']);
    buildsGreen(['z1 = 2+3i', 'z1*z2 = -13', 'z2 = -2+3i']);
  });

  it('the other product spellings the grammar reads', () => {
    buildsGreen(['z1 = 2+3i', 'z2 = -2+3i', 'z1·z2 = -13']);
    buildsGreen(['z1 = 2+3i', 'z2 = -2+3i', 'z1 z2 = -13']);
    buildsGreen(['z1 = 2+3i', 'z2 = -2+3i', 'z1z2 = -13']);
  });
});

describe('#1481 — the refusals still refuse, on the right half', () => {
  it('a FALSE product is refused on the ARGUMENT, naming an earlier line', () => {
    const v = acceptLine(['z1 = 2+3i', 'z2 = -2+3i'], 'z1*z2 = 13', 0);
    expect(v).toMatchObject({ ok: false, error: { key: 'incompatible' } });
    expect(deriveLines(['z1 = 2+3i', 'z2 = -2+3i', 'z1*z2 = 13']).contradiction).toBe('argument');
  });

  it('a false power and a false rescale are refused on the argument', () => {
    expect(acceptLine(['z1 = 2+3i'], 'z1^2 = 5+12i', 0).ok).toBe(false);
    expect(deriveLines(['z1 = 2+3i', 'z1^2 = 5+12i']).contradiction).toBe('argument');
    expect(acceptLine(['z1 = 2+3i', 'z2 = 6+4i'], 'z2 = 2*z1', 0).ok).toBe(false);
  });

  it.each([
    [['z1 = 1+i', 'z2 = 1-i'], 'z1*z2 = 3'],
    [['z1 = 2+3i', 'z2 = -2+3i'], 'z1*z2 = -12'],
  ])('a wrong MODULUS is refused on the modulus: %j + «%s»', (lines, raw) => {
    expect(acceptLine(lines, raw, 0)).toMatchObject({ ok: false, error: { key: 'incompatible' } });
    expect(deriveLines([...lines, raw]).contradiction).toBe('modulus');
  });
});

describe('#1481 — claims over typed literals are decided exactly (row 11 was a true answer marked ✗)', () => {
  const verdict = (lines: string[]) => deriveLines(lines).claims[0].verdict.status;

  it('«w ממשי» HOLDS for (2+3i)(2−3i) = 13', () => {
    expect(verdict(['z1 = 2+3i', 'z2 = 2-3i', 'w = z1*z2', 'w ממשי'])).toBe('holds');
  });

  it('«w ממשי» is REFUTED for (2+3i)² = −5+12i — a theorem, not a guess', () => {
    expect(verdict(['z1 = 2+3i', 'w = z1^2', 'w ממשי'])).toBe('refuted');
  });

  it('«w מדומה טהור» HOLDS for (2+3i)·(3+2i) = 13i', () => {
    expect(verdict(['z1 = 2+3i', 'z2 = 3+2i', 'w = z1*z2', 'w מדומה טהור'])).toBe('holds');
  });

  it('conjugates 3+4i / 3−4i HOLD; 3+4i / 4+3i are REFUTED', () => {
    expect(verdict(['z1 = 3+4i', 'z2 = 3-4i', 'z1 ו-z2 צמודים זה לזה'])).toBe('holds');
    expect(verdict(['z1 = 3+4i', 'z2 = 4+3i', 'z1 ו-z2 צמודים זה לזה'])).toBe('refuted');
  });

  it('an OPAQUE direction that cancels only numerically is UNKNOWN — never refuted', () => {
    // 1±√2i are radical literals, each with its own opaque atom: their product 3 is real, but nothing
    // exact relates the two atoms. Unknown is the honest answer; ✗ would mark a true answer wrong.
    expect(verdict(['z1 = 1+√2i', 'z2 = 1-√2i', 'w = z1*z2', 'w ממשי'])).toBe('unknown');
  });
});

describe('#1481 — the opaque net: a true relation it cannot decide is UNDECIDED, not refused', () => {
  it('(1+√2i)(1−√2i) = 3 is accepted, and listed as undecided rather than silently passed', () => {
    const lines = ['z1 = 1+√2i', 'z2 = 1-√2i', 'z1*z2 = 3'];
    for (let i = 0; i < lines.length; i++) expect(acceptLine(lines.slice(0, i), lines[i], 0).ok).toBe(true);
    const d = deriveLines(lines);
    expect(d.contradiction).toBeNull();
    expect(d.undecided).toEqual(['z1*z2 = 3']);
  });

  it('an opaque relation that is clearly FALSE is still refused', () => {
    expect(acceptLine(['z1 = 1+√2i', 'z2 = 1-√2i'], 'z1*z2 = -3', 0).ok).toBe(false);
  });
});

describe('#1481 — the ask lane stays exact over several atoms (M-d)', () => {
  const ask = (lines: string[], q: string) => {
    const d = deriveLines(lines, 0, 0, [q]);
    return askRowsOf([q], d.knowledge)[0].row!;
  };

  it('«z1*z2» for 1+2i, 3+i prints exactly 1+7i', () => {
    const row = ask(['z1 = 1+2i', 'z2 = 3+i'], 'z1*z2');
    expect(row.value).toBe('1+7i');
    expect(row.approx).toBeFalsy();
  });

  it('«z1^2» for 2+3i prints exactly -5+12i', () => {
    const row = ask(['z1 = 2+3i'], 'z1^2');
    expect(row.value).toBe('-5+12i');
    expect(row.approx).toBeFalsy();
  });

  it('a literal with two prime atoms reads back exactly on the canvas: z = 1+7i', () => {
    const d = deriveLines(['z = 1+7i']);
    expect(d.points.find((p) => p.name === 'z')!.readingCart).toBe('z = 1+7i');
  });
});
