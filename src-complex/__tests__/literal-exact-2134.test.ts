/**
 * #2134 + #2109 (ADR-CX-071) — A LITERAL IS READ EXACTLY OR LEFT AS WRITTEN; A CIRCUMSCRIBED CIRCLE'S
 * COLLINEARITY IS SCALE-FREE.
 *
 * «z1 = 5cis(π/7) · z2 = 15cis(π/7) · המעגל החוסם את המשולש Oz1z2» drew a circle of radius 3.1·10¹⁰.
 * Two defects, each alone keeping the class alive:
 *   1. `foldConstants`' float read-back replaced «15cis(π/7)» with the Gaussian rational
 *      104616/7741 + (44933/6904)i — a different number, 1.6·10⁻¹⁰ rad off π/7 — so two numbers stated
 *      at one argument were not on one line, «|z1| = 15» was refused, and so was «z2 = 3z1».
 *   2. `circumcircle`'s absolute `|d| < 1e-12` scaled with |z|²: exact «300w / 1000w» and
 *      «95cis20 / 107cis20» still drew circles (r up to 7·10¹⁸).
 * The floor is the operator's #2109 ruling (2026-10-15): 1e-9, analytic's, so a genuinely thin typed
 * triangle is still drawn. Everything runs through the real `submitLine` + `deriveLines`.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { activeLines, submitLine } from '../app/submit';
import { parseExpr } from '../parser/exprParse';
import { FLATNESS_FLOOR } from '../replay/derive2';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (...lines: string[]): boolean[] => lines.map((l) => submitLine(l));
const derived = (seed = 0) => deriveLines(activeLines(), seed, seed);
const CIRCLE = 'המעגל החוסם את המשולש Oz1z2';
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

/** The #1895 refusal: the circle line is not added, and nothing is drawn. */
const expectCircleRefused = (givens: string[]) => {
  expect(play(...givens).every(Boolean)).toBe(true);
  expect(submitLine(CIRCLE)).toBe(false);
  expect(['incompatible', 'impossible']).toContain(store().lastError?.key);
  expect(store().lines).toEqual(givens);
  for (const seed of SEEDS) expect(derived(seed).objects).toEqual([]);
};

describe('#2134 — the report and its family: no circle through numbers on one line', () => {
  it.each([
    [['z1 = 5cis(π/7)', 'z2 = 15cis(π/7)']], // the report
    [['z1 = 10cis(π/9)', 'z2 = 70cis(π/9)']],
    [['z1 = 100cis(π/7)', 'z2 = 300cis(π/7)']],
    [['z1 = 5cis20', 'z2 = 15cis20']], // degrees too
    [['z1 = 95cis20', 'z2 = 107cis20']], // exact on both sides: the floor member on its own
    [['w = cis(π/7)', 'z1 = 300w', 'z2 = 1000w']], // large and exact: the floor member on its own
    [['z1 = 2cis30', 'z2 = 4cis30']], // the ruled twin (unchanged)
    [['z1 = 1', 'z2 = 2']], // the #1895 lock (unchanged)
  ])('%j · the circumscribed circle → refused', (givens) => expectCircleRefused(givens));
});

describe('#2134 — class: a polar literal is the number it states, at every modulus', () => {
  const ANGLES: [string, number][] = [
    ['(π/7)', Math.PI / 7],
    ['(π/9)', Math.PI / 9],
    ['(2π/7)', (2 * Math.PI) / 7],
    ['(π/5)', Math.PI / 5],
    ['(3π/7)', (3 * Math.PI) / 7],
    ['(π/11)', Math.PI / 11],
    ['20', (20 * Math.PI) / 180],
    ['10', (10 * Math.PI) / 180],
    ['1', Math.PI / 180],
  ];

  it.each(ANGLES)('m·cis%s for m = 2…100 is never folded into one value (no fraction stands in for it)', (spelled) => {
    for (let m = 2; m <= 100; m++) {
      const e = parseExpr(`${m}cis${spelled}`);
      expect(e, `${m}cis${spelled}`).not.toBeNull();
      // a single folded `val` is what the read-back produced: the nearby Gaussian rational
      expect(e!.t, `${m}cis${spelled}`).not.toBe('val');
    }
  });

  it.each(ANGLES)('«z1 = m·cis%s» plots at m·(cos θ, sin θ) and reads «= m·cis…», for m = 1…100', (spelled, th) => {
    for (let m = 1; m <= 100; m++) {
      store().resetSession();
      expect(submitLine(`z1 = ${m}cis${spelled}`)).toBe(true);
      const p = derived().points.find((q) => q.display === 'z₁')!;
      expect(Math.abs(p.z.re - m * Math.cos(th)), `${m}cis${spelled}`).toBeLessThan(1e-12 * m);
      expect(Math.abs(p.z.im - m * Math.sin(th)), `${m}cis${spelled}`).toBeLessThan(1e-12 * m);
      expect(p.reading.startsWith(`z₁ = ${m}·cis`), `${m}cis${spelled}: ${p.reading}`).toBe(true);
    }
  });

  it('the reported pair is collinear to round-off once the literal is exact (step 1 alone already flattens it)', () => {
    play('z1 = 5cis(π/7)', 'z2 = 15cis(π/7)');
    const pts = derived().points;
    const a = pts.find((q) => q.display === 'z₁')!.z;
    const b = pts.find((q) => q.display === 'z₂')!.z;
    const cross = Math.abs(a.re * b.im - a.im * b.re);
    const span2 = Math.max(a.re ** 2 + a.im ** 2, b.re ** 2 + b.im ** 2, (a.re - b.re) ** 2 + (a.im - b.im) ** 2);
    expect(cross / span2).toBeLessThan(1e-15);
    expect(Math.abs(Math.atan2(b.im, b.re) - Math.PI / 7)).toBeLessThan(1e-15);
    expect(Math.abs(Math.hypot(b.re, b.im) - 15)).toBeLessThan(1e-12);
  });
});

