/**
 * #2367 (ADR-3D-376) — A PLANE'S TWO FORMS ARE ONE DERIVATION FROM ITS EQUATION.
 *
 * The operator's T45 (round #2353): «ABCD: z - 2 = 0» printed with no parametric form — *"if we show z-2=0 why
 * cant we have the parametric equation too? we should always show both"*. The parametric row was derived from a
 * named vertex and two edges, with its own gate stricter than the equation's. It is now derived from the equation
 * (a stable, known vertex and stable edges still preferred), so wherever the equation prints, both forms print —
 * on the panel and in the ask lane. Rulings 2026-10-20: Q1 an equation-given plane is listed in the panel too;
 * Q2 the simplest point; Q3 no letter on the row («π1 = (0, 0, 2) + t·(1, 0, 0) + s·(0, 1, 0)» "is perfect");
 * Q4 nicer numbers where possible.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataView, planePointAndSpan } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { deserializeFigure3 } from '../store/figureFile3';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };
const BOX = "תיבה ABCDA'B'C'D'";
const T45 = [BOX, 'AB=(1,0,0)', 'AD=(0,1,0)', "AA'=(0,0,2)", 'z_A=2', 'מישור ABCD', "מישור ABB'A'"];

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const cOf = (st: St, seed = st.seed) => derive3(st.facts, seed).construction;
const panel = (st: St, seed = st.seed) => dataView(cOf(st, seed), seed);
const ask = (st: St, q: string, seed = st.seed) => answerQuery(cOf(st, seed), q, seed);

/** Parse «π = (x, y, z) + t·(…) + s·(…)» and check it against «ax + by + cz + d = 0». */
const num = (t: string): number => {
  const m = t.trim().match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!m) throw new Error(`not a number: ${t}`);
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
};
const triple = (t: string) => t.split(',').map(num);
function parseParam(row: string): { p: number[]; e1: number[]; e2: number[] } {
  const m = row.match(/= \(([^)]*)\) \+ t·\(([^)]*)\) \+ s·\(([^)]*)\)$/);
  if (!m) throw new Error(`not a parametric row: ${row}`);
  return { p: triple(m[1]), e1: triple(m[2]), e2: triple(m[3]) };
}
function parseEq(row: string): number[] {
  const lhs = row.replace(/ = 0$/, '').replace(/\s+/g, '');
  const co = [0, 0, 0, 0];
  for (const term of lhs.match(/[+-]?[^+-]+/g)!) {
    const m = term.match(/^([+-]?)(\d*(?:\.\d+)?)([xyz]?)$/)!;
    const v = (m[1] === '-' ? -1 : 1) * (m[2] === '' ? 1 : Number(m[2]));
    co[m[3] === 'x' ? 0 : m[3] === 'y' ? 1 : m[3] === 'z' ? 2 : 3] += v;
  }
  return co;
}
function consistent(eqRow: string, parRow: string): void {
  const [a, b, c, d] = parseEq(eqRow);
  const { p, e1, e2 } = parseParam(parRow);
  const dot = (u: number[]) => a * u[0] + b * u[1] + c * u[2];
  const tol = 0.02 * Math.max(1, Math.hypot(a, b, c, d)); // the row prints two decimals at worst
  expect(Math.abs(dot(p) + d), `${parRow} on ${eqRow}`).toBeLessThan(tol);
  expect(Math.abs(dot(e1)), `${parRow} e1 ⟂ n`).toBeLessThan(tol);
  expect(Math.abs(dot(e2)), `${parRow} e2 ⟂ n`).toBeLessThan(tol);
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  expect(Math.hypot(...cr), `${parRow} independent`).toBeGreaterThan(1e-6);
}
/** The panel's plane rows, grouped by plane label: [equation, parametric?]. */
function panelPairs(planes: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of planes) {
    const i = r.indexOf(': ');
    const k = r.slice(0, i);
    (out.get(k) ?? out.set(k, []).get(k)!).push(r.slice(i + 2));
  }
  return out;
}

describe('#2367 — the operator’s T45', () => {
  const st = build(T45);
  it('the panel shows «ABCD: π1 = (0, 0, 2) + t·(1, 0, 0) + s·(0, 1, 0)» under «ABCD: z - 2 = 0»', () => {
    for (const seed of [st.seed, 1, 7]) {
      expect(panel(st, seed).planes, `seed ${seed}`).toEqual(['ABCD: z - 2 = 0', 'ABCD: π1 = (0, 0, 2) + t·(1, 0, 0) + s·(0, 1, 0)']);
    }
  });
  it('asking «מישור ABCD» gives both rows; ABB′A′ (offset unanchored) still shows neither', () => {
    expect(ask(st, 'מישור ABCD').rows).toEqual(['z - 2 = 0', 'π1 = (0, 0, 2) + t·(1, 0, 0) + s·(0, 1, 0)']);
    expect(ask(st, "מישור ABB'A'").note).toBe('noFrame');
  });
  it('honesty: the row names no vertex, and A still reads (?, ?, 2)', () => {
    const p = panel(st);
    const par = p.planes.find((r) => r.includes('t·'))!;
    expect(par.replace(/^ABCD: /, '')).not.toMatch(/[A-D]/);
    expect(p.pointComps.A).toEqual(['?', '?', '2']);
  });
});

