/**
 * #791 — CAPITAL LETTERS ARE POINTS (ADR-CX-033): the exam's figure register arrives.
 *
 * The operator's rulings (2026-08-26), locked here:
 *  1. «A = 5+i» defines a complex number and positions point A — case-SENSITIVELY: lowercase `a`
 *     stays the real parameter the «הביעו באמצעות a ו-b» register needs.
 *  2. «AB» between two capital points is the DISTANCE, never a product — multiplication requires an
 *     explicit `A*B`.
 *  3. `d_{z1z2}` / `d_{AB}` is the textbook distance form — a glued run, no comma.
 *  4. «z1 = A» binds the label to the number: ONE point, displayed «A (z₁)» everywhere.
 */
import { describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { readAsk } from '../app/submit';

const pt = (d: ReturnType<typeof deriveLines>, name: string) => d.points.find((p) => p.name === name);

describe('a capital letter defines a point (ruling 1)', () => {
  it('«A = 5+i» builds point A with its reading', () => {
    const d = deriveLines(['A = 5+i'], 0, 0);
    expect(d.untranslated).toEqual([]);
    expect(pt(d, 'A')).toBeDefined();
    expect(pt(d, 'A')!.readingCart).toBe('A = 5+i');
  });

  it('case-sensitivity: lowercase «a» is NOT a point — the parameter register holds', () => {
    const d = deriveLines(['a = 5+i'], 0, 0);
    expect(d.points.find((p) => p.name === 'a' || p.name === 'A')).toBeUndefined();
  });

  it('the z/w family keeps folding: «Z1 = 3+4i» is z1, as it always was', () => {
    const d = deriveLines(['Z1 = 3+4i'], 0, 0);
    expect(pt(d, 'z1')).toBeDefined();
    expect(pt(d, 'z1')!.readingCart).toBe('z₁ = 3+4i');
  });

  it('O stays the origin — it is not a definable label', () => {
    const d = deriveLines(['אורך OA', 'A = 3+4i'].reverse(), 0, 0);
    expect(d.untranslated).toEqual([]);
  });
});

describe('«AB» is a distance, «A*B» is a product (ruling 2)', () => {
  const GIVENS = ['A = 3+4i', 'B = 3'];

  it('the bare pair asks the distance — |A−B| = 4', () => {
    expect(readAsk('AB').kind).toBe('measure'); // the bare pair converts to a length ask
    const d = deriveLines(GIVENS, 0, 0, ['AB']);
    expect(d.knowledge[0].value).toBe('4');
  });

  it('the explicit star multiplies — |A*B| = 15', () => {
    const d = deriveLines(GIVENS, 0, 0, ['|A*B|']);
    expect(d.knowledge[0].value).toBe('15');
  });

  it('the measure nouns read label runs: «אורך AB» = 4, «שטח OAB» = 6', () => {
    const d = deriveLines(GIVENS, 0, 0, ['אורך AB', 'שטח OAB']);
    expect(d.knowledge.map((k) => k.value)).toEqual(['4', '6']);
  });

  it('English mirror: «length AB»', () => {
    const d = deriveLines(GIVENS, 0, 0, ['length AB']);
    expect(d.knowledge[0].value).toBe('4');
  });

  it('a lowercase run never reads as points — «אורך ab» stays unread', () => {
    const d = deriveLines(['אורך ab'], 0, 0);
    expect(d.untranslated).toHaveLength(1);
  });
});

describe('the d_{…} distance form (ruling 3)', () => {
  it('d_{AB} and d_{z1z2} both answer the distance', () => {
    const dLabels = deriveLines(['A = 3+4i', 'B = 3'], 0, 0, ['d_{AB}']);
    expect(dLabels.knowledge[0].value).toBe('4');
    const dNums = deriveLines(['z1 = 3+4i', 'z2 = 3'], 0, 0, ['d_{z1z2}']);
    expect(dNums.knowledge[0].value).toBe('4');
  });

  it('d_{oz1} is |z1| — distance from the origin', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0, ['d_{Oz1}']);
    expect(d.knowledge[0].value).toBe('5');
  });

  it('as a GIVEN it drives: «d_{z1z2} = 5» pins the free point to the circle', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2', 'd_{z1z2} = 5'], 0, 0, ['d_{z1z2}']);
    expect(d.unsatisfied).toEqual([]);
    expect(d.contradiction).toBeNull();
  });

  it('garbage inside the braces refuses the line rather than guessing', () => {
    const d = deriveLines(['d_{hello} = 5'], 0, 0);
    expect(d.untranslated).toHaveLength(1);
  });
});

describe('«z1 = A» binds — one point, dual-named «A (z₁)» (ruling 4)', () => {
  it('the operator’s format: display and readings say «A (z₁)», the label node is not drawn twice', () => {
    const d = deriveLines(['z1 = 3+4i', 'z1 = A'], 0, 0);
    expect(d.untranslated).toEqual([]);
    expect(pt(d, 'A')).toBeUndefined(); // one dot, not two coincident ones
    const p = pt(d, 'z1')!;
    expect(p.display).toBe('A (z₁)');
    expect(p.readingCart).toBe('A (z₁) = 3+4i');
  });

  it('either order binds: «A = z1» after the number exists', () => {
    const d = deriveLines(['z1 = 3+4i', 'A = z1'], 0, 0);
    expect(pt(d, 'z1')!.display).toBe('A (z₁)');
    expect(pt(d, 'A')).toBeUndefined();
  });

  it('a cold binding is one FREE point wearing both names', () => {
    const d = deriveLines(['z1 = A'], 0, 0);
    expect(pt(d, 'z1')!.display).toBe('A (z₁)');
    expect(pt(d, 'A')).toBeUndefined();
  });

  it('asks reach the point through EITHER name', () => {
    const d = deriveLines(['z1 = 3+4i', 'z1 = A', 'B = 3'], 0, 0, ['אורך AB', 'd_{z1z2}'.replace('z2', 'B')]);
    expect(d.knowledge[0].value).toBe('4'); // through the label
    expect(d.knowledge[1].value).toBe('4'); // d_{z1B} — mixed run, through the number and the label
  });

  it('an unbound point still reads its plain name', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0);
    expect(pt(d, 'z1')!.display).toBe('z₁');
  });
});
