/**
 * #487 (ADR-3D-124) — the FREE-standing named plane: «מישור π2» declares a plane with nothing yet known
 * about it; its 3 DOFs (normal 2 + offset 1) are genuine ADR-052 free DOFs — sampled per seed, resampled
 * on "show another configuration", pinned as givens accumulate, and REPORTED by the same code that does
 * the pinning (the conformance rule: a sampled quantity absent from the count is a default masquerading
 * as fixed).
 *
 * Operator rulings (2026-08-10, recorded on the issue):
 *  1. a membership naming an undeclared plane AUTO-CREATES it (the forgiving flow; the accepted cost —
 *     a typo'd name conjures a plane — is bounded by ruling 2: only noun-carrying phrasings create).
 *  2. a bare «π2» line is NOT a declaration — the noun is required.
 *  3. a free plane draws as a patch that visibly resamples until pinned.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3, resolve3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, dot3, norm3, normalize3, sub3, type Vec3 } from '../engine/vec3';

const state = () => useGeo3.getState();
const submit = (u: string) => state().submit(u);
const build = (utts: string[]) => {
  state().clear();
  for (const u of utts) submit(u);
};
const derived = (seed = 0) => derive3(state().facts, seed);
const planeAt = (seed: number) => derive3(state().facts, seed).resolved.planes.get('π2');
const SEEDS = [0, 1, 2, 3, 4];

/** |n̂a × n̂b| — 0 ⟺ parallel normals. */
const misalignment = (a: Vec3, b: Vec3): number => norm3(cross3(normalize3(a), normalize3(b)));

describe('#487 — the declaration parses (and the bare symbol deliberately does not)', () => {
  it.each(['מישור π2', 'המישור π2', 'נתון מישור π2', 'plane π2', 'the plane π2'])('«%s» → free-plane', (u) => {
    const r = parse3(u);
    expect(r.ok, u).toBe(true);
    if (r.ok) expect(r.commands).toEqual([{ type: 'free-plane', name: 'π2' }]);
  });

  it('Am. 1 (operator play, 2026-08-10): a bare «π2» line IS a declaration — deterministic, no LLM call', () => {
    // The original ruling 2 required the noun; play showed the bare form escalating to the LLM, which
    // drew the plane anyway — a paid, non-deterministic detour to the same outcome. π-notation is a
    // plane by convention, so the deterministic parser owns it.
    for (const u of ['π2', 'π', 'pi2', 'נתון π2']) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands[0].type).toBe('free-plane');
    }
  });

  it('a name followed by an equation still belongs to planeByEquation', () => {
    const r = parse3('המישור π2: z - 3 = 0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('plane3');
  });

  it('a name followed by a point-run still belongs to the point-run rules', () => {
    const r = parse3('מישור ABC');
    if (r.ok) expect(r.commands[0].type).not.toBe('free-plane');
  });
});

describe('#487 — a free plane is FREE: sampled, resampled, counted', () => {
  beforeEach(() => state().clear());

  it('«מישור π2» alone builds, and its orientation CHANGES across seeds (the issue’s first lock)', () => {
    build(['מישור π2']);
    const normals = SEEDS.map((s) => planeAt(s)!.n);
    const distinct = new Set(normals.map((n) => normalize3(n)).map((n) => `${n.x.toFixed(4)},${n.y.toFixed(4)}`));
    expect(distinct.size, 'a fixed default would be ADR-052’s cardinal sin').toBeGreaterThan(2);
  });

  it('the 3 DOFs are REPORTED, not merely sampled — the conformance rule, closed by construction', () => {
    build(['מישור π2']);
    const d = derived();
    expect(d.resolved.freePlaneDofs.get('π2')).toBe(3);
    expect(freeDofCount3(d.construction, d.resolved)).toBe(3);
  });

  it('a NEW point on the free plane rides it in every configuration', () => {
    build(['מישור π2', 'B על המישור π2']);
    for (const s of SEEDS) {
      const d = derived(s);
      const pl = d.resolved.planes.get('π2')!;
      const b = d.positions.get('B')!;
      expect(Math.abs(dot3(pl.n, b) + pl.d) / norm3(pl.n), `seed ${s}`).toBeLessThan(1e-7);
    }
  });
});

