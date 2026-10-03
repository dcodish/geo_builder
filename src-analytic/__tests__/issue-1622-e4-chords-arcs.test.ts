/**
 * #1622 E4 (ADR-AG-220) — 2-D's chords-arcs family in the analytic builder: arc measures (a value, a ratio, a sum, the
 * ⌢{} glyph), the central angle, the semicircle / quarter circle / sector, the midpoint of an arc, the diameter from a
 * point, and the inscribed angle on a diameter (Thales).
 *
 * Every lock CALLS the real path — `decideSubmit` for the verdict, `derive` for the figure — and asserts GEOMETRY at
 * several seeds, never pixels: an arc's measure is its central angle, a semicircle's angle is 90°, an arc is drawn on
 * its circle between its ends.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import type { Figure } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import { decideRename } from '../app/rename';

const SEEDS = [0, 1, 2, 3, 4, 5];

/** Submit each line as the app does; every one must record. */
function recordsAll(lines: readonly string[]): void {
  const kept: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, kept, 0);
    expect(v.kind, `«${line}» after ${JSON.stringify(kept)}: ${JSON.stringify(v)}`).toBe('record');
    if (v.kind === 'record') kept.push(v.line);
  }
}

function fig(lines: readonly string[], seed: number): Figure {
  const d = derive(lines, seed);
  expect(d.faults, `faults at seed ${seed}`).toEqual([]);
  expect(d.figure.unsatisfied).toEqual([]);
  return d.figure;
}
const pt = (f: Figure, id: string) => {
  const p = f.points.find((q) => q.id === id);
  expect(p, `point ${id}`).toBeDefined();
  return p!;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** The unsigned angle at v between the rays to a and b, in degrees. */
const deg = (v: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const ux = a.x - v.x;
  const uy = a.y - v.y;
  const wx = b.x - v.x;
  const wy = b.y - v.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};
const circleOf = (f: Figure, id: string) => {
  const c = f.curves.find((q) => q.id === id);
  expect(c, `curve ${id}`).toBeDefined();
  expect(c!.curve.kind).toBe('circle');
  return c! as { stated: boolean; curve: { kind: 'circle'; cx: number; cy: number; r: number } };
};
const centreOf = (f: Figure, id: string) => {
  const c = circleOf(f, id).curve;
  return { x: c.cx, y: c.cy, r: c.r };
};
const onCircle = (f: Figure, circle: string, ids: string[]) => {
  const c = centreOf(f, circle);
  for (const id of ids) expect(dist(pt(f, id), c), `${id} on ${circle}`).toBeCloseTo(c.r, 4);
};
const arcById = (f: Figure, id: string) => {
  const a = (f.arcs ?? []).find((q) => q.id === id);
  expect(a, `arc ${id}`).toBeDefined();
  return a!;
};
/** The arc's middle point, in world space. */
const arcMid = (a: { cx: number; cy: number; r: number; start: number; sweep: number }) => ({
  x: a.cx + a.r * Math.cos(a.start + a.sweep / 2),
  y: a.cy + a.r * Math.sin(a.start + a.sweep / 2),
});
const side = (p: { x: number; y: number }, q: { x: number; y: number }, w: { x: number; y: number }) =>
  Math.sign((q.x - p.x) * (w.y - p.y) - (q.y - p.y) * (w.x - p.x));

describe('arc measures — an arc is its central angle (2-D ADR-116)', () => {
  const circleAC = ['מעגל O', 'A על מעגל O', 'C על מעגל O'];

  it.each([['⌢{AC} = 60°'], ['קשת AC = 60'], ['קשת AC = 60 במעגל O'], ['arc AC = 60 in circle O'], ['הקשת AC שווה ל-60']])(
    '«%s» records, and ∠AOC = 60° with A, C on the circle at six seeds',
    (line) => {
      recordsAll([...circleAC, line]);
      for (const seed of SEEDS) {
        const f = fig([...circleAC, line], seed);
        expect(deg(pt(f, 'O'), pt(f, 'A'), pt(f, 'C'))).toBeCloseTo(60, 3);
        onCircle(f, 'circle-at-O', ['A', 'C']);
      }
    },
  );

  it('on a circle whose centre has no letter (an equation circle), the arc is the angle at its centre (0,0)', () => {
    const lines = ['x^2+y^2=25', 'A על המעגל', 'C על המעגל', '⌢{AC} = 60°'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      expect(deg({ x: 0, y: 0 }, pt(f, 'A'), pt(f, 'C'))).toBeCloseTo(60, 3);
      // a 60° chord of a radius-5 circle is 5
      expect(dist(pt(f, 'A'), pt(f, 'C'))).toBeCloseTo(5, 3);
    }
  });

  it('a reflex arc is the circle\'s other arc: «קשת AB = 200» makes ∠AOB = 160°', () => {
    const lines = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'קשת AB = 200'];
    recordsAll(lines);
    for (const seed of SEEDS) expect(deg(pt(fig(lines, seed), 'O'), pt(fig(lines, seed), 'A'), pt(fig(lines, seed), 'B'))).toBeCloseTo(160, 3);
  });

  it('cat-2d-066 — on a triangle and a circle, the arc puts its ends ON the circle and ∠AOB = 40°', () => {
    const lines = ['משולש ABC', 'מעגל O', 'קשת AB = 40 במעגל O'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      onCircle(f, 'circle-at-O', ['A', 'B']);
      expect(deg(pt(f, 'O'), pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(40, 3);
    }
  });

  it('cat-2d-065 — a ratio: «קשת DE = 2 קשת CE במעגל O» on free points states circle O and ∠DOE = 2∠COE', () => {
    const lines = ['נקודה D', 'נקודה E', 'נקודה C', 'נקודה O', 'קשת DE = 2 קשת CE במעגל O'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      onCircle(f, 'circle-at-O', ['D', 'E', 'C']);
      const O = pt(f, 'O');
      expect(deg(O, pt(f, 'D'), pt(f, 'E'))).toBeCloseTo(2 * deg(O, pt(f, 'C'), pt(f, 'E')), 2);
    }
  });

  it('«קשת AB שווה לקשת BC» — the equality in words — makes the two central angles equal', () => {
    const lines = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'קשת AB שווה לקשת BC'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      const O = pt(f, 'O');
      expect(deg(O, pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(deg(O, pt(f, 'B'), pt(f, 'C')), 3);
    }
  });

  it('cat-2d-067 — a sum: ⌢AC + ⌢BE = ⌢AD + ⌢BC holds, every end on circle O', () => {
    const lines = ['נקודה A', 'נקודה C', 'נקודה B', 'נקודה E', 'נקודה D', 'נקודה O', 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      onCircle(f, 'circle-at-O', ['A', 'B', 'C', 'D', 'E']);
      const O = pt(f, 'O');
      const a = (p: string, q: string) => deg(O, pt(f, p), pt(f, q));
      expect(a('A', 'C') + a('B', 'E')).toBeCloseTo(a('A', 'D') + a('B', 'C'), 2);
    }
  });

  it('a sum against a value: «קשת AB + קשת CD = 180»', () => {
    const lines = ['נתון מעגל O', 'A על מעגל O', 'B על מעגל O', 'C על מעגל O', 'D על מעגל O', 'קשת AB + קשת CD = 180'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      const O = pt(f, 'O');
      expect(deg(O, pt(f, 'A'), pt(f, 'B')) + deg(O, pt(f, 'C'), pt(f, 'D'))).toBeCloseTo(180, 2);
    }
  });

  it('REFUSAL — an arc whose ends the figure does not have is refused naming the end (2-D refuses it too)', () => {
    const v = decideSubmit('קשת AB = 40 במעגל O', ['מעגל O'], 0);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error.key).toBe('unknown-reference');
  });

  it('He and En lower to the same arc fact', () => {
    const he = parseLine('קשת AB = 40 במעגל O');
    const en = parseLine('arc AB = 40 in circle O');
    expect(he.ok && en.ok).toBe(true);
    if (he.ok && en.ok) expect(he.facts.map(({ src: _s, ...f }) => f)).toEqual(en.facts.map(({ src: _s, ...f }) => f));
  });
});

describe('the central angle — 2-D\'s three-letter form, the middle letter the centre', () => {
  it('cat-2d-069 «זוית מרכזית COD» draws the radii OC and OD and introduces the points', () => {
    recordsAll(['זוית מרכזית COD']);
    const f = fig(['זוית מרכזית COD'], 0);
    expect(f.segments.map((s) => [...s.ends].sort().join('')).sort()).toEqual(['CO', 'DO']);
  });

  it('«זוית מרכזית COD = 80» on circle O is an angle given: ∠COD = 80°', () => {
    const lines = ['מעגל O', 'זוית מרכזית COD = 80'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      expect(deg(pt(f, 'O'), pt(f, 'C'), pt(f, 'D'))).toBeCloseTo(80, 3);
    }
  });
});

describe('semicircle, quarter circle, sector — an arc drawn on a hidden circle', () => {
  it('cat-2d-115 «חצי מעגל שקוטרו AB» — the half on AB: centre the midpoint, radius |AB|/2, sweep π; the circle not drawn', () => {
    recordsAll(['חצי מעגל שקוטרו AB']);
    for (const seed of SEEDS) {
      const f = fig(['חצי מעגל שקוטרו AB'], seed);
      const A = pt(f, 'A');
      const B = pt(f, 'B');
      const arc = arcById(f, 'arc-BA');
      expect(arc.cx).toBeCloseTo((A.x + B.x) / 2, 6);
      expect(arc.cy).toBeCloseTo((A.y + B.y) / 2, 6);
      expect(arc.r).toBeCloseTo(dist(A, B) / 2, 6);
      expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI, 6);
      expect(circleOf(f, 'circle-diam-AB').stated).toBe(false);
      expect(f.segments.some((s) => [...s.ends].sort().join('') === 'AB')).toBe(true);
    }
  });

  it('THALES — a semicircle\'s angle is 90°: «C על המעגל» on the semicircle gives ∠ACB = 90° at six seeds', () => {
    const lines = ['חצי מעגל שקוטרו AB', 'C על המעגל'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      expect(deg(pt(f, 'C'), pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(90, 3);
    }
  });

  it('THALES — the inscribed angle on a diameter of circle O is 90° at six seeds', () => {
    const lines = ['מעגל O', 'AB קוטר במעגל O', 'C על מעגל O'];
    recordsAll(lines);
    for (const seed of SEEDS) {
      const f = fig(lines, seed);
      expect(deg(pt(f, 'C'), pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(90, 3);
    }
  });

  it('cat-2d-117 «… מחוץ למשולש ABC» bulges away from C; «… בתוך המשולש ABC» toward it', () => {
    for (const [where, away] of [['מחוץ למשולש ABC', true], ['בתוך המשולש ABC', false]] as const) {
      const lines = ['משולש ABC', `חצי מעגל על צלע AB ${where}`];
      recordsAll(lines);
      for (const seed of SEEDS) {
        const f = fig(lines, seed);
        const A = pt(f, 'A');
        const B = pt(f, 'B');
        const mid = arcMid(arcById(f, 'arc-BA'));
        expect(side(A, B, mid) === side(A, B, pt(f, 'C')), `${where} seed ${seed}`).toBe(!away);
      }
    }
  });

  it('cat-2d-116 «על כל צלע של ריבוע ABCD יש חצי מעגל» — the square and four halves, one on each side', () => {
    const lines = ['על כל צלע של ריבוע ABCD יש חצי מעגל'];
    recordsAll(lines);
    const f = fig(lines, 0);
    const ring = ['A', 'B', 'C', 'D'];
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % 4];
      const arc = arcById(f, `arc-${q}${p}`);
      expect(arc.cx).toBeCloseTo((pt(f, p).x + pt(f, q).x) / 2, 5);
      expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI, 6);
    });
    // a square: four equal sides
    expect(dist(pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(dist(pt(f, 'B'), pt(f, 'C')), 4);
  });

  it('cat-2d-118 «רבע מעגל» — the tool names its ends A, B; a 90° arc with its radii, the circle not drawn', () => {
    recordsAll(['רבע מעגל']);
    for (const seed of SEEDS) {
      const f = fig(['רבע מעגל'], seed);
      const arc = arcById(f, 'arc-AB');
      expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI / 2, 4);
      expect(arc.radii).toBe(true);
      expect(deg({ x: arc.cx, y: arc.cy }, pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(90, 3);
      onCircle(f, 'circle-sector-AB', ['A', 'B']);
      expect(circleOf(f, 'circle-sector-AB').stated).toBe(false);
    }
    // the next free letters, as 2-D names them
    const d = derive(['נקודה A', 'רבע מעגל'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('cat-2d-119 «גזרה AOB בזווית 80» — ∠AOB = 80°, OA = OB, an 80° arc and the radii OA, OB', () => {
    recordsAll(['גזרה AOB בזווית 80']);
    for (const seed of SEEDS) {
      const f = fig(['גזרה AOB בזווית 80'], seed);
      const O = pt(f, 'O');
      expect(deg(O, pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(80, 3);
      expect(dist(O, pt(f, 'A'))).toBeCloseTo(dist(O, pt(f, 'B')), 4);
      expect((Math.abs(arcById(f, 'arc-AB').sweep) * 180) / Math.PI).toBeCloseTo(80, 3);
      expect(f.segments.map((s) => [...s.ends].sort().join('')).sort()).toEqual(['AO', 'BO']);
      expect(circleOf(f, 'circle-at-O').stated).toBe(false);
    }
  });

  it('a reflex sector «גזרה AOB בזווית 200» draws the MAJOR arc (200°) over a 160° central angle', () => {
    for (const seed of SEEDS) {
      const f = fig(['גזרה AOB בזווית 200'], seed);
      expect(deg(pt(f, 'O'), pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(160, 3);
      expect((Math.abs(arcById(f, 'arc-AB').sweep) * 180) / Math.PI).toBeCloseTo(200, 3);
    }
  });

  it('a sector with no angle leaves the angle FREE (ADR-052): it moves with the configuration', () => {
    const angles = SEEDS.map((seed) => {
      const f = fig(['גזרה AOB'], seed);
      return Math.round(deg(pt(f, 'O'), pt(f, 'A'), pt(f, 'B')));
    });
    expect(new Set(angles).size).toBeGreaterThan(1);
  });

  it('a sector cut from circle O the figure has rides that circle, which stays drawn; «מעגל O» after a sector draws it', () => {
    const bound = fig(['מעגל O', 'גזרה AOB בזווית 80'], 0);
    expect(circleOf(bound, 'circle-at-O').stated).toBe(true);
    onCircle(bound, 'circle-at-O', ['A', 'B']);
    recordsAll(['גזרה AOB בזווית 80', 'מעגל O']);
    expect(circleOf(fig(['גזרה AOB בזווית 80', 'מעגל O'], 0), 'circle-at-O').stated).toBe(true);
  });
});

describe('the midpoint of an arc', () => {
  const base = ['מעגל O', 'B על מעגל O', 'C על מעגל O'];

  it('cat-2d-131 «M אמצע הקשת BC במעגל O» on an empty canvas states the circle and its points', () => {
    recordsAll(['M אמצע הקשת BC במעגל O']);
    for (const seed of SEEDS) {
      const f = fig(['M אמצע הקשת BC במעגל O'], seed);
      onCircle(f, 'circle-at-O', ['B', 'C', 'M']);
      const O = pt(f, 'O');
      expect(deg(O, pt(f, 'B'), pt(f, 'M'))).toBeCloseTo(deg(O, pt(f, 'B'), pt(f, 'C')) / 2, 3);
    }
  });

  it('the minor arc by default, the major with «הגדולה» — ∠BOM is half of ∠BOC, or half of its complement', () => {
    for (const [line, major] of [['M אמצע הקשת BC', false], ['M אמצע הקשת הגדולה BC', true], ['M is the midpoint of arc BC', false]] as const) {
      recordsAll([...base, line]);
      for (const seed of SEEDS) {
        const f = fig([...base, line], seed);
        const O = pt(f, 'O');
        const boc = deg(O, pt(f, 'B'), pt(f, 'C'));
        expect(deg(O, pt(f, 'B'), pt(f, 'M')), `${line} seed ${seed}`).toBeCloseTo(major ? (360 - boc) / 2 : boc / 2, 3);
        onCircle(f, 'circle-at-O', ['M']);
      }
    }
  });
});

describe('a diameter from a point — the tool names the far end (2-D\'s D)', () => {
  it('cat-2d-129 «קוטר מנקודה F במעגל O» — D is F\'s antipode: O is the midpoint of FD', () => {
    recordsAll(['קוטר מנקודה F במעגל O']);
    for (const seed of SEEDS) {
      const f = fig(['קוטר מנקודה F במעגל O'], seed);
      const F = pt(f, 'F');
      const D = pt(f, 'D');
      const O = pt(f, 'O');
      expect((F.x + D.x) / 2).toBeCloseTo(O.x, 4);
      expect((F.y + D.y) / 2).toBeCloseTo(O.y, 4);
      onCircle(f, 'circle-at-O', ['F', 'D']);
    }
  });

  it('cat-2d-130 «קוטר העובר בנקודה A במעגל O», and the next free letter when D is taken', () => {
    recordsAll(['קוטר העובר בנקודה A במעגל O']);
    expect(fig(['קוטר העובר בנקודה A במעגל O'], 0).points.map((p) => p.id).sort()).toEqual(['A', 'D', 'O']);
    expect(fig(['נקודה D', 'קוטר מנקודה F במעגל O'], 0).points.map((p) => p.id).sort()).toEqual(['D', 'E', 'F', 'O']);
  });

  it('the far end the tool named is renameable: «D → K» rewrites the row as «FK קוטר במעגל O» (the ADR-AG-211 promise)', () => {
    const v = decideRename('D', 'K', { lines: ['קוטר מנקודה F במעגל O'], disabled: [], queries: [], spokenFor: {}, seed: 0 } as never);
    expect(v.kind).toBe('apply');
    if (v.kind === 'apply') expect(v.lines).toEqual(['FK קוטר במעגל O']);
  });

  it('cat-2d-145 «קוטר» — the tool names A, B and the circle on them is drawn', () => {
    recordsAll(['קוטר']);
    const f = fig(['קוטר'], 0);
    expect(f.points.map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(circleOf(f, 'circle-diam-AB').stated).toBe(true);
  });

  it('cat-2d-128 — the diameter from F cut where it meets the side AC: E on line FO and between A and C, FE drawn', () => {
    const lines = ['משולש ABC', 'מעגל O', 'F על מעגל O', 'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E'];
    recordsAll(lines);
    const f = fig(lines, 0);
    const [F, O, E, A, C] = ['F', 'O', 'E', 'A', 'C'].map((id) => pt(f, id));
    expect((O.x - F.x) * (E.y - F.y) - (O.y - F.y) * (E.x - F.x)).toBeCloseTo(0, 4);
    expect(dist(A, E) + dist(E, C)).toBeCloseTo(dist(A, C), 4);
    expect(f.segments.some((s) => [...s.ends].sort().join('') === 'EF')).toBe(true);
  });
});

describe('a circle by its diameter\'s value is the circle with half that radius', () => {
  it.each([['מעגל O בקוטר 10'], ['מעגל O שקוטרו 10'], ['circle O with diameter 10']])('«%s» — r = 5', (line) => {
    recordsAll([line]);
    for (const seed of SEEDS) expect(centreOf(fig([line], seed), 'circle-at-O').r).toBeCloseTo(5, 9);
  });
});
