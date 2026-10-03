/**
 * #1621 slice D, stream D1 (ADR-AG-214) — measures as givens: the ratio of two measures and the area notation.
 *
 * «היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5» (corpus 6/5), «S_BDC / S_ODC = 0.8» (7/4), «S_{ABC} = 13»,
 * «שטח המשולש ABC שווה ל-45» (18/4), «DO/DE = 2/3» (16/5), «CD/OB = 5/2» (17/4), «שטח המשולש OCF גדול פי 4 משטח
 * המשולש AOE» (20/4). Every one lowers to the `length-eq` the rest of the measures use — no new solver.
 *
 * Every lock CALLS the real path (`derive`, `decideSubmit`, `confirmTaught`, `parseLine`, `ask`) and asserts
 * GEOMETRY — the stated ratio measured off the drawn figure by the shoelace, at several seeds; the free DOFs
 * still free (ADR-052); a ratio that cannot hold refused naming the statement; a region that does not exist
 * refused by name. The corpus questions are locked line by line to the printed coordinates.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { confirmTaught, decideSubmit } from '../app/submit';
import { ask } from '../app/ask';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
type P = { x: number; y: number };

const CORPUS: Array<{ id: string; lines: string[] }> = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'),
);
const corpus = (id: string) => CORPUS.find((q) => q.id === id)!.lines;

const pt = (d: Derivation, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const clean = (d: Derivation) => {
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
};
/** The shoelace — the measure the `area` term itself uses. */
const area = (d: Derivation, ids: string) => {
  const ps = [...ids].map((id) => pt(d, id));
  let s = 0;
  for (let i = 0; i < ps.length; i += 1) {
    const q = ps[(i + 1) % ps.length];
    s += ps[i].x * q.y - q.x * ps[i].y;
  }
  return Math.abs(s) / 2;
};
const dist = (d: Derivation, a: string, b: string) => Math.hypot(pt(d, a).x - pt(d, b).x, pt(d, a).y - pt(d, b).y);
const at = (d: Derivation, id: string, x: number, y: number) => {
  expect(pt(d, id).x, `${id}.x`).toBeCloseTo(x, 4);
  expect(pt(d, id).y, `${id}.y`).toBeCloseTo(y, 4);
};

/** The lines a student ends up holding, submitted one by one through the app's own decision. */
function submitted(lines: readonly string[]) {
  const held: string[] = [];
  const verdicts = lines.map((line) => {
    const v = decideSubmit(line, held, 0);
    const final = v.kind === 'teach' ? decideSubmit(v.canonical, held, 0) : v;
    if (final.kind === 'record') held.push(final.line);
    return final;
  });
  return { held, verdicts };
}

