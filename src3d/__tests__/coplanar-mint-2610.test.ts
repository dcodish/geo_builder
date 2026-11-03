/**
 * #2610 ([ADR-3D-409](../../docs/06b-decisions-3d.md#adr-3d-409); #2048 ruling A, 2026-10-13: *"every example builds
 * on a blank canvas, and whatever is missing is created"*) — A PLANE, FACE OR POLYGON NAMED BY 4+ LETTERS THAT THE
 * FIGURE LACKS IS CREATED IN ONE PLANE.
 *
 * Measured at 3225756c before the fix: the mint pass created every missing letter as an independent `free3` point, so
 * the four points of «המישור ABCD» / «הפאה ABCD» were in general position and the line's own statement was false at
 * every seed (refused `not-coplanar` / `segments-do-not-meet`). The pass now reads what the operand asserts: a face or
 * polygon run is created by its declaration («מרובע ABCD»), and a plane run's 4th+ missing letters ride the plane.
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';

const st = () => useGeo3.getState();
const reset = (seed = 0) => useGeo3.setState({ facts: [], seed, lastError: null, lastNotice: null, lastCreated: null } as never);

function build(lines: readonly string[], seed = 0) {
  reset(seed);
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» at seed ${seed}`).toBeNull();
  }
  // the configuration index is the store's: re-derive at the asked seed (a structural edit resets it)
  const d = derive3(st().facts, seed);
  for (const [id, s] of Object.entries(d.status)) expect(s, `${id} at seed ${seed}`).toBe('ok');
  return d;
}

/** |det| of the four points, scaled by the edge lengths (0 ⇔ coplanar). */
function flatness(p: Vec3[]): number {
  const [a, b, c, d] = p;
  const u = sub3(b, a), v = sub3(c, a), w = sub3(d, a);
  return Math.abs(dot3(cross3(u, v), w)) / Math.max(1e-12, norm3(u) * norm3(v) * norm3(w));
}

describe('#2610 — a plane, face or polygon named by its letters on a blank canvas is created in one plane', () => {
  const ROWS: { lines: string[]; run: string[]; created: string[] }[] = [
    { lines: ['O מפגש האלכסונים של הפאה ABCD'], run: ['A', 'B', 'C', 'D'], created: ['A', 'B', 'C', 'D'] },
    { lines: ['O מפגש האלכסונים של המרובע ABCD'], run: ['A', 'B', 'C', 'D'], created: ['A', 'B', 'C', 'D'] },
    { lines: ["ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'"], run: ['B', 'C', "C'", "B'"], created: ['B', "C'", 'D', 'C', "B'"] },
    { lines: ['BE היטל הישר TB על המישור ABCD'], run: ['A', 'B', 'C', 'D'], created: ['T', 'B', 'A', 'C', 'D'] },
    { lines: ['E על המישור ABCD'], run: ['A', 'B', 'C', 'D'], created: ['A', 'B', 'C', 'D'] },
  ];
  for (const row of ROWS) {
    for (const seed of [0, 1, 2, 3]) {
      it(`«${row.lines.join(' · ')}» builds at seed ${seed}, its run coplanar`, () => {
        const d = build(row.lines, seed);
        const pts = row.run.map((q) => d.positions.get(q));
        expect(pts.every(Boolean), 'every run letter placed').toBe(true);
        expect(flatness(pts as Vec3[])).toBeLessThan(1e-6);
      });
    }
    it(`«${row.lines.join(' · ')}» names the created letters in the notice`, () => {
      build(row.lines);
      expect(st().lastCreated?.ids).toEqual(row.created);
    });
  }

  it('a plane named by letters, then a point on it, builds (the plane line creates the letters)', () => {
    const d = build(['המישור ABCD', 'E על המישור ABCD']);
    expect(flatness(['A', 'B', 'C', 'D'].map((q) => d.positions.get(q)!))).toBeLessThan(1e-6);
  });

  it('the face is created as its declaration: a convex quadrilateral whose diagonals cross inside it', () => {
    for (const seed of [0, 1, 2, 3]) {
      const d = build(['O מפגש האלכסונים של הפאה ABCD'], seed);
      const [A, B, C, D, O] = ['A', 'B', 'C', 'D', 'O'].map((q) => d.positions.get(q)!);
      // O lies strictly inside both diagonals AC and BD
      const along = (p: Vec3, q: Vec3, x: Vec3) => dot3(sub3(x, p), sub3(q, p)) / dot3(sub3(q, p), sub3(q, p));
      for (const t of [along(A, C, O), along(B, D, O)]) {
        expect(t).toBeGreaterThan(1e-3);
        expect(t).toBeLessThan(1 - 1e-3);
      }
      // the polygon is declared (its edges drawn), exactly as «מרובע ABCD» typed first draws it
      expect(d.construction.solids.some((s) => s.ids.join('') === 'ABCD')).toBe(true);
    }
  });

  it('a pentagon face is created by its declaration too', () => {
    const d = build(['מחומש ABCDE']);
    expect(d.construction.solids.some((s) => s.ids.join('') === 'ABCDE')).toBe(true);
  });

  it('existing letters stay where they are; only the missing ones are created', () => {
    reset();
    for (const l of ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)']) st().submit(l);
    st().submit('E על המישור ABCD');
    expect(st().lastError).toBeNull();
    expect(st().lastCreated?.ids).toEqual(['D']);
    const d = derive3(st().facts, 0);
    expect(d.positions.get('A')).toEqual({ x: 0, y: 0, z: 0 });
    expect(Math.abs(d.positions.get('D')!.z)).toBeLessThan(1e-9); // D rides the plane z = 0
  });

  it('three stated collinear letters do not fix a plane: the fourth is created free, and the plane still builds', () => {
    build(['A(0,0,0)', 'B(1,0,0)', 'C(2,0,0)', 'E על המישור ABCD']);
  });

  // controls
  it('four existing points that are not in one plane, named as a plane, are still refused not-coplanar', () => {
    reset();
    for (const l of ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'D(0,0,1)']) st().submit(l);
    st().submit('המישור ABCD');
    expect(st().lastError?.code).toBe('not-coplanar');
    expect(st().facts).toHaveLength(4);
  });

  it('four existing non-coplanar points named as a face are still refused, and nothing is created', () => {
    reset();
    for (const l of ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'D(0,0,1)']) st().submit(l);
    st().submit('O מפגש האלכסונים של הפאה ABCD');
    expect(st().lastError).not.toBeNull();
    expect(st().facts).toHaveLength(4);
    expect(derive3(st().facts, 0).construction.points.has('O')).toBe(false);
  });

  it('an atomic refusal keeps no created points: a face over letters with a non-flat existing triple + apex', () => {
    reset();
    for (const l of ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'D(0,0,1)']) st().submit(l);
    st().submit('O מפגש האלכסונים של המחומש ABCDE');
    expect(st().lastError).not.toBeNull();
    const pts = derive3(st().facts, 0).construction.points;
    expect(pts.has('E')).toBe(false);
    expect(pts.has('O')).toBe(false);
  });

  it('a three-letter run is unchanged: «E על המישור ABC» over stated points builds', () => {
    build(['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'E על המישור ABC']);
  });
});
