/**
 * Ground-truth relations detection (ADR-134, first slice: equal sides + equal angles).
 *
 * The detector must report a relation ONLY when it holds across every sampled configuration (forced by the
 * givens), so the load-bearing cases are the NEGATIVES: a scalene triangle / general quad must report
 * NOTHING (no two edges or angles are equal in every drawing), proving we don't read a coincidence of the
 * default drawing as a ground truth.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import { detectRelations, detectRelationsAcross, distinctSamples, freeDofs, freeDofCount, isGeoPoint, circleMembers, pointNeighbors, applySeed, evaluate } from '@/engine';
import type { AnyCommand, SegmentRef, AngleRef, Construction, Id, Vec } from '@/engine';

let n = 0;
function build(...utterances: string[]) {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const r = parse(u, {});
    if (!r.ok) throw new Error('parse failed: ' + u);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  return replay(facts, 0).construction;
}

/** Build threading figure context to the parser (so a later step can resolve "the circle", existing points). */
function buildCtx(...utterances: string[]) {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const { construction } = replay(facts);
    const ctx = {
      circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
      points: construction.objects.filter(isGeoPoint).map((o) => o.id),
      circleMembers: circleMembers(construction),
      neighbors: pointNeighbors(construction),
    };
    const r = parse(u, ctx);
    if (!r.ok) throw new Error('parse failed: ' + u);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  return replay(facts, 0).construction;
}

/** Canonical "{A,B}" set key for a segment, for order-independent assertions. */
const segKey = (s: SegmentRef) => [...s].sort().join('');
const segClassKeys = (cls: SegmentRef[]) => cls.map(segKey).sort();
/** "V:AB" for an angle. */
const angKey = (a: AngleRef) => `${a.vertex}:${[a.a, a.b].sort().join('')}`;
const angClassKeys = (cls: AngleRef[]) => cls.map(angKey).sort();

describe('equal-segment ground truths', () => {
  it('a rhombus has all four sides equal (one class of 4)', () => {
    const r = detectRelations(build('rhombus ABCD'));
    const classes = r.equalSegments.map(segClassKeys);
    expect(classes).toContainEqual(['AB', 'AD', 'BC', 'CD']); // all four edges in one equality class
  });

  it('a kite has two equal-adjacent-side pairs, NOT all four equal', () => {
    // kite ABCD ⇒ |AB|=|AD| and |CB|=|CD| (axis AC) — two classes of two, never one class of four
    const classes = detectRelations(build('kite ABCD')).equalSegments.map(segClassKeys).sort();
    expect(classes).toEqual([['AB', 'AD'], ['BC', 'CD']]);
  });

  it('a SCALENE triangle reports NO equal sides (no false positive)', () => {
    expect(detectRelations(build('triangle ABC')).equalSegments).toEqual([]);
  });

  it('the two halves of a diameter (radii OA, OB) are detected equal — IMPLICIT edges', () => {
    // AB is a diameter through its midpoint/centre O; OA and OB are never DRAWN as segments, but they
    // are visible halves of AB, so the broadened (on-host) segment universe finds them equal.
    const classes = detectRelations(build('AB קוטר במעגל O')).equalSegments.map(segClassKeys);
    expect(classes).toContainEqual(['AO', 'BO']);
  });

  it('a general quadrilateral reports NO equal sides', () => {
    expect(detectRelations(build('quadrilateral ABCD')).equalSegments).toEqual([]);
  });
});

describe('equal-angle ground truths', () => {
  it('a square has four equal (right) angles', () => {
    const cls = detectRelations(build('square ABCD')).equalAngles;
    // exactly one class containing the four corner angles
    const big = cls.find((c) => c.length === 4);
    expect(big && angClassKeys(big)).toEqual(['A:BD', 'B:AC', 'C:BD', 'D:AC']);
  });

  it('an isosceles triangle has two equal base angles', () => {
    // "isosceles ABC" ⇒ |AB|=|AC| (apex A) ⇒ base angles at B and C are equal
    const cls = detectRelations(build('isosceles triangle ABC')).equalAngles.map(angClassKeys);
    expect(cls).toContainEqual(['B:AC', 'C:AB']);
  });

  it('a scalene triangle reports NO equal angles', () => {
    expect(detectRelations(build('triangle ABC')).equalAngles).toEqual([]);
  });
});

