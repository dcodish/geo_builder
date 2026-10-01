/**
 * #1637 G1 — the knowledge pool, the configuration search and the walk (ADR-AG-197): #1642, #1638, #1635,
 * #1634, #1539.
 *
 * One class under five reports: **a configuration the student's givens contradict, or one the search merely
 * failed to vary, was read as evidence.**
 *
 * - #1642 — the pool read configurations that break a given, and a starved pool of a 2-DOF figure printed
 *   «או» pairs; the right-angle seat the axis lines rule out was dead at 2 seeds in 3.
 * - #1638 — a chord collapsed onto one point, and two chords named in one sentence shared an end, so the
 *   panel printed «B = (2,−2) או (4,−2)».
 * - #1635 — a selector that failed in every configuration was swallowed because the figure still had freedom.
 * - #1634 — a free radius was repaired to its feasibility boundary (the tangent circle) at 24/24 seeds.
 * - #1539 — the signature read «-0.0000» as a second configuration; and (operator ruling 2026-10-01) two
 *   crossings named in one sentence now swap under «הציגו תצורה אחרת».
 *
 * Every assertion CALLS the decision it guards — `derive`, `panelKnowledge` + `pointText`, `knownOptions`,
 * `anotherConfiguration` — never a copy of it (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import {
  admittedToPool,
  configurationPool,
  distinctConfigSeeds,
  drawableAt,
  evaluate,
  evaluateStats,
  figureSignature,
  knownOptions,
  sameConfiguration,
  POOL_SIZE,
  type Figure,
} from '../engine/evaluate';
import { reportedDof } from '../engine/carriers';
import { panelKnowledge, panelShowsUnknown } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { anotherConfiguration } from '../app/another';
import { analyticCorpus } from './analyticCorpus';

const fmt = (v: number) => String(Math.round(v * 100) / 100);
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const at = (f: Figure, id: string) => f.points.find((p) => p.id === id)!;
const rows = (lines: string[]) => {
  const d = derive(lines, 0);
  const pk = panelKnowledge(d);
  return Object.fromEntries(pk.points.map((p) => [p.id, pointText(d, p.id, p.x, p.y, fmt)]));
};
const valid = (f: Figure) => f.unsatisfied.length === 0 && f.selectorsOk && f.ringFaults.length === 0;

// The operator's lines, verbatim from session 1ebc4l0w.
const SIX = [
  'משולש AOB ישר זווית',
  'O ראשית הצירים',
  'הצלע BO נמצאת על ציר ה-y',
  'הצלע AO נמצאת על ציר ה-x',
  'במשולש AOB חסום מעגל שמרכזו C',
  'הנקודה C נמצאת ברביע השני',
];
const CHORDS = [
  'מעגל שמרכזו M',
  'המיתרים AB ו-BC שווים',
  'משוואת המעגל היא: (x − 3)² + (y − 1)² = 10',
  'נתון: C(4,−2)',
  'הישר BC מקביל לציר ה-x',
];
const TANGENT_THEN_TWO = ['נתון מעגל שמרכזו M', 'המעגל משיק לציר ה-x', 'המעגל חותך את ציר ה-x בנקודות B ו-C'];
const FREE_RADIUS = ['נתון מעגל שמרכזו M(6,10)', 'B על המעגל', 'B על ציר ה-y'];

describe('#1642 — a 2-DOF figure prints no coordinate it cannot know', () => {
  it('the operator\'s six lines: A, B and C print no number beyond the axis each lies on', () => {
    const r = rows(SIX);
    expect(r.O).toBe('(0, 0)');
    // The axis lines pin A.y and B.x — the half-pinned form; nothing else is a number, and no «או».
    expect(r.A).toBe('(x_A, 0)');
    expect(r.B).toBe('(0, y_B)');
    expect(r.C).toBe('—');
    for (const id of ['A', 'B', 'C']) expect(r[id], id).not.toContain('או');
  });

  it('the right angle the axis lines force is found at every seed whose samples allow it — the whole-rate rises from 1/24', () => {
    const c = derive(SIX, 0).construction;
    const whole = SEEDS.filter((s) => valid(evaluate(c, s))).length;
    // Measured: 1/24 before (the seats at A and B are dead at every seed); 7/24 after.
    expect(whole).toBeGreaterThanOrEqual(6);
    // …and every whole configuration seats the right angle at O.
    for (const s of SEEDS) {
      const f = evaluate(c, s);
      if (!valid(f)) continue;
      const A = at(f, 'A');
      const B = at(f, 'B');
      expect(Math.abs(A.y) + Math.abs(B.x), `seed ${s}`).toBeLessThan(1e-6);
    }
  });

  it('the pool holds many different pictures, so freedom reads as freedom', () => {
    const c = derive(SIX, 0).construction;
    configurationPool(c).fill();
    const figs = SEEDS.map((s) => drawableAt(c, s)).filter(admittedToPool);
    const reps: Figure[] = [];
    for (const f of figs) if (!reps.some((r) => sameConfiguration(r, f))) reps.push(f);
    expect(reps.length).toBeGreaterThanOrEqual(4);
  });

  it('a pool member that breaks a given is never read: an inadmissible configuration is not admitted', () => {
    // The issue's own second defect: a fallback figure whose selector fails.
    const c = derive(SIX, 0).construction;
    for (const s of SEEDS) {
      const f = evaluate(c, s);
      expect(admittedToPool(f), `seed ${s}`).toBe(valid(f));
    }
  });

  it('a genuine discrete set on a figure with freedom elsewhere is still a set (the witnesses rule is not a blanket withhold)', () => {
    // C's two roots (area 7 on AB) with an unrelated free point Z: each root is witnessed by many pictures.
    const lines = ['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7', 'נקודה Z'];
    const d = derive(lines, 0);
    expect(reportedDof(d.construction, d.figure.carrierDof)).toBeGreaterThan(0);
    const set = knownOptions(d.construction, (f) => {
      const p = f.points.find((q) => q.id === 'C');
      return p ? [p.x, p.y] : null;
    });
    expect(set?.length).toBe(2);
  });
});

describe('#1642 — the class sweep: no value the panel prints is read off a configuration that breaks a given', () => {
  it('over the analytic corpus, every printed coordinate and option member is witnessed by an ADMITTED configuration', () => {
    const bad: string[] = [];
    let printed = 0;
    let figures = 0;
    for (const lines of analyticCorpus()) {
      let d;
      try {
        d = derive(lines, 0);
      } catch {
        continue;
      }
      if (d.figure.points.length === 0) continue;
      figures += 1;
      const c = d.construction;
      const pk = panelKnowledge(d);
      const admitted = Array.from({ length: POOL_SIZE }, (_, s) => drawableAt(c, s)).filter(admittedToPool);
      const witnessed = (id: string, x: number, y: number) =>
        admitted.some((f) => {
          const p = f.points.find((q) => q.id === id);
          return p !== undefined && Math.abs(p.x - x) <= 1e-3 * Math.max(1, Math.abs(x)) && Math.abs(p.y - y) <= 1e-3 * Math.max(1, Math.abs(y));
        });
      for (const p of pk.points) {
        const values: Array<[number, number]> = [];
        if (p.x.known && p.y.known) values.push([p.x.value, p.y.value]);
        else {
          const set = knownOptions(c, (f) => {
            const q = f.points.find((r) => r.id === p.id);
            return q ? [q.x, q.y] : null;
          });
          for (const v of set ?? []) values.push([v[0], v[1]]);
        }
        for (const [x, y] of values) {
          printed += 1;
          if (!witnessed(p.id, x, y)) bad.push(`${JSON.stringify(lines)} ${p.id} = (${x}, ${y})`);
        }
      }
    }
    expect(bad).toEqual([]);
    // the sweep exercised real claims — a net that checks nothing passes by default
    expect(figures).toBeGreaterThan(400);
    expect(printed).toBeGreaterThan(1000);
  }, 900_000);
});

describe('#1638 — a chord has two ends, and one sentence\'s chords are different chords', () => {
  it('the operator\'s 7/5 lines: the pool holds only A(0.4,−0.8), B(2,−2)', () => {
    const c = derive(CHORDS, 0).construction;
    configurationPool(c).fill();
    for (const s of SEEDS) {
      const f = drawableAt(c, s);
      if (!admittedToPool(f)) continue;
      expect([at(f, 'A').x, at(f, 'A').y].map(fmt), `A seed ${s}`).toEqual(['0.4', '-0.8']);
      expect([at(f, 'B').x, at(f, 'B').y].map(fmt), `B seed ${s}`).toEqual(['2', '-2']);
    }
  });

  it('the panel prints B = (2, −2) alone, and the slope of BC is 0', () => {
    const r = rows(CHORDS);
    expect(r.B).toBe('(2, -2)');
    expect(r.A).toBe('(0.4, -0.8)');
    const d = derive(CHORDS, 0);
    expect(d.faults).toEqual([]);
    const B = at(d.figure, 'B');
    const C = at(d.figure, 'C');
    expect(Math.abs((C.y - B.y) / (C.x - B.x))).toBeLessThan(1e-6);
  });

  it('24 seeds: no chord collapses and no two of the sentence\'s letters coincide in any drawn figure', () => {
    for (const s of SEEDS) {
      const f = derive(CHORDS, s).figure;
      const [A, B, C] = ['A', 'B', 'C'].map((id) => at(f, id));
      for (const [p, q, name] of [[A, B, 'AB'], [B, C, 'BC'], [A, C, 'AC']] as const) {
        expect(Math.hypot(p.x - q.x, p.y - q.y), `${name} seed ${s}`).toBeGreaterThan(0.1);
      }
    }
  });

  it('a genuinely two-configuration chord figure still shows both', () => {
    // Without the parallel line B has two places on the circle equidistant from A and C.
    const lines = ['מעגל שמרכזו M', 'המיתרים AB ו-BC שווים', 'משוואת המעגל היא: (x − 3)² + (y − 1)² = 10', 'נתון: C(4,−2)', 'A(0,0)'];
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    const set = knownOptions(d.construction, (f) => {
      const p = f.points.find((q) => q.id === 'B');
      return p ? [p.x, p.y] : null;
    });
    expect(set?.length).toBe(2);
  });

  it('one chord: «AB מיתר במעגל» never draws A on B', () => {
    for (const s of SEEDS) {
      const f = derive(['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל הוא 5', 'AB מיתר במעגל'], s).figure;
      expect(Math.hypot(at(f, 'A').x - at(f, 'B').x, at(f, 'A').y - at(f, 'B').y), `seed ${s}`).toBeGreaterThan(0.1);
    }
  });
});

describe('#1635 — a selector that fails in every configuration is refused, whatever the freedom', () => {
  it('tangent to the x-axis, then two crossings with it: the third line is refused', () => {
    const d = derive(TANGENT_THEN_TWO, 0);
    expect(d.faults.map((f) => [f.index, f.code])).toEqual([[2, 'unsatisfiable']]);
  });

  it('a free circle NOT tangent to the axis still gives two distinct crossings, unrefused', () => {
    for (const s of [0, 1, 2, 3, 4, 5]) {
      const d = derive(['נתון מעגל שמרכזו M', 'המעגל חותך את ציר ה-x בנקודות B ו-C'], s);
      expect(d.faults, `seed ${s}`).toEqual([]);
      const B = at(d.figure, 'B');
      const C = at(d.figure, 'C');
      expect(Math.abs(B.x - C.x), `seed ${s}`).toBeGreaterThan(0.1);
    }
  });
});

describe('#1634 — a free radius is sampled inside the feasible region, never repaired to its boundary', () => {
  const radius = (f: Figure) => {
    const c = f.curves.find((q) => q.curve.kind === 'circle');
    return c && c.curve.kind === 'circle' ? c.curve.r : NaN;
  };

  it('the three lines: r > 6 at most seeds, and the crossing moves', () => {
    const rs = SEEDS.map((s) => radius(derive(FREE_RADIUS, s).figure));
    // Measured: r = 6 at 24/24 before; 24/24 above 6.5 after.
    expect(rs.filter((r) => r > 6.1).length).toBeGreaterThanOrEqual(18);
    const bs = new Set(SEEDS.map((s) => fmt(at(derive(FREE_RADIUS, s).figure, 'B').y)));
    expect(bs.size).toBeGreaterThan(6);
    for (const s of SEEDS) expect(derive(FREE_RADIUS, s).faults, `seed ${s}`).toEqual([]);
  });

  it('«הציגו תצורה אחרת» moves the crossing point', () => {
    const next = anotherConfiguration(FREE_RADIUS, 0);
    expect(next.found).toBe(true);
    expect(at(derive(FREE_RADIUS, next.seed).figure, 'B').y).not.toBeCloseTo(at(derive(FREE_RADIUS, 0).figure, 'B').y, 3);
  });

  it('the #1289 invariant holds on the original catalog row (centre M(6,10)): freedom in the panel means something unknown', () => {
    const lines = ['נתון מעגל שמרכזו M(6,10)', 'B היא אחת מנקודות החיתוך של המעגל עם ציר ה-y'];
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    expect(reportedDof(d.construction, d.figure.carrierDof)).toBeGreaterThan(0);
    expect(panelShowsUnknown(panelKnowledge(d))).toBe(true);
    // B's y is not knowledge: the radius is free
    expect(rows(lines).B).toBe('(0, y_B)');
  });

  it('a parameter a given PINS is not pushed: «A(a,0)» · «a² = 4»-style pins keep their root', () => {
    const lines = ['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל הוא 5', 'B על המעגל', 'B על ציר ה-y'];
    for (const s of SEEDS.slice(0, 6)) {
      const f = derive(lines, s).figure;
      expect(radius(f), `seed ${s}`).toBeCloseTo(5, 6);
      expect(Math.abs(at(f, 'B').y), `seed ${s}`).toBeCloseTo(5, 6);
    }
  });
});

describe('#1539 — the signature reads one picture as one; a pair named in one sentence swaps', () => {
  it('zero has one spelling in the signature', () => {
    const f = derive(['A(0,0)', 'B(4,0)'], 0).figure;
    const g: Figure = { ...f, points: f.points.map((p) => (p.id === 'B' ? { ...p, y: -1e-9 } : p)) };
    expect(figureSignature(g)).toBe(figureSignature(f));
    expect(figureSignature(g)).not.toContain('-0.0000');
    expect(sameConfiguration(f, g)).toBe(true);
  });

  it('a fully determined figure reports one configuration and the button offers none', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];
    expect(anotherConfiguration(lines, 0).found).toBe(false);
  });

  it('the 572 exam figure (fully determined) reports exactly one configuration, and «הציגו תצורה אחרת» offers none', () => {
    const PART_B = [
      'נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2', 'k הוא פרמטר',
      'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N על הישר 3', 'M נקודת החיתוך של הישר 3 עם ציר ה-y', 'דרך M עובר ישר l4',
      'A נקודת החיתוך של הישר l4 עם הישר 1', 'B נקודת החיתוך של הישר l4 עם הישר 2', 'M אמצע AB',
    ];
    const d = derive(PART_B, 0);
    expect(d.faults).toEqual([]);
    expect(distinctConfigSeeds(d.construction)).toEqual([0]);
    expect(anotherConfiguration(PART_B, 0).found).toBe(false);
  });

  it('two named crossings of the circle with an axis swap on a press, both ways', () => {
    const lines = ['משוואת המעגל היא x²+y²=25', 'המעגל חותך את ציר ה-x בנקודות B ו-C'];
    const B0 = at(derive(lines, 0).figure, 'B').x;
    const next = anotherConfiguration(lines, 0);
    expect(next.found).toBe(true);
    const f1 = derive(lines, next.seed).figure;
    expect(at(f1, 'B').x).toBeCloseTo(-B0, 6);
    expect(at(f1, 'C').x).toBeCloseTo(B0, 6);
    const back = anotherConfiguration(lines, next.seed);
    expect(back.found).toBe(true);
    expect(at(derive(lines, back.seed).figure, 'B').x).toBeCloseTo(B0, 6);
  });

  it('two crossings of NAMED curves in one sentence: the stated order first, the swap on the next press (supersedes ADR-AG-185\'s fixed order)', () => {
    const lines = ['נתון מעגל I שמשוואתו x²+y²=25', 'נתון הישר l1: y=x+1', 'הישר l1 חותך את המעגל I בנקודות A ו-B'];
    const f0 = derive(lines, 0).figure;
    expect([at(f0, 'A').x, at(f0, 'A').y]).toEqual([expect.closeTo(-4, 6), expect.closeTo(-3, 6)]);
    const next = anotherConfiguration(lines, 0);
    expect(next.found).toBe(true);
    const f1 = derive(lines, next.seed).figure;
    expect([at(f1, 'A').x, at(f1, 'A').y]).toEqual([expect.closeTo(3, 6), expect.closeTo(4, 6)]);
    expect([at(f1, 'B').x, at(f1, 'B').y]).toEqual([expect.closeTo(-4, 6), expect.closeTo(-3, 6)]);
    expect(derive(lines, next.seed).faults).toEqual([]);
  });

  it('a single ordinal («נקודת החיתוך הראשונה») is the student\'s word and never swaps', () => {
    const lines = ['נתון מעגל I שמשוואתו x²+y²=25', 'נתון הישר l1: y=x+1', 'A נקודת החיתוך הראשונה של הישר l1 עם המעגל I'];
    const A0 = at(derive(lines, 0).figure, 'A');
    for (const s of SEEDS.slice(0, 6)) {
      const A = at(derive(lines, s).figure, 'A');
      expect(Math.hypot(A.x - A0.x, A.y - A0.y), `seed ${s}`).toBeLessThan(1e-6);
    }
  });

  it('the render floor on a deferred pool is three seeds, whatever the figure — a determined figure does not walk 24 at render', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];
    const d = derive(lines, 0);
    const pool = configurationPool(d.construction);
    pool.defer();
    const before = evaluateStats.uncached;
    panelKnowledge(d);
    expect(evaluateStats.uncached - before).toBeLessThanOrEqual(3);
    expect(pool.complete()).toBe(false);
  });
});
