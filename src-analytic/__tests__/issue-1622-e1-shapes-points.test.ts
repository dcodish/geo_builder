/**
 * #1622 slice E1 (ADR-AG-217) — the shapes and points 2-D reads, ported to analytic: a bare letter run, the regular
 * polygon and the five-to-eight-sided nouns, a shape that states its size (with or without letters), a polygon
 * inscribed in a triangle, a point at a fraction of a segment, at two distances, on a carrier at a distance, an
 * unlettered midpoint, inside / outside a polygon, on a side of a line, ordered collinear points, an unlettered line
 * carrying points, and a bound on a length.
 *
 * 2-D's verdict is the reference (operator ruling 2026-10-02); each sentence's 2-D verdict and the points it introduces
 * were measured through `decideDeterministic2D` and are in the ADR. Every assertion here goes through the real path —
 * `decideSubmit` for the verdict, `derive` (parse → tool letters → fold → solve → drawable configuration) for the
 * figure — and the geometry is measured on the drawn figure at several seeds.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { decideRename, type RenameState } from '../app/rename';

type P = { x: number; y: number };
const SEEDS = [0, 1, 2, 3, 4, 5];
const EPS = 1e-6;

const fig = (lines: readonly string[], seed = 0) => {
  const d = derive(lines, seed);
  expect(d.faults, `faults @${seed}: ${lines.join(' | ')}`).toEqual([]);
  expect(d.figure.unsatisfied, `unsatisfied @${seed}: ${lines.join(' | ')}`).toEqual([]);
  expect(d.figure.selectorsOk, `selectors @${seed}: ${lines.join(' | ')}`).toBe(true);
  expect(d.figure.ringFaults, `ring @${seed}: ${lines.join(' | ')}`).toEqual([]);
  return d;
};
const pt = (d: ReturnType<typeof derive>, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const angleAt = (v: P, a: P, b: P) =>
  (Math.acos(((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (dist(v, a) * dist(v, b))) * 180) / Math.PI;
/** `p` on the closed segment `ab` (collinear and between). */
const onSegment = (p: P, a: P, b: P) => {
  const l = dist(a, b);
  return Math.abs(cross(a, b, p)) / l < 1e-6 * Math.max(1, l) && dist(a, p) + dist(p, b) - l < 1e-6 * Math.max(1, l);
};
const insideTriangle = (p: P, a: P, b: P, c: P) => {
  const s = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
  return s.every((x) => x > 0) || s.every((x) => x < 0);
};

/** The verdict the app gives the LAST line, every earlier accepted line recorded first. */
const verdictOf = (lines: readonly string[]): string => {
  const prior: string[] = [];
  let last: ReturnType<typeof decideSubmit> | null = null;
  for (const line of lines) {
    last = decideSubmit(line, prior, 0);
    if (last.kind === 'record') prior.push(last.line);
  }
  return last!.kind === 'refused' ? last!.error.key : last!.kind;
};