describe('definitive angle VALUES', () => {
  it('an equilateral triangle has three 60° angles (all definitive)', () => {
    const def = detectRelations(build('equilateral triangle ABC')).definiteAngles;
    expect(def.length).toBe(3);
    for (const a of def) expect(a.valueDeg).toBeCloseTo(60, 3);
  });

  it('a square has four 90° angles (all definitive)', () => {
    const def = detectRelations(build('square ABCD')).definiteAngles;
    expect(def.length).toBe(4);
    for (const a of def) expect(a.valueDeg).toBeCloseTo(90, 3);
  });

  it('a SCALENE triangle has NO definitive angle (every angle flexes)', () => {
    expect(detectRelations(build('triangle ABC')).definiteAngles).toEqual([]);
  });
});

describe('no false positives when the figure is genuinely free (the sampler must vary the shape)', () => {
  it('a FREE inscribed triangle reports nothing — its vertices are samplable, so no angle is "forced"', () => {
    // Regression for the ADR-052 bug: the inscribed triangle's on-circle vertices had no samplable theta, so
    // the shape was frozen across every "configuration" and EVERY angle read as a definite/equal ground
    // truth. With the vertices free + a scalene default, the shape varies and nothing is falsely forced.
    const r = detectRelations(build('triangle ABC inscribed in a circle'));
    expect(r.equalSegments).toEqual([]);
    expect(r.equalAngles).toEqual([]);
    expect(r.definiteAngles).toEqual([]);
  });

  it('an ORDER-recruited inscribed triangle is still samplable — an order-only `solve` does not freeze it (ADR-136 Am. 2)', () => {
    // The inscribed triangle + "the tangent at D and the extension of AB meet at E": the `collinear-order
    // [A,B,E]` (ADR-135) recruits A,D,B and marks them `solve`. An order constraint removes 0 DOF, so they
    // must stay samplable — otherwise the frozen shape makes every angle read "definitive" (the ADR-052 smell).
    const c = buildCtx('משולש ADB חסום במעגל', 'המשיק בנקודה D והמשך AB נפגשים בנקודה E');
    expect(freeDofCount(c), 'the figure keeps shape DOF').toBeGreaterThan(0);
    const fd = new Set(freeDofs(c));
    for (const v of ['A', 'D', 'B']) expect(fd.has(v), `vertex ${v} samplable despite the order solve`).toBe(true);
    const r = detectRelations(c);
    expect(r.definiteAngles, 'no angle is forced in an under-determined figure').toEqual([]);
  });
});

