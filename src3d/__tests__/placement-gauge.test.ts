/**
 * #367 (ADR-3D-095): a solid's placement is a GAUGE only while nothing in the figure is absolute.
 *
 * Operator report (2026-07-28, playing PR #356): `פירמידה משולשת ABCD` then `l1:x=t(0,m,2m-2)` drew the
 * line straight through vertex A, and "show another configuration" never separated them — "it seems that
 * A is hard coded at 0,0,0". It was: the canonical placement puts the first vertex at the origin and the
 * second along +x, and only the SHAPE dims were sampled, so a line through the origin passed through A in
 * every configuration. The figure asserted a coincidence the student never stated (ADR-052 / M4).
 *
 * The class is NOT "lines": it is "an unstated placement relative to an absolute-frame object is frozen".
 * Equation planes and coordinate points are the same case, so they are asserted here too.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3, hasAbsoluteFrameObject, placementSampled3 } from '../engine/evaluate';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import type { Vec3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** Distance from a point to the resolved line — the quantity the operator was looking at. */
const distToLine = (p: Vec3, anchor: Vec3, dir: Vec3): number => {
  const ap = { x: p.x - anchor.x, y: p.y - anchor.y, z: p.z - anchor.z };
  const dd = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
  const t = (ap.x * dir.x + ap.y * dir.y + ap.z * dir.z) / dd;
  return Math.hypot(ap.x - t * dir.x, ap.y - t * dir.y, ap.z - t * dir.z);
};

const at = (seed: number, id: string): Vec3 => derive3(state().facts, seed).resolved.positions.get(id)!;

describe('#367 — an unstated placement against an absolute object is sampled, not frozen', () => {
  beforeEach(() => state().clear());

  it("the operator's sequence: the line no longer passes through A, at any seed", () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    expect(state().lastError).toBeNull();

    for (let seed = 0; seed < 24; seed++) {
      const res = derive3(state().facts, seed).resolved;
      const line = res.lines.get('ℓ1')!;
      expect(line, 'the line resolves').toBeTruthy();
      for (const id of ['A', 'B', 'C', 'D']) {
        const d = distToLine(res.positions.get(id)!, line.anchor, line.dir);
        expect(d, `${id} clears ℓ1 at seed ${seed}`).toBeGreaterThan(0.15);
      }
    }
  });

  it('A is no longer pinned at the origin, and the placement genuinely varies', () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    const seen = [0, 1, 2, 3, 4, 5].map((s) => at(s, 'A'));
    for (const A of seen) {
      expect(Math.hypot(A.x, A.y, A.z), 'A is off the origin').toBeGreaterThan(1e-6);
    }
    // distinct placements, not one value repeated
    const distinct = new Set(seen.map((A) => `${A.x.toFixed(3)},${A.y.toFixed(3)},${A.z.toFixed(3)}`));
    expect(distinct.size, 'the placement varies across configurations').toBeGreaterThan(3);
  });

  it('the shape is untouched — only the placement moved (a rigid motion)', () => {
    submit('פירמידה משולשת ABCD');
    submit('l1:x=t(0,m,2m-2)');
    const edge = (seed: number, a: string, b: string): number => {
      const p = at(seed, a);
      const q = at(seed, b);
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    };
    // |AB| is the similarity gauge: identical at every seed. The placement must not have scaled it.
    expect(edge(0, 'A', 'B')).toBeCloseTo(edge(5, 'A', 'B'), 9);
    expect(edge(0, 'A', 'B')).toBeCloseTo(1, 9);
  });

  it('WITHOUT an absolute object the placement stays frozen (stability — the figure must not wander)', () => {
    submit('פירמידה משולשת ABCD');
    const A0 = at(0, 'A');
    const A3 = at(3, 'A');
    expect(A0.x).toBeCloseTo(0, 12);
    expect(A0.y).toBeCloseTo(0, 12);
    expect(A0.z).toBeCloseTo(0, 12);
    expect(A3.x).toBeCloseTo(0, 12);
    expect(at(0, 'B').x).toBeCloseTo(1, 12);
  });

  it('a PINNED figure is unaffected — the pivot owns the placement (no double placement)', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit('A(1,2,3)');
    expect(state().lastError).toBeNull();
    const A = at(0, 'A');
    expect(A.x).toBeCloseTo(1, 6);
    expect(A.y).toBeCloseTo(2, 6);
    expect(A.z).toBeCloseTo(3, 6);
  });

  describe('the class beyond the reported instance', () => {
    it('an EQUATION plane frames the figure the same way', () => {
      submit("תיבה ABCDA'B'C'D'");
      submit('המישור π1: z - 3 = 0');
      expect(state().lastError).toBeNull();
      const seen = [0, 1, 2, 3].map((s) => at(s, 'A'));
      const distinct = new Set(seen.map((A) => `${A.x.toFixed(3)},${A.y.toFixed(3)},${A.z.toFixed(3)}`));
      expect(distinct.size, 'the box is placed differently against the plane each time').toBeGreaterThan(2);
    });

    it('the predicate answers ONE question for both consumers', () => {
      submit('פירמידה משולשת ABCD');
      const bare = derive3(state().facts, 0);
      expect(hasAbsoluteFrameObject(bare.construction)).toBe(false);
      submit('l1:x=t(0,m,2m-2)');
      const framed = derive3(state().facts, 0);
      expect(hasAbsoluteFrameObject(framed.construction), 'a parametric line IS an absolute frame').toBe(true);
    });
  });
});

