/**
 * #552 — the FREE-standing named LINE: «ישר k» / bare «l1» declares a line with nothing yet known
 * about it; its 4 DOFs (direction 2 + anchor 2) are genuine ADR-052 free DOFs — sampled per seed,
 * resampled on "show another configuration", pinned as givens accumulate («l ⊥ BCK», «l ∥ BCK»,
 * memberships, angles), and REPORTED by the same code that does the pinning (the conformance rule).
 *
 * The #487 free-plane shape, line edition. The naming rules (operator request, 2026-08-13):
 *  - CONVENTION names (`l`, `l1`, typed or ℓ-form) may stand BARE — the ℓ-prefix marks a line the
 *    way the π-prefix marks a plane (#487 Am. 1).
 *  - any OTHER single-letter name takes the NOUN («ישר k»), which states its kind — the parser is
 *    context-free and never guesses; a bare «k» stays not-handled.
 *  - a relation naming an undeclared CONVENTION line auto-creates it (the on-planes ruling-1 shape);
 *    a non-convention name must be declared first (a typo refuses, never conjures).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, dot3, norm3, normalize3, sub3, type Vec3 } from '../engine/vec3';

const state = () => useGeo3.getState();
const submit = (u: string) => state().submit(u);
const build = (utts: string[]) => {
  state().clear();
  for (const u of utts) submit(u);
};
const derived = (seed = 0) => derive3(state().facts, seed);
const lineAt = (name: string, seed: number) => derive3(state().facts, seed).resolved.lines.get(name);
const SEEDS = [0, 1, 2, 3, 4];

/** |â × b̂| — 0 ⟺ parallel. */
const misalignment = (a: Vec3, b: Vec3): number => norm3(cross3(normalize3(a), normalize3(b)));
/** |â · b̂| — 0 ⟺ perpendicular. */
const alignment = (a: Vec3, b: Vec3): number => Math.abs(dot3(normalize3(a), normalize3(b)));
/** The base plane's normal of the cube at this seed. */
const runNormalOf = (ids: string[], seed: number): Vec3 => {
  const d = derived(seed);
  const [a, b, c0] = ids.map((id) => d.positions.get(id)!);
  return cross3(sub3(b, a), sub3(c0, a));
};

describe('#552 — the declaration parses (convention bare, noun for the rest)', () => {
  it.each(['ישר l1', 'הישר l1', 'נתון ישר l1', 'line l1', 'the line l1'])('«%s» → free-line ℓ1', (u) => {
    const r = parse3(u);
    expect(r.ok, u).toBe(true);
    if (r.ok) expect(r.commands).toEqual([{ type: 'free-line', name: 'ℓ1' }]);
  });

  it('the bare CONVENTION notation declares too — l/ℓ is to lines what π is to planes (#487 Am. 1)', () => {
    for (const [u, name] of [['l', 'ℓ'], ['l1', 'ℓ1'], ['ℓ2', 'ℓ2'], ['נתון l1', 'ℓ1']] as const) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands).toEqual([{ type: 'free-line', name }]);
    }
  });

  it('a NON-convention name declares WITH the noun — «ישר k» — and keeps its name un-mangled', () => {
    for (const u of ['ישר k', 'הישר k', 'נתון ישר k', 'line k', 'the line k']) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands).toEqual([{ type: 'free-line', name: 'k' }]);
    }
  });

  it('a bare «k» is NOT a declaration — no noun, no convention, no guessing', () => {
    expect(parse3('k').ok).toBe(false);
  });

  it('a name followed by an equation still belongs to parametricLine', () => {
    const r = parse3('הישר l: x=(1,2,3)+t(2,4,6)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('line3');
  });

  it('«ℓ ישר החיתוך בין המישורים π1 ו-π2» still belongs to intersectionLine', () => {
    const r = parse3('ℓ ישר החיתוך בין המישורים π1 ו-π2');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('plane-plane-line');
  });
});