describe('every #1622 E1 sentence builds — the verdict 2-D gives (decideSubmit)', () => {
  it.each([
    [['ABCD']],
    [['ABC']],
    [['ריבוע ABCD שצלעו הוא 1']],
    [['ריבוע שצלעו 4']],
    [['ריבוע']],
    [['מלבן במידות 4*6']],
    [['מלבן ABCD 4 על 6']],
    [['מחומש ABCDE']],
    [['משושה ABCDEF']],
    [['מתומן ABCDEFGH']],
    [['מחומש משוכלל ABCDE']],
    [['משושה משוכלל ABCDEF']],
    [['מחומש משוכלל']],
    [['הנקודה E נמצאת בתוך המשולש KAO']],
    [['משולש ABC', 'C במרחק 5 מ-A ו-5 מ-B']],
    [['משולש ABC', 'D על AB במרחק 3 מ-A']],
    [['מעוין BDEF חסום במשולש ABC']],
    [['מלבן DEFG חסום במשולש ABC']],
    [['ריבוע DEFG חסום במשולש ABC']],
    [['נקודה E על AC ב-40%']],
    [['משולש ABC', 'אמצע AB']],
    [['C ו-D בצדדים שונים של AB']],
    [['קו ועליו נקודה A']],
    [['משולש ABC', 'ישר ABE']],
    [['5 < AB < 9']],
    // English, the same sentences
    [['square ABCD whose side is 1']],
    [['regular pentagon ABCDE']],
    [['rectangle 4 by 6']],
    [['point E inside triangle KAO']],
    [['triangle ABC', 'C is 5 from A and 5 from B']],
    [['triangle ABC', 'D on AB at a distance of 3 from A']],
    [['rhombus BDEF inscribed in triangle ABC']],
    [['E on AC at 40%']],
    [['triangle ABC', 'midpoint of AB']],
    [['C and D are on different sides of AB']],
    [['a line with point A on it']],
    [['triangle ABC', 'line ABE']],
    [['AB > 5']],
  ] as const)('%j', (lines) => {
    expect(verdictOf(lines)).toBe('record');
  });

  it('«מלבן ABCD שצלעו 4» ASKS which side — a rectangle\'s «its side» is an unstated pick (2-D: sideUnspecified)', () => {
    expect(verdictOf(['מלבן ABCD שצלעו 4'])).toBe('ambiguous-side');
  });
  it('«משובע ABCDEFG» is refused by name — 2-D builds a heptagon only when regular (#835)', () => {
    expect(verdictOf(['משובע ABCDEFG'])).toBe('polygon-not-supported');
    expect(verdictOf(['משובע משוכלל ABCDEFG'])).toBe('record');
  });
  it('a definite noun alone REFERS («המשולש»): it is not a new unlettered shape', () => {
    expect(verdictOf(['המשולש'])).not.toBe('record');
  });
});

