/**
 * #1365 (ADR-CX-058) — «z1 = a+bi», the symbolic cartesian form every textbook uses.
 *
 * Operator ruling, 2026-09-24: the lexer split (`bi` is b·i, never `pi`, never a complex letter), the
 * number reads «z₁ = a+bi» in the cartesian view while a and b are free, the numeric reading takes
 * over once they are forced, and the polar view stays bare until then (FR-KN-1). Locks: the measured
 * cases of the round-#1382 escalation, «z1 = a+bi · |z1| = 5» building at 24/24 seeds, and the
 * reading in both views.
 *
 * Every case runs through the real `submitLine` gate and the real `deriveLines` fold, and reads the
 * readings off the SAME surfaces the canvas and the panel print (`DerivedPoint.reading*`, `v2Labels`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { v2Labels } from '../replay/scene2';
import { useComplexStore } from '../store/useComplexStore';

const SEEDS = Array.from({ length: 24 }, (_, s) => s);
const st = () => useComplexStore.getState();

const submitAll = (lines: string[]): void => {
  for (const l of lines) expect(submitLine(l), l).toBe(true);
  expect(st().lines).toEqual(lines);
};
const pointOf = (lines: string[], name: string, seed = 0) => deriveLines(lines, seed, seed).points.find((p) => p.name === name)!;
const unsatisfiedSeeds = (lines: string[]) =>
  SEEDS.filter((s) => {
    const d = deriveLines(lines, s, s);
    return d.contradiction !== null || d.unsatisfied.length > 0;
  });

beforeEach(() => st().resetSession());

describe('#1365 — the class: every textbook spelling is accepted and reads back symbolically', () => {
  it.each([
    ['z1 = a+bi', 'z1', 'z₁ = a+bi'],
    ['z = x+yi', 'z', 'z = x+yi'],
    ['z1 = a-bi', 'z1', 'z₁ = a-bi'],
    ['z1 = a+ib', 'z1', 'z₁ = a+bi'],
    ['w = c+di', 'w', 'w = c+di'],
    ['z1 = a + bi', 'z1', 'z₁ = a+bi'],
    ['z1 = a + b*i', 'z1', 'z₁ = a+bi'],
    ['z1 = 2 + bi', 'z1', 'z₁ = 2+bi'],
    ['z1 = -a-bi', 'z1', 'z₁ = -a-bi'],
  ])('«%s» — accepted; the cartesian view reads the definition, the polar view stays bare', (line, name, cart) => {
    submitAll([line]);
    const d = deriveLines([line], 0, 0);
    const p = d.points.find((q) => q.name === name)!;
    expect(p.readingCart).toBe(cart);
    expect(p.reading).toBe(p.display); // FR-KN-1: no polar value that is not knowledge
    expect(p.defined).toBe('symbolic');
    // the PANEL prints the same row in the cartesian view, and none in the polar view
    expect(v2Labels(d, 'cart')).toEqual([cart]);
    expect(v2Labels(d, 'polar')).toEqual([]);
    // a and b are real PARAMETERS, listed free — never complex names
    expect(d.params.every((r) => r.value === null)).toBe(true);
  });

  it('«z1 = 3+4i» is unaffected: the literal reads exactly as before', () => {
    submitAll(['z1 = 3+4i']);
    const p = pointOf(['z1 = 3+4i'], 'z1');
    expect(p.readingCart).toBe('z₁ = 3+4i');
    expect(p.reading).toBe('z₁ ≈ 5·cis53.13°');
    expect(p.defined).toBeNull();
  });
});

describe('#1365 — the escalation\'s measured cases now build, at every seed', () => {
  it.each([
    [['z1 = a+bi', '|z1| = 5']],
    [['|z1| = 5', 'z1 = a+bi']],
    [['z1 = a+bi', 'z1 ברביע השני']],
    [['z = x+yi', 'z ברביע השני']],
    [['z1 = a-bi', '|z1| = 5']],
    [['z1 = a+ib', 'z1 in the second quadrant']],
  ])('%j — accepted through the real gate, satisfied at 24/24 seeds', (lines) => {
    submitAll(lines);
    expect(unsatisfiedSeeds(lines)).toEqual([]);
  });

  it('«z1 = a+bi · z1 ברביע השני» really draws in quadrant II at every seed, and still reads a+bi', () => {
    const lines = ['z1 = a+bi', 'z1 ברביע השני'];
    for (const s of SEEDS) {
      const p = pointOf(lines, 'z1', s);
      expect(p.z.re, `seed ${s}`).toBeLessThan(0);
      expect(p.z.im, `seed ${s}`).toBeGreaterThan(0);
      expect(p.readingCart).toBe('z₁ = a+bi');
    }
  });
});

describe('#1365 — once the parameters are forced, the numeric reading takes over', () => {
  it('one forced: «a = 3» → «z₁ = 3+bi»; the polar view stays bare', () => {
    const lines = ['z1 = a+bi', 'a = 3'];
    submitAll(lines);
    const p = pointOf(lines, 'z1');
    expect(p.readingCart).toBe('z₁ = 3+bi');
    expect(p.reading).toBe(p.display);
  });

  it('both forced: «a = 3 · b = 4» reads exactly as the literal 3+4i, in BOTH views and on the panel', () => {
    const lines = ['z1 = a+bi', 'a = 3', 'b = 4'];
    submitAll(lines);
    const d = deriveLines(lines, 0, 0);
    const p = d.points.find((q) => q.name === 'z1')!;
    const lit = pointOf(['z1 = 3+4i'], 'z1');
    expect(p.readingCart).toBe(lit.readingCart);
    expect(p.reading).toBe(lit.reading);
    expect(p.defined).toBe('closed');
    expect(v2Labels(d, 'cart')).toEqual(['z₁ = 3+4i']);
    expect(v2Labels(d, 'polar')).toEqual(['z₁ ≈ 5·cis53.13°']);
  });

  it('a negative forced value keeps its sign: «b = 2 · a = -1» → «z₁ = -1+2i»', () => {
    const lines = ['z1 = a+bi', 'b = 2', 'a = -1'];
    submitAll(lines);
    expect(pointOf(lines, 'z1').readingCart).toBe('z₁ = -1+2i');
  });

  it('forced through the number itself («|z1| = 5 · arg z1 = 120») — the exact carriers read, unchanged', () => {
    const lines = ['z1 = a+bi', '|z1| = 5', 'arg z1 = 120'];
    submitAll(lines);
    const p = pointOf(lines, 'z1');
    expect(p.reading).toBe('z₁ = 5·cis120°');
    expect(p.readingCart).toBe('z₁ = -5/2+(5√3/2)i');
    expect(p.defined).toBeNull();
  });

  it('a number known only AS A FUNCTION of a parameter no longer prints its sample: «z2 = 2bi» reads «z₂ = 2bi»', () => {
    const lines = ['z1 = a+bi', 'z2 = 2bi'];
    submitAll(lines);
    const p = pointOf(lines, 'z2');
    expect(p.readingCart).toBe('z₂ = 2bi');
    expect(p.readingCart).not.toMatch(/\d\.\d/);
  });
});

describe('#1365 — an AMBIGUOUS glued i refuses, with a clarification that really reads', () => {
  it('«z1 = zi»: refused, and the explicit product is offered — which the gate then accepts', () => {
    expect(submitLine('z1 = zi')).toBe(false);
    expect(st().lastError).toEqual({ key: 'glued-i', detail: 'z1 = zi', suggestion: 'z1 = z*i' });
    expect(st().lines).toEqual([]);
    expect(submitLine('z1 = z*i')).toBe(true);
  });

  it('«z1 = 3 + wi»: refused with «z1 = 3 + w*i»', () => {
    expect(submitLine('z1 = 3 + wi')).toBe(false);
    expect(st().lastError).toEqual({ key: 'glued-i', detail: 'z1 = 3 + wi', suggestion: 'z1 = 3 + w*i' });
  });

  it.each(['z1 = pi', 'z1 = 2-ii', 'im = 3', 'z1 = ib z2'])('«%s»: refused as not understood — never split, no product invented', (line) => {
    expect(submitLine(line)).toBe(false);
    expect(st().lastError).toEqual({ key: 'not-handled', detail: line });
    expect(st().lines).toEqual([]);
  });

  it('a letter DECLARED complex is not split: «u מספר מרוכב · z1 = 2 + ui» does not commit', () => {
    expect(submitLine('u מספר מרוכב')).toBe(true);
    expect(submitLine('z1 = 2 + ui')).toBe(false);
    expect(st().lines).toEqual(['u מספר מרוכב']);
  });
});
