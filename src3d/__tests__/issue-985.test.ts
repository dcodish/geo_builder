/**
 * #985 (ADR-3D-244) — a stated shape is RESPECTED: the nodes it needs are created, carrying the freedom
 * the shape leaves open.
 *
 * Operator, playing round #974 T15/T16: *"on a kite the image invents a point D (which is correct behavior)
 * but in T15 is refuses because point is not determine while it is possible to create such a trapezoid.
 * why?"* — and the ruling (2026-09-11): *"when a user asks for a shape, we respect it and create nodes as
 * needed with dof. so yes - we support trapezoid as well as all other shapes."*
 *
 * «משולש ABC» · «טרפז ABCD» refused `unknown-point: D` while five sibling nouns invented the corner. The
 * refusal (ADR-3D-152) reasoned that an undetermined corner cannot be completed without asserting an
 * unstated given. Half right: a SPECIFIC corner would be. A corner minted FREE where the shape leaves it
 * free asserts nothing — FR-SP-2's "a figure that is not fully determined is a normal state".
 *
 * The mechanism (the operator's own pointer — *"the 2d tool does this sequence with no issue at all"*): 2-D
 * mints D as a `scaled-offset` vertex, `anchor + k·(to − from)`. 3-D now has the same kind, and its k is a
 * REAL free DOF: counted by `freeDofCount3`, resampled per seed, and driven by the pivot's rider lane
 * (#820) when a later given reads it. It is the parallelogram corner (#984) with the ratio released.
 *
 * What a plane rider + the ∥ pin could NOT do (round #988's first attempt, `claim-refuted`): a rider is
 * sampled, not solved, so a pin can only verify it. The relation has to live in the point's construction.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';
import { quadCornerDef } from '../engine/baseShapes';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (lines: string[], seed = 0) => {
  reset();
  useGeo3.setState({ seed });
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, st.seed);
  return { st, d, pos: d.resolved.positions, dof: freeDofCount3(d.construction, d.resolved) };
};
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const norm = (v: V) => Math.hypot(v.x, v.y, v.z);
const cross = (u: V, v: V): V => ({ x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x });
/** sin of the angle between two segments — 0 exactly when they are parallel. */
const sinBetween = (pos: Map<string, V>, p: string, q: string, r: string, s: string) => {
  const u = sub(pos.get(q)!, pos.get(p)!);
  const v = sub(pos.get(s)!, pos.get(r)!);
  return norm(cross(u, v)) / (norm(u) * norm(v));
};
const len = (pos: Map<string, V>, p: string, q: string) => norm(sub(pos.get(q)!, pos.get(p)!));
const inkOf = (d: ReturnType<typeof derive3>) => new Set(d.construction.segments.map((s) => [...s].sort().join('')));

beforeEach(reset);

describe('#985 — «משולש ABC» · «טרפז ABCD» BUILDS, and DC ∥ AB holds by construction', () => {
  it.each([0, 1, 2, 3])('seed %i — the corner is placed, the bases are parallel, and it is visibly a trapezoid', (seed) => {
    const { st, pos } = build(['משולש ABC', 'טרפז ABCD'], seed);
    expect(st.lastError, 'no refusal').toBeNull();
    expect(pos.has('D'), 'D exists').toBe(true);
    expect(sinBetween(pos, 'D', 'C', 'A', 'B'), 'DC ∥ AB — the family definition, on the ring as named').toBeLessThan(1e-9);
    // ADR-052 / the baseShapes sampling rule: a stated trapezoid must never LOOK like a parallelogram
    const ratio = len(pos, 'D', 'C') / len(pos, 'A', 'B');
    expect(ratio).toBeGreaterThan(0);
    expect(Math.abs(ratio - 1), `|DC|/|AB| = ${ratio} must not be ≈ 1 (that is the parallelogram)`).toBeGreaterThan(0.1);
  });

  it('the corner is a `scaled-offset` with its ratio FREE — the parallelogram corner with k released', () => {
    const { d, pos } = build(['משולש ABC', 'טרפז ABCD']);
    const def = d.construction.points.get('D') as { kind: string; anchor: string; from: string; to: string; k?: number };
    expect(def.kind).toBe('scaled-offset');
    expect(def.k, 'the ratio was never stated, so it is not fixed').toBeUndefined();
    // D missing (index 3): its partner along the parallel pair is C; offset by k·(A − B)
    expect(def.anchor).toBe('C');
    expect(def.from).toBe('B');
    expect(def.to).toBe('A');
    // the twin relation, asserted numerically: with k = 1 this construction IS #984's parallelogram point
    const [A, B, C] = ['A', 'B', 'C'].map((id) => pos.get(id)!);
    const anchor = pos.get(def.anchor)!;
    const dir = sub(pos.get(def.to)!, pos.get(def.from)!);
    const atOne = { x: anchor.x + dir.x, y: anchor.y + dir.y, z: anchor.z + dir.z };
    expect(norm(sub(atOne, { x: A.x + C.x - B.x, y: A.y + C.y - B.y, z: A.z + C.z - B.z }))).toBeLessThan(1e-9);
  });

  it('the freed ratio is a GENUINE free DOF: in the rider lane un-driven, and different at different seeds (ADR-052)', () => {
    // The conformance smell ADR-052 names — a value the figure can move that the count does not report,
    // or one the count reports that never moves — is asserted absent from both sides: the pivot records
    // NO driven value for D (the ratio is free), and the ratio actually differs across seeds.
    //
    // Deliberately NOT asserted through `freeDofCount3`: the cue subtracts one dim per scalar pin, and a
    // pin the corner's construction already satisfies (this family's own DC ∥ AB) is over-counted — a
    // pre-existing ARM 2 defect (a parallelogram completion already reports 0 where the triangle keeps
    // 2), measured and filed as its own issue rather than patched inside this one.
    const ratios = [0, 1, 2, 3].map((seed) => {
      const { d, pos } = build(['משולש ABC', 'טרפז ABCD'], seed);
      expect(d.resolved.pivot?.riderTs?.D, `seed ${seed}: nothing reads the ratio, so the pivot did not drive it`).toBeUndefined();
      return len(pos, 'D', 'C') / len(pos, 'A', 'B');
    });
    const distinct = new Set(ratios.map((r) => r.toFixed(3)));
    expect(distinct.size, `«הציגו תצורה אחרת» must move the corner — ratios seen: ${ratios.join(', ')}`).toBeGreaterThan(1);
  });

  it.each([
    ['A', 'משולש BCD'],
    ['B', 'משולש ACD'],
    ['C', 'משולש ABD'],
    ['D', 'משולש ABC'],
  ])('whichever corner is missing (%s), the SAME pair is parallel — read from the ring, never the letters', (missing, triangle) => {
    const { st, pos } = build([triangle, 'טרפז ABCD']);
    expect(st.lastError, `missing ${missing}`).toBeNull();
    expect(pos.has(missing)).toBe(true);
    expect(sinBetween(pos, 'D', 'C', 'A', 'B'), `missing ${missing}: still DC ∥ AB`).toBeLessThan(1e-9);
  });

  it('a stated shape leaves its trace and nothing else: the two missing sides, no diagonal (#984 holds here)', () => {
    const { d } = build(['משולש ABC', 'טרפז ABCD']);
    const ink = inkOf(d);
    expect(ink.has('CD')).toBe(true);
    expect(ink.has('AD')).toBe(true);
    expect(ink.has('BD'), 'no diagonal nobody asked for').toBe(false);
    expect(ink.has('AC')).toBe(false);
  });
});

