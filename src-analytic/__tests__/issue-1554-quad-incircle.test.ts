/**
 * #1554 — THE QUADRILATERAL'S INCIRCLE ON A NAMED CENTRE, THE SIDE LIST, AND THE SENTENCE WITH NO LETTERS (ADR-AG-242).
 *
 * ADR-AG-194/198 shipped both directions over every shape noun. What #1554 still owned, re-measured on main @ 4d6e3fd6
 * through `decideSubmit`:
 *  - «במרובע ABCD חסום מעגל O», «מעגל M חסום במרובע ABCD» — `out-of-scope`: a quadrilateral's incircle centre had no
 *    derived rule, so a centre letter on it was refused (the parity row cat-2d-109 carried `knownGap: #1554`);
 *  - «מעגל M משיק לצלעות AB, BC, CD, DA» — `not-handled` (ruling 2b: the spelled-out incircle must lower to the same
 *    thing as «מעגל M חסום במרובע ABCD»), while the English "circle M is tangent to sides …" built a free circle;
 *  - «מרובע חסום במעגל» with no letters — `not-handled` (prod, log-triage 2026-09-30); 2-D builds it.
 *
 * The locks CALL the product (`decideSubmit`, `derive`, `evalRule`) and measure the drawn geometry independently.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { evalRule, incircleCentre } from '../engine/derived';
import { sameDerivation } from '../engine/sameDerivation';
import { decideSubmit } from '../app/submit';

type P = { x: number; y: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const lineDist = (c: P, a: P, b: P) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / dist(a, b);
const pts = (d: ReturnType<typeof derive>): Record<string, P> => Object.fromEntries(d.figure.points.map((p) => [p.id, p]));
const circles = (d: ReturnType<typeof derive>) =>
  d.figure.curves.filter((c) => c.curve.kind === 'circle').map((c) => ({ id: c.id, ...(c.curve as { cx: number; cy: number; r: number }) }));
const whole = (d: ReturnType<typeof derive>) =>
  d.faults.length === 0 && d.figure.unsatisfied.length === 0 && d.figure.ringFaults.length === 0 && d.figure.selectorsOk;
/** Submit each line in order through the real gate, as the app does; every verdict. */
const play = (lines: readonly string[]) => {
  const acc: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, acc, 0);
    if (v.kind === 'record') acc.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
};
/** The one circle of the figure is tangent to every side of the ring, and `centre` (when given) is its centre. */
function tangentRing(lines: readonly string[], ring: string, centre?: string, seeds: readonly number[] = SEEDS) {
  for (const s of seeds) {
    const d = derive(lines, s);
    expect(whole(d), `${lines.join(' · ')} @${s}`).toBe(true);
    const cs = circles(d);
    expect(cs).toHaveLength(1);
    const [c] = cs;
    const p = pts(d);
    const v = [...ring];
    for (let i = 0; i < v.length; i += 1) {
      expect(Math.abs(lineDist({ x: c.cx, y: c.cy }, p[v[i]], p[v[(i + 1) % v.length]]) - c.r)).toBeLessThan(1e-6);
    }
    if (centre) expect(dist(p[centre], { x: c.cx, y: c.cy })).toBeLessThan(1e-6);
  }
}

