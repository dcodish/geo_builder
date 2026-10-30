/**
 * #2512 ([ADR-AG-333](../../docs/06c-decisions-analytic.md#adr-ag-333)) — a second ring around one circle builds, as in 2-D
 * (ADR-762, ADR-W-157: the analytic port in the same item).
 *
 * Measured before (main 045a8546, through `decideSubmit` → `derive`): «מעגל O ברדיוס 3» · «משולש ABC חוסם את מעגל O» ·
 * «משולש DEF חוסם את מעגל O» was refused «polygon-collapsed» on line 3; two squares around O «unsatisfiable»; which letter
 * sets failed depended on the letters (ABC + DEF and ABC + XYZ refused, ABC + PQR built and faulted at seeds 6–8). The
 * lowering is right (free vertices held by bounded `tangent-line` rows); the joint descent of a second ring started from
 * the letters' sampled positions and fell into a basin it could not leave. The fix starts such a ring on 2-D's dual, an
 * exact solution, so it no longer depends on the letters.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

function play(lines: readonly string[]): string[] {
  const held: string[] = [];
  for (const l of lines) {
    const v = decideSubmit(l, held, 0, derive(held, 0));
    expect(v.kind, `«${l}»`).toBe('record');
    held.push(l);
  }
  return held;
}

const L = (s: string) => s.split('');
const ROWS: [string, string[], string[][]][] = [
  ['R0 the report', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], [L('ABC'), L('DEF')]],
  ['R1 bare circle', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], [L('ABC'), L('DEF')]],
  ['R2 circle voice', ['מעגל O ברדיוס 3', 'מעגל O חסום במשולש ABC', 'מעגל O חסום במשולש DEF'], [L('ABC'), L('DEF')]],
  ['R6 three triangles', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O', 'משולש GHK חוסם את מעגל O'], [L('ABC'), L('DEF'), L('GHK')]],
  ['R9 two squares', ['מעגל O ברדיוס 3', 'ריבוע ABCD חוסם את מעגל O', 'ריבוע EFGH חוסם את מעגל O'], [L('ABCD'), L('EFGH')]],
  ['R7 a triangle, then a square', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'ריבוע DEFG חוסם את מעגל O'], [L('ABC'), L('DEFG')]],
  ['letters XYZ', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש XYZ חוסם את מעגל O'], [L('ABC'), L('XYZ')]],
  ['letters PQR', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש PQR חוסם את מעגל O'], [L('ABC'), L('PQR')]],
];

describe('#2512 analytic — a second ring around a circle builds, tangent and distinct, at seeds 0–8', () => {
  for (const [name, lines, rings] of ROWS) {
    it(name, () => {
      const held = play(lines);
      for (let seed = 0; seed <= 8; seed++) {
        const d = derive(held, seed);
        expect(d.faults ?? [], `seed ${seed}: no fault`).toEqual([]);
        const P = new Map(d.figure.points.map((p) => [p.id, p] as const));
        const c = d.figure.curves.find((k) => k.curve.kind === 'circle')!.curve;
        if (c.kind !== 'circle') throw new Error('no circle');
        rings.forEach((ring, j) => {
          const pts = ring.map((id) => P.get(id)!);
          // every side tangent to O, touching it within the side (the bounded tangency, #1503)
          pts.forEach((a, i) => {
            const b = pts[(i + 1) % pts.length];
            const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
            const t = ((c.cx - a.x) * (b.x - a.x) + (c.cy - a.y) * (b.y - a.y)) / len2;
            const foot = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
            expect(Math.hypot(foot.x - c.cx, foot.y - c.cy), `seed ${seed}: ${ring[i]}${ring[(i + 1) % ring.length]} tangent`).toBeCloseTo(c.r, 3);
            expect(t > 0 && t < 1, `seed ${seed}: ${ring[i]}${ring[(i + 1) % ring.length]} touches within the side`).toBe(true);
          });
          // no vertex on an earlier ring's vertex
          rings.slice(0, j).flat().forEach((e) =>
            pts.forEach((p, i) => expect(Math.hypot(p.x - P.get(e)!.x, p.y - P.get(e)!.y), `seed ${seed}: ${ring[i]} is not on ${e}`).toBeGreaterThan(1e-3)),
          );
        });
      }
    });
  }

  const HEAD: [string[], Record<string, [number, number]>][] = [
    /*
     * Re-measured under #1687 (ADR-AG-348, line provenance): the ring's vertices start fitted to the circle as line 1 drew
     * it, so the circle no longer moves for the ring where that fit holds. At seed 0 the triangle keeps O exactly at
     * (−3.547089, −2.541066), where «מעגל O ברדיוס 3» alone draws it (at 045a8546 the ring moved O to (−1.63, −2.63)).
     * The square and DEF start configurations change with it (the inscribed ABC is now fitted vertex by vertex, as
     * three «X על המעגל» lines are). Still the lock's point: #2512's dual start is for a SECOND
     * ring only, and never touches these.
     */
    [['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O'], { A: [-12.395431, -3.503007], B: [-0.107452, -6.45159], C: [-1.022111, 2.020167], O: [-3.547089, -2.541066] }],
    [['מעגל O ברדיוס 3', 'ריבוע ABCD חוסם את מעגל O'], { A: [-3.89946, -1.137603], B: [1.924106, -2.581929], C: [0.47978, -8.405495], D: [-5.343786, -6.961169] }],
    [['מעגל O ברדיוס 3', 'משולש ABC חסום במעגל O', 'משולש DEF חוסם את מעגל O'], { D: [-0.378594, -2.01532], E: [12.709113, -0.575194], F: [1.347761, 6.122901] }],
  ];
  for (const [lines, want] of HEAD) {
    it(`a ring with no ring around its circle before it keeps its start: «${lines.at(-1)}» draws as at 045a8546, re-measured under #1687 (seed 0)`, () => {
      const P = new Map(derive(play(lines), 0).figure.points.map((p) => [p.id, p] as const));
      for (const [id, [x, y]] of Object.entries(want)) {
        expect(P.get(id)!.x, `${id}.x`).toBeCloseTo(x, 5);
        expect(P.get(id)!.y, `${id}.y`).toBeCloseTo(y, 5);
      }
    });
  }
});
