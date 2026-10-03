/**
 * #1620 slice C, stream S7 (ADR-AG-213) — the two tangents meet: 2-D's «המשיק בנקודה A והמשיק בנקודה C למעגל O
 * נפגשים בנקודה D» (parity row `cat-2d-111`), its plural, the bare «המשיקים נפגשים בנקודה D», English, the meet
 * verbs as one verb, and the honest refusal when the two tangents are PARALLEL.
 *
 * Every lock CALLS the real path (`derive`, `decideSubmit`) and asserts GEOMETRY at several seeds: D on both
 * tangents (DA ⟂ OA, DC ⟂ OC), DA = DC, A and C on the circle — and that antipodal touch points are refused
 * `unsatisfiable` naming the line, never drawn as a circle shrunk to a dot.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
type P = { x: number; y: number };

const pt = (d: Derivation, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const sub = (p: P, q: P): P => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (u: P, v: P) => u.x * v.x + u.y * v.y;
const len = (u: P) => Math.hypot(u.x, u.y);
const clean = (d: Derivation) => {
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
};

/** D is where the tangents at A and C to circle O meet: A, C on the circle, DA ⟂ OA, DC ⟂ OC, DA = DC. */
function assertTangentsMeet(d: Derivation, circle = 'O') {
  const [o, a, c, dd] = [circle, 'A', 'C', 'D'].map((id) => pt(d, id));
  const r = d.figure.env[`r_${circle}`];
  expect(r).toBeGreaterThan(0.5); // a circle the student can see — never the collapsed dot
  const scale = Math.max(1, len(sub(dd, o)));
  expect(len(sub(a, o))).toBeCloseTo(r, 6);
  expect(len(sub(c, o))).toBeCloseTo(r, 6);
  expect(Math.abs(dot(sub(dd, a), sub(a, o))) / (scale * r)).toBeLessThan(1e-6);
  expect(Math.abs(dot(sub(dd, c), sub(c, o))) / (scale * r)).toBeLessThan(1e-6);
  expect(Math.abs(len(sub(dd, a)) - len(sub(dd, c))) / scale).toBeLessThan(1e-6);
  expect(len(sub(a, c))).toBeGreaterThan(1e-3 * r); // two touch points, not one
}

const ROW_111 = 'המשיק בנקודה A והמשיק בנקודה C למעגל O נפגשים בנקודה D';
const TWO_TANGENTS = ['מעגל O', 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C'];

describe('2-D’s sentence (cat-2d-111) — the tangents at A and C meet at D', () => {
  it('on an EMPTY canvas it states circle O, puts A and C on it, draws both tangents and D where they meet, at 8 seeds', () => {
    for (const seed of SEEDS) {
      const d = clean(derive([ROW_111], seed));
      assertTangentsMeet(d);
      expect(d.figure.curves.map((c) => c.id).sort()).toEqual(['circle-at-O', 'tangent-A', 'tangent-C']);
      expect(d.minted).toEqual([]);
    }
  });

  it('after «מעגל O», «A על המעגל», «C על המעגל» — the operator’s context — it records and builds the same construction', () => {
    const lines = ['מעגל O', 'A על המעגל', 'C על המעגל'];
    expect(decideSubmit(ROW_111, lines, 0).kind).toBe('record');
    for (const seed of SEEDS) assertTangentsMeet(clean(derive([...lines, ROW_111], seed)));
  });

  it('every spelling a student types is the same D: the circle before, after or shared; «נחתכים»; the plural; English', () => {
    const spellings: string[][] = [
      [ROW_111],
      ['המשיק למעגל O בנקודה A והמשיק למעגל O בנקודה C נפגשים בנקודה D'],
      ['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C נפגשים בנקודה D'],
      ['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C למעגל O נחתכים בנקודה D'],
      ['המשיקים למעגל O בנקודות A ו-C נפגשים בנקודה D'],
      ['מעגל O', 'המשיקים בנקודות A ו-C נחתכים בנקודה D'],
      ['מעגל O', 'המשיקים למעגל בנקודות A ו-C נפגשים ב-D'],
      ['the tangent at A and the tangent at C to circle O meet at D'],
      ['the tangents to circle O at A and C meet at D'],
      ['the tangents at A and C to circle O meet at D'],
      ['מעגל O', 'the tangent at A and the tangent at C meet at D'],
      ['D נקודת החיתוך של המשיק למעגל O בנקודה A עם המשיק למעגל O בנקודה C'],
    ];
    const ref = clean(derive(spellings[0], 2));
    for (const s of spellings) {
      const d = clean(derive(s, 2));
      assertTangentsMeet(d);
      for (const id of ['O', 'A', 'C', 'D']) {
        expect(pt(d, id).x, `${s.join(' | ')} — ${id}`).toBeCloseTo(pt(ref, id).x, 6);
        expect(pt(d, id).y, `${s.join(' | ')} — ${id}`).toBeCloseTo(pt(ref, id).y, 6);
      }
    }
  });

  it('every unstated magnitude stays free (ADR-052): the radius and the touch points move with the seed', () => {
    const rs = new Set(SEEDS.map((seed) => derive([ROW_111], seed).figure.env.r_O.toFixed(4)));
    const as = new Set(SEEDS.map((seed) => pt(derive([ROW_111], seed), 'A').x.toFixed(4)));
    expect(rs.size).toBeGreaterThan(2);
    expect(as.size).toBeGreaterThan(2);
  });

  it('«המשיק בנקודה C למעגל O» — the circle after the point — is the tangent the circle-first spelling builds', () => {
    for (const seed of [0, 3]) {
      const a = clean(derive(['מעגל O', 'המשיק בנקודה A למעגל O'], seed));
      const b = clean(derive(['מעגל O', 'המשיק למעגל O בנקודה A'], seed));
      expect(pt(a, 'A')).toEqual(pt(b, 'A'));
      expect(a.figure.curves.some((c) => c.id === 'tangent-A')).toBe(true);
    }
  });
});

describe('«המשיקים נפגשים בנקודה D» — the two tangents the figure holds', () => {
  it('after two drawn tangents it builds D on both, and draws AD and CD as 2-D does — four spellings, 8 seeds', () => {
    for (const s of ['המשיקים נפגשים בנקודה D', 'המשיקים נחתכים בנקודה D', 'D נקודת החיתוך של המשיקים', 'the tangents meet at D']) {
      expect(decideSubmit(s, TWO_TANGENTS, 0).kind, s).toBe('record');
      for (const seed of SEEDS) {
        const d = clean(derive([...TWO_TANGENTS, s], seed));
        assertTangentsMeet(d);
        const segs = d.figure.segments.map((g) => [...g.ends].sort().join(''));
        expect(segs, s).toEqual(expect.arrayContaining(['AD', 'CD']));
      }
    }
  });

  it('none, one or three tangents is a question, never a guess', () => {
    const asks = (lines: string[], found: number) => {
      const v = decideSubmit('המשיקים נפגשים בנקודה D', lines, 0);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.error).toMatchObject({ key: 'ambiguous-shape', host: { kind: 'line', found, need: 2 } });
    };
    asks([], 0);
    asks(['מעגל O', 'המשיק למעגל O בנקודה A'], 1);
    asks([...TWO_TANGENTS, 'המשיק למעגל O בנקודה E'], 3);
  });
});

