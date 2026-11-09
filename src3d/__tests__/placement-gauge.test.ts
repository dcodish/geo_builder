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
import { absoluteFrameObjects3, absolutePointCount } from '../engine/types';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import type { Vec3 } from '../engine/vec3';
import { scaleGivenActive, scaleGivenSafe } from '../engine/scaleGiven';

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

/**
 * #2746 (ADR-3D-453): ONE "absolute frame?" predicate. `scaleGivenSafe` kept its own list (every plane, every line),
 * which drifted from `hasAbsoluteFrameObject` when ADR-3D-435 stopped counting a free plane: «אורך AB = 4» beside
 * a bare «מישור π3» or «ישר l» turned red and the cube shrank back to edge 1; the other order was refused.
 */
describe('#2746 — the scale given asks the same absolute-frame predicate', () => {
  beforeEach(() => state().clear());
  const CUBE3 = "קובייה ABCDA'B'C'D'";
  const derived = (seed: number) => derive3(state().facts, seed);
  const SEEDS = [0, 3];
  const allOk = (seed: number): void => {
    const d = derive3(state().facts, seed);
    for (const f of state().facts) expect(d.status[f.id], `${f.utterance} @ seed ${seed}`).toBe('ok');
  };
  const snap = (seed: number): Map<string, Vec3> => new Map(derive3(state().facts, seed).resolved.positions);
  const near = (p: Vec3, q: Vec3): number => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

  for (const free of ['מישור π3', 'ישר l']) {
    it(`«אורך AB = 4» then «${free}»: the length stays ok and no point moves`, () => {
      submit(CUBE3);
      submit('אורך AB = 4');
      const before = SEEDS.map(snap);
      submit(free);
      expect(state().lastError).toBeNull();
      SEEDS.forEach((seed, i) => {
        allOk(seed);
        const after = snap(seed);
        expect(near(after.get('B')!, { x: 4, y: 0, z: 0 }), 'B = (4,0,0)').toBeLessThan(1e-9);
        for (const [id, p] of before[i]) expect(near(after.get(id)!, p), `${id} @ seed ${seed}`).toBeLessThan(1e-9);
      });
      expect(scaleGivenActive(derived(0).construction)).toBe(true);
    });

    it(`«${free}» then «אורך AB = 4»: the size is accepted, edge 4`, () => {
      submit(CUBE3);
      submit(free);
      submit('אורך AB = 4');
      expect(state().lastError).toBeNull();
      for (const seed of SEEDS) {
        allOk(seed);
        expect(near(snap(seed).get('B')!, { x: 4, y: 0, z: 0 })).toBeLessThan(1e-9);
      }
    });
  }

  it('a stated distance from A to the free plane holds at the stated size (re-resolved after the rescale)', () => {
    for (const l of [CUBE3, 'אורך AB = 4', 'מישור π3', 'המרחק בין A למישור π3 הוא 2']) submit(l);
    expect(state().lastError).toBeNull();
    for (const seed of SEEDS) {
      allOk(seed);
      const r = derive3(state().facts, seed).resolved;
      const pl = r.planes.get('π3')!;
      const A = r.positions.get('A')!;
      const nn = Math.hypot(pl.n.x, pl.n.y, pl.n.z);
      expect(Math.abs((pl.n.x * A.x + pl.n.y * A.y + pl.n.z * A.z + pl.d) / nn), 'dist(A, π3)').toBeCloseTo(2, 9);
      expect(near(r.positions.get('B')!, { x: 4, y: 0, z: 0 })).toBeLessThan(1e-9);
    }
  });

  it('a free plane through A, B, C and a free line through A and C′ are carried by the rescale', () => {
    for (const l of [CUBE3, 'אורך AB = 4', 'מישור π3', 'A על המישור π3', 'B על המישור π3', 'C על המישור π3', 'ישר l', 'A על הישר l', "C' על הישר l"]) submit(l);
    expect(state().lastError).toBeNull();
    for (const seed of SEEDS) {
      allOk(seed);
      const r = derive3(state().facts, seed).resolved;
      const pl = r.planes.get('π3')!;
      const nn = Math.hypot(pl.n.x, pl.n.y, pl.n.z);
      for (const id of ['A', 'B', 'C']) {
        const p = r.positions.get(id)!;
        expect(Math.abs(pl.n.x * p.x + pl.n.y * p.y + pl.n.z * p.z + pl.d) / nn, `${id} on π3`).toBeLessThan(1e-9);
      }
      const ln = r.lines.get('ℓ')!;
      expect(distToLine(r.positions.get("C'")!, ln.anchor, ln.dir), "C' on ℓ").toBeLessThan(1e-9);
      expect(distToLine(r.positions.get('A')!, ln.anchor, ln.dir), 'A on ℓ').toBeLessThan(1e-9);
      expect(near(r.positions.get("C'")!, { x: 4, y: 4, z: 4 })).toBeLessThan(1e-9);
    }
  });

  it('a volume given on a pyramid beside a free line is the scale given too', () => {
    for (const l of ['פירמידה ABCDS שבסיסה ריבוע', 'נפח הפירמידה ABCDS = 12', 'ישר k']) submit(l);
    expect(state().lastError).toBeNull();
    for (const seed of SEEDS) allOk(seed);
  });

  // the controls: an absolute object still detaches the size, as #551 contracts — refused as today
  // #2789 (ADR-3D-457): «l1:x=t(1,1,1)» passes through the origin, so the rescale keeps it — now accepted (below); the
  // controls off the origin still refuse, the follow-up #2792's
  for (const abs of ['x+y+z=1', 'P(1,2,3)']) {
    it(`«${abs}» still refuses the size (size-on-solid)`, () => {
      for (const l of [CUBE3, 'אורך AB = 4', abs]) submit(l);
      const d = derived(0);
      expect(hasAbsoluteFrameObject(d.construction)).toBe(true);
      expect(scaleGivenSafe(d.construction)).toBe(false);
      const sized = state().facts.find((f) => f.utterance === 'אורך AB = 4')!;
      expect(d.status[sized.id]).toEqual(expect.objectContaining({ code: 'size-on-solid' }));
    });
  }

  it('a partial point («P on the positive x-axis») frames the figure and keeps the size (#2789, ADR-3D-457, operator "4 - b")', () => {
    for (const l of [CUBE3, 'אורך AB = 4', 'P נמצא על החלק החיובי של ציר ה-x']) submit(l);
    const d = derived(0);
    expect(hasAbsoluteFrameObject(d.construction)).toBe(true);
    expect(scaleGivenSafe(d.construction)).toBe(true);
  });
});