describe('ADR-295 — detection ground truth = valid configs of the REAL objects only', () => {
  // The operator's tangent/secant figure (issues #49/#50/#88): tangent from A at B; the secant A-O-C-D
  // through the centre; G on the extension of DB; AG ⟂ AD; BC. Under-determined (free radius), and its
  // Thales tangent construction mints the scaffold midpoint `~tanmid-OA`.
  const tangentSecant = (): Construction =>
    buildCtx(
      'נתון מעגל שרדיוסו R ומרכזו O',
      'מנקודה A יוצא משיק למעגל בנקודה B',
      'המשך AO חותך את המעגל בנקודה D',
      'AO חותך את המעגל בנקודה C',
      'G נמצאת על המשך DB',
      'AG אנך ל AD',
      'BC',
    );
  const pool = (c: Construction, seeds: number[]): Map<Id, Vec>[] => {
    const out: Map<Id, Vec>[] = [];
    for (const s of seeds) { const r = evaluate(applySeed(c, s)); if (r.ok) out.push(r.positions); }
    return out;
  };

  it('#49 — no `~`-scaffold point appears in any equality class (the AO midpoint is not a subdivision)', () => {
    const rel = detectRelations(tangentSecant());
    const leak = rel.equalSegments.flat().some(([a, b]) => a.startsWith('~') || b.startsWith('~'));
    expect(leak, `no scaffold segment equalities (got ${JSON.stringify(rel.equalSegments)})`).toBe(false);
    // the REAL radii equalities survive
    expect(rel.equalSegments.map(segClassKeys)).toContainEqual(['CO', 'DO']);
  });

  it('#50 — distinctSamples drops an unforced point-collapse sample, keeps a forced one', () => {
    const c = tangentSecant();
    // Two independently-defined points landing together in ONLY SOME samples ⇒ that sample is dropped; a pair
    // together in EVERY sample (a forced coincidence) is kept. Simulate by injecting a collapse into one seed.
    const good = pool(c, [0, 1, 2, 3]);
    expect(good.length, 'baseline pool').toBeGreaterThanOrEqual(3);
    const collapsed = good.map((m) => new Map(m));
    // collapse C onto D in exactly ONE sample (an unforced degeneracy)
    collapsed[0].set('C', collapsed[0].get('D')!);
    const kept = distinctSamples(c, collapsed);
    expect(kept.length, 'the single collapsed sample is dropped').toBe(collapsed.length - 1);
    // a coincidence present in EVERY sample is forced ⇒ nothing dropped
    const allCollapsed = good.map((m) => { const n = new Map(m); n.set('C', n.get('D')!); return n; });
    expect(distinctSamples(c, allCollapsed).length, 'a forced coincidence is allowed').toBe(allCollapsed.length);
  });

  it('#88 — a definite VALUE needs a non-starved pool when the figure has free shape DOF', () => {
    const c = tangentSecant();
    expect(freeDofCount(c), 'the figure is under-determined').toBeGreaterThan(0);
    // Healthy internal pool ⇒ the forced right angles print.
    const healthy = detectRelations(c);
    expect(healthy.samplesUsed).toBeGreaterThanOrEqual(4);
    expect(healthy.definiteAngles.length, 'forced 90° angles print on a healthy pool').toBeGreaterThan(0);
    // A pool STARVED to 3 self-agreeing samples ⇒ NO definite value (vacuously "same in every sample").
    const starved = detectRelationsAcross([c], { positions: pool(c, [0, 1, 2]) });
    expect(starved.samplesUsed).toBe(3);
    expect(starved.definiteAngles, 'starved pool prints no definite value').toEqual([]);
    // At the floor (4) it prints again.
    const four = detectRelationsAcross([c], { positions: pool(c, [0, 1, 2, 3]) });
    expect(four.samplesUsed).toBe(4);
    expect(four.definiteAngles.length, 'the floor lets the forced value print').toBeGreaterThan(0);
  });

  it('#88 — a DETERMINED figure (0 shape DOF) prints definite values even on a thin pool', () => {
    const c = build('equilateral triangle ABC');
    expect(freeDofCount(c)).toBe(0);
    const thin = detectRelationsAcross([c], { positions: pool(c, [0, 1]) });
    expect(thin.definiteAngles.length, 'the three 60° corners print').toBe(3);
    for (const a of thin.definiteAngles) expect(a.valueDeg).toBeCloseTo(60, 3);
  });
});

describe('determined figures still work (single configuration)', () => {
  it('a lone square samples (all seeds identical) and still finds its equalities', () => {
    const r = detectRelations(build('square ABCD'));
    expect(r.samplesUsed).toBeGreaterThan(0);
    expect(r.equalSegments.map(segClassKeys)).toContainEqual(['AB', 'AD', 'BC', 'CD']);
  });
});

describe('ADR-138 B2 — a variant shape reports no FORCED equal-pair across its variants', () => {
  const kite = (variant: number) =>
    replay(
      [{ id: `kv${variant}`, group: 'k', utterance: 'kite', cmd: { type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'], variant }, enabled: true } as Fact],
      0,
    ).construction;

  it('a kite equal-pair is forced in ONE config but NOT across its two axes', () => {
    const v0 = kite(0); // axis AC: |AB|=|AD|, |CB|=|CD|
    const v1 = kite(1); // axis BD: |AB|=|BC|, |AD|=|DC|
    // a single config reads the drawn pair as forced (the pre-B2 behaviour)
    expect(detectRelations(v0).equalSegments.length).toBeGreaterThan(0);
    // across BOTH variants, no segment-pair holds in every drawing — the equal-pair is the student's free choice
    expect(detectRelationsAcross([v0, v1]).equalSegments).toEqual([]);
  });

  it('a non-variant figure is unaffected (a square still reports its four equal sides)', () => {
    expect(detectRelationsAcross([build('square ABCD')]).equalSegments.length).toBeGreaterThan(0);
  });
});
