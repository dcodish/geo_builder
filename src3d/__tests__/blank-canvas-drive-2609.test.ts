/**
 * #2609 ([ADR-3D-408](../../docs/06b-decisions-3d.md#adr-3d-408)) — A RELATION OVER CREATED POINTS PLACES THEM, ON A
 * FIGURE WITH NO SOLID.
 *
 * On an empty 3-D canvas «שטח המשולש ABC = 4.5», «AB∥ACD», «∠SAB = ∠SAD» and the other guide examples below were refused
 * «point-not-determined»: the points the line created are `free3`, the statement reaches their sampled coordinates, but
 * every drive-or-claim site asked `statementReachesFreeDof3(c, cmd) && c.solids.length > 0` (and the carrier reach
 * itself returned false on a solid-free figure), so the statement became a claim judged against the sample. The
 * predicate alone decides now, and the pivot's own admissibility (#2503's degenerate-operand check, widened to a plane
 * operand whose points fall on one line) runs on a solid-free figure too.
 *
 * Everything goes through the store's own submit, and the stated value is read off the DRAWN figure at every one of
 * seeds 0–23 (the «הציגו תצורה אחרת» cycle), never re-derived from the engine's own predicates.
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { statementReachesFreeDof3 } from '../engine/apply';
import { emptyConstruction3 } from '../engine/types';

type P3 = { x: number; y: number; z: number };
type Pos = ReadonlyMap<string, P3>;

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);

const sub = (p: P3, q: P3) => [p.x - q.x, p.y - q.y, p.z - q.z];
const dot = (u: number[], w: number[]) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
const cross = (u: number[], w: number[]) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
const len = (u: number[]) => Math.hypot(...u);
const vec = (pos: Pos, a: string, b: string) => sub(pos.get(b)!, pos.get(a)!);
const dist = (pos: Pos, a: string, b: string) => len(vec(pos, a, b));
const cosAt = (pos: Pos, v: string, p: string, q: string) => {
  const u = vec(pos, v, p);
  const w = vec(pos, v, q);
  return dot(u, w) / (len(u) * len(w));
};
/** |cos| of the angle between two lines */
const lineCos = (pos: Pos, [a, b]: string, [c, d]: string) => Math.abs(dot(vec(pos, a, b), vec(pos, c, d))) / (dist(pos, a, b) * dist(pos, c, d));
const normal = (pos: Pos, [a, b, c]: string) => cross(vec(pos, a, b), vec(pos, a, c));
/** sin of the angle between line ab and the plane through three points (0 = parallel) */
const sinToPlane = (pos: Pos, ab: string, plane: string) => {
  const n = normal(pos, plane);
  const d = vec(pos, ab[0], ab[1]);
  return Math.abs(dot(d, n)) / (len(d) * len(n));
};

type Row = { line: string; holds: (pos: Pos) => [number, number][] };

/**
 * Each built row, with the stated value or relation as [measured, expected] pairs read off the drawing. The 14th row
 * that now records, «הזווית בין הישר AC' לבין המישור ABCD היא 30», is not locked here: its four created plane letters
 * are not one plane (#2610's class), so the angle holds against A, B, D and C sits off it.
 */
const ROWS: Row[] = [
  { line: 'אורך AS שווה לאורך AB', holds: (p) => [[dist(p, 'A', 'S'), dist(p, 'A', 'B')]] },
  { line: 'אורך AB=BC', holds: (p) => [[dist(p, 'A', 'B'), dist(p, 'B', 'C')]] },
  { line: '∠SAB = ∠SAD', holds: (p) => [[cosAt(p, 'A', 'S', 'B'), cosAt(p, 'A', 'S', 'D')]] },
  { line: 'זווית SAB = זווית SAD', holds: (p) => [[cosAt(p, 'A', 'S', 'B'), cosAt(p, 'A', 'S', 'D')]] },
  { line: 'הזווית שבין AB לבין AC שווה לזווית שבין AB לבין AD', holds: (p) => [[lineCos(p, 'AB', 'AC'), lineCos(p, 'AB', 'AD')]] },
  { line: 'AE יוצר זוויות שוות עם AB ו-AD', holds: (p) => [[lineCos(p, 'AE', 'AB'), lineCos(p, 'AE', 'AD')]] },
  { line: 'המישור ACD מקביל ל-AB', holds: (p) => [[sinToPlane(p, 'AB', 'ACD'), 0]] },
  { line: 'AB∥ACD', holds: (p) => [[sinToPlane(p, 'AB', 'ACD'), 0]] },
  { line: 'EF מקביל למישור ABC', holds: (p) => [[sinToPlane(p, 'EF', 'ABC'), 0]] },
  { line: 'SM מאונך ל-DB', holds: (p) => [[dot(vec(p, 'S', 'M'), vec(p, 'D', 'B')) / (dist(p, 'S', 'M') * dist(p, 'D', 'B')), 0]] },
  { line: 'שטח המשולש ABC = 4.5', holds: (p) => [[len(normal(p, 'ABC')) / 2, 4.5]] },
  { line: 'קוסינוס הזווית ACB = 3/4', holds: (p) => [[cosAt(p, 'C', 'A', 'B'), 0.75]] },
  {
    line: 'המישור KBC: x + 2y + 3z - 26 = 0',
    holds: (p) => ['K', 'B', 'C'].map((id) => { const q = p.get(id)!; return [q.x + 2 * q.y + 3 * q.z - 26, 0] as [number, number]; }),
  },
];