describe('the tool letters an unlettered shape or line with 2-D\'s letters (ADR-AG-211)', () => {
  const minted = (lines: readonly string[]) => fig(lines).minted.map((m) => m.id);
  it.each([
    [['ריבוע שצלעו 4'], ['A', 'B', 'C', 'D']],
    [['ריבוע'], ['A', 'B', 'C', 'D']],
    [['מלבן במידות 4*6'], ['A', 'B', 'C', 'D']],
    [['מחומש משוכלל'], ['A', 'B', 'C', 'D', 'E']],
    [['נקודה A', 'משולש'], ['B', 'C', 'D']],
    [['ריבוע', 'ריבוע'], ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']],
    [['קו ועליו נקודה A'], ['B', 'C']],
    [['קו ועליו נקודות A ו-B'], ['C', 'D']],
    [['משולש ABC', 'אמצע AB'], ['M']],
    [['משולש ABC', 'נקודה M', 'אמצע AB'], ['N']],
  ] as const)('%j → %j', (lines, want) => {
    expect(minted(lines)).toEqual(want);
  });

  it('an unlettered midpoint is the SAME point as the student\'s own midpoint of that pair (#1153)', () => {
    expect(verdictOf(['משולש ABC', 'M אמצע AB', 'אמצע AB'])).toMatch(/already/);
  });

  it.each([
    [['ריבוע שצלעו 4'], 'A', 'ריבוע KBCD שצלעו 4'],
    [['מלבן במידות 4*6'], 'C', 'מלבן ABKD במידות 4*6'],
    [['משולש ABC', 'אמצע AB'], 'M', 'K אמצע AB'],
  ] as const)('a tool letter is renameable — %j, %s → K, written into the sentence', (lines, from, expected) => {
    const state: RenameState = { lines: [...lines], disabled: [], queries: [], spokenFor: {}, seed: 0 };
    const r = decideRename(from, 'K', state);
    expect(r.kind, JSON.stringify(r)).toBe('apply');
    if (r.kind !== 'apply') return;
    expect(r.lines[r.lines.length - 1]).toBe(expected);
    // The session's seed names follow the letter (#1631), so the renamed point stays where it was.
    const after = derive(r.lines, 0, r.seedNames);
    expect(after.faults).toEqual([]);
    expect(pt(after, 'K').x).toBeCloseTo(pt(fig(lines), from).x, 9);
    expect(pt(after, 'K').y).toBeCloseTo(pt(fig(lines), from).y, 9);
  });
});

describe('the figures, measured at six seeds', () => {
  it.each(SEEDS)('«ריבוע ABCD שצלעו הוא 1» and «ריבוע שצלעו 4» are squares of side 1 and 4 (seed %i)', (seed) => {
    for (const [lines, side] of [
      [['ריבוע ABCD שצלעו הוא 1'], 1],
      [['ריבוע שצלעו 4'], 4],
      [['square ABCD whose side is √2'], Math.SQRT2],
    ] as const) {
      const d = fig(lines, seed);
      const [a, b, c, e] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
      for (const [p, q] of [[a, b], [b, c], [c, e], [e, a]]) expect(dist(p, q)).toBeCloseTo(side, 5);
      expect(angleAt(b, a, c)).toBeCloseTo(90, 4);
    }
  });

  it.each(SEEDS)('«מלבן במידות 4*6» is a 4 × 6 rectangle, AB the 4 (seed %i)', (seed) => {
    const d = fig(['מלבן במידות 4*6'], seed);
    const [a, b, c, e] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
    expect(dist(a, b)).toBeCloseTo(4, 5);
    expect(dist(b, c)).toBeCloseTo(6, 5);
    expect(angleAt(b, a, c)).toBeCloseTo(90, 4);
    expect(dist(c, e)).toBeCloseTo(4, 5);
  });

  it.each(SEEDS)('a regular polygon has equal sides and equal (n−2)·180/n angles; the bare noun asserts neither (seed %i)', (seed) => {
    for (const [line, ids] of [
      ['מחומש משוכלל ABCDE', 'ABCDE'],
      ['משושה משוכלל ABCDEF', 'ABCDEF'],
      ['מתומן משוכלל ABCDEFGH', 'ABCDEFGH'],
    ] as const) {
      const d = fig([line], seed);
      const v = [...ids].map((id) => pt(d, id));
      const n = v.length;
      const s0 = dist(v[0], v[1]);
      for (let i = 0; i < n; i += 1) {
        expect(dist(v[i], v[(i + 1) % n])).toBeCloseTo(s0, 6);
        expect(angleAt(v[i], v[(i + n - 1) % n], v[(i + 1) % n])).toBeCloseTo(((n - 2) * 180) / n, 4);
      }
    }
    const bare = fig(['מחומש ABCDE'], seed);
    const v = [...'ABCDE'].map((id) => pt(bare, id));
    const sides = v.map((p, i) => dist(p, v[(i + 1) % 5]));
    expect(Math.max(...sides) - Math.min(...sides)).toBeGreaterThan(EPS);
  });

  it('a regular polygon moves under «הציגו תצורה אחרת» — its size and place are free (ADR-052)', () => {
    const at = (seed: number) => pt(fig(['מחומש משוכלל ABCDE'], seed), 'A');
    expect(dist(at(0), at(1))).toBeGreaterThan(EPS);
  });

  it.each(SEEDS)('«הנקודה E נמצאת בתוך המשולש KAO» puts E inside; «מחוץ ל» outside (seed %i)', (seed) => {
    const d = fig(['הנקודה E נמצאת בתוך המשולש KAO'], seed);
    expect(insideTriangle(pt(d, 'E'), pt(d, 'K'), pt(d, 'A'), pt(d, 'O'))).toBe(true);
    const o = fig(['משולש ABC', 'הנקודה D נמצאת מחוץ למשולש ABC'], seed);
    expect(insideTriangle(pt(o, 'D'), pt(o, 'A'), pt(o, 'B'), pt(o, 'C'))).toBe(false);
  });

  it.each(SEEDS)('«C במרחק 5 מ-A ו-5 מ-B» and «D על AB במרחק 3 מ-A» (seed %i)', (seed) => {
    const d = fig(['משולש ABC', 'C במרחק 5 מ-A ו-5 מ-B'], seed);
    expect(dist(pt(d, 'C'), pt(d, 'A'))).toBeCloseTo(5, 5);
    expect(dist(pt(d, 'C'), pt(d, 'B'))).toBeCloseTo(5, 5);
    const e = fig(['משולש ABC', 'D על AB במרחק 3 מ-A'], seed);
    expect(dist(pt(e, 'D'), pt(e, 'A'))).toBeCloseTo(3, 5);
    expect(onSegment(pt(e, 'D'), pt(e, 'A'), pt(e, 'B'))).toBe(true);
  });

  it.each(SEEDS)('a shape inscribed in a triangle: every vertex on a side, the shape honoured (seed %i)', (seed) => {
    const rh = fig(['מעוין BDEF חסום במשולש ABC'], seed);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => pt(rh, id));
    const [D, E, F] = ['D', 'E', 'F'].map((id) => pt(rh, id));
    const sides: Array<[P, P]> = [[A, B], [B, C], [C, A]];
    for (const p of [D, E, F]) expect(sides.some(([a, b]) => onSegment(p, a, b))).toBe(true);
    for (const [p, q] of [[D, E], [E, F], [F, B]]) expect(dist(p, q)).toBeCloseTo(dist(B, D), 5);

    for (const [line, right] of [
      ['מלבן DEFG חסום במשולש ABC', false],
      ['ריבוע DEFG חסום במשולש ABC', true],
    ] as const) {
      const d = fig([line], seed);
      const [a, b, c] = ['A', 'B', 'C'].map((id) => pt(d, id));
      const v = ['D', 'E', 'F', 'G'].map((id) => pt(d, id));
      const tri: Array<[P, P]> = [[a, b], [b, c], [c, a]];
      for (const p of v) expect(tri.some(([x, y]) => onSegment(p, x, y))).toBe(true);
      for (let i = 0; i < 4; i += 1) expect(angleAt(v[i], v[(i + 3) % 4], v[(i + 1) % 4])).toBeCloseTo(90, 4);
      if (right) expect(dist(v[0], v[1])).toBeCloseTo(dist(v[1], v[2]), 5);
    }
  });

  it('«הציגו תצורה אחרת» cycles the rhombus\'s mirror placement — D on BC, then D on BA (2-D\'s variant)', () => {
    const where = (seed: number) => {
      const d = fig(['מעוין BDEF חסום במשולש ABC'], seed);
      return onSegment(pt(d, 'D'), pt(d, 'B'), pt(d, 'C')) ? 'BC' : 'BA';
    };
    expect(new Set([0, 3, 6, 7, 8, 9, 10, 11].map(where))).toEqual(new Set(['BC', 'BA']));
  });

  it.each(SEEDS)('«המעגל החוסם את משולש ABC חותך את CE בנקודה D» states the circumcircle: D on it, on CE, not C (seed %i)', (seed) => {
    const d = fig(['משולש ABC', 'נקודה E', 'נקודה D', 'המעגל החוסם את משולש ABC חותך את CE בנקודה D'], seed);
    const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((id) => pt(d, id));
    // the circumcentre, from the three vertices
    const k = 2 * cross(A, B, C);
    const sq = (p: P) => p.x * p.x + p.y * p.y;
    const O = {
      x: (sq(A) * (B.y - C.y) + sq(B) * (C.y - A.y) + sq(C) * (A.y - B.y)) / k,
      y: (sq(A) * (C.x - B.x) + sq(B) * (A.x - C.x) + sq(C) * (B.x - A.x)) / k,
    };
    expect(dist(O, D)).toBeCloseTo(dist(O, A), 5);
    expect(Math.abs(cross(C, E, D)) / dist(C, E)).toBeLessThan(1e-6 * Math.max(1, dist(C, E)));
    expect(dist(C, D)).toBeGreaterThan(1e-3);
  });

  it.each(SEEDS)('«נקודה E על AC ב-40%» is 40% of the way from A (seed %i)', (seed) => {
    const d = fig(['נקודה E על AC ב-40%'], seed);
    const [A, C, E] = ['A', 'C', 'E'].map((id) => pt(d, id));
    expect(dist(A, E) / dist(A, C)).toBeCloseTo(0.4, 6);
    expect(onSegment(E, A, C)).toBe(true);
  });

  it.each(SEEDS)('«אמצע AB» is the midpoint M (seed %i)', (seed) => {
    const d = fig(['משולש ABC', 'אמצע AB'], seed);
    const [A, B, M] = ['A', 'B', 'M'].map((id) => pt(d, id));
    expect(dist(M, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 })).toBeLessThan(EPS);
  });

  it.each(SEEDS)('«C ו-D בצדדים שונים של AB» / «באותו צד» (seed %i)', (seed) => {
    const d = fig(['C ו-D בצדדים שונים של AB'], seed);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
    expect(Math.sign(cross(A, B, C)) * Math.sign(cross(A, B, D))).toBe(-1);
    const s = fig(['משולש ABC', 'C ו-D באותו צד של AB'], seed);
    const [a, b, c, e] = ['A', 'B', 'C', 'D'].map((id) => pt(s, id));
    expect(Math.sign(cross(a, b, c)) * Math.sign(cross(a, b, e))).toBe(1);
  });

  it.each(SEEDS)('«קו ועליו נקודה A» — A on the segment BC (seed %i)', (seed) => {
    const d = fig(['קו ועליו נקודה A'], seed);
    expect(onSegment(pt(d, 'A'), pt(d, 'B'), pt(d, 'C'))).toBe(true);
  });

  it.each(SEEDS)('«ישר ABE» — A, B, E collinear with B between; «ישר ABEF» keeps the order (seed %i)', (seed) => {
    const d = fig(['משולש ABC', 'ישר ABE'], seed);
    expect(onSegment(pt(d, 'B'), pt(d, 'A'), pt(d, 'E'))).toBe(true);
    const f = fig(['משולש ABC', 'ישר ABEF'], seed);
    expect(onSegment(pt(f, 'B'), pt(f, 'A'), pt(f, 'E'))).toBe(true);
    expect(onSegment(pt(f, 'E'), pt(f, 'B'), pt(f, 'F'))).toBe(true);
  });

  it.each(SEEDS)('a bound on a length holds and leaves it free (seed %i)', (seed) => {
    for (const [line, lo, hi] of [
      ['5 < AB < 9', 5, 9],
      ['AB > 5', 5, Infinity],
      ['AB < 9', 0, 9],
      ['AB בין 5 ל-9', 5, 9],
      ['AB גדול מ-5', 5, Infinity],
    ] as const) {
      const d = fig([line], seed);
      const l = dist(pt(d, 'A'), pt(d, 'B'));
      expect(l, line).toBeGreaterThan(lo);
      expect(l, line).toBeLessThan(hi);
    }
  });

  it('a bound is a REGION, not a value: the length still moves between configurations (ADR-052)', () => {
    const l = (seed: number) => {
      const d = fig(['5 < AB < 9'], seed);
      return dist(pt(d, 'A'), pt(d, 'B'));
    };
    expect(new Set(SEEDS.map((s) => l(s).toFixed(6))).size).toBeGreaterThan(1);
  });

  it('a strict bound the givens violate is refused on the sentence; a closed one at its end holds', () => {
    expect(derive(['AB = 5', 'AB > 5'], 0).faults.length).toBeGreaterThan(0);
    expect(derive(['AB = 5', 'AB ≥ 5'], 0).faults).toEqual([]);
    expect(derive(['AB = 12', '5 < AB < 9'], 0).faults.length).toBeGreaterThan(0);
  });
});
