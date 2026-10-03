/**
 * #1621 D3 (ADR-AG-216) — coordinates in words on a VERTEX, and an ORDER between measures.
 *
 * Two halves, one stream:
 *
 * 1. **«שיעור ה-y של הקודקוד A הוא 10»** (471 corpus 14/4), «… B קטן מ-6» (13/4), «… D קטן מ-9 (ראו סרטוט)» (23/4)
 *    were `not-handled` because the coordinate rules spelled the subject noun inline as «הנקודה» while the shared
 *    `HE_POINT` token spelled the vertex defectively («קדקוד») — the exam writes «קודקוד». One token, both
 *    spellings, and the coordinate rules use it. The value lowers to the shipped `coord` constraint and the
 *    comparison to the shipped `coord-compare` SELECTOR (ADR-AG-005 D7: a strict comparison picks a branch, it
 *    pins nothing).
 * 2. **«AB < BC», «DC > AB», «AB ≤ 10», «∢ABC ≤ 40°», «∢ABC < ∢BAC», «זווית ABC קהה»** — 2-D reads each as a REGION
 *    (ADR-039 / ADR-390 / ADR-108: it removes no DOF); analytic answered `not-handled` / `bad-equation`. They lower
 *    to a `sign` selector over the order's difference (`Quantity` `order`), which never moves a determined figure,
 *    refuses one it contradicts, and SEEDS a free figure inside the region (the #1071 lesson).
 *
 * Every lock calls the real path: `parseLine`, `derive`, `decideSubmit`, and the corpus questions through
 * `confirmTaught` as the ratchet does.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { confirmTaught, decideSubmit } from '../app/submit';

interface CorpusQuestion {
  id: string;
  lines: string[];
}
const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const question = (id: string) => CORPUS.find((q) => q.id === id)!.lines;

const SEEDS = [0, 1, 2, 3, 4, 5];

/** The drawn position of each point, rounded to the panel's precision. */
function at(lines: readonly string[], seed: number): Record<string, [number, number]> {
  const d = derive(lines, seed);
  return Object.fromEntries(d.figure.points.map((p) => [p.id, [Math.round(p.x * 1000) / 1000 + 0, Math.round(p.y * 1000) / 1000 + 0]]));
}
const len = (P: Record<string, [number, number]>, a: string, b: string) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
const angle = (P: Record<string, [number, number]>, a: string, v: string, b: string) => {
  const u = [P[a][0] - P[v][0], P[a][1] - P[v][1]];
  const w = [P[b][0] - P[v][0], P[b][1] - P[v][1]];
  return (Math.acos((u[0] * w[0] + u[1] * w[1]) / Math.hypot(u[0], u[1]) / Math.hypot(w[0], w[1])) * 180) / Math.PI;
};
const faultsOf = (lines: readonly string[], seed = 0) => derive(lines, seed).faults.map((f) => `${f.index}:${f.code}`);

