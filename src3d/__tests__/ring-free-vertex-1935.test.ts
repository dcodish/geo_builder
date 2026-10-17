/**
 * Issue #1935 (ADR-3D-356): a flat ring declared over existing points, one of them still FREE, drives that point into
 * the plane — operator ruling 2026-10-09, option A: *"The free point rides into the plane. D moves so that ACBD really
 * is a flat quadrilateral, and the figure holds."*
 *
 * The instance (measured at 9d734201): «משולש ABC · משולש ABD · מרובע ACBD» recorded green with D `free3` and the ring
 * skew at 12/12 seeds (det(AB, AC, AD) = 0.423 at seed 0); likewise «מלבן ACBD», «ריבוע ACBD», the reversed ring, the
 * English spelling, the pinned-A,B,C row and «מחומש ABCDE» over two free corners. The fix re-homes the ring's free
 * vertices onto the plane of its placed ones (`flattenRingFreeVertices3`, apply.ts) — the point kind a minted corner
 * already gets (ADR-3D-172).
 *
 * Locks, at seeds 0–23 through `decideSubmit3` → `derive3`: every class row records and is flat; A, B, C do not move
 * when the ring line is added; D still varies (free in the plane); the controls are unchanged — #1928's all-placed
 * skew ring is still refused `ring-not-flat`, and «משולש ABC · מרובע ABCD» / «טרפז ACBD» stay flat.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { ringSkew3, type Vec3 } from '../engine/vec3';

const SEEDS = 24;

type St = { facts: Fact3[]; seed: number };
function build(lines: readonly string[], seed: number): St {
  let st: St = { facts: [], seed };
  for (const line of lines) {
    const v = decideSubmit3(st, line);
    if (v.kind !== 'record') throw new Error(`«${line}» @${seed}: ${v.kind} ${JSON.stringify((v as { error?: unknown }).error ?? '')}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const positionsOf = (st: St) => derive3(st.facts, st.seed).positions;
const at = (pos: Map<string, Vec3>, id: string): Vec3 => {
  const p = pos.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};

/** `still`: the noun adds no relation on A, B, C, so they must not move. A rectangle or square over the existing triangle
 *  STATES its corner C right-angled (∠ACB = 90°, and a square |CA| = |CB|) — the triangle is driven by that given, so
 *  only flatness is asserted; the square leaves no freedom at all (`determined`). */
type Mode = 'still' | 'driven' | 'determined';
const ROWS: [string, string[], string[], Mode][] = [
  ['the report', ['משולש ABC', 'משולש ABD', 'מרובע ACBD'], ['A', 'C', 'B', 'D'], 'still'],
  ['a rectangle', ['משולש ABC', 'משולש ABD', 'מלבן ACBD'], ['A', 'C', 'B', 'D'], 'driven'],
  ['a square', ['משולש ABC', 'משולש ABD', 'ריבוע ACBD'], ['A', 'C', 'B', 'D'], 'determined'],
  ['a parallelogram', ['משולש ABC', 'משולש ABD', 'מקבילית ACBD'], ['A', 'C', 'B', 'D'], 'driven'],
  ['a rhombus', ['משולש ABC', 'משולש ABD', 'מעוין ACBD'], ['A', 'C', 'B', 'D'], 'driven'],
  ['a kite', ['משולש ABC', 'משולש ABD', 'דלתון ACBD'], ['A', 'C', 'B', 'D'], 'driven'],
  ['the ring reversed', ['משולש ABC', 'משולש ABD', 'מרובע DBCA'], ['D', 'B', 'C', 'A'], 'still'],
  ['another order', ['משולש ABC', 'משולש ABD', 'מרובע ADBC'], ['A', 'D', 'B', 'C'], 'still'],
  ['English', ['triangle ABC', 'triangle ABD', 'quadrilateral ACBD'], ['A', 'C', 'B', 'D'], 'still'],
  ['two free corners', ['משולש ABC', 'משולש CDE', 'מחומש ABCDE'], ['A', 'B', 'C', 'D', 'E'], 'still'],
  ['A, B, C pinned', ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'משולש ABD', 'מרובע ACBD'], ['A', 'C', 'B', 'D'], 'still'],
];

describe('#1935 the ring is flat, and only the free vertex moves', () => {
  it.each(ROWS)('%s: records and is flat at seeds 0–23; A, B, C stay put unless the noun drives them; D still varies', (_name, lines, ring, mode) => {
    const ds = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const before = build(lines.slice(0, -1), seed);
      const after = build(lines, seed);
      const d = derive3(after.facts, after.seed);
      for (const f of after.facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
      expect(ringSkew3(ring.map((id) => at(d.positions, id))), `skew @${seed}`).toBeLessThan(1e-9);
      const p0 = positionsOf(before);
      if (mode === 'still') for (const id of ['A', 'B', 'C']) expect(at(d.positions, id), `${id} @${seed}`).toEqual(at(p0, id));
      const D = at(d.positions, 'D');
      ds.add([D.x, D.y, D.z].map((v) => v.toFixed(4)).join(','));
    }
    // a square over the triangle fixes its shape, so D is the square's corner; otherwise D keeps freedom (ADR-052)
    if (mode === 'determined') expect(ds.size, 'D is the square corner').toBe(1);
    else expect(ds.size, 'D re-samples within the plane').toBeGreaterThan(SEEDS / 2);
  });
});

describe('#1935 the controls are unchanged', () => {
  it('#1928: every vertex placed and skew — still refused ring-not-flat', () => {
    const st = build(['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,5)'], 0);
    const v = decideSubmit3(st, 'מרובע ABCD');
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.code).toBe('ring-not-flat');
  });

  it.each([
    [['משולש ABC', 'מרובע ABCD'], ['A', 'B', 'C', 'D']],
    [['משולש ABC', 'משולש ABD', 'טרפז ACBD'], ['A', 'C', 'B', 'D']],
  ])('%j stays flat at seeds 0–23', (lines, ring) => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const pos = positionsOf(build(lines, seed));
      expect(ringSkew3(ring.map((id) => at(pos, id))), `@${seed}`).toBeLessThan(1e-9);
    }
  });

  it('a triangle over existing points re-homes nothing (flat by itself)', () => {
    const st = build(['משולש ABC', 'משולש ABD', 'משולש BCD'], 0);
    expect(derive3(st.facts, st.seed).construction.points.get('D')?.kind).toBe('free3');
  });
});
