/**
 * #2681 ([ADR-3D-413](../../docs/06b-decisions-3d.md#adr-3d-413)) — A PLANE NAMED BY FOUR OR MORE LETTERS INSIDE A
 * RELATION GETS THE SAME COPLANARITY VERDICT AS «המישור ABCD» ALONE (#2610 T7, ADR-3D-409).
 *
 * Measured at ebacadd1 before the fix (`useGeo3.submit`): on a blank canvas «המישור ABCD מקביל למישור EFGH» and
 * «המישור ABCD מאונך לישר EF» built green with A, B, C, D in general position (flatness 0.59 / 0.51); over four
 * stated non-coplanar points the ⟂ form built green and the ∥ form was refused `point-not-determined`. The relation
 * lowered alone, never to the `plane-through` the named form uses, so the run was neither created flat nor checked.
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';

const st = () => useGeo3.getState();
const reset = (seed = 0) => useGeo3.setState({ facts: [], seed, lastError: null, lastNotice: null, lastCreated: null } as never);
const NON_COPLANAR = ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)', 'D(0,0,1)'];

function build(lines: readonly string[], seed = 0) {
  reset(seed);
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» at seed ${seed}`).toBeNull();
  }
  const d = derive3(st().facts, seed);
  for (const [id, s] of Object.entries(d.status)) expect(s, `${id} at seed ${seed}`).toBe('ok');
  return d;
}

/** |det| of the four points, scaled by the edge lengths (0 ⇔ coplanar). */
function flatness(d: ReturnType<typeof derive3>, run: readonly string[]): number {
  const [a, b, c, e] = run.map((q) => d.positions.get(q)) as Vec3[];
  const u = sub3(b, a), v = sub3(c, a), w = sub3(e, a);
  return Math.abs(dot3(cross3(u, v), w)) / Math.max(1e-12, norm3(u) * norm3(v) * norm3(w));
}

/** Every relation reader that takes a plane operand, in the student's spellings (the plan's audit list). */
const RELATIONS: { line: string; runs: string[][] }[] = [
  { line: 'המישור ABCD מקביל למישור EFGH', runs: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']] }, // the report
  { line: 'המישור ABCD מאונך לישר EF', runs: [['A', 'B', 'C', 'D']] }, // the report
  { line: 'EF מקביל למישור ABCD', runs: [['A', 'B', 'C', 'D']] },
  { line: 'EF מאונך למישור ABCD', runs: [['A', 'B', 'C', 'D']] },
  { line: 'המישור ABCD מאונך למישור EFG', runs: [['A', 'B', 'C', 'D']] },
  { line: 'הזווית בין EF למישור ABCD היא 30', runs: [['A', 'B', 'C', 'D']] },
  { line: 'הזווית בין המישור ABCD למישור EFG היא 40', runs: [['A', 'B', 'C', 'D']] },
  { line: 'המרחק בין E למישור ABCD הוא 2', runs: [['A', 'B', 'C', 'D']] },
  { line: 'הפאה ABCD מקבילה למישור EFG', runs: [['A', 'B', 'C', 'D']] },
  { line: 'plane ABCD is parallel to plane EFGH', runs: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']] },
];

describe('#2681 — a four-letter plane inside a relation is created in one plane on a blank canvas', () => {
  for (const row of RELATIONS) {
    for (const seed of [0, 1, 2, 3]) {
      it(`«${row.line}» at seed ${seed}: every run coplanar`, () => {
        const d = build([row.line], seed);
        for (const run of row.runs) expect(flatness(d, run), run.join('')).toBeLessThan(1e-6);
      });
    }
  }

  it('the created plane still has its free shape: «הציגו תצורה אחרת» moves the fourth letter within the plane', () => {
    const at = (seed: number) => build(['המישור ABCD מקביל למישור EFGH'], seed).positions.get('D')!;
    const ds = [0, 1, 2, 3].map(at);
    expect(new Set(ds.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`)).size).toBeGreaterThan(1);
  });

  it('the run is declared once, after the relation: the face of a face relation is still recorded', () => {
    const r = parse3('הפאה ABCD מקבילה למישור EFG');
    expect(r.ok && r.commands.filter((k) => k.type === 'plane-through')).toEqual([{ type: 'plane-through', name: 'ABCD', ids: ['A', 'B', 'C', 'D'] }]);
    expect(r.ok && r.commands[0].type).toBe('plane-rel');
    // a rule that already declares its run is unchanged (no second declaration)
    const cut = parse3('הישר EF חותך את המישור ABCD בנקודה K');
    expect(cut.ok && cut.commands.filter((k) => k.type === 'plane-through')).toHaveLength(1);
  });

  it('a three-letter plane is unchanged: no declaration is added', () => {
    const r = parse3('EF מקביל למישור ABC');
    expect(r.ok && r.commands.some((k) => k.type === 'plane-through')).toBe(false);
  });
});

describe('#2681 — over stated points not in one plane, the relation is refused «not in one plane»', () => {
  for (const row of RELATIONS.filter((r) => !r.line.startsWith('plane '))) {
    it(`«${row.line}» over four non-coplanar points → not-coplanar, nothing recorded`, () => {
      reset();
      for (const l of NON_COPLANAR) st().submit(l);
      st().submit(row.line);
      expect(st().lastError?.code).toBe('not-coplanar');
      expect(st().facts).toHaveLength(NON_COPLANAR.length);
    });
  }

  it('the same verdict as «המישור ABCD» alone (#2610 T7)', () => {
    reset();
    for (const l of NON_COPLANAR) st().submit(l);
    st().submit('המישור ABCD');
    const alone = st().lastError;
    reset();
    for (const l of NON_COPLANAR) st().submit(l);
    st().submit('המישור ABCD מקביל למישור EFGH');
    expect(st().lastError).toEqual(alone);
  });

  // controls
  it('over four stated coplanar points the relation builds', () => {
    const FLAT = ['A(0,0,0)', 'B(1,0,0)', 'C(1,1,0)', 'D(0,1,0)'];
    build([...FLAT, 'המישור ABCD מאונך לישר EF']);
    build([...FLAT, 'המישור ABCD מקביל למישור EFGH']);
  });

  it('a cube face named in a relation builds: the face is its plane', () => {
    build(["קובייה ABCDA'B'C'D'", "A'C' מקביל למישור ABCD", "המישור ABB'A' מאונך למישור ABCD"]);
  });

  it('existing letters stay where they are; the missing fourth rides the plane of the three', () => {
    reset();
    for (const l of ['A(0,0,0)', 'B(1,0,0)', 'C(0,1,0)']) st().submit(l);
    st().submit('המישור ABCD מאונך לישר EF');
    expect(st().lastError).toBeNull();
    const d = derive3(st().facts, 0);
    expect(d.positions.get('A')).toEqual({ x: 0, y: 0, z: 0 });
    expect(Math.abs(d.positions.get('D')!.z)).toBeLessThan(1e-9);
  });
});
