/**
 * #2733 ([ADR-AG-428](../../docs/06c-decisions-analytic.md#adr-ag-428)) — A TRUE CROSSING THAT LANDS ON A POINT THE FIGURE
 * ALREADY HAS IS RECORDED ON IT, AND THE PAGE SAYS SO.
 *
 * «נתון מעגל שמרכזו M(0,3) ורדיוסו 5 · P(-4,0) · הישר x=-4 חותך את המעגל בנקודות K ו-L» was refused `unsatisfiable`,
 * though the crossings are (-4,0) and (-4,6). `crossingPartners` kept K apart from L and P, and L apart from K and P:
 * three separate points on two roots. Now an earlier point is a partner only while the pair has a root that neither an
 * earlier point nor a sibling holds, so one letter lands on P, the other on (-4,6), and the page says «P ו-K נפלו על
 * אותה נקודה.». And a touch point named by its own tangency sentence is never "a second crossing" (the #1924 arm).
 *
 * Operator, 2026-11-07 on this issue: accept L as a second name for the point (*"yes"*); ADR-W-177, 2026-11-02:
 * *"accept with message"*.
 *
 * pipeline-lock: the verdict is a refused line turned recorded, with WHICH letters share a point. Each row walks the
 * student's door (`decideSubmit`, line by line, in the configuration the last line drew) and reads the drawn figure's
 * coincidences (`coincidencesOf`); the fixtures net asserts only that a saved figure builds, and covers one spelling.
 */
import { describe, expect, it } from 'vitest';
import { coincidencesOf } from '../app/coincidences';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import type { Seed } from '../engine/evaluate';
import type { InputError } from '../store/useAnalyticStore';
import operator from './fixtures/issue-2733-crossing-on-p.analytic.json';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
type Pt = readonly [number, number];

/** Every line through the real door; the drawn figure, its coincidences, and a point lookup. */
function walk(lines: readonly string[], seed: number) {
  const held: string[] = [];
  let conf: Seed = seed;
  for (const line of lines) {
    const v = decideSubmit(line, held, conf);
    expect(v.kind, `«${line}» at seed ${seed}`).toBe('record');
    if (v.kind !== 'record') break;
    held.push(v.line);
    conf = v.configuration ?? conf;
  }
  const d = derive(held, conf);
  const at = (id: string) => d.figure.points.find((p) => p.id === id);
  return { d, at, coincidences: coincidencesOf(d) };
}

const near = (p: { x: number; y: number } | undefined, [x, y]: Pt) => !!p && Math.hypot(p.x - x, p.y - y) < 1e-6;

/**
 * The class row's promise: the lines record with no fault; exactly one coincidence, P with one of the two letters; the
 * other letter on the free root; P (and any fixed point named) unmoved.
 */