describe('#1621 D3 — a coordinate stated in words about a VERTEX («הקודקוד A»)', () => {
  it('«שיעור ה-y של הקודקוד A הוא 10» is the coordinate constraint its «הנקודה» twin is', () => {
    const vertex = parseLine('שיעור ה-y של הקודקוד A הוא 10');
    const point = parseLine('שיעור ה-y של הנקודה A הוא 10');
    expect(vertex.ok).toBe(true);
    expect(vertex.ok && point.ok && vertex.facts.map((f) => ({ ...f, src: '' }))).toEqual(point.ok && point.facts.map((f) => ({ ...f, src: '' })));
  });

  it('«… קטן מ-6» about a vertex is the coord-compare SELECTOR, not a constraint', () => {
    const r = parseLine('שיעור ה-y של הקודקוד B קטן מ-6');
    expect(r.ok && r.facts.map((f) => f.t)).toEqual(['selector']);
    expect(r.ok && r.facts[0].t === 'selector' && r.facts[0].sel.kind).toBe('coord-compare');
  });

  it('the defective spelling «קדקוד» still reads (one token, both spellings)', () => {
    expect(parseLine('שיעור ה-y של הקדקוד A הוא 10').ok).toBe(true);
  });

  it('14/4 fully lands, at its printed coordinates, at every seed', () => {
    const lines = confirmTaught(question('14/4'), 0);
    for (const seed of SEEDS) {
      expect(faultsOf(lines, seed)).toEqual([]);
      const P = at(lines, seed);
      expect([P.A, P.B, P.D]).toEqual([[-6, 10], [0, 4], [0, 7]]);
    }
  });

  it('13/4: «y_B < 6» picks the root B(0,4) of AB = √40 on the y-axis — a selector never moves a determined point', () => {
    const lines = confirmTaught(question('13/4'), 0);
    for (const seed of SEEDS) {
      expect(faultsOf(lines, seed)).toEqual([]);
      const P = at(lines, seed);
      expect([P.A, P.B, P.C, P.E, P.D, P.F]).toEqual([[6, 6], [0, 4], [6, -4], [3, 0], [6, 1], [3, 5]]);
    }
    // The other side of the same comparison names the other root.
    const flipped = ['בסרטוט שלפניך מתואר משולש ABC', 'הקודקוד B נמצא על ציר ה-y', 'A(6,6), AB = √40', 'שיעור ה-y של הקודקוד B גדול מ-6'];
    for (const seed of SEEDS) expect(at(flipped, seed).B).toEqual([0, 8]);
  });

  it('23/4: «y_D < 9 (ראו סרטוט)» picks D(0,6) — the whole question lands', () => {
    const lines = confirmTaught(question('23/4'), 0);
    for (const seed of SEEDS) {
      expect(faultsOf(lines, seed)).toEqual([]);
      const P = at(lines, seed);
      expect([P.A, P.C, P.D, P.E]).toEqual([[1, 9], [6, 4], [0, 6], [2, 8]]);
    }
  });
});