/**
 * #2789 (ADR-3D-457) — a point stated on a coordinate axis is an absolute object (ADR-3D-094: "Lane-A absolute like
 * coord"), and a size beside any object the rescale keeps (a cone through the origin) is accepted in both orders.
 * Operator 2026-11-09 on #2746: "4 - b"; ADR-W-199: "we would not refuse something that can be built".
 */
describe('#2789 — an axis point frames the figure, and a size beside an origin cone holds', () => {
  beforeEach(() => state().clear());
  const CUBE = "קובייה ABCDA'B'C'D'";
  const SIZE = 'אורך AB = 4';
  const PX = 'P נמצא על החלק החיובי של ציר ה-x';
  const SEEDS8 = [0, 1, 2, 3, 4, 5, 6, 7];
  const near = (p: Vec3, q: Vec3): number => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const build = (lines: readonly string[]): void => {
    for (const l of lines) {
      submit(l);
      expect(state().lastError, l).toBeNull();
    }
  };
  const okAt = (seed: number) => {
    const d = derive3(state().facts, seed);
    for (const f of state().facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
    return d;
  };
  const onAxis = (p: Vec3, axis: 'x' | 'y' | 'z', sign: 1 | -1 | 0) => {
    const others = (['x', 'y', 'z'] as const).filter((a) => a !== axis);
    for (const a of others) expect(p[a]).toBe(0);
    if (sign !== 0) expect(Math.sign(p[axis])).toBe(sign);
  };

  it('the report: the size holds, P stays on +x, the placement is sampled, every vertex clears P, the axes are drawn', () => {
    build([CUBE, PX, SIZE]);
    const As = new Set<string>();
    for (const seed of SEEDS8) {
      const d = okAt(seed);
      const pos = d.resolved.positions;
      expect(near(pos.get('A')!, pos.get('B')!)).toBeCloseTo(4, 9);
      onAxis(pos.get('P')!, 'x', 1);
      As.add(pos.get('A')!.x.toFixed(6));
      for (const v of ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"]) expect(near(pos.get(v)!, pos.get('P')!), `${v} @${seed}`).toBeGreaterThan(0.1);
    }
    expect(As.size, 'A varies across seeds').toBeGreaterThan(1);
    const d0 = derive3(state().facts, 0);
    expect(placementSampled3(d0.construction)).toBe(true);
    expect(buildScene3(d0.construction, d0.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).axes.length, 'axes drawn').toBeGreaterThan(0);
  });

  it('size first: «אורך AB = 4» stays ok and the cube keeps edge 4 when P is added', () => {
    build([CUBE, SIZE]);
    expect(near(at(0, 'A'), at(0, 'B'))).toBeCloseTo(4, 9);
    build([PX]);
    for (const seed of SEEDS8) {
      const d = okAt(seed);
      expect(near(d.resolved.positions.get('A')!, d.resolved.positions.get('B')!)).toBeCloseTo(4, 9);
      onAxis(d.resolved.positions.get('P')!, 'x', 1);
    }
  });

  it.each([
    ['P נמצא על החלק השלילי של ציר ה-y', 'y', -1],
    ['P נמצא על החלק החיובי של ציר ה-z', 'z', 1],
    ['P נמצא על ציר ה-x', 'x', 0],
  ] as const)('«%s», both orders', (line, axis, sign) => {
    for (const order of [[CUBE, line, SIZE], [CUBE, SIZE, line]]) {
      state().clear();
      build(order);
      for (const seed of [0, 3]) {
        const d = okAt(seed);
        expect(near(d.resolved.positions.get('A')!, d.resolved.positions.get('B')!)).toBeCloseTo(4, 9);
        onAxis(d.resolved.positions.get('P')!, axis, sign);
      }
    }
  });

  it('the drift: a box with «P נמצא על ציר ה-x» and «אורך AB = 4» keeps P on the x-axis at every seed', () => {
    build(["תיבה ABCDA'B'C'D'", 'P נמצא על ציר ה-x', SIZE]);
    for (const seed of SEEDS8) onAxis(okAt(seed).resolved.positions.get('P')!, 'x', 0);
  });

  it('a pyramid’s volume beside a half-axis point: ok in both orders, the same drawing', () => {
    const vol = 'נפח הפירמידה ABCDS = 12';
    build(['פירמידה ABCDS', PX, vol]);
    const first = [0, 3].map((s) => okAt(s).resolved.positions);
    state().clear();
    build(['פירמידה ABCDS', vol, PX]);
    [0, 3].forEach((s, i) => {
      const pos = okAt(s).resolved.positions;
      for (const [id, p] of pos) expect(near(p, first[i].get(id)!), `${id} @${s}`).toBeLessThan(1e-9);
    });
  });

  it('a vertex on the +x half-axis with the size: |AB| = 4 and D on the half-axis', () => {
    build([CUBE, 'הקודקוד D נמצא על החלק החיובי של ציר ה-x', SIZE]);
    for (const seed of SEEDS8) {
      const pos = okAt(seed).resolved.positions;
      expect(near(pos.get('A')!, pos.get('B')!)).toBeCloseTo(4, 9);
      const D = pos.get('D')!;
      expect(Math.abs(D.y) + Math.abs(D.z)).toBeLessThan(1e-6);
      expect(D.x).toBeGreaterThan(0);
    }
  });

  it.each(['הקודקוד D נמצא על ציר ה-x', 'D בראשית הצירים', 'המישור ABC מונח על המישור [xy]', 'x+y+z=0', 'l1:x=t(1,1,1)'])(
    'the origin cone «%s» keeps the size, both orders',
    (line) => {
      for (const order of [[CUBE, line, SIZE], [CUBE, SIZE, line]]) {
        state().clear();
        build(order);
        for (const seed of [0, 3]) {
          const pos = okAt(seed).resolved.positions;
          expect(near(pos.get('A')!, pos.get('B')!)).toBeCloseTo(4, 9);
        }
      }
    },
  );

  it.each(['P(2,0,0)', 'x+y+z=1', 'l1:x=(1,0,0)+t(1,1,1)'])('a control off the origin «%s» still refuses the size (#2792)', (line) => {
    build([CUBE, line]);
    submit(SIZE);
    expect(state().lastError).toMatchObject({ code: 'size-on-solid' });
  });

  it('an axis point is not a stated position: absolutePointCount and the translation axes are untouched', () => {
    build([CUBE, PX]);
    const c = derive3(state().facts, 0).construction;
    expect(absolutePointCount(c)).toBe(0);
    expect(absoluteFrameObjects3(c)).toEqual([{ kind: 'point', scaleInvariant: true }]);
  });
});

/**
 * #2798 (ADR-3D-456) — a point built from BOTH the figure and a fixed object is drawn at its own definition wherever the
 * funnel lands the figure. «M אמצע AP» beside «P(1,2,3)» was carried off with the cube (1–4.6 units off the midpoint)
 * while every line read green; a foot from a vertex to an equation plane stayed where the canonical cube had put it.
 */
describe('#2798 — the funnel re-seats a mixed point from its own definition', () => {
  beforeEach(() => state().clear());
  type P3 = { x: number; y: number; z: number };
  const lerp = (a: P3, b: P3, t: number): P3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  const gap = (a: P3, b: P3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const mean = (...ps: P3[]): P3 => ({ x: ps.reduce((s, q) => s + q.x, 0) / ps.length, y: ps.reduce((s, q) => s + q.y, 0) / ps.length, z: ps.reduce((s, q) => s + q.z, 0) / ps.length });
  const footOnPlane = (p: P3, n: P3, d: number): P3 => {
    const t = (n.x * p.x + n.y * p.y + n.z * p.z + d) / (n.x * n.x + n.y * n.y + n.z * n.z);
    return { x: p.x - n.x * t, y: p.y - n.y * t, z: p.z - n.z * t };
  };
  const footOnLine = (p: P3, a: P3, u: P3): P3 => lerp(a, { x: a.x + u.x, y: a.y + u.y, z: a.z + u.z }, ((p.x - a.x) * u.x + (p.y - a.y) * u.y + (p.z - a.z) * u.z) / (u.x * u.x + u.y * u.y + u.z * u.z));
  const CUBE = "קובייה ABCDA'B'C'D'";
  const PI1 = 'המישור π1: x + y + z - 1 = 0';
  const L1 = 'הישר ℓ1: x = (1,2,3) + t(1,1,1)';
  const ONES = { x: 1, y: 1, z: 1 };
  const P = { x: 1, y: 2, z: 3 };
  /** every line accepted, every fact ok at seeds 0–7, and the drawn point at its definition from the drawn inputs */
  const holds = (lines: readonly string[], off: (p: (id: string) => P3) => number, seeds = 8): void => {
    for (const l of lines) {
      submit(l);
      expect(state().lastError, l).toBeNull();
    }
    for (let seed = 0; seed < seeds; seed++) {
      const d = derive3(state().facts, seed);
      for (const f of state().facts) expect(d.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
      expect(off((id) => d.positions.get(id)!), `seed ${seed}`).toBeLessThan(1e-9);
    }
  };
  const mid = (m: string, a: string, b: string) => (p: (id: string) => P3) => gap(p(m), lerp(p(a), p(b), 0.5));

  it('the report: «M אמצע AP» beside «P(1,2,3)» is the midpoint at every seed, P stays put, the cube still roams', () => {
    holds([CUBE, 'P(1,2,3)', 'M אמצע AP'], mid('M', 'A', 'P'));
    for (let seed = 0; seed < 8; seed++) expect(gap(at(seed, 'P'), P)).toBe(0);
    expect(new Set([0, 1, 2, 3].map((s) => at(s, 'A').x.toFixed(6))).size, 'the placement is still sampled').toBeGreaterThan(1);
  });
  it.each([
    ['a box', ["תיבה ABCDA'B'C'D'", 'P(1,2,3)', 'M אמצע AP'], 'A'],
    ['a pyramid', ['פירמידה ABCDS', 'P(1,2,3)', 'M אמצע SP'], 'S'],
    ['a tetrahedron', ['פירמידה משולשת ABCD', 'P(1,2,3)', 'M אמצע AP'], 'A'],
  ])('%s: the same', (_n, lines, v) => holds(lines, mid('M', v, 'P')));
  it('a midpoint of two stated points never moves with the cube (all its inputs are fixed)', () => {
    holds([CUBE, 'P(1,2,3)', 'Q(4,0,1)', 'M אמצע PQ'], (p) => gap(p('M'), { x: 2.5, y: 1, z: 2 }));
    for (let seed = 0; seed < 8; seed++) expect(at(seed, 'M')).toEqual({ x: 2.5, y: 1, z: 2 });
  });
  it('a ratio point and a centroid with a stated point', () => {
    holds([CUBE, 'P(1,2,3)', 'E על AP כך ש-AE:EP = 2:1'], (p) => gap(p('E'), lerp(p('A'), p('P'), 2 / 3)));
    state().clear();
    holds([CUBE, 'P(1,2,3)', 'E מפגש התיכונים של משולש ABP'], (p) => gap(p('E'), mean(p('A'), p('B'), p('P'))));
  });
  it('a foot from a vertex to an equation plane and to a typed line is the foot of the DRAWN vertex', () => {
    holds([CUBE, PI1, 'מ-A מורידים אנך למישור π1 החותך אותו בנקודה F'], (p) => gap(p('F'), footOnPlane(p('A'), ONES, -1)));
    state().clear();
    holds([CUBE, L1, 'מ-B מעבירים אנך לישר ℓ1 החותך אותו בנקודה F'], (p) => gap(p('F'), footOnLine(p('B'), P, ONES)));
  });
  it('an equation plane’s crossing with an edge lies on the plane and on the edge — the funnel keeps the crossing on its ink', () => {
    holds([CUBE, PI1, "המישור π1 חותך את AC' בנקודה E"], (p) => {
      const E = p('E');
      const A = p('A');
      const C = p("C'");
      const t = ((E.x - A.x) * (C.x - A.x) + (E.y - A.y) * (C.y - A.y) + (E.z - A.z) * (C.z - A.z)) / gap(A, C) ** 2;
      return Math.abs(E.x + E.y + E.z - 1) + gap(E, lerp(A, C, t)) + (t < 0 || t > 1 ? 1 : 0);
    });
  });
  it('control: the crossing of a typed line with plane ABC (resolved late) is unchanged', () => {
    holds([CUBE, L1, 'הישר ℓ1 חותך את מישור ABC בנקודה E'], (p) => gap(p('E'), footOnLine(p('E'), P, ONES)));
  });
  it('a point built from a mixed point follows the re-seated one', () => {
    holds([CUBE, 'P(1,2,3)', 'M אמצע AP', 'N אמצע MB'], (p) => mid('M', 'A', 'P')(p) + mid('N', 'M', 'B')(p));
  });
  it('the refusals that disappear: «AM = MP» is true, «E על המישור ABP» is buildable (ADR-W-199)', () => {
    holds([CUBE, 'P(1,2,3)', 'M אמצע AP', 'AM = MP'], mid('M', 'A', 'P'));
    state().clear();
    holds([CUBE, 'P(1,2,3)', 'מישור ABP', 'E על המישור ABP'], (p) => {
      const [A, B, Q, E] = [p('A'), p('B'), p('P'), p('E')];
      const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
      const v = { x: Q.x - A.x, y: Q.y - A.y, z: Q.z - A.z };
      const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
      return Math.abs(n.x * (E.x - A.x) + n.y * (E.y - A.y) + n.z * (E.z - A.z)) / Math.hypot(n.x, n.y, n.z);
    });
  });
  it('a stated length on a rider of a mixed segment holds where the rider is drawn («E על AP» · «AE = 1»)', () => {
    holds([CUBE, 'P(1,2,3)', 'E על AP', 'AE = 1'], (p) => {
      const [A, E, Q] = [p('A'), p('E'), p('P')];
      const t = ((E.x - A.x) * (Q.x - A.x) + (E.y - A.y) * (Q.y - A.y) + (E.z - A.z) * (Q.z - A.z)) / gap(A, Q) ** 2;
      return gap(E, lerp(A, Q, t)) + Math.abs(gap(A, E) - 1);
    }, 3); // the drive is a full pivot solve per seed (~1.7 s)
  });
});
