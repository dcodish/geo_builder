import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, polygonsConvex, meetsRequirements, useGeoStore } from '@/store/geoStore';
import { freeDofs, firstCyclableBranch, evaluate } from '@/engine';
import { ctxOf, at, dist } from './scenarios-corpus';
import type { Derived, Fact } from '@/store/geoStore';
import type { AnyCommand, Id, Vec } from '@/engine';

/**
 * Resampling regressions — these exercise "show another configuration" (seed > 0), which the
 * seed-0 scenario runner above can't reach. The exact operator sequence is replayed through the
 * real store (parse-with-context → execute → resample), as the app does.
 */
describe('reported scenarios — "show another configuration" keeps a polygon valid', () => {
  it('[quad-diagonals-resample] "מרובע ABCD" + "AC=10" + "DB=10" resamples only to a clean CONVEX quad', () => {
    // The operator built a general quad with both diagonals = 10; "show another configuration"
    // landed first on a tangled (self-crossing) ABCD, then on a concave (dart) one. The sampler
    // must only surface a CLEAN CONVEX drawing of the shape (rejects both).
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['מרובע ABCD', 'AC=10', 'DB=10']) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    for (let press = 0; press < 8; press++) {
      st.resample();
      const seed = useGeoStore.getState().seed;
      const fig = replay(useGeoStore.getState().facts, seed);
      expect(polygonsConvex(useGeoStore.getState().facts, fig.positions), `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(fig, 'A'), at(fig, 'C'))).toBeCloseTo(10, 3); // the diagonals still hold
      expect(dist(at(fig, 'B'), at(fig, 'D'))).toBeCloseTo(10, 3);
    }
    st.clear();
  });

  it('[ntzdgqn2-kite-detection-honours-requirements] the kite-EMKO figure: ∠AMO=∠EMO reported and △CAK~△OMK in the similar list (ADR-256)', async () => {
    // Operator (2026-07-08, session ntzdgqn2): "when I ask to see equal angles … AMO which should be like
    // OME is not shown; also the triangles OMK and CAK are similar and are not in the list." Both are
    // FORCED by the givens (kite ⇒ MO bisects ∠KOE; radii ⇒ ∠OCA = ∠COB/2 = ∠KOM; vertical angles at K),
    // but the detection sample pool included configs where K slid OFF segment CO (the stated meet), flipping
    // ray O→K — so relations true in every VALID config read as not forced. The pool is now gated on the
    // figure's stated configuration requirements (requirementSamples + extension margins), same bar as
    // firstSatisfyingSeed.
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['AB קוטר במעגל O', 'C על המעגל', 'M מחוץ למעגל', 'AM חותך את CO בנקודה K', 'E על BO', 'OK=OE', 'MK=ME', 'MO', 'AC', 'BC/EK=5/3']) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u, `g-${u}`);
    }
    await useGeoStore.getState().viewRelations();
    const rel = useGeoStore.getState().relations!.result;
    // The wedge at M toward A/K (K lies on MA — one ray) equals the wedge toward E: one class holds both.
    // Ray-merge may name the shared ray by either A or K, so accept either name.
    const hasMWedgePair = rel.equalAngles.some((cls) => {
      const names = cls.map((a) => [a.a, a.vertex, a.b].join(''));
      const mSide = names.some((n) => n === 'AMO' || n === 'OMA' || n === 'KMO' || n === 'OMK');
      const eSide = names.some((n) => n === 'EMO' || n === 'OME');
      return mSide && eSide;
    });
    expect(hasMWedgePair, `∠AMO = ∠EMO reported (got: ${rel.equalAngles.map((c) => c.map((a) => `∠${a.a}${a.vertex}${a.b}`).join('=')).join(' | ')})`).toBe(true);
    await useGeoStore.getState().detectShapes();
    const similar = useGeoStore.getState().shapes!.result.similar;
    const key = (t: Id[]) => [...t].sort().join('');
    const hasPair = similar.some((cls) => {
      const sets = cls.triangles.map(key);
      return sets.includes('ACK') && sets.includes('KMO');
    });
    expect(hasPair, `△CAK ~ △OMK in the similar classes (got: ${similar.map((c) => c.triangles.map((t) => t.join('')).join('~')).join(' | ')})`).toBe(true);
    // The kite halves' CONGRUENCE (△OEM ≅ △OMK) is a STRONGER statement than the merged class's
    // similarity and must be reported alongside it (ADR-257 — operator: "OEM=OMK is not shown").
    const hasCongruentPair = similar.some((cls) => {
      const sets = cls.triangles.map(key);
      return cls.kind === 'congruent' && sets.includes('EMO') && sets.includes('KMO');
    });
    expect(hasCongruentPair, `△OEM ≅ △OMK reported as a congruent class (got: ${similar.map((c) => `${c.kind}:${c.triangles.map((t) => t.join('')).join('~')}`).join(' | ')})`).toBe(true);
    st.clear();
  });

  it('[q9-degenerate-wedge-quantifier] the Q9 two-circle figure reports the part-א classes ∠ACE=∠ABE and ∠AFD=∠ABD (#193)', async () => {
    // Operator (booklet Q9, the #191/#192 build): "when I try to see similar angles, they are not shown
    // as equal. For instance ACE and ABE." Both pairs are FORCED (inscribed angles on one arc) and hold
    // EXACTLY in every converged sample — but the angle-universe gate killed any wedge that is within 2°
    // of 0/180 in ANY single sample, and the thin-lens seeds (A almost on the secant) squashed ∠ACE/∠AFD
    // somewhere in the pool. The exclusion is now ALL-samples (structural degeneracy only — the same
    // quantifier discipline as distinctSamples/sameRay).
    const st = useGeoStore.getState();
    st.clear();
    const steps = [
      'שני מעגלים נחתכים בנקודות A ו-B',
      'מיתר CE במעגל השמאלי',
      'מיתר DF במעגל הימני',
      'ישר CDEF',
      'משולש ACF',
      'AB',
      'BC',
      'BD',
      'BE',
      'BF',
      'מעגל חוסם את המשולש ACF',
      'G על הקשת הגדולה CF',
      'GC',
      'GF',
      'נסמן ב-O את החיתוך של AB ו-CF',
    ];
    for (const u of steps) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u, `g-${u}`);
    }
    await useGeoStore.getState().viewRelations();
    const rel = useGeoStore.getState().relations!.result;
    // Ray-merge may rename an arm lying on the secant (C,D,E,F collinear) to the class representative,
    // so accept any collinear stand-in for the merged arm.
    const wedge = (cls: { vertex: Id; a: Id; b: Id }[], vertex: Id, arm1: Id[], arm2: Id[]) =>
      cls.some(
        (x) =>
          x.vertex === vertex &&
          ((arm1.includes(x.a) && arm2.includes(x.b)) || (arm1.includes(x.b) && arm2.includes(x.a))),
      );
    const fmt = rel.equalAngles.map((c) => c.map((a) => `∠${a.a}${a.vertex}${a.b}`).join('=')).join(' | ');
    const class1 = rel.equalAngles.some((cls) => wedge(cls, 'C', ['A'], ['D', 'E', 'F']) && wedge(cls, 'B', ['A', 'H'], ['E']));
    expect(class1, `∠ACE = ∠ABE surfaced (got: ${fmt})`).toBe(true);
    const class2 = rel.equalAngles.some((cls) => wedge(cls, 'F', ['A'], ['C', 'D', 'E']) && wedge(cls, 'B', ['A', 'H'], ['D']));
    expect(class2, `∠AFD = ∠ABD surfaced (got: ${fmt})`).toBe(true);
    st.clear();
  });

  it('[constrained-inscribed-quad-resample] the constrained cyclic quad offers DIFFERENT convex drawings', () => {
    // Same figure as the seed-0 scenario. The operator saw "5 DOF" but "show another configuration"
    // said impossible — because the quad's vertices were pinned, leaving only similarity DOF. With the
    // vertices freed (ADR-097), resampling must find a genuinely different drawing, each still CONVEX
    // and satisfying AE=2CE / AD=CE.
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['מרובע BCED חסום במעגל', 'המשך BD והמשך CE נפגשים שנקודה A', 'AE=2CE', 'AD=CE']) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    let found = 0;
    for (let press = 0; press < 8; press++) {
      if (!st.resample()) continue; // resample found another view
      found++;
      const seed = useGeoStore.getState().seed;
      const fig = replay(useGeoStore.getState().facts, seed);
      expect(polygonsConvex(useGeoStore.getState().facts, fig.positions), `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(fig, 'A'), at(fig, 'E'))).toBeCloseTo(2 * dist(at(fig, 'C'), at(fig, 'E')), 2);
      expect(dist(at(fig, 'A'), at(fig, 'D'))).toBeCloseTo(dist(at(fig, 'C'), at(fig, 'E')), 2);
    }
    expect(found, '"show another configuration" found at least one different convex drawing').toBeGreaterThan(0);
    st.clear();
  });

  it('[secant-tangent-resample] a figure with BOTH a branch and free DOFs varies its free DOFs, not only the branch', () => {
    // circle + secant from E + tangent from E + ∠DOA=2α. D is a circle∩circle (BRANCHABLE) and A,B
    // are free on-circle. The "show another configuration" button used to cycle the branch
    // EXCLUSIVELY when any branch existed, so A,B stayed fixed (only 2 options). The figure must in
    // fact have free DOFs that resampling varies, alongside the discrete branch.
    const steps = [
      'מעגל O שרדיוסו R',
      'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B',
      'מנקודה E משיק נוגע במעגל O בנקודה D',
      '∠DOA=2α',
    ];
    const facts: Fact[] = [];
    let g = 0;
    for (const u of steps) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const group = `g${g++}`;
      for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    }
    const base = replay(facts);
    // BOTH kinds of freedom coexist: a branchable point AND continuous free DOFs.
    expect(base.construction.objects.some((o) => o.kind === 'circle-circle')).toBe(true);
    expect(freeDofs(base.construction).length).toBeGreaterThan(0);
    // Resampling (what the button now also does) moves the free on-circle points A,B — not fixed.
    const moved = [1, 2, 3, 4, 5].some((seed) => {
      const f = replay(facts, seed);
      return dist(f.positions.get('A')!, base.positions.get('A')!) > 1e-3 || dist(f.positions.get('B')!, base.positions.get('B')!) > 1e-3;
    });
    expect(moved).toBe(true);
  });

  it('[two-circles-show-another] "שני מעגלים נחתכים" — "show another" resamples, never collides A onto B', () => {
    // Operator report: two intersecting circles, then "show another configuration" — sometimes an
    // error about point B, sometimes not. Root cause: A and B are the SAME circle∩circle at branches
    // 0 and 1, both already drawn; the button cycled A's branch onto B's (n=2, 0→1), making A≡B and
    // failing the second crossing. `cyclableBranch` now reports NO unshown branch, so the button only
    // resamples the circle centres — A and B stay two distinct, valid crossings on every press.
    const st = useGeoStore.getState();
    st.clear();
    const u = 'שני מעגלים נחתכים בנקודות A ו- B';
    const r = parse(u, ctxOf(useGeoStore.getState().facts));
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    for (const cmd of r.commands) st.execute(cmd, u);

    const base = replay(useGeoStore.getState().facts).construction;
    // The button must NOT find a cyclable branch here (both crossings already on screen).
    const branchId = firstCyclableBranch(base);
    expect(branchId).toBeUndefined();

    for (let press = 0; press < 12; press++) {
      // Mirror the App's "show another configuration": resample, then cycle only a cyclable branch.
      st.resample();
      const seed = useGeoStore.getState().seed;
      const fig = replay(useGeoStore.getState().facts, seed);
      const bid = firstCyclableBranch(fig.construction);
      if (bid) st.cycleAlt(bid);
      const after = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
      expect(evaluate(after.construction).ok, `press ${press + 1} (seed ${seed})`).toBe(true);
      expect(dist(at(after, 'A'), at(after, 'B')), `press ${press + 1}`).toBeGreaterThan(0.1); // A,B stay distinct
    }
    st.clear();
  });

  it('[free-on-circle-extensions-auto-advance] the store auto-advances the seed so both "המשך" extensions reach the far side', () => {
    // The operator's exact sequence (session n19qmb3t) through the REAL store path (execute), which the
    // run()/replay scenario above can't exercise: C is a FREE point on circle P, so at the default seed
    // its placement can leave "המשך CB" with no crossing beyond B (E lands between C and B). The store's
    // execute now AUTO-ADVANCES the seed to the first configuration where BOTH extensions reach the far
    // side cleanly — the student sees a valid default, never the wrong-side figure (ADR-098).
    const st = useGeoStore.getState();
    st.clear();
    const steps = [
      'שני מעגלים נחתכים בנקודות A ו B',
      'נקודה C על מעגל P',
      'המשך CA חותך את מעגל O בנקודה D',
      'המשך CB חותך את מעגל O בנקודה E',
    ];
    for (const u of steps) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(fig.violations, `givens not satisfied: ${JSON.stringify(fig.violations.map((v) => v.message))}`).toEqual([]);
    const beyond = (a: Vec, b: Vec, id: Vec) => (id.x - b.x) * (b.x - a.x) + (id.y - b.y) * (b.y - a.y) > 0;
    expect(beyond(at(fig, 'C'), at(fig, 'A'), at(fig, 'D')), 'D beyond A (המשך CA)').toBe(true);
    expect(beyond(at(fig, 'C'), at(fig, 'B'), at(fig, 'E')), 'E beyond B (המשך CB)').toBe(true);
    st.clear();
  });

  it('[two-circles-secant-web] two secants from existing points stay valid across every "other view"', () => {
    // Operator's book figure: two circles meet at A,B; C on the right circle; secant AC cuts the LEFT
    // circle at D; secant CB cuts the LEFT circle at E. The LLM decomposed each secant as "from X a line
    // cuts circle O at Y and Z". The OLD behaviour: (1) re-placed the existing Y onto circle O (pinning a
    // point to BOTH circles, so it collapsed to the intersection), and (2) used a fixed branch index whose
    // root order flips under resampling, so D/E intermittently collapsed onto A/B ("would be at the same
    // point"). Now: an existing crossing is a direction point (never re-placed on the circle), and the new
    // crossing is the root that does NOT coincide with a placed point — so it holds on EVERY view.
    const st = useGeoStore.getState();
    st.clear();
    // Steps 2–5 are the LLM canonical lines the log recorded (re-parsed with context, as llmParse does).
    const steps = [
      'שני מעגלים נחתכים בנקודות A ו- B',
      'C על מעגל P',
      'מנקודה A ישר חותך את המעגל O בנקודות C ו-D',
      'segment CD', // LLM canonical for the operator's "CD"
      'מנקודה C ישר חותך את המעגל O בנקודות B ו-E',
    ];
    for (const u of steps) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    const radius = (fig: Derived, center: Id) =>
      (fig.construction.objects.find((o) => o.kind === 'circle' && [(center as string), `@ctr-${center}`].includes((o as { center: Id }).center)) as { radius: { value: number } }).radius.value; // anon centre (ADR-342)

    // Canonical view + 8 resampled "other views" all stay structurally correct.
    for (let press = 0; press <= 8; press++) {
      if (press > 0) st.resample();
      const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
      expect(evaluate(fig.construction).ok, `view ${press}`).toBe(true);
      // C stays on the RIGHT circle P only — never pinned onto circle O.
      expect(dist(at(fig, 'P'), at(fig, 'C')), `view ${press}: C on P`).toBeCloseTo(radius(fig, 'P'), 2);
      expect(dist(at(fig, 'O'), at(fig, 'C')), `view ${press}: C off O`).not.toBeCloseTo(radius(fig, 'O'), 1);
      // D and E are genuine second crossings of the secants with the LEFT circle O — on it, and distinct from A/B.
      for (const p of ['D', 'E'] as const) {
        expect(dist(at(fig, 'O'), at(fig, p)), `view ${press}: ${p} on O`).toBeCloseTo(radius(fig, 'O'), 2);
        expect(dist(at(fig, p), at(fig, 'A')), `view ${press}: ${p}≠A`).toBeGreaterThan(0.1);
        expect(dist(at(fig, p), at(fig, 'B')), `view ${press}: ${p}≠B`).toBeGreaterThan(0.1);
      }
    }
    st.clear();
  });

  it('[gxccyt2n-show-another-composite-validated] the two-tangent-circles figure: EVERY "show another" view satisfies the givens (#175 P1, ADR-340)', () => {
    // Operator, prod session gxccyt2n (2026-07-16): "I built this shape and it was good. When I asked for
    // another configuration I got several errors and the diagram is broken." Root cause: the button
    // validated only the SEED (searchResample → meetsRequirements(facts, seed)) and then applied
    // cycleAlt/cycleVariant on the FACTS unchecked — flipping D's branch sent the tangency touch onto B
    // («B ו-D נפלו על אותה נקודה») and broke the figure's HEADLINE given (the circles' internal tangency,
    // violation "centres 1.04 apart but they are 1.44 apart"). Now the search space IS the composite
    // (facts × seed × branch × variant), each candidate validated whole by meetsRequirements, applied as
    // ONE transition. Steps 2/4/6 carry the LLM commands the prod log recorded (the issue's triage).
    const st = useGeoStore.getState();
    st.clear();
    const llm = (cmds: AnyCommand[], u: string) => st.executeMany(cmds, u);
    const typed = (u: string) => {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, u).toBe(true);
      if (r.ok) st.executeMany(r.commands, u);
    };
    typed('שני מעגלים משיקים מבפנים');
    llm(
      [
        { type: 'tangent', id: 'tan-B', circle: 'circle-O', at: 'B', visible: true },
        { type: 'point-on-line', id: 'A', line: 'tan-B', offset: 5 },
      ] as AnyCommand[],
      'מנקודה A מעבירים משיק למעגל בנקודה B',
    );
    typed('מנקודה A מעבירים משיק למעגל הקטן בנקודה D');
    llm([{ type: 'extend-onto-circle', id: 'E', a: 'A', b: 'D', circle: 'circle-O' }] as AnyCommand[], 'המשך AD חותך את המעגל הגדול בנקודה E');
    typed('S_{ABD}=S_{BDE}');
    llm(
      [
        { type: 'line-through', id: 'chord-AD', a: 'A', b: 'D' },
        { type: 'line-circle-intersection', id: 'C', line: 'chord-AD', circle: 'circle-O', avoid: 'D' },
        { type: 'segment', a: 'A', b: 'C' },
        { type: 'segment', a: 'C', b: 'D' },
      ] as AnyCommand[],
      'AD חותך את המעגל הגדול בנקודה C',
    );
    typed('BD');
    typed('BE');
    // The built figure satisfies its givens…
    const facts0 = useGeoStore.getState().facts;
    expect(meetsRequirements(facts0, useGeoStore.getState().seed), 'initial view valid').toBe(true);
    // THE DETERMINISTIC BREAKING PAIR (measured, the issue's own numbers): seed 2 is plain-VALID but
    // flipping D's branch on it VIOLATES the tangency given — exactly the composite the old pipeline
    // applied (searchResample found seed 2, then cycleAlt(D) unchecked). The gated cycleAlt must keep
    // the view requirement-satisfying (here: no other valid branch exists at seed 2 → a no-op); the
    // ungated one flips into the violation and FAILS this assert.
    st.applyView({ seed: 2 });
    expect(meetsRequirements(useGeoStore.getState().facts, 2), 'seed 2 is a valid view').toBe(true);
    st.cycleAlt('D');
    {
      const { facts, seed } = useGeoStore.getState();
      expect(meetsRequirements(facts, seed), 'cycleAlt never turns a valid view violating (kept or no-opped)').toBe(true);
    }
    // …and EVERY view "show another" applies keeps satisfying the givens — no reachable output violates.
    st.applyView({ facts: facts0, seed: 0 });
    for (let press = 1; press <= 3; press++) {
      st.resample();
      const { facts, seed } = useGeoStore.getState();
      const fig = replay(facts, seed);
      expect(fig.lastError, `press ${press} (seed ${seed}) builds`).toBeNull();
      expect(fig.violations.map((v) => v.message), `press ${press} (seed ${seed}) honours the givens`).toEqual([]);
      expect(meetsRequirements(facts, seed), `press ${press} (seed ${seed}) meets every requirement`).toBe(true);
    }
    st.clear();
  });

  it('[sqrt-times-free-radius-allseeds] "AB=√2R" on a free-radius tangent figure holds on EVERY view (ADR-071)', () => {
    // The over-constraint was SEED-DEPENDENT (the seed-0 scenario above can't catch that): the radius
    // root the relation wants is capped by the tangent (A must stay OUTSIDE the circle), so only a
    // radius + on-circle-angle solve satisfies it. Replay the operator's exact sequence across seeds.
    const steps = ['מעגל O', 'מנקודה A מחוץ למעגל מעבירים משיק לנקודה D', 'B על המעגל', 'AB', 'AO', 'BO', 'DO', 'AB=√2R', 'BO=R'];
    const facts: Fact[] = [];
    let g = 0;
    for (const u of steps) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const group = `g${g++}`;
      for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    }
    for (let seed = 0; seed <= 8; seed++) {
      const fig = replay(facts, seed);
      expect(fig.lastError, `seed ${seed}`).toBeNull();
      const r = dist(at(fig, 'O'), at(fig, 'B')); // |OB| = the (free) radius
      expect(dist(at(fig, 'A'), at(fig, 'B')), `seed ${seed}: |AB| = √2·R`).toBeCloseTo(Math.SQRT2 * r, 2);
    }
  });
});