describe('#1621 D3 — an ORDER between measures is a region (a selector), as 2-D reads it', () => {
  it.each([
    ['AB < BC'],
    ['DC > AB'],
    ['AB קטן מ-BC'],
    ['AB ≤ 10'],
    ['AB לפחות 3'],
    ['∢ABC ≤ 40°'],
    ['∢ABC < ∢BAC'],
    ['זווית ABC קהה'],
    ['זווית ABC גדולה מ-40'],
    ['AB is shorter than BC'],
    ['angle ABC is obtuse'],
  ])('«%s» lowers to a sign selector over an order — never a constraint', (line) => {
    const r = parseLine(line);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.facts.some((f) => f.t === 'constraint')).toBe(false);
    const sels = r.facts.filter((f) => f.t === 'selector');
    expect(sels).toHaveLength(1);
    expect(sels[0].t === 'selector' && sels[0].sel.kind === 'sign' && sels[0].sel.q.k).toBe('order');
  });

  it('«20 < ∢ABC < 60» is a window: two orders on one angle, each end with its own operator', () => {
    const r = parseLine('20 < ∢ABC < 60');
    expect(r.ok && r.facts.filter((f) => f.t === 'selector').length).toBe(2);
  });

  it('a strictness travels: «≤» admits the boundary, «<» does not (2-D #1265)', () => {
    expect(faultsOf(['משולש ABC', 'AB = 5', 'BC = 5', 'AB ≤ BC'])).toEqual([]);
    expect(faultsOf(['משולש ABC', 'AB = 5', 'BC = 5', 'AB < BC'])).toEqual(['3:unsatisfiable']);
  });

  it('it consumes no freedom: the constraints are unchanged and the order is a selector', () => {
    const base = derive(['משולש ABC'], 0).construction;
    const with_ = derive(['משולש ABC', 'AB < BC'], 0).construction;
    expect(with_.constraints).toEqual(base.constraints);
    expect(with_.selectors.length).toBe(base.selectors.length + 1);
  });

  it('a DETERMINED figure is never moved by an order that holds, and is refused on one it contradicts', () => {
    const fig = ['A(0,0)', 'B(4,0)', 'C(1,3)'];
    for (const seed of SEEDS) {
      expect(at([...fig, 'AB < BC'], seed)).toEqual(at(fig, seed));
      expect(at([...fig, 'זווית ACB חדה'], seed)).toEqual(at(fig, seed));
    }
    expect(faultsOf([...fig, 'AB < BC'])).toEqual([]);
    expect(faultsOf([...fig, 'AB > BC'])).toEqual(['3:unsatisfiable']);
    expect(faultsOf([...fig, 'זווית ACB קהה'])).toEqual(['3:unsatisfiable']);
    expect(faultsOf([...fig, '∢BAC < ∢ABC'])).toEqual(['3:unsatisfiable']);
  });

  it.each<[string, string[], (P: Record<string, [number, number]>) => boolean]>([
    ['AB < BC', ['משולש ABC', 'AB < BC'], (P) => len(P, 'A', 'B') < len(P, 'B', 'C')],
    ['AB > BC', ['משולש ABC', 'AB > BC'], (P) => len(P, 'A', 'B') > len(P, 'B', 'C')],
    ['DC > AB', ['מרובע ABCD', 'DC > AB'], (P) => len(P, 'D', 'C') > len(P, 'A', 'B')],
    ['AB ≥ 10', ['משולש ABC', 'AB ≥ 10'], (P) => len(P, 'A', 'B') >= 10],
    ['AB ≤ 1', ['משולש ABC', 'AB ≤ 1'], (P) => len(P, 'A', 'B') <= 1],
    ['∢ABC obtuse', ['משולש ABC', 'זווית ABC קהה'], (P) => angle(P, 'A', 'B', 'C') > 90],
    ['∢ABC ≥ 150°', ['משולש ABC', '∢ABC ≥ 150°'], (P) => angle(P, 'A', 'B', 'C') >= 150],
    ['∢ABC ≤ 10°', ['משולש ABC', '∢ABC ≤ 10°'], (P) => angle(P, 'A', 'B', 'C') <= 10],
    ['∢ABC < ∢BAC', ['משולש ABC', '∢ABC < ∢BAC'], (P) => angle(P, 'A', 'B', 'C') < angle(P, 'B', 'A', 'C')],
    ['bare AB < BC', ['AB < BC'], (P) => len(P, 'A', 'B') < len(P, 'B', 'C')],
  ])('a FREE figure is drawn inside the region at every seed, and still varies (%s)', (_name, lines, holds) => {
    const drawn = SEEDS.map((seed) => {
      expect(faultsOf(lines, seed), `seed ${seed}`).toEqual([]);
      const P = at(lines, seed);
      expect(holds(P), `seed ${seed}: ${JSON.stringify(P)}`).toBe(true);
      return JSON.stringify(P);
    });
    // ADR-052: the order is a region, not a value — «הציגו תצורה אחרת» still moves the figure inside it.
    expect(new Set(drawn).size).toBeGreaterThanOrEqual(3);
  });

  it('a length beside an angle compares two kinds of thing — refused by name, never built', () => {
    expect(parseLine('AB < ∢ABC')).toMatchObject({ ok: false, code: 'bad-operand' });
  });

  it('the submit path records an order and refuses a contradicted one', () => {
    const lines = ['משולש ABC', 'AB = 5', 'BC = 7'];
    expect(decideSubmit('AB < BC', lines, 0).kind).toMatch(/^(record|already-follows)$/);
    expect(decideSubmit('AB > BC', lines, 0)).toMatchObject({ kind: 'refused', error: { key: 'unsatisfiable' } });
  });

  it('the neighbours keep their readings: a parameter domain, a coordinate comparison, a ratio of areas', () => {
    const kinds = (line: string) => {
      const r = parseLine(line);
      return r.ok ? r.facts.map((f) => (f.t === 'selector' ? `selector:${f.sel.kind}` : f.t === 'constraint' ? `constraint:${f.k.t}` : f.t)) : r.code;
    };
    expect(kinds('a > 0')).toEqual(['param']);
    expect(kinds('0 < k < 6')).toEqual(['param']);
    expect(kinds('x_B > x_D')).toEqual(['selector:coord-compare']);
    expect(kinds('שטח המשולש ABC גדול פי 2 משטח המשולש CEF')).toContain('constraint:length-eq');
  });
});