function landsOnP(lines: readonly string[], seed: number, letters: readonly [string, string], p: Pt, free: Pt, fixed: Record<string, Pt> = {}) {
  const { d, at, coincidences } = walk(lines, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  expect(coincidences.length, `seed ${seed}: ${JSON.stringify(coincidences)}`).toBe(1);
  const pair = coincidences[0];
  expect(pair, `seed ${seed}`).toContain('P');
  const onP = pair.find((id) => id !== 'P')!;
  expect(letters, `seed ${seed}`).toContain(onP);
  const other = letters.find((id) => id !== onP)!;
  expect(near(at(onP), p), `${onP} on P at seed ${seed}`).toBe(true);
  expect(near(at(other), free), `${other} on the free root at seed ${seed}`).toBe(true);
  expect(near(at('P'), p), `P unmoved at seed ${seed}`).toBe(true);
  for (const [id, q] of Object.entries(fixed)) expect(near(at(id), q), `${id} unmoved at seed ${seed}`).toBe(true);
}

const CIRCLE = 'נתון מעגל שמרכזו M(0,3) ורדיוסו 5';
const P = 'P(-4,0)';
const ON_P: Pt = [-4, 0];
const FREE: Pt = [-4, 6];
const M = { M: [0, 3] as Pt };

describe('#2733 — the operator’s lines (fixture)', () => {
  it.each(SEEDS)('seed %i: records, one of K and L on P, the other at (-4, 6), M and P unmoved', (seed) => {
    landsOnP(operator.lines, seed, ['K', 'L'], ON_P, FREE, M);
  });
});

/** Every sibling of the sentence: the crossing line(s), with P typed before them and after them. */
const SIBLINGS: Array<[string, string[]]> = [
  ['the verb, «בנקודות K ו-L»', ['הישר x=-4 חותך את המעגל בנקודות K ו-L']],
  ['the mirrored order, «L ו-K»', ['הישר x=-4 חותך את המעגל בנקודות L ו-K']],
  ['the noun, «K ו-L נקודות החיתוך»', ['K ו-L נקודות החיתוך של הישר x=-4 עם המעגל']],
  ['the plural verb, «נחתכים»', ['הישר x=-4 והמעגל נחתכים בנקודות K ו-L']],
  ['two sentences, «האחרת»', ['K נקודת החיתוך של הישר x=-4 עם המעגל', 'L נקודת החיתוך האחרת של הישר x=-4 עם המעגל']],
  ['two sentences, the same noun twice', ['K נקודת החיתוך של הישר x=-4 עם המעגל', 'L נקודת החיתוך של הישר x=-4 עם המעגל']],
  ['a named line', ['נתון הישר l: x=-4', 'הישר l חותך את המעגל בנקודות K ו-L']],
];

describe('#2733 — every spelling, P before the crossing', () => {
  for (const [name, crossing] of SIBLINGS) {
    it(name, () => {
      for (const seed of SEEDS) landsOnP([CIRCLE, P, ...crossing], seed, ['K', 'L'], ON_P, FREE, M);
    });
  }
});

describe('#2733 — every spelling, P after the crossing (unchanged)', () => {
  for (const [name, crossing] of SIBLINGS) {
    it(name, () => {
      for (const seed of SEEDS) landsOnP([CIRCLE, ...crossing, P], seed, ['K', 'L'], ON_P, FREE, M);
    });
  }
});

describe('#2733 — the class beyond the sentence', () => {
  it('English', () => {
    const lines = ['circle with centre M(0,3) and radius 5', 'P(-4,0)', 'the line x=-4 cuts the circle at points K and L'];
    for (const seed of SEEDS) landsOnP(lines, seed, ['K', 'L'], ON_P, FREE, M);
  });

  it('a line through P, «הישר PQ»', () => {
    for (const seed of SEEDS) landsOnP([CIRCLE, P, 'Q(-4,10)', 'הישר PQ חותך את המעגל בנקודות K ו-L'], seed, ['K', 'L'], ON_P, FREE, { ...M, Q: [-4, 10] });
  });

  it('the circle cuts the x-axis, «המעגל חותך את ציר ה-x»', () => {
    for (const seed of SEEDS) landsOnP([CIRCLE, P, 'המעגל חותך את ציר ה-x בנקודות K ו-L'], seed, ['K', 'L'], ON_P, [4, 0], M);
  });

  it('a radius given as a parameter, P on the circle', () => {
    const lines = ['נתון מעגל שמרכזו M(0,3) ורדיוסו r', P, 'P על המעגל', 'הישר x=-4 חותך את המעגל בנקודות K ו-L'];
    for (const seed of SEEDS) landsOnP(lines, seed, ['K', 'L'], ON_P, FREE, M);
  });

  it('the other circle of the issue, «x^2+y^2=25 · P(3,4) · הישר y=4»', () => {
    for (const seed of SEEDS) landsOnP(['x^2+y^2=25', 'P(3,4)', 'הישר y=4 חותך את המעגל בנקודות K ו-L'], seed, ['K', 'L'], [3, 4], [-3, 4]);
  });

  it('an ellipse, P(4, 9/5)', () => {
    for (const seed of SEEDS) landsOnP(['x^2/25+y^2/9=1', 'P(4,9/5)', 'הישר x=4 חותך את האליפסה בנקודות K ו-L'], seed, ['K', 'L'], [4, 1.8], [4, -1.8]);
  });

  it('a parabola, P(4, 4)', () => {
    for (const seed of SEEDS) landsOnP(['y^2=4x', 'P(4,4)', 'הישר x=4 חותך את הפרבולה בנקודות K ו-L'], seed, ['K', 'L'], [4, 4], [4, -4]);
  });

  it('a parabola, P(1, 2): one letter on P, the other at (1, -2) (it drew all three on one dot)', () => {
    for (const seed of SEEDS) landsOnP(['y^2=4x', 'P(1,2)', 'הישר x=1 חותך את הפרבולה בנקודות K ו-L'], seed, ['K', 'L'], [1, 2], [1, -2]);
  });

  it('2-D’s catalogue sentence: one of C and D on A, the other apart', () => {
    for (const seed of SEEDS) {
      const { d, coincidences } = walk(['מעגל O', 'A על מעגל O', 'הישר AO חותך את מעגל O בנקודות C ו-D'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(coincidences.length, `seed ${seed}`).toBe(1);
      expect(coincidences[0], `seed ${seed}`).toContain('A');
    }
  });
});

describe('#2733 — a touch point named by its own tangency sentence lands on the point already there', () => {
  const rows: Array<[string, string[], string, Pt]> = [
    ['a circle', ['x^2+y^2=25', 'T(0,5)', 'הישר y=5 משיק למעגל בנקודה K'], 'K', [0, 5]],
    ['a parabola', ['y^2=4x', 'T(0,0)', 'הישר x=0 משיק לפרבולה בנקודה K'], 'K', [0, 0]],
    ['an ellipse', ['x^2/25+y^2/9=1', 'T(5,0)', 'הישר x=5 משיק לאליפסה בנקודה K'], 'K', [5, 0]],
  ];
  it.each(rows)('%s: records, K on T, the notice pair [T, K]', (_name, lines, id, t) => {
    for (const seed of [0, 1, 2]) {
      const { d, at, coincidences } = walk(lines, seed);
      expect(d.faults).toEqual([]);
      expect(coincidences).toEqual([['T', id]]);
      expect(near(at(id), t)).toBe(true);
    }
  });
});

describe('#2733 — controls: what was right stays right', () => {
  const lastRefused = (lines: readonly string[]): InputError => {
    for (let i = 0; i < lines.length - 1; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind).toBe('record');
    const v = decideSubmit(lines[lines.length - 1], lines.slice(0, -1), 0);
    expect(v.kind, `«${lines[lines.length - 1]}»`).toBe('refused');
    return (v as { error: InputError }).error;
  };

  it('P off the circle: K and L on the two crossings, P apart, no notice', () => {
    for (const seed of [0, 1, 2]) {
      const { d, at, coincidences } = walk([CIRCLE, 'P(-4,1)', 'הישר x=-4 חותך את המעגל בנקודות K ו-L'], seed);
      expect(d.faults).toEqual([]);
      expect(coincidences).toEqual([]);
      expect([at('K'), at('L')].filter((p) => near(p, ON_P) || near(p, FREE))).toHaveLength(2);
    }
  });

  it('«בנקודות K ו-P» with P off the circle is still refused, naming P', () => {
    expect(lastRefused([CIRCLE, 'P(-4,1)', 'הישר x=-4 חותך את המעגל בנקודות K ו-P'])).toMatchObject({ key: 'unsatisfiable', reusedId: 'P' });
  });

  it('a single crossing with P on one root takes the other (ADR-AG-350)', () => {
    for (const seed of [0, 1, 2]) {
      const { d, at, coincidences } = walk([CIRCLE, P, 'הישר x=-4 חותך את המעגל בנקודה K'], seed);
      expect(d.faults).toEqual([]);
      expect(coincidences).toEqual([]);
      expect(near(at('K'), FREE)).toBe(true);
    }
  });

  it('both roots named: K on P and L on Q, two notices', () => {
    const { d, coincidences } = walk([CIRCLE, P, 'Q(-4,6)', 'הישר x=-4 חותך את המעגל בנקודות K ו-L'], 0);
    expect(d.faults).toEqual([]);
    expect(coincidences).toEqual([['P', 'K'], ['Q', 'L']]);
  });

  it('a tangent line asked for two crossings is still refused', () => {
    expect(lastRefused(['x^2+y^2=25', 'הישר y=5 חותך את המעגל בנקודות K ו-L'])).toMatchObject({ key: 'unsatisfiable' });
    expect(lastRefused(['x^2+y^2=25', 'T(0,5)', 'הישר y=5 חותך את המעגל בנקודות K ו-L'])).toMatchObject({ key: 'tangent-no-second-crossing', id: 'K' });
  });

  it('a point stated on the circle and on the tangent at T is still refused (#1924)', () => {
    expect(lastRefused(['x^2+y^2=25', 'T(0,5)', 'נתון הישר l: y=5', 'K על המעגל', 'K על הישר l'])).toMatchObject({ key: 'tangent-no-second-crossing', id: 'K' });
  });
});