describe('#552 — a free line is FREE: sampled, resampled, counted', () => {
  beforeEach(() => state().clear());

  it('«ישר l» alone builds, and its direction CHANGES across seeds', () => {
    build(['ישר l']);
    expect(state().facts).toHaveLength(1);
    const dirs = SEEDS.map((s) => normalize3(lineAt('ℓ', s)!.dir));
    const distinct = new Set(dirs.map((n) => `${n.x.toFixed(4)},${n.y.toFixed(4)},${n.z.toFixed(4)}`));
    expect(distinct.size, 'a fixed default direction would be ADR-052’s cardinal sin').toBeGreaterThan(2);
  });

  it('the 4 DOFs are REPORTED, not merely sampled — the conformance rule, closed by construction', () => {
    build(['ישר l']);
    const d = derived();
    expect(d.resolved.freeLineDofs.get('ℓ')).toBe(4);
    expect(freeDofCount3(d.construction, d.resolved)).toBe(4);
  });

  it('a NEW point stated on the free line rides it in every configuration', () => {
    build(['ישר l1', 'B על הישר l1']);
    for (const s of SEEDS) {
      const d = derived(s);
      const ln = d.resolved.lines.get('ℓ1')!;
      const b = d.positions.get('B')!;
      expect(norm3(cross3(sub3(b, ln.anchor), normalize3(ln.dir))), `seed ${s}`).toBeLessThan(1e-7);
    }
  });
});

describe('#552 — the operator’s relations: «l⊥BCK» / «l∥BCK» create and pin', () => {
  beforeEach(() => state().clear());

  it('«l⊥BCK» (glued, the operator’s exact notation) auto-creates ℓ and pins its direction ∥ the run normal; 2 DOF remain', () => {
    build(['פירמידה BCKS', 'l⊥BCK']);
    expect(state().facts, 'the relation must not be refused').toHaveLength(2);
    for (const s of SEEDS) {
      const ln = lineAt('ℓ', s)!;
      expect(misalignment(ln.dir, runNormalOf(['B', 'C', 'K'], s)), `seed ${s}`).toBeLessThan(1e-6);
      expect(derive3(state().facts, s).status[state().facts[1].id], `claim green (seed ${s})`).toBe('ok');
    }
    expect(derived().resolved.freeLineDofs.get('ℓ')).toBe(2);
  });

  it('«l ∥ BCK»: the direction stays IN the plane’s direction space; 3 DOF remain and the spin resamples', () => {
    build(['פירמידה BCKS', 'l ∥ BCK']);
    expect(state().facts).toHaveLength(2);
    for (const s of SEEDS) {
      const ln = lineAt('ℓ', s)!;
      expect(alignment(ln.dir, runNormalOf(['B', 'C', 'K'], s)), `seed ${s}`).toBeLessThan(1e-6);
      expect(derive3(state().facts, s).status[state().facts[1].id], `claim green (seed ${s})`).toBe('ok');
    }
    expect(derived().resolved.freeLineDofs.get('ℓ')).toBe(3);
    const dirs = SEEDS.map((s) => normalize3(lineAt('ℓ', s)!.dir)).map((n) => `${n.x.toFixed(3)},${n.y.toFixed(3)}`);
    expect(new Set(dirs).size, 'the in-plane spin is still sampled').toBeGreaterThan(2);
  });

  it('the Hebrew wording lands on the same lowering — «הישר l מאונך למישור BCK» ≡ «l⊥BCK»', () => {
    build(['פירמידה BCKS', 'הישר l מאונך למישור BCK']);
    const worded = lineAt('ℓ', 0)!;
    build(['פירמידה BCKS', 'l⊥BCK']);
    const symbolic = lineAt('ℓ', 0)!;
    expect(worded).toEqual(symbolic);
  });

  it('a stated line↔plane ANGLE puts the direction on the cone — the #534 treatment from birth', () => {
    build(['פירמידה BCKS', 'הזווית בין הישר l1 לבין המישור BCK היא 30']);
    expect(state().facts).toHaveLength(2);
    for (const s of SEEDS) {
      const ln = lineAt('ℓ1', s)!;
      const beta = (Math.asin(alignment(ln.dir, runNormalOf(['B', 'C', 'K'], s))) * 180) / Math.PI;
      expect(Math.abs(beta - 30), `seed ${s}`).toBeLessThan(1e-4);
    }
    expect(derived().resolved.freeLineDofs.get('ℓ1'), 'cone spin 1 + anchor 2').toBe(3);
  });

  it('«l1 ∥ l2» cold: BOTH auto-create, the later reads the earlier — parallel at every seed', () => {
    build(['l1 ∥ l2']);
    expect(state().facts).toHaveLength(1);
    for (const s of SEEDS) {
      const a = lineAt('ℓ1', s)!;
      const b = lineAt('ℓ2', s)!;
      expect(misalignment(a.dir, b.dir), `seed ${s}`).toBeLessThan(1e-6);
    }
  });

  it('«l ⊥ π2» — a free line against a FREE plane: the plane leads, the line follows its normal', () => {
    build(['מישור π2', 'l ⊥ π2']);
    expect(state().facts).toHaveLength(2);
    for (const s of SEEDS) {
      const d = derived(s);
      const pl = d.resolved.planes.get('π2')!;
      const ln = d.resolved.lines.get('ℓ')!;
      expect(misalignment(ln.dir, pl.n), `seed ${s}`).toBeLessThan(1e-6);
    }
  });
});