describe('the tangents at the ends of a diameter are PARALLEL — refused, never drawn as a dot', () => {
  const DIAMETER = ['מעגל O', 'AC קוטר במעגל O'];

  it('2-D’s sentence after «AC קוטר במעגל O» is refused `unsatisfiable`, naming the line and the diameter it contradicts', () => {
    for (const seed of [0, 1, 2]) {
      const v = decideSubmit(ROW_111, DIAMETER, seed);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') continue;
      expect(v.error).toMatchObject({ key: 'unsatisfiable', detail: ROW_111, definedBy: 'AC קוטר במעגל O' });
    }
  });

  it('the bare plural after both tangents is refused the same way', () => {
    const lines = [...DIAMETER, 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C'];
    const v = decideSubmit('המשיקים נפגשים בנקודה D', lines, 0);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error).toMatchObject({ key: 'unsatisfiable', detail: 'המשיקים נפגשים בנקודה D' });
  });

  it('the solve does not satisfy the contradiction by shrinking the whole figure to a point (the floor keeps the sampled scale)', () => {
    // The canonical crossing read on the base too — and drew O, A, C and D on one dot, r ≈ 4·10⁻⁶, with no fault.
    const crossing = 'D נקודת החיתוך של המשיק בנקודה A עם המשיק בנקודה C';
    for (const seed of [0, 1, 2]) {
      const d = derive([...DIAMETER, 'המשיק למעגל O בנקודה A', 'המשיק למעגל O בנקודה C', crossing], seed);
      expect(d.faults.some((f) => f.index === 4 && f.code === 'unsatisfiable'), JSON.stringify(d.faults)).toBe(true);
    }
  });
});

describe('honest refusals and the meet verbs', () => {
  it('one tangent twice names no crossing — «בנקודה A … בנקודה A» and «בנקודות A ו-A» are refused', () => {
    for (const s of ['המשיק בנקודה A והמשיק בנקודה A למעגל O נפגשים בנקודה D', 'המשיקים למעגל O בנקודות A ו-A נפגשים בנקודה D']) {
      const v = decideSubmit(s, [], 0);
      expect(v.kind, s).toBe('refused');
      if (v.kind === 'refused') expect(v.error.key, s).toBe('repeated-vertex');
    }
  });

  it('a tangent naming two circles is not read as either', () => {
    const v = decideSubmit('המשיק למעגל O בנקודה A למעגל K', ['מעגל O', 'מעגל K'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('not-handled');
  });

  it('«נפגשים» is «נחתכים» for two lines (2-D reads both): the same E, in Hebrew and English', () => {
    const quad = ['מרובע ABCD'];
    for (const seed of [0, 1, 2]) {
      const a = clean(derive([...quad, 'הישר AC והישר BD נחתכים בנקודה E'], seed));
      for (const s of ['הישר AC והישר BD נפגשים בנקודה E', 'הישר AC והישר BD מצטלבים בנקודה E']) {
        const b = clean(derive([...quad, s], seed));
        expect(pt(b, 'E').x, s).toBeCloseTo(pt(a, 'E').x, 9);
        expect(pt(b, 'E').y, s).toBeCloseTo(pt(a, 'E').y, 9);
      }
    }
    const lines = ['ישר l1: y=x', 'ישר l2: y=-x+2'];
    for (const s of ['l1 and l2 meet at E', 'הישר l1 והישר l2 נפגשים בנקודה E']) {
      const d = clean(derive([...lines, s], 0));
      expect(pt(d, 'E').x, s).toBeCloseTo(1, 6);
      expect(pt(d, 'E').y, s).toBeCloseTo(1, 6);
    }
  });
});