describe('#1554 — a centre letter on a quadrilateral`s incircle', () => {
  const SPELLINGS = [
    ['במרובע ABCD חסום מעגל O', 'O'],
    ['מעגל M חסום במרובע ABCD', 'M'],
    ['מעגל חסום במרובע ABCD שמרכזו O', 'O'],
    ['במרובע ABCD חסום מעגל שמרכזו O', 'O'],
    ['circle O is inscribed in quadrilateral ABCD', 'O'],
  ] as const;
  it.each(SPELLINGS)('«%s» records and names the incircle`s centre at 24 seeds', (line, centre) => {
    expect(play([line])).toEqual(['record']);
    tangentRing([line], 'ABCD', centre);
  });

  it('every quadrilateral noun circumscribing a circle on a centre: whole, tangent, centred (the lock table, named)', () => {
    for (const noun of ['מרובע', 'טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית', 'מקבילית', 'מלבן', 'מעוין', 'ריבוע', 'דלתון']) {
      const line = `ב${noun} ABCD חסום מעגל O`;
      expect(play([line]), line).toEqual(['record']);
      tangentRing([line], 'ABCD', 'O', [0, 5, 11, 17, 23]);
    }
  });

  it('«מעגל O חסום במקבילית ABCD» forces a rhombus, «… במלבן» a square', () => {
    for (const s of SEEDS) {
      const p = pts(derive(['מעגל O חסום במקבילית ABCD'], s));
      expect(Math.abs(dist(p.A, p.B) - dist(p.B, p.C))).toBeLessThan(1e-6);
      const q = pts(derive(['מעגל O חסום במלבן ABCD'], s));
      expect(Math.abs(dist(q.A, q.B) - dist(q.B, q.C))).toBeLessThan(1e-6);
    }
  });

  it('«O מרכז המעגל» after the unnamed incircle names the same point (the centre rule of a computed circle)', () => {
    expect(play(['מעגל חסום במרובע ABCD', 'O מרכז המעגל'])).toEqual(['record', 'record']);
    for (const s of [0, 7, 19]) {
      const a = pts(derive(['מעגל חסום במרובע ABCD', 'O מרכז המעגל'], s));
      const b = pts(derive(['במרובע ABCD חסום מעגל O'], s));
      expect(dist(a.O, b.O)).toBeLessThan(1e-9);
    }
  });

  it('a triangle keeps the incentre — the bare letter «מעגל O» is the centre there too', () => {
    expect(play(['במשולש ABC חסום מעגל O'])).toEqual(['record']);
    const d = derive(['במשולש ABC חסום מעגל O'], 0);
    const o = d.construction.objects.find((x) => x.id === 'O');
    expect(o && o.kind === 'derived' ? o.rule.t : null).toBe('incentre');
    tangentRing(['במשולש ABC חסום מעגל O'], 'ABC', 'O', [0, 9]);
  });

  it('a numeral is a circle`s name, never a centre — still refused by name', () => {
    expect(play(['circle I is inscribed in quadrilateral ABCD'])).toEqual(['refused:out-of-scope']);
  });

  it('the derived rule: `incircleCentre``s closed form, one point however the ring is rotated or reversed', () => {
    const at = (id: string) => ({ A: { x: 0, y: 0 }, B: { x: 4, y: 0 }, C: { x: 4, y: 4 }, D: { x: 0, y: 4 } })[id] ?? null;
    expect(evalRule({ t: 'incircle-centre', v: ['A', 'B', 'C', 'D'] }, at)).toEqual(incircleCentre([at('A')!, at('B')!, at('C')!, at('D')!]));
    expect(evalRule({ t: 'incircle-centre', v: ['A', 'B', 'C', 'D'] }, at)).toEqual({ x: 2, y: 2 });
    expect(sameDerivation({ t: 'incircle-centre', v: ['A', 'B', 'C', 'D'] }, { t: 'incircle-centre', v: ['C', 'B', 'A', 'D'] })).toBe(true);
    expect(sameDerivation({ t: 'incircle-centre', v: ['A', 'B', 'C', 'D'] }, { t: 'incircle-centre', v: ['A', 'C', 'B', 'D'] })).toBe(false);
  });
});

