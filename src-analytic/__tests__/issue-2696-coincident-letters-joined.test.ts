/**
 * #2696 (ADR-AG-393) — TWO LETTERS ON ONE DOT ARE WRITTEN «C=E», AS 2-D WRITES THEM (ADR-486).
 *
 * The operator's #2691 figure: E (the altitude's foot from A) lands on C, and analytic wrote the two letters side by
 * side — «CE». Ruled 2026-11-04 (card q5 = A): match 2-D. The join is 2-D's own rule, hoisted to `shell/converge`
 * (`mergedLabels`), and both builders' scenes read it, so this file locks the analytic scene and the shared rule.
 *
 * The pairs are the ones R214's notice reads (`coincidencesOf`), as `App.tsx` hands them to `buildScene`.
 */
import { describe, expect, it } from 'vitest';
import { mergedLabels } from '../../shell/converge';
import { coincidencesOf } from '../app/coincidences';
import { derive } from '../engine/derive';
import { buildScene, hasLetter } from '../render/scene';

const OPERATOR = ['משולש ABC', 'A(8,-2)', 'משוואת הצלע BC היא x-y+2=0', 'P מפגש תיכונים', 'שיעור ה- x של P הוא 3', 'AD תיכון', 'AE גובה', 'שטח ABC הוא 18'];

const sceneOf = (lines: readonly string[], seed: number) => {
  const d = derive([...lines], seed);
  return { pairs: coincidencesOf(d), scene: buildScene(d.figure, d.box, 720, 720, { coincidences: coincidencesOf(d) }) };
};

describe('#2696 — the operator figure', () => {
  it.each([0, 1, 2, 3])('seed %i: E on a vertex is ONE label «X=E», and E writes no letter of its own', (seed) => {
    const { pairs, scene } = sceneOf(OPERATOR, seed);
    expect(pairs.length, 'the figure has the coincidence (the premise)').toBe(1);
    const [a, b] = [...pairs[0]].sort();
    const carrier = scene.points.find((p) => p.id === a)!;
    const other = scene.points.find((p) => p.id === b)!;
    expect(carrier.label).toBe(`${a}=${b}`);
    expect(other.label).toBe('');
    expect(hasLetter(other)).toBe(false);
    expect(other.at, 'no letter is placed for the silent member').toBeUndefined();
    // both points stay: ids, positions
    expect(Math.hypot(carrier.cx - other.cx, carrier.cy - other.cy)).toBeLessThan(1);
    // every other letter is untouched
    for (const p of scene.points) if (p !== carrier && p !== other) expect(p.label).toBe(p.id);
  });

  it('without the pairs (a caller that hands none), the letters are the two letters — the old drawing', () => {
    const d = derive(OPERATOR, 0);
    const s = buildScene(d.figure, d.box, 720, 720, {});
    expect(s.points.some((p) => p.label.includes('='))).toBe(false);
  });
});

describe('#2696 — the carrier keeps the dot\'s stated coordinates', () => {
  it('«V(0,0) · Y on y=x · x of Y is 0»: V=Y writes V\'s (0, 0)', () => {
    const { pairs, scene } = sceneOf(['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x', 'שיעור ה-x של Y הוא 0'], 0);
    expect(pairs).toEqual([['V', 'Y']]);
    const v = scene.points.find((p) => p.id === 'V')!;
    expect(v.label).toBe('V=Y');
    expect(v.coords?.map((c) => c.text)).toEqual(['0', '0']);
  });
});

describe('#2696 — the shared rule (2-D\'s ADR-486, in shell)', () => {
  it('a pair joins alphabetically on its first id', () => {
    expect([...mergedLabels([['E', 'C']])]).toEqual([['C', 'C=E'], ['E', '']]);
  });
  it('a chain is one group', () => {
    const m = mergedLabels([['B', 'C'], ['A', 'B']]);
    expect(m.get('A')).toBe('A=B=C');
    expect(m.get('B')).toBe('');
    expect(m.get('C')).toBe('');
  });
  it('two separate pairs are two labels', () => {
    const m = mergedLabels([['A', 'B'], ['C', 'D']]);
    expect(m.get('A')).toBe('A=B');
    expect(m.get('C')).toBe('C=D');
  });
  it('no pairs, no merge', () => {
    expect(mergedLabels([]).size).toBe(0);
  });
});