const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);

/** Submit lines on a blank canvas: the error of the first refused one, or null. */
function submitAll(lines: readonly string[]): { code: string; stated?: string; others?: string[] } | null {
  reset();
  for (const line of lines) {
    st().submit(line);
    const err = st().lastError as { code: string } | null;
    if (err) return err;
  }
  return null;
}

describe('#2609 — a relation over created points places them on a blank canvas', () => {
  for (const row of ROWS) {
    it(`«${row.line}» records, and the stated value holds at every one of seeds 0–23`, () => {
      expect(submitAll([row.line])).toBeNull();
      const facts = st().facts;
      expect(facts).toHaveLength(1);
      const drawn: string[] = [];
      let whole = 0;
      for (const seed of SEEDS_24) {
        const d = derive3(facts, seed);
        if (d.status[facts[0].id] !== 'ok') continue;
        // the stated value, measured on the drawn figure
        for (const [got, want] of row.holds(d.positions)) expect(got, `seed ${seed}`).toBeCloseTo(want, 4);
        whole++;
        drawn.push(JSON.stringify([...d.positions].map(([k, v]) => [k, +v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)])));
      }
      // docs/17 §7: the seed whole-rate — every configuration the cycle shows is green
      expect(whole).toBeGreaterThanOrEqual(20);
      // «הציגו תצורה אחרת» varies what was not stated (ADR-052): the drawings are not all the same
      expect(new Set(drawn).size).toBeGreaterThan(1);
    }, 300_000);
  }

  it('«AB∥ACD» then «AB ⊥ ACD» is refused as a contradiction naming «AB∥ACD», never «unknown point»', () => {
    expect(submitAll(['AB∥ACD', 'AB ⊥ ACD'])).toEqual({ code: 'givens-contradict', stated: 'AB ⊥ ACD', others: ['AB∥ACD'] });
    expect(st().facts).toHaveLength(1);
  }, 120_000);

  it('the other order is the same contradiction, naming «AB ⊥ ACD»', () => {
    expect(submitAll(['AB ⊥ ACD', 'AB∥ACD'])).toEqual({ code: 'givens-contradict', stated: 'AB∥ACD', others: ['AB ⊥ ACD'] });
  }, 120_000);

  it('controls: «AB = 5», «∠ABC = 60», «AB ⊥ ACD» alone and «משולש ABC · שטח המשולש ABC = 4.5» still record', () => {
    for (const lines of [['AB = 5'], ['∠ABC = 60'], ['AB ⊥ ACD'], ['משולש ABC', 'שטח המשולש ABC = 4.5']]) {
      expect(submitAll(lines), lines.join(' · ')).toBeNull();
      const d = derive3(st().facts, st().seed);
      for (const f of st().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    }
  }, 120_000);

  it('the predicate: a statement naming a created point reaches a free DOF on a solid-free figure; one naming none does not', () => {
    const c = emptyConstruction3();
    c.points.set('A', { kind: 'free3' });
    c.points.set('B', { kind: 'coord', x: 1, y: 0, z: 0 } as never);
    c.points.set('C', { kind: 'coord', x: 0, y: 1, z: 0 } as never);
    expect(statementReachesFreeDof3(c, ['A', 'B'])).toBe(true);
    expect(statementReachesFreeDof3(c, ['B', 'C'])).toBe(false);
  });
});