/**
 * #2592 (ADR-3D-435): a FREE plane («מישור π3») is not an absolute frame object. It carries no absolute
 * data, and `resolveFreePlane` already samples its own three DOFs relative to the figure. Counting it
 * sampled the solid's placement too: «מישור π3» threw the cube off the floor (cue 0 → 9, the x/y/z axes
 * drawn) and the first membership or ∥/⊥ closed the gauge and put it back. Two jumps, where the operator's
 * rule is that a solid stays on the floor until the student places it (ADR-3D-400) and adding a statement
 * never moves the figure. A bare plane draws no axes (sr-15, ADR-W-175: *"clean canvas always"*).
 */
describe('#2592 — a free plane is not an absolute frame: the figure never jumps for it', () => {
  beforeEach(() => state().clear());

  const SEEDS = [0, 1, 2, 3, 7];
  const CUBE = "קובייה ABCDA'B'C'D'";
  const derived = (seed: number) => derive3(state().facts, seed);
  const cueAt = (seed: number) => {
    const d = derived(seed);
    return freeDofCount3(d.construction, d.resolved);
  };
  const axesAt = (seed: number) => {
    const d = derived(seed);
    return buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).axes.length;
  };
  /** The plane up to the sign of its equation, so the same plane at two seeds reads the same. */
  const planeKey = (seed: number) => {
    const pl = derived(seed).resolved.planes.get('π3')!;
    const s = [pl.n.x, pl.n.y, pl.n.z].find((v) => Math.abs(v) > 1e-9)! > 0 ? 1 : -1;
    return [pl.n.x, pl.n.y, pl.n.z, pl.d].map((v) => (s * v).toFixed(4)).join(',');
  };

  interface Row {
    name: string;
    lines: string[];
    base: string[];
    above: string[];
    /** π3's own DOFs once every line is in: membership 2 (its normal), ∥ or ⊥ 1 (its offset). */
    planeDof: number;
  }
  const SOLIDS = [
    { solid: CUBE, base: ['A', 'B', 'C', 'D'], above: ["A'", "B'", "C'", "D'"], member: 'A' },
    { solid: 'משולש ABC', base: ['A', 'B', 'C'], above: [], member: 'A' },
    { solid: 'פירמידה SABCD', base: ['A', 'B', 'C', 'D'], above: ['S'], member: 'S' },
  ];
  const ROWS: Row[] = [
    ...SOLIDS.flatMap(({ solid, base, above, member }) => [
      { name: `${solid} · membership`, lines: [solid, 'מישור π3', `${member} על המישור π3`], base, above, planeDof: 2 },
      { name: `${solid} · ∥`, lines: [solid, 'מישור π3', 'π3 ∥ ABC'], base, above, planeDof: 1 },
      { name: `${solid} · ⊥`, lines: [solid, 'מישור π3', 'π3 ⊥ AB'], base, above, planeDof: 1 },
    ]),
    // the plane minted by a ⊥ line (ADR-3D-388), and a containment, on the cube
    { name: 'cube · minted by «הישר AC׳ מאונך למישור π3»', lines: [CUBE, "הישר AC' מאונך למישור π3"], base: SOLIDS[0].base, above: SOLIDS[0].above, planeDof: 1 },
    { name: 'cube · «הישר AB מוכל במישור π3»', lines: [CUBE, 'מישור π3', 'הישר AB מוכל במישור π3'], base: SOLIDS[0].base, above: SOLIDS[0].above, planeDof: 1 },
  ];

  for (const row of ROWS) {
    it(row.name, () => {
      submit(row.lines[0]);
      const before = SEEDS.map((seed) => ({ pos: new Map(derived(seed).resolved.positions), cue: cueAt(seed) }));
      for (const line of row.lines.slice(1)) {
        submit(line);
        expect(state().lastError, line).toBeNull();
        const last = line === row.lines[row.lines.length - 1];
        SEEDS.forEach((seed, i) => {
          const d = derived(seed);
          for (const f of state().facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
          // every earlier point stays exactly where it was: only the plane is new
          for (const [id, p] of before[i].pos) {
            const q = d.resolved.positions.get(id)!;
            expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), `«${line}» moved ${id} @${seed}`).toBeLessThan(1e-9);
          }
          expect(hasAbsoluteFrameObject(d.construction), `«${line}»`).toBe(false);
          expect(placementSampled3(d.construction), `«${line}»`).toBe(false);
          expect(axesAt(seed), `«${line}» draws no axes @${seed}`).toBe(0);
          // the cue reads the plane's own freedom, never the +6 placement
          const planeDofs = d.resolved.freePlaneDofs.get('π3');
          expect(cueAt(seed), `«${line}» @${seed}`).toBe(before[i].cue + planeDofs!);
          if (last) expect(planeDofs, `π3's DOFs after «${line}»`).toBe(row.planeDof);
          else expect(planeDofs, 'a bare plane: normal 2 + offset 1').toBe(3);
        });
        // ADR-052: π3 still varies across configurations while it has a free DOF
        expect(new Set(SEEDS.map(planeKey)).size, `π3 varies after «${line}»`).toBeGreaterThan(1);
      }
      // the solid is on the floor, in the ADR-3D-400 frame, at every configuration
      for (const seed of SEEDS) {
        const pos = derived(seed).resolved.positions;
        const [b0, b1] = [pos.get(row.base[0])!, pos.get(row.base[1])!];
        expect(Math.hypot(b0.x, b0.y, b0.z), `${row.base[0]} at the origin @${seed}`).toBeLessThan(1e-9);
        expect(Math.abs(b1.y) + Math.abs(b1.z), `the first edge along +x @${seed}`).toBeLessThan(1e-9);
        expect(b1.x).toBeGreaterThan(0);
        for (const id of row.base) expect(Math.abs(pos.get(id)!.z), `${id} on the floor @${seed}`).toBeLessThan(1e-9);
        for (const id of row.above) expect(pos.get(id)!.z, `${id} above the floor @${seed}`).toBeGreaterThan(1e-6);
      }
    });
  }

  it('FR-SP-4: the canonical cube beside a pinned free plane prints no π3 equation and no coordinate', () => {
    for (const lines of [
      [CUBE, "הישר AC' מאונך למישור π3"],
      [CUBE, 'מישור π3', 'π3 ∥ ABC', 'A על המישור π3'],
    ]) {
      state().clear();
      for (const l of lines) submit(l);
      for (const seed of [0, 1, 3]) {
        const c = derived(seed).construction;
        const panel = dataView(c, seed);
        expect(panel.planes, lines.join(' · ')).toEqual([]);
        expect(panel.points).toEqual([]);
        expect(panel.pointCoords).toEqual({});
        expect(panel.vectors.filter((v) => v.coords !== null)).toEqual([]);
      }
      const c = derived(0).construction;
      // the ask lane answers the frameless note (ADR-3D-181), never an equation
      expect(answerQuery(c, 'משוואת המישור π3', 0).note, lines.join(' · ')).toBe('noFrame');
      expect(answerQuery(c, 'A', 0).answer).toBeNull();
    }
  });

  describe('unchanged: an absolute object beside a free plane still frames the figure (ADR-3D-095, ADR-3D-247)', () => {
    const GUARDS: { name: string; line: string; sampled: boolean }[] = [
      { name: 'an equation plane', line: 'המישור π1: z - 3 = 0', sampled: true },
      { name: 'a coordinate point', line: 'P(1,2,3)', sampled: true },
      { name: 'the free plane given its equation (M1: it stops being free)', line: 'המישור π3: z - 3 = 0', sampled: true },
      { name: 'the free plane related to a coordinate plane', line: 'π3 ∥ [xy]', sampled: true },
      { name: "a coordinate on the figure's own vertex (the pivot places it)", line: 'A(0,0,0)', sampled: false },
    ];
    for (const g of GUARDS) {
      it(g.name, () => {
        for (const l of [CUBE, 'מישור π3', g.line]) submit(l);
        expect(state().lastError).toBeNull();
        const d = derived(0);
        for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
        expect(hasAbsoluteFrameObject(d.construction)).toBe(true);
        expect(placementSampled3(d.construction)).toBe(g.sampled);
        expect(axesAt(0), 'the axes are drawn').toBe(3);
      });
    }

    it('the sampled placement is counted: +6 beside the plane (ADR-3D-247)', () => {
      for (const l of [CUBE, 'מישור π3', 'המישור π1: z - 3 = 0']) submit(l);
      expect(cueAt(0)).toBe(3 + 6);
    });

    it('the predicate itself: a free plane and a free line are not absolute; an equation plane is', () => {
      submit(CUBE);
      submit('מישור π3');
      expect(hasAbsoluteFrameObject(derived(0).construction), 'a free plane').toBe(false);
      submit('ישר l');
      expect(hasAbsoluteFrameObject(derived(0).construction), 'a free line beside it').toBe(false);
      submit('המישור π1: z - 3 = 0');
      expect(hasAbsoluteFrameObject(derived(0).construction), 'an equation plane').toBe(true);
    });
  });
});