describe('#2367 — the class: wherever the equation shows, both forms show (panel and ask lane)', () => {
  const ROWS: { name: string; lines: string[]; plane: string; q: string; eq: string }[] = [
    { name: 'row 3: two axes anchored', lines: [...T45, 'x_A=1'], plane: 'ABCD', q: 'מישור ABCD', eq: 'z - 2 = 0' },
    { name: 'row 4: an equation-given plane (Q1: listed in the panel)', lines: ['המישור π1: z - 2.5 = 0'], plane: 'π1', q: 'מישור π1', eq: '2z - 5 = 0' },
    { name: 'row 5: the English equation', lines: ['plane π1: x + 2y + 3z - 5 = 0'], plane: 'π1', q: 'מישור π1', eq: 'x + 2y + 3z - 5 = 0' },
    { name: 'row 7: a base lying on [xy], free to turn in it', lines: ['פירמידה SABCD', 'A(0,0,0)', 'הבסיס ABCD מונח על המישור xy', 'מישור ABCD'], plane: 'ABCD', q: 'מישור ABCD', eq: 'z = 0' },
    { name: 'row 8: a square lying on [xy]', lines: ['ריבוע ABCD', 'A(0,0,0)', 'המישור ABC מונח על המישור xy', 'מישור ABC'], plane: 'ABC', q: 'מישור ABC', eq: 'z = 0' },
    { name: 'row 9: a free plane pinned by three points', lines: ['מישור π2', 'A(1,0,0)', 'B(0,1,0)', 'C(0,0,1)', 'A על המישור π2', 'B על המישור π2', 'C על המישור π2'], plane: 'π2', q: 'מישור π2', eq: 'x + y + z - 1 = 0' },
    { name: 'a general plane (Q4: correct, as nice as the normal allows)', lines: ['המישור π1: 20x - y + 2z - 5 = 0'], plane: 'π1', q: 'מישור π1', eq: '20x - y + 2z - 5 = 0' },
  ];
  for (const r of ROWS) {
    it(r.name, () => {
      const st = build(r.lines);
      const pair = panelPairs(panel(st).planes).get(r.plane);
      expect(pair, 'panel').toBeDefined();
      expect(pair![0]).toBe(r.eq);
      expect(pair).toHaveLength(2);
      consistent(pair![0], pair![1]);
      const a = ask(st, r.q);
      expect(a.answer).toBe(r.eq);
      expect(a.rows).toEqual([r.eq, pair![1]]); // one seam, two surfaces: the same row
    });
  }
  it('the simplest point and the nicest directions (Q2, Q4)', () => {
    const rows = (lines: string[], plane: string) => panelPairs(panel(build(lines)).planes).get(plane)![1];
    expect(rows(['המישור π1: z - 2.5 = 0'], 'π1')).toBe('π1 = (0, 0, 5/2) + t·(1, 0, 0) + s·(0, 1, 0)');
    expect(rows(['מישור π2', 'A(1,0,0)', 'B(0,1,0)', 'C(0,0,1)', 'A על המישור π2', 'B על המישור π2', 'C על המישור π2'], 'π2')).toBe('π2 = (1, 0, 0) + t·(1, -1, 0) + s·(1, 0, -1)');
    expect(rows(['המישור π1: 20x - y + 2z - 5 = 0'], 'π1')).toBe('π1 = (0, -5, 0) + t·(0, 2, 1) + s·(1, 0, -10)');
    const s = planePointAndSpan({ x: 0, y: 0, z: 1, d: -2 })!;
    expect([s.p0, s.e1, s.e2]).toEqual([{ x: 0, y: 0, z: 2 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]);
  });
});

describe('#2367 — controls', () => {
  it('row 2: a fully placed box keeps both forms of both planes, byte-identical', () => {
    const st = build([...T45.slice(0, 4), 'A(0,0,2)', ...T45.slice(5)]);
    expect(panel(st).planes).toEqual([
      'ABCD: z - 2 = 0', 'ABCD: π1 = (0, 0, 2) + t·(1, 0, 0) + s·(0, 1, 0)',
      "ABB'A': y = 0", "ABB'A': π2 = (0, 0, 2) + t·(1, 0, 0) + s·(0, 0, 2)",
    ]);
  });
  it('row 6: three coordinate points keep the vertex and the edges, byte-identical', () => {
    const st = build(['A(1,0,0)', 'B(0,2,0)', 'C(0,0,3)', 'מישור ABC']);
    expect(panel(st).planes).toEqual(['ABC: 6x + 3y + 2z - 6 = 0', 'ABC: π = (1, 0, 0) + t·(-1, 2, 0) + s·(-1, 0, 3)']);
  });
  it('row 10: a plane not determined prints neither form', () => {
    const st = build([BOX, 'z_A=2', 'מישור ABCD']);
    expect(panel(st).planes).toEqual([]);
    expect(ask(st, 'מישור ABCD')).toMatchObject({ answer: null, note: 'undetermined' });
  });
  it('#2368 first: the cube free to turn about AB gains no false parametric row', () => {
    const st = build(["קובייה ABCDA'B'C'D'", 'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABCD']);
    for (const seed of [0, 5]) expect(panel(st, seed).planes, `seed ${seed}`).toEqual([]);
  });
});

describe('#2367 — property sweep over the fixture corpus: an equation row ⟺ a parametric row', () => {
  const DIR = join(__dirname, '..', '..', 'fixtures3');
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')).sort()) {
    it(file, () => {
      const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
      if (!r.ok) return;
      const d = derive3(r.facts, r.seed);
      const p = dataView(d.construction, r.seed);
      for (const [label, rows] of panelPairs(p.planes)) {
        expect(rows, `${label}: both forms`).toHaveLength(2);
        expect(rows[1], label).toMatch(/ \+ t·/);
        consistent(rows[0], rows[1]);
        if (d.construction.pointPlanes.has(label) || d.construction.planes.has(label)) {
          const a = answerQuery(d.construction, `מישור ${label}`, r.seed);
          if (a.answer !== null) expect(a.rows, `ask «מישור ${label}»`).toEqual(rows);
        }
      }
    });
  }
});