describe('#985 — the freed ratio is WIRED: a later given drives it through the pivot\'s rider lane (#820)', () => {
  it.each([0, 1, 2])('seed %i — «|DC| = 0.5|AB|» pins the ratio exactly, and it is the RIDER LANE that did it', (seed) => {
    const before = build(['משולש ABC', 'טרפז ABCD'], seed);
    const after = build(['משולש ABC', 'טרפז ABCD', '|DC| = 0.5|AB|'], seed);
    expect(after.st.lastError, 'the given is honoured, not refused against the sample').toBeNull();
    expect(len(after.pos, 'D', 'C') / len(after.pos, 'A', 'B')).toBeCloseTo(0.5, 6);
    expect(sinBetween(after.pos, 'D', 'C', 'A', 'B'), 'still a trapezoid').toBeLessThan(1e-9);
    // the mechanism, not just the outcome: the pivot's own record says it DROVE D's ratio to 0.5 (#820's
    // lane) — |DC| = k·|AB| identically, so nothing else could have satisfied the given
    expect(after.d.resolved.pivot?.riderTs?.D, 'the ratio joined the rider lane and was solved').toBeCloseTo(0.5, 6);
    // anti-luck (the ADR-3D-100 discipline): the ratio was NOT 0.5 before the given
    expect(Math.abs(len(before.pos, 'D', 'C') / len(before.pos, 'A', 'B') - 0.5)).toBeGreaterThan(1e-3);
  });
});

describe('#985 — the family table: every quad noun creates its corner; the determined ones are still DERIVED', () => {
  it.each([
    ['ריבוע', 'parallelogram-point'],
    ['מלבן', 'parallelogram-point'],
    ['מעוין', 'parallelogram-point'],
    ['מקבילית', 'parallelogram-point'],
    ['דלתון', 'reflect-line'],
    ['טרפז', 'scaled-offset'],
    ['מרובע', 'on-plane'],
  ])('«משולש ABC» · «%s ABCD» builds, and the corner is a %s', (noun, kind) => {
    const { st, d, pos } = build(['משולש ABC', `${noun} ABCD`]);
    expect(st.lastError, `${noun}: no unknown-point refusal survives`).toBeNull();
    expect(pos.has('D')).toBe(true);
    expect(d.construction.points.get('D')!.kind).toBe(kind);
  });

  it('«מרובע ABCD» is unchanged — a plane rider with two free DOFs (the model the ruling named)', () => {
    const base = build(['משולש ABC']).dof;
    expect(build(['משולש ABC', 'מרובע ABCD']).dof).toBe(base + 2);
  });

  it('quadCornerDef reads the ring, not the letters — the trapezoid row for every missing index', () => {
    const ring = ['A', 'B', 'C', 'D'];
    // unknown → (anchor = partner along the parallel pair, from → to = the opposite side, ring-consistent)
    const rows: Record<number, [string, string, string]> = { 3: ['C', 'B', 'A'], 2: ['D', 'A', 'B'], 0: ['B', 'C', 'D'], 1: ['A', 'D', 'C'] };
    for (const [i, [anchor, from, to]] of Object.entries(rows)) {
      const def = quadCornerDef('trapezoid', ring, Number(i)) as { kind: string; anchor: string; from: string; to: string };
      expect(def.kind, `index ${i}`).toBe('scaled-offset');
      expect([def.anchor, def.from, def.to], `index ${i}`).toEqual([anchor, from, to]);
    }
    // the determined rows are exactly #984's and #601's definitions
    expect(quadCornerDef('parallelogram', ring, 3)).toEqual({ kind: 'parallelogram-point', opp: 'B', n1: 'A', n2: 'C' });
    expect(quadCornerDef('kite', ring, 3)).toEqual({ kind: 'reflect-line', from: 'B', a: 'A', b: 'C' });
    expect(quadCornerDef('quad', ring, 3)).toEqual({ kind: 'on-plane', plane: 'ABC' });
  });
});