describe('#1554 ruling 2b — «מעגל M משיק לצלעות AB, BC, CD, DA» is the spelled-out incircle', () => {
  const SENTENCE = ['מרובע ABCD', 'מעגל M חסום במרובע ABCD'];
  const LISTS = [
    ['מרובע ABCD', 'מעגל M משיק לצלעות AB, BC, CD, DA'],
    ['מרובע ABCD', 'מעגל M משיק לצלעות AB, BC, CD ו-DA'],
    ['מרובע ABCD', 'circle M is tangent to the sides AB, BC, CD and DA'],
  ];
  it.each(LISTS)('%s · %s ≡ the incircle sentence — the same points at 24 seeds', (...lines) => {
    expect(play(lines)).toEqual(['record', 'record']);
    for (const s of SEEDS) {
      const a = pts(derive(SENTENCE, s));
      const b = pts(derive(lines, s));
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      for (const k of Object.keys(a)) expect(dist(a[k], b[k])).toBeLessThan(1e-9);
    }
    tangentRing(lines, 'ABCD', 'M');
  });

  it('a triangle`s list is its incircle on the incentre', () => {
    const lines = ['משולש ABC', 'מעגל M משיק לצלעות AB, BC ו-CA'];
    expect(play(lines)).toEqual(['record', 'record']);
    tangentRing(lines, 'ABC', 'M', [0, 4, 12]);
  });

  it('a SUBSET of the sides is a circle on M touching those two — never the incircle', () => {
    const lines = ['מרובע ABCD', 'מעגל M משיק לצלעות AB ו-BC'];
    expect(play(lines)).toEqual(['record', 'record']);
    const d = derive(lines, 0);
    expect(circles(d).map((c) => c.id)).toEqual(['circle-at-M']);
    const p = pts(d);
    const [c] = circles(d);
    expect(Math.abs(lineDist(p.M, p.A, p.B) - c.r)).toBeLessThan(1e-6);
    expect(Math.abs(lineDist(p.M, p.B, p.C) - c.r)).toBeLessThan(1e-6);
  });

  it('a circle M the figure already has is the circle the list is about — one circle, tangent to all four sides', () => {
    const lines = ['מרובע ABCD', 'מעגל M', 'מעגל M משיק לצלעות AB, BC, CD ו-DA'];
    expect(play(lines)).toEqual(['record', 'record', 'record']);
    tangentRing(lines, 'ABCD', 'M', [0, 6, 13]);
    expect(circles(derive(lines, 0)).map((c) => c.id)).toEqual(['circle-at-M']);
  });

  it('the four one-side lines build the same GEOMETRY (tangent to all four sides at every seed) — a solved circle on M', () => {
    const lines = ['מרובע ABCD', 'מעגל M משיק לצלע AB', 'מעגל M משיק לצלע BC', 'מעגל M משיק לצלע CD', 'מעגל M משיק לצלע DA'];
    expect(play(lines)).toEqual(['record', 'record', 'record', 'record', 'record']);
    tangentRing(lines, 'ABCD', 'M', [0, 8, 16]);
  });
});

describe('#1554 — the sentence with no letters (2-D builds it; the tool letters the ring)', () => {
  it.each([
    ['מרובע חסום במעגל', 'ABCD', 'circle-thru-ABC'],
    ['טרפז חסום במעגל', 'ABCD', 'circle-thru-ABC'],
    ['ריבוע חסום במעגל', 'ABCD', 'circle-thru-ABC'],
    ['משולש חסום במעגל', 'ABC', 'circle-thru-ABC'],
    ['מעגל חסום במרובע', 'ABCD', 'circle-in-ABCD'],
    ['מעגל חסום בדלתון', 'ABCD', 'circle-in-ABCD'],
    ['a quadrilateral is inscribed in a circle', 'ABCD', 'circle-thru-ABC'],
  ])('«%s» records as the lettered sentence: ring %s, %s', (line, ring, circle) => {
    expect(play([line])).toEqual(['record']);
    const d = derive([line], 0);
    expect(d.figure.points.map((p) => p.id).join('')).toBe(ring);
    expect(circles(d).map((c) => c.id)).toEqual([circle]);
    const lettered = line.startsWith('a ') ? 'מרובע ABCD חסום במעגל' : line.replace(/^(\S+) חסום (במעגל)$/, `$1 ${ring} חסום $2`).replace(/^(מעגל חסום ב\S+)$/, `$1 ${ring}`);
    for (const s of [0, 3, 11]) {
      const a = pts(derive([line], s));
      const b = pts(derive([lettered], s));
      for (const k of Object.keys(b)) expect(dist(a[k], b[k]), `${line} vs ${lettered} @${s}`).toBeLessThan(1e-9);
    }
  });

  it('the next free letters after a ring the figure has', () => {
    expect(play(['מרובע', 'מרובע חסום במעגל'])).toEqual(['record', 'record']);
    expect(derive(['מרובע', 'מרובע חסום במעגל'], 0).figure.points.map((p) => p.id).join('')).toBe('ABCDEFGH');
  });

  it('REFUSED: «טרפז ישר זווית חסום במעגל» contradicts its noun, lettered or not (operator ruling 2026-10-01)', () => {
    expect(play(['טרפז ישר זווית חסום במעגל'])).toEqual(['refused:inscribed-contradicts-noun']);
    expect(play(['טרפז ישר זווית ABCD חסום במעגל'])).toEqual(['refused:inscribed-contradicts-noun']);
  });

  it('a DEFINITE noun refers to a ring — «המרובע חסום במעגל» is not this rule', () => {
    expect(play(['המרובע חסום במעגל'])).toEqual(['refused:not-handled']);
  });
});