describe('the area notation S_{…} is «שטח …» (ADR-AG-214)', () => {
  it('«S_{ABC} = 13» and «S_ABC = 13» lower to exactly the facts of «שטח ABC = 13»', () => {
    const facts = (s: string) => {
      const r = parseLine(s);
      expect(r.ok, s).toBe(true);
      return JSON.stringify(r.ok ? r.facts.map(({ src: _src, ...f }) => f) : null);
    };
    const worded = facts('שטח ABC = 13');
    expect(facts('S_{ABC} = 13')).toBe(worded);
    expect(facts('S_ABC = 13')).toBe(worded);
    expect(facts('S_{ ABC } = 13')).toBe(worded);
  });

  it('pins the area it names, at every seed, and leaves the shape free', () => {
    const shapes = new Set<string>();
    for (const seed of SEEDS) {
      const d = clean(derive(['משולש ABC', 'S_{ABC} = 13'], seed));
      expect(area(d, 'ABC')).toBeCloseTo(13, 4);
      shapes.add((dist(d, 'A', 'B') / dist(d, 'B', 'C')).toFixed(3));
    }
    expect(shapes.size, 'the triangle is still free in shape (ADR-052)').toBeGreaterThan(1);
  });

  it('a subscripted NAME is not a polygon — «S_1», «S_A» are left to the rest of the grammar', () => {
    for (const s of ['S_1 = 3', 'S_A = 3']) {
      const r = parseLine(s);
      if (r.ok) expect(JSON.stringify(r.facts), s).not.toContain('"area"');
    }
  });

  it('the ask lane reads it too: «S_{ABC}» on a 3-4-5 right triangle answers 6', () => {
    const d = clean(derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'], 0));
    const a = ask(d, 'S_{ABC}', (v) => String(+v.toFixed(4)));
    expect(a.value).toBe('6');
  });
});

describe('the ratio of two measures — «היחס בין X ל-Y הוא p:q», «X / Y = r»', () => {
  const RATIO_SPELLINGS = [
    'S_{ABD} / S_{ADC} = 0.8',
    'S_ABD / S_ADC = 0.8',
    'היחס בין שטח המשולש ABD לשטח המשולש ADC הוא 4:5',
    'היחס בין שטח ABD לבין שטח ADC הוא 4/5',
    'היחס בין שטח המשולש ABD לשטח המשולש ADC הוא 0.8',
    'נתון כי היחס בין שטח המשולש ABD לשטח המשולש ADC הוא 4:5',
    'the ratio of the area of triangle ABD to the area of triangle ADC is 4:5',
  ];
  for (const s of RATIO_SPELLINGS) {
    it(`«${s}» holds in the drawn figure at every seed — and D divides BC 4:5`, () => {
      for (const seed of SEEDS) {
        const d = clean(derive(['משולש ABC', 'נקודה D על BC', s], seed));
        expect(area(d, 'ABD') / area(d, 'ADC'), `seed ${seed}`).toBeCloseTo(0.8, 4);
        expect(dist(d, 'B', 'D') / dist(d, 'D', 'C'), `seed ${seed}`).toBeCloseTo(0.8, 4);
      }
    });
  }

  it('a ratio pins ONE relation and nothing else — the quadrilateral stays free (ADR-052)', () => {
    const shapes = new Set<string>();
    for (const seed of SEEDS) {
      const d = clean(derive(['מרובע ABCD', 'S_{ABC} / S_{ACD} = 0.8'], seed));
      expect(area(d, 'ABC') / area(d, 'ACD'), `seed ${seed}`).toBeCloseTo(0.8, 4);
      shapes.add(`${pt(d, 'A').x.toFixed(3)},${pt(d, 'A').y.toFixed(3)}`);
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('a ratio of a TRIANGLE to a QUADRILATERAL — the corpus 6/5 shape, Hebrew and English', () => {
    for (const s of [
      'היחס בין שטח המשולש AOB לשטח הטרפז ADCB הוא 4:5',
      'the ratio of the area of triangle AOB to the area of trapezoid ADCB is 4:5',
    ]) {
      for (const seed of SEEDS) {
        const d = clean(derive(['משולש AOB', 'טרפז ADCB', s], seed));
        expect(area(d, 'AOB') / area(d, 'ADCB'), `${s} @${seed}`).toBeCloseTo(0.8, 4);
      }
    }
  });

  it('the join is found by the MEASURES: a distance with its own «ל» inside still splits right', () => {
    const d = clean(derive(['A(0,0)', 'B(4,0)', 'C(0,3)', 'נקודה P', 'היחס בין המרחק מ-P לישר AB למרחק מ-P לישר AC הוא 2'], 0));
    expect(Math.abs(pt(d, 'P').y) / Math.abs(pt(d, 'P').x)).toBeCloseTo(2, 4);
  });

  it('a length ratio by «/» — «BD/DC = 2/3» — is the colon form «BD:DC = 2:3»', () => {
    for (const seed of SEEDS) {
      for (const s of ['BD/DC = 2/3', 'BD:DC = 2:3', 'היחס בין BD ל-DC הוא 2:3']) {
        const d = clean(derive(['משולש ABC', 'נקודה D על BC', s], seed));
        expect(dist(d, 'B', 'D') / dist(d, 'D', 'C'), `${s} @${seed}`).toBeCloseTo(2 / 3, 4);
      }
    }
  });

  it('an area VALUE in English with its vertices — «the area of triangle ABC is 45» (the noun no longer eats the run)', () => {
    for (const s of ['the area of triangle ABC is 45', 'the area of the triangle ABC is 45', 'the area of ABC is 45', 'the area of triangle ABC = 45']) {
      const d = clean(derive(['triangle ABC', s], 0));
      expect(area(d, 'ABC'), s).toBeCloseTo(45, 4);
    }
  });
});

describe('the honest refusals', () => {
  it('a ratio that cannot hold is refused as unsatisfiable, naming the statement', () => {
    for (const s of ['S_{ABD} / S_{ABC} = 2', 'היחס בין שטח המשולש ABD לשטח המשולש ABC הוא 2:1']) {
      const { verdicts } = submitted(['משולש ABC', 'נקודה D על BC', s]);
      const v = verdicts[2];
      expect(v.kind, s).toBe('refused');
      if (v.kind === 'refused') {
        expect(v.error.key).toBe('unsatisfiable');
        expect(v.error.detail).toBe(s);
      }
    }
  });

  it('a region whose vertices do not exist is refused by name, never drawn', () => {
    for (const s of ['S_{XYZ} / S_{ABC} = 2', 'היחס בין שטח המשולש XYZ לשטח המשולש ABC הוא 1:2']) {
      const { verdicts } = submitted(['משולש ABC', s]);
      const v = verdicts[1];
      expect(v.kind, s).toBe('refused');
      if (v.kind === 'refused') {
        expect(v.error.key).toBe('unknown-reference');
        expect(v.error.detail).toBe('X');
      }
    }
  });
});

describe('the corpus, line by line to the printed coordinates', () => {
  it('6/5 — the area ratio fixes B and D: A(0,6), D(0,9), B(4,0), C(6,0)', () => {
    const q = corpus('6/5');
    // Line 2's position words («D מעל A», «C מימין ל-B») are stream D3's; here they are the component order they
    // mean (`y_D > y_A`, `x_C > x_B`, the shipped notation), so this lock is about the RATIO alone.
    const lines = [q[0], q[1], 'A ו-D על ציר ה-y, B ו-C על ציר ה-x', 'y_D > y_A', 'x_C > x_B', q[3], q[4]];
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(lines, 0), seed));
      at(d, 'O', 0, 0);
      at(d, 'A', 0, 6);
      at(d, 'D', 0, 9);
      at(d, 'B', 4, 0);
      at(d, 'C', 6, 0);
      expect(area(d, 'AOB') / area(d, 'ADCB')).toBeCloseTo(0.8, 4);
    }
  });

  it('6/5 — the printed ratio line lands in the printed question', () => {
    const q = corpus('6/5');
    const d = derive(confirmTaught(q, 0), 0);
    expect(d.faults.map((f) => f.index)).not.toContain(3);
  });

  it('6/5 — without the order, the ratio still holds on the mirror figure (|OB| = 4, |OD| = 9)', () => {
    const q = corpus('6/5');
    const lines = [q[0], q[1], 'A ו-D על ציר ה-y, B ו-C על ציר ה-x', q[3], q[4]];
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(lines, 0), seed));
      expect(Math.abs(pt(d, 'B').x)).toBeCloseTo(4, 4);
      expect(Math.abs(pt(d, 'D').y)).toBeCloseTo(9, 4);
      expect(area(d, 'AOB') / area(d, 'ADCB')).toBeCloseTo(0.8, 4);
    }
  });

  it('7/4 — the printed «S_BDC / S_ODC = 0.8» is READ, and refused as unsatisfiable: D is on BC, so S_BDC = 0', () => {
    const q = corpus('7/4');
    const { verdicts } = submitted(q);
    expect(verdicts.slice(0, 4).map((v) => v.kind)).toEqual(['record', 'record', 'record', 'record']);
    const v = verdicts[4];
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') {
      expect(v.error.key).toBe('unsatisfiable');
      expect(v.error.detail).toBe(q[4]);
    }
  });

  it('7/4 — the notation on its own figure: «S_BEC / S_ODC = 0.8» puts B at (6,8) or (14,−8)', () => {
    const q = corpus('7/4');
    const lines = [...q.slice(0, 4), 'נתון: S_BEC / S_ODC = 0.8'];
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(lines, 0), seed));
      at(d, 'C', 10, 0);
      at(d, 'D', 8, 4);
      const b = pt(d, 'B');
      expect([`6,8`, `14,-8`]).toContain(`${Math.round(b.x)},${Math.round(b.y)}`);
      expect(Math.hypot(b.x - Math.round(b.x), b.y - Math.round(b.y))).toBeLessThan(1e-6);
      expect(area(d, 'BEC') / area(d, 'ODC')).toBeCloseTo(0.8, 4);
    }
  });

  it('16/5 — «וכי DO/DE = 2/3»: A(3,0), D(0,4), E(0,10), C(−4.5,10), B(16⅓,10)', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(corpus('16/5'), 0), seed));
      at(d, 'A', 3, 0);
      at(d, 'D', 0, 4);
      at(d, 'E', 0, 10);
      at(d, 'C', -4.5, 10);
      at(d, 'B', 49 / 3, 10);
      expect(dist(d, 'D', 'O') / dist(d, 'D', 'E')).toBeCloseTo(2 / 3, 4);
    }
  });

  it('17/4 — «CD/OB = 5/2»: A(0,4), B(6,0), CD = 15, C at (16,15) or (−4,−15)', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(corpus('17/4'), 0), seed));
      at(d, 'A', 0, 4);
      at(d, 'B', 6, 0);
      const c = pt(d, 'C');
      expect([`16,15`, `-4,-15`]).toContain(`${Math.round(c.x)},${Math.round(c.y)}`);
      at(d, 'D', c.x, 0);
      expect(dist(d, 'C', 'D') / dist(d, 'O', 'B')).toBeCloseTo(2.5, 4);
    }
  });

  it('18/4 — «ידוע כי שטח המשולש ABD שווה ל-45»: A(0,6), B(∓9,0), C(0,−4), D(±6,0)', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(corpus('18/4'), 0), seed));
      // Fixed up to the reflection in the y-axis (the printed figure has B on the left).
      const left = pt(d, 'B').x < 0 ? 1 : -1;
      at(d, 'A', 0, 6);
      at(d, 'B', -9 * left, 0);
      at(d, 'C', 0, -4);
      at(d, 'D', 6 * left, 0);
      expect(area(d, 'ABD')).toBeCloseTo(45, 4);
    }
  });

  it('20/4 — «שטח המשולש OCF גדול פי 4 משטח המשולש AOE»: A(4,±2), B(0,±10), C(−4,±8), E(4,0), F(−4,0)', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(confirmTaught(corpus('20/4'), 0), seed));
      // The givens fix the figure up to the reflection in the x-axis (the printed one has B above it).
      const up = pt(d, 'B').y > 0 ? 1 : -1;
      at(d, 'A', 4, 2 * up);
      at(d, 'B', 0, 10 * up);
      at(d, 'C', -4, 8 * up);
      at(d, 'E', 4, 0);
      at(d, 'F', -4, 0);
      expect(area(d, 'OCF') / area(d, 'AOE')).toBeCloseTo(4, 4);
    }
  });
});