describe('#487 ruling 1 — a membership on an UNDECLARED plane creates it', () => {
  beforeEach(() => state().clear());

  it('«B על המישור π2» with no π2 builds the plane and the rider', () => {
    build(['B על המישור π2']);
    const d = derived();
    expect(d.status[state().facts[0].id]).toBe('ok');
    expect(d.construction.planes.get('π2')?.free).toBe(true);
    expect(d.positions.has('B')).toBe(true);
  });

  it('auto-created ≡ declared-then-membered — one creation seam, byte-identical resolution', () => {
    build(['B על המישור π2']);
    const auto = planeAt(0)!;
    build(['מישור π2', 'B על המישור π2']);
    const declared = planeAt(0)!;
    expect(auto).toEqual(declared);
  });

  it('a MISTYPED point-run name still refuses — only π-style names auto-create', () => {
    state().clear();
    submit('קובייה ABCD');
    submit('E על המישור ABCX'); // X is not a cube vertex — a typo, not a plane declaration
    expect(state().facts).toHaveLength(1); // refused, kept prior
  });
});

describe('#487 — pinning: givens claim the DOFs one by one, and the count follows', () => {
  beforeEach(() => state().clear());

  it('ONE existing member: the plane passes through it at every seed; 2 DOF remain', () => {
    build(['קובייה ABCD', 'מישור π2', 'A על המישור π2']);
    for (const s of SEEDS) {
      const d = derived(s);
      const pl = d.resolved.planes.get('π2')!;
      const a = d.positions.get('A')!;
      expect(Math.abs(dot3(pl.n, a) + pl.d) / norm3(pl.n), `seed ${s}`).toBeLessThan(1e-7);
    }
    expect(derived().resolved.freePlaneDofs.get('π2')).toBe(2);
  });

  it('THREE members: the plane IS their plane, identical at every seed — it stops resampling (the stability regression, plane edition)', () => {
    build(['קובייה ABCD', 'מישור π2', 'A על המישור π2', 'B על המישור π2', 'C על המישור π2']);
    const first = planeAt(SEEDS[0])!;
    for (const s of SEEDS) {
      const pl = planeAt(s)!;
      expect(misalignment(pl.n, first.n), `seed ${s}`).toBeLessThan(1e-9);
      expect(Math.abs(pl.d / norm3(pl.n) - first.d / norm3(first.n)), `seed ${s}`).toBeLessThan(1e-9);
    }
    expect(derived().resolved.freePlaneDofs.get('π2')).toBe(0);
  });

  it('«המישור π2 מקביל למישור ABC»: ∥ pinned in every seed, the offset still free — and the claim verifies green', () => {
    build(['קובייה ABCD', 'מישור π2', 'המישור π2 מקביל למישור ABC']);
    expect(state().facts, 'the relation must not be refused').toHaveLength(3);
    for (const s of SEEDS) {
      const d = derived(s);
      const pl = d.resolved.planes.get('π2')!;
      const [a, b, c0] = ['A', 'B', 'C'].map((id) => d.positions.get(id)!);
      const runN = cross3(sub3(b, a), sub3(c0, a));
      expect(misalignment(pl.n, runN), `seed ${s}`).toBeLessThan(1e-6);
      expect(d.status[state().facts[2].id], `seed ${s}`).toBe('ok');
    }
    expect(derived().resolved.freePlaneDofs.get('π2')).toBe(1);
    const offsets = SEEDS.map((s) => {
      const pl = planeAt(s)!;
      return (pl.d / norm3(pl.n)).toFixed(3);
    });
    expect(new Set(offsets).size, 'the unpinned offset must still vary').toBeGreaterThan(2);
  });

  it('«l מאונך למישור π2»: the normal locks to the line’s direction; 1 DOF (offset) remains', () => {
    build(['הישר l: x=(1,2,3)+t(2,4,6)', 'מישור π2', 'l מאונך למישור π2']);
    for (const s of SEEDS) {
      const pl = planeAt(s)!;
      expect(misalignment(pl.n, { x: 2, y: 4, z: 6 }), `seed ${s}`).toBeLessThan(1e-9);
    }
    expect(derived().resolved.freePlaneDofs.get('π2')).toBe(1);
  });

  it('an equation stated LATER for the free plane pins it outright (M1, the plane3 edition)', () => {
    build(['מישור π2', 'B על המישור π2', 'המישור π2: z - 3 = 0']);
    expect(state().facts).toHaveLength(3);
    for (const s of SEEDS) {
      const pl = planeAt(s)!;
      expect(misalignment(pl.n, { x: 0, y: 0, z: 1 }), `seed ${s}`).toBeLessThan(1e-12);
      const b = derive3(state().facts, s).positions.get('B')!;
      expect(Math.abs(b.z - 3), `the rider follows the now-pinned plane (seed ${s})`).toBeLessThan(1e-7);
    }
    expect(derived().resolved.freePlaneDofs.size, 'no longer free — no free-plane DOF entry').toBe(0);
  });
});