describe('#557 (operator play, 2026-08-13) — the relation holds on a PIVOT figure too', () => {
  beforeEach(() => state().clear());

  // The play finding: on a figure with an absolute frame (coordinates injected — the operator's
  // prism had A(0,0,0), B on the x-axis, |u|=3 …) «l⊥BCK» was refused `line-not-determined`. The
  // free line resolved PRE-pivot against canonical positions; the pivot then moved the figure and
  // the claim was verified against geometry the student had pinned correctly. Class bug — the free
  // PLANE had it latently too — fixed by `reresolveFreeObjects3` (final-positions re-resolution).
  it('«l⊥ABC» on a coordinate-injected cube: the direction follows the MOVED figure, claim green', () => {
    build(['קובייה ABCD', 'A(0,0,0)', 'B(0,3,0)', 'l⊥ABC']);
    expect(state().facts, 'the relation must not be refused').toHaveLength(4);
    for (const s of SEEDS) {
      const d = derived(s);
      const ln = d.resolved.lines.get('ℓ')!;
      expect(misalignment(ln.dir, runNormalOf(['A', 'B', 'C'], s)), `seed ${s}`).toBeLessThan(1e-6);
      for (const f of state().facts) expect(d.status[f.id], `seed ${s}`).toBe('ok');
    }
  });

  it('the operator’s order — declare «l» FIRST, then relate — lands identically', () => {
    build(['קובייה ABCD', 'A(0,0,0)', 'B(0,3,0)', 'l', 'l⊥ABC']);
    expect(state().facts).toHaveLength(5);
    const d = derived();
    const ln = d.resolved.lines.get('ℓ')!;
    expect(misalignment(ln.dir, runNormalOf(['A', 'B', 'C'], 0))).toBeLessThan(1e-6);
    for (const f of state().facts) expect(d.status[f.id]).toBe('ok');
  });

  it('an on-line rider re-seats onto the corrected line (the dependent half of the class)', () => {
    build(['קובייה ABCD', 'A(0,0,0)', 'B(0,3,0)', 'l⊥ABC', 'E על הישר l']);
    for (const s of SEEDS) {
      const d = derived(s);
      const ln = d.resolved.lines.get('ℓ')!;
      const e = d.positions.get('E')!;
      expect(norm3(cross3(sub3(e, ln.anchor), normalize3(ln.dir))), `seed ${s}`).toBeLessThan(1e-7);
    }
  });
});

describe('#552 — members pin the anchor, then the whole line (M1)', () => {
  beforeEach(() => state().clear());

  it('ONE existing member: the line passes through it at every seed; 2 DOF (direction) remain', () => {
    build(['קובייה ABCD', 'ישר l', 'A על הישר l']);
    for (const s of SEEDS) {
      const d = derived(s);
      const ln = d.resolved.lines.get('ℓ')!;
      const a = d.positions.get('A')!;
      expect(norm3(cross3(sub3(a, ln.anchor), normalize3(ln.dir))), `seed ${s}`).toBeLessThan(1e-7);
    }
    expect(derived().resolved.freeLineDofs.get('ℓ')).toBe(2);
  });

  it('TWO members: the chord IS the line — 0 DOF, identical at every seed (the stability regression, line edition)', () => {
    build(['קובייה ABCD', 'ישר l', 'A על הישר l', "C' על הישר l"]);
    expect(state().facts).toHaveLength(4);
    for (const s of SEEDS) {
      const d = derived(s);
      const ln = d.resolved.lines.get('ℓ')!;
      const a = d.positions.get('A')!;
      const c2 = d.positions.get("C'")!;
      expect(misalignment(ln.dir, sub3(c2, a)), `seed ${s}`).toBeLessThan(1e-9);
      expect(norm3(cross3(sub3(a, ln.anchor), normalize3(ln.dir))), `seed ${s}`).toBeLessThan(1e-9);
      for (const f of state().facts) expect(d.status[f.id], `seed ${s}`).toBe('ok');
    }
    expect(derived().resolved.freeLineDofs.get('ℓ')).toBe(0);
  });

  it('adding the line and its members never moves the CUBE (stability — the figure is not driven)', () => {
    build(['קובייה ABCD']);
    const before = derived().positions.get("B'")!;
    build(['קובייה ABCD', 'ישר l', 'A על הישר l', 'l ⊥ ABC']);
    const after = derived().positions.get("B'")!;
    expect(after).toEqual(before);
  });
});