describe('#2109 — class: the collinearity verdict is about shape, not size', () => {
  it.each([1, 10, 100])('«z1 = %d(1+i) · z2 = 2·that» gets the same verdict at every scale', (k) => {
    expectCircleRefused([`z1 = ${k}+${k}i`, `z2 = ${2 * k}+${2 * k}i`]);
  });

  it.each([1, 10, 100])('a genuine triangle at scale %d is drawn at every scale', (k) => {
    expect(play(`z1 = ${k}`, `z2 = ${k}i`, CIRCLE)).toEqual([true, true, true]);
    const c = derived().objects.filter((o) => o.kind === 'circle');
    expect(c).toHaveLength(1);
    expect(Math.abs(c[0].radius! - (k * Math.SQRT2) / 2)).toBeLessThan(1e-9 * k);
  });
});

describe('#2134 — true statements are accepted (a true answer is never marked wrong)', () => {
  it('«z1 = 15cis(π/7)» · «|z1| = 15» → accepted, and the ask |z1| reads 15', () => {
    expect(play('z1 = 15cis(π/7)', '|z1| = 15')).toEqual([true, true]);
    const d = deriveLines(['z1 = 15cis(π/7)'], 0, 0, ['|z1|']);
    const row = askRowsOf(['|z1|'], d.knowledge)[0].row!;
    expect(row.value).toBe('15');
    expect(row.approx).toBeFalsy();
  });

  it('«z1 = 5cis(π/7)» · «z2 = 15cis(π/7)» · «z2 = 3z1» → accepted', () => {
    expect(play('z1 = 5cis(π/7)', 'z2 = 15cis(π/7)', 'z2 = 3z1')).toEqual([true, true, true]);
    expect(derived().unsatisfied).toEqual([]);
  });

  it('«z1 = 15cis20» · «|z1| = 15» → accepted, reading «z₁ = 15·cis20°»', () => {
    expect(play('z1 = 15cis20', '|z1| = 15')).toEqual([true, true]);
    expect(derived().points.find((q) => q.display === 'z₁')!.reading).toBe('z₁ = 15·cis20°');
  });

  it('«z1 = 15cis(π/7) + 1» carries no fraction under `=` — it reads as its twin «5cis(π/7) + 1» does', () => {
    expect(play('z1 = 15cis(π/7) + 1')).toEqual([true]);
    const p = derived().points.find((q) => q.display === 'z₁')!;
    expect(p.readingCart).not.toMatch(/\//);
    expect(Math.abs(p.z.re - (15 * Math.cos(Math.PI / 7) + 1))).toBeLessThan(1e-9);
    store().resetSession();
    play('z1 = 5cis(π/7) + 1');
    const twin = derived().points.find((q) => q.display === 'z₁')!;
    expect([p.reading, p.readingCart]).toEqual([twin.reading, twin.readingCart]);
  });
});

describe('#2134 — controls that stay as they are', () => {
  it('#1435: «√2 + √3» is never a fraction; Gaussian-rational and table literals read exactly', () => {
    const e = parseExpr('√2 + √3');
    expect(JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain('"3480"');
    for (const [line, reading] of [
      ['z1 = 3+4i', 'z₁ = 3+4i'],
      ['z1 = 2cis30', 'z₁ = √3+i'],
    ]) {
      store().resetSession();
      expect(submitLine(line)).toBe(true);
      expect(derived().points.find((q) => q.display === 'z₁')!.readingCart).toBe(reading);
    }
    store().resetSession();
    expect(submitLine('z1 = 2cis(π/4)')).toBe(true);
    expect(derived().points.find((q) => q.display === 'z₁')!.reading).toBe('z₁ = 2·cis45°');
  });

  it('the thin typed triangle «3+0.0000001i» is still drawn at r ≈ 10⁷ (the #2109 ruling)', () => {
    expect(play('z1 = 1', 'z2 = 2', 'z3 = 3+0.0000001i', 'המעגל החוסם את המשולש z1z2z3')).toEqual([true, true, true, true]);
    const c = derived().objects.filter((o) => o.kind === 'circle');
    expect(c).toHaveLength(1);
    expect(c[0].radius!).toBeGreaterThan(9e6);
    expect(c[0].radius!).toBeLessThan(1.1e7);
  });

  it('«z1 = 1+i · z2 = z1² · z3 = z1³» → the circle of radius √5 is drawn', () => {
    expect(play('z1 = 1+i', 'z2 = z1^2', 'z3 = z1^3', 'המעגל החוסם את המשולש z1z2z3')).toEqual([true, true, true, true]);
    const c = derived().objects.filter((o) => o.kind === 'circle');
    expect(c).toHaveLength(1);
    expect(Math.abs(c[0].radius! - Math.sqrt(5))).toBeLessThan(1e-9);
  });
});

describe('#2109 — the floor is the ruled constant, equal to analytic’s `isDegenerate`', () => {
  it('complex’s floor is 1e-9, and analytic’s scale-free test reads `1e-9 * scale * scale`', () => {
    expect(FLATNESS_FLOOR).toBe(1e-9);
    const analytic = readFileSync(new URL('../../src-analytic/engine/derived.ts', import.meta.url), 'utf8');
    const body = analytic.slice(analytic.indexOf('function isDegenerate'));
    expect(body.slice(0, body.indexOf('\n}'))).toMatch(/<=\s*1e-9\s*\*\s*scale\s*\*\s*scale/);
  });
});