describe('#487 — honesty boundaries', () => {
  beforeEach(() => state().clear());

  it('a FOURTH non-coplanar member REFUSES at submit (keep-prior-on-error) — never a silent drop', () => {
    build(['קובייה ABCD', 'מישור π2', 'A על המישור π2', 'B על המישור π2', 'C על המישור π2', "A' על המישור π2"]);
    expect(state().facts, 'the impossible membership is refused, the figure kept').toHaveLength(5);
    expect(state().lastError).toEqual({ code: 'not-on-plane', id: "A'" });
  });

  it('a construct that needs an EQUATION refuses plane-not-determined, never reads the placeholder', () => {
    build(['הישר l: x=(1,2,3)+t(m-2,m,m+2)', 'מישור π2']);
    submit('הזווית בין המישורים π2 ו-π2 היא 45'); // vacuous, but exercises the gate order safely
    // the honest gate: an angle-between-planes naming the free plane refuses
    state().clear();
    build(['המישור π1: x+y+z-5=0', 'מישור π2']);
    submit('הזווית בין המישורים π1 ו-π2 היא 45');
    expect(state().lastError).toEqual({ code: 'plane-not-determined', id: 'π2' });
  });

  it('the declaration is idempotent; a clash with a DEFINED plane refuses', () => {
    build(['מישור π2', 'מישור π2']);
    expect(state().facts, 're-declaring is a no-op fact, not an error').toHaveLength(2);
    state().clear();
    build(['המישור π1: z-3=0']);
    submit('מישור π1');
    expect(state().lastError).toEqual({ code: 'already-defined', id: 'π1' });
  });

  it('a figure parameter and a free plane coexist — the placeholder never selects roots (chooseParam guard)', () => {
    build(['הישר l: x=(1,2,3)+t(m-2,m,m+2)', 'המישור π1: x+(m-2)y+(m-1)z-5=0', 'l⊥π1', 'מישור π2', 'B על המישור π2']);
    const d = derived();
    expect(d.resolved.param?.value, 'm = 4 (the unique ⊥ root) must survive the free plane').toBeCloseTo(4, 6);
    for (const f of state().facts) expect(d.status[f.id]).toBe('ok');
  });
});

describe('#557 — the latent PLANE half of the pivot-staleness class (found via the line edition)', () => {
  beforeEach(() => state().clear());

  it('«π2 ∥ ABC» on a coordinate-injected cube: the normal follows the MOVED figure, claim green', () => {
    // Before reresolveFreeObjects3, the free plane resolved pre-pivot against canonical positions;
    // the pivot then rotated the cube to its stated coordinates and the ∥ claim failed against
    // geometry the student had pinned correctly (reported as plane-not-determined).
    build(['קובייה ABCD', 'A(0,0,0)', 'B(0,3,0)', 'מישור π2', 'המישור π2 מקביל למישור ABC']);
    expect(state().facts, 'the relation must not be refused').toHaveLength(5);
    for (const s of [0, 1, 2, 3, 4]) {
      const d = derive3(state().facts, s);
      const pl = d.resolved.planes.get('π2')!;
      const [a, b, c0] = ['A', 'B', 'C'].map((id) => d.positions.get(id)!);
      expect(misalignment(pl.n, cross3(sub3(b, a), sub3(c0, a))), `seed ${s}`).toBeLessThan(1e-6);
      for (const f of state().facts) expect(d.status[f.id], `seed ${s}`).toBe('ok');
    }
  });
});

describe('#487 — the figure file round-trips a free plane', () => {
  it('save → load keeps the declaration and the auto-created membership', async () => {
    const { serializeFigure3, deserializeFigure3 } = await import('../store/figureFile3');
    state().clear();
    build(['מישור π2', 'B על המישור π2']);
    const text = serializeFigure3(state().facts, state().seed);
    const r = deserializeFigure3(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = derive3(r.facts, 0).construction;
      expect(c.planes.get('π2')?.free).toBe(true);
    }
  });
});

describe('#487 — the operator’s exact sequence (the report’s regression lock)', () => {
  it('declare, then constrain — the incremental order the report asked for', () => {
    state().clear();
    build(['מישור π2', 'B על המישור π2']);
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id]).toBe('ok');
    // resolve directly too — the pure-engine path the store wraps
    const r = resolve3(d.construction, 7);
    const pl = r.planes.get('π2')!;
    const b = r.positions.get('B')!;
    expect(Math.abs(dot3(pl.n, b) + pl.d) / norm3(pl.n)).toBeLessThan(1e-7);
  });
});