describe('#552 — the noun-declared arbitrary name works end to end', () => {
  beforeEach(() => state().clear());

  it('«ישר k» then «הישר k מאונך למישור ABC»: the relation finds k, pins it, claim green', () => {
    build(['קובייה ABCD', 'ישר k', 'הישר k מאונך למישור ABC']);
    expect(state().facts).toHaveLength(3);
    for (const s of SEEDS) {
      const d = derived(s);
      const ln = d.resolved.lines.get('k')!;
      expect(misalignment(ln.dir, runNormalOf(['A', 'B', 'C'], s)), `seed ${s}`).toBeLessThan(1e-6);
      expect(d.status[state().facts[2].id], `seed ${s}`).toBe('ok');
    }
  });

  it('«B על הישר k» (noun form) reaches the declared k; the bare «B על k» stays not-handled', () => {
    build(['ישר k', 'B על הישר k']);
    expect(state().facts).toHaveLength(2);
    const d = derived();
    const ln = d.resolved.lines.get('k')!;
    const b = d.positions.get('B')!;
    expect(norm3(cross3(sub3(b, ln.anchor), normalize3(ln.dir)))).toBeLessThan(1e-7);
    expect(parse3('B על k').ok, 'no noun, no convention — no kind signal').toBe(false);
  });

  it('an UNDECLARED non-convention name refuses — a typo must not conjure a line', () => {
    build(['קובייה ABCD', 'הישר k מאונך למישור ABC']);
    expect(state().facts, 'refused, kept prior').toHaveLength(1);
    expect(state().lastError).toEqual({ code: 'unknown-line', id: 'k' });
  });
});

describe('#552 — honesty boundaries', () => {
  beforeEach(() => state().clear());

  it('re-declaring is idempotent; a clash with a DEFINED line refuses', () => {
    build(['ישר l1', 'ישר l1']);
    expect(state().facts, 're-declaring is a no-op fact, not an error').toHaveLength(2);
    state().clear();
    build(['הישר l1: x=(0,0,0)+t(1,0,0)']);
    submit('ישר l1');
    expect(state().lastError).toEqual({ code: 'already-defined', id: 'ℓ1' });
  });

  it('a line named after an existing VECTOR refuses — every later mention would be ambiguous', () => {
    build(['קובייה ABCD', "נסמן: AB=u, AD=v, AA'=w"]);
    submit('ישר u');
    expect(state().lastError).toEqual({ code: 'already-defined', id: 'u' });
  });

  it('a THIRD non-collinear member REFUSES at submit (keep-prior-on-error) — never a silent drop', () => {
    build(['קובייה ABCD', 'ישר l', 'A על הישר l', "C' על הישר l", 'B על הישר l']);
    expect(state().facts, 'the impossible membership is refused, the figure kept').toHaveLength(4);
    expect(state().lastError).toEqual({ code: 'not-on-line', id: 'B' });
  });

  it('a stated DISTANCE to a still-free line reports line-not-determined, never claim-refuted (the #508 class guard, line edition)', () => {
    // the distance pin (#508's line twin) is deliberately not built yet — until it is, the given must
    // degrade to "pin this line first", never to an accusation judged against a sampled anchor
    build(['קובייה ABCD', 'ישר l']);
    submit('המרחק בין A לישר l הוא 3');
    // the store refuses the fact (keep-prior) with the honest code — never claim-refuted
    expect(state().lastError).toEqual({ code: 'line-not-determined', id: 'ℓ' });
  });

  it('the canvas echo for a free line is its NAME, never a sampled equation (ADR-052 — canvas numbers are knowledge)', async () => {
    const { buildScene3 } = await import('../render/scene3');
    const { HOME_CAMERA } = await import('../render/camera');
    build(['ישר l1']);
    const d = derived();
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 });
    const label = scene.lines.find((ln) => ln.name === 'ℓ1');
    expect(label?.form).toBe('ℓ1');
  });
});

describe('#552 — the figure file round-trips a free line', () => {
  it('save → load keeps the declaration and the relation', async () => {
    const { serializeFigure3, deserializeFigure3 } = await import('../store/figureFile3');
    state().clear();
    build(['פירמידה BCKS', 'l⊥BCK']);
    const text = serializeFigure3(state().facts, state().seed);
    const r = deserializeFigure3(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = derive3(r.facts, 0).construction;
      expect(c.lines.get('ℓ')?.kind).toBe('free');
    }
  });
});
