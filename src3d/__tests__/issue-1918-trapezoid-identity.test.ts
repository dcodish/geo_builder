/**
 * Issue #1918 (ADR-3D-313): a declared TRAPEZOID keeps its identity — exactly one pair of parallel sides — or
 * the page says it no longer does.
 *
 * The class (measured on main @ 5edeeca1): *a declared trapezoid's exclusive half, "exactly one parallel pair",
 * was held only as a drawing PREFERENCE (the #615 tier of `firstSatisfyingSeed3`), so any given that forced the
 * second pair drew a parallelogram, green.* Three routes reached it without consulting the noun: a circle
 * stated through a declared right trapezoid on another line (FR-SP-15 promises a refusal), a stated ∥ on the
 * OTHER two sides (stacked on the noun's own pair instead of re-seating it — 2-D's ADR-506), and a trapezoid
 * re-declared over a parallelogram-family ring (ARM 3 read `QUAD_IMPLIES` one way only).
 *
 * The four arms, each locked here along the App's own «הציגו תצורה אחרת» walk:
 *  (A) a circle through a declared right trapezoid is refused, either order, naming both statements;
 *  (B) a declared trapezoid DRAWN with both pairs parallel carries 2-D's amber warning, and no cyclic notice;
 *  (C) a stated pair of the other two sides becomes the trapezoid's pair, on every route;
 *  (D) a trapezoid and a shape no quadrilateral can be at the same time are refused, either order.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Derived3, type Fact3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';
import { firstSatisfyingSeed3, solidFaceCollapsed } from '../engine/evaluate';
import { QUAD_IMPLIES, quadImplies, quadsDisjoint, trapezoidRingInForce3, type QuadBase } from '../engine/baseShapes';
import { shapeWarnings3 } from '../engine/notices';
import { emptyConstruction3, type Construction3 } from '../engine/types';
import { notCyclic3 } from '../lexicon/shapePhrase3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';
import { cross3, norm3, sub3, v3, type Vec3 } from '../engine/vec3';

/** The rendered text without its bidi isolates (the locale wraps every Latin run in LRI…PDI). */
const plain = (s: string) => s.replace(/[\u2066-\u2069]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('en')(k, o) as string);

/** |sin| between two directions — 2-D's verify.ts test: parallel at < sin 1°. */
const SIN1 = Math.sin(Math.PI / 180);
const sinBetween = (u: Vec3, w: Vec3) => norm3(cross3(u, w)) / (norm3(u) * norm3(w));

type St = { facts: Fact3[]; seed: number };
type Outcome = { kind: string; error?: unknown };

/** Submit each line through the 3-D deterministic lane; stop at the first line that does not record. */
function play(lines: readonly string[]): { st: St; outcomes: Outcome[] } {
  let n = 0;
  let st: St = { facts: [], seed: 0 };
  const outcomes: Outcome[] = [];
  for (const line of lines) {
    const v = decideDeterministic3(st, line, () => `f${++n}`);
    outcomes.push(v.kind === 'refused' ? { kind: v.kind, error: v.error } : { kind: v.kind });
    if (v.kind !== 'record') break;
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, outcomes };
}

/** The App's «הציגו תצורה אחרת» walk: `count` configurations from the committed seed. */
function walk(st: St, count: number): Derived3[] {
  const out: Derived3[] = [];
  let seed: number | null = st.seed;
  for (let k = 0; k < count && seed !== null; k++) {
    out.push(derive3(st.facts, seed));
    const d = derive3(st.facts, seed + 1);
    seed = d.construction.requirements.length === 0 && !solidFaceCollapsed(d.construction, d.positions) ? seed + 1 : firstSatisfyingSeed3(d.construction, seed + 1);
  }
  return out;
}

const P = (d: Derived3, id: string): Vec3 => {
  const p = d.positions.get(id);
  if (!p) throw new Error(`no ${id}`);
  return p;
};
const abDc = (d: Derived3) => sinBetween(sub3(P(d, 'B'), P(d, 'A')), sub3(P(d, 'C'), P(d, 'D')));
const adBc = (d: Derived3) => sinBetween(sub3(P(d, 'D'), P(d, 'A')), sub3(P(d, 'C'), P(d, 'B')));
const allOk = (d: Derived3) => Object.values(d.status).every((s) => s === 'ok');

const HE_MORPH = 'ABCD הוגדר כטרפז, אך כעת שני זוגות הצלעות הנגדיות מקבילים — זה כבר לא טרפז. כדי לשנות את הצורה, ערכו או מחקו את שלב הטרפז.';

describe('#1918 the three reported sequences, verbatim, along 24 configurations', () => {
  it('«טרפז ישר זווית ABCD» · «ABCD חסום במעגל» — the second line is refused, naming both statements', () => {
    const { outcomes } = play(['טרפז ישר זווית ABCD', 'ABCD חסום במעגל']);
    expect(outcomes.map((o) => o.kind)).toEqual(['record', 'refused']);
    const err = outcomes[1].error as Parameters<typeof errorText3>[1];
    expect(errorText3(he, err)).toBe(
      'לא ניתן: «ABCD חסום במעגל» סותר את «טרפז ישר זווית ABCD» — אי אפשר לקיים את שניהם יחד. הסיבה: מעגל שעובר דרך ארבעת הקודקודים הופך טרפז ישר זווית למלבן, ומלבן אינו טרפז ישר זווית.',
    );
    expect(errorText3(en, err)).toBe(
      "Can't do that: «ABCD חסום במעגל» contradicts «טרפז ישר זווית ABCD» — they can't both hold. The reason: a circle through the four vertices would make a right trapezoid a rectangle, and a rectangle is not a right trapezoid.",
    );
  });

  it('«טרפז שווה שוקיים ABCD» · «זווית DAB = 90» — records, and the drawn parallelogram carries 2-D\'s amber warning', () => {
    const { st, outcomes } = play(['טרפז שווה שוקיים ABCD', 'זווית DAB = 90']);
    expect(outcomes.map((o) => o.kind)).toEqual(['record', 'record']);
    const ds = walk(st, 24);
    expect(ds).toHaveLength(24);
    for (const d of ds) {
      expect(allOk(d)).toBe(true);
      expect(d.shapeWarnings).toEqual([{ kind: 'trapezoid-morph', ids: ['A', 'B', 'C', 'D'] }]);
      expect(d.notices.filter((n) => n.kind === 'inscribed-constrained' || n.kind === 'base-constrained')).toEqual([]);
    }
    expect(he('warn.mismatch')).toBe('ייתכן שהאיור אינו תואם למה שתיארתם:');
    expect(he('warn.trapezoidMorph', { quad: 'ABCD' })).toBe(HE_MORPH);
    expect(en('warn.trapezoidMorph', { quad: 'ABCD' })).toBe(
      'ABCD was declared a trapezoid, but both pairs of opposite sides are now parallel — it is no longer a trapezoid. To change the shape, edit or delete the trapezoid step.',
    );
  });

  it('«טרפז ABCD» · «AD ∥ BC» — records re-seated: AD ∥ BC, AB ∦ DC, no warning, at every configuration', () => {
    const { st, outcomes } = play(['טרפז ABCD', 'AD ∥ BC']);
    expect(outcomes.map((o) => o.kind)).toEqual(['record', 'record']);
    const ds = walk(st, 24);
    expect(ds).toHaveLength(24);
    for (const d of ds) {
      expect(allOk(d)).toBe(true);
      expect(adBc(d)).toBeLessThan(1e-6);
      expect(abDc(d)).toBeGreaterThan(SIN1);
      expect(d.shapeWarnings).toEqual([]);
    }
  });
});

const refusedCode = (lines: string[]) => {
  const { outcomes } = play(lines);
  const last = outcomes[outcomes.length - 1];
  return { kinds: outcomes.map((o) => o.kind), error: last.error as { code: string } & Record<string, unknown> };
};

describe('#1918 (A) a circle through a declared right trapezoid — every spelling, both orders, every frame', () => {
  it.each([
    ['טרפז ישר זווית ABCD', 'ABCD חסום במעגל'],
    ['טרפז ישר זווית ABCD', 'מעגל חוסם את ABCD'],
    ['טרפז ישר זווית ABCD', 'מעגל חוסם את BCDA'],
    ['right trapezoid ABCD', 'ABCD is inscribed in a circle'],
    ['פירמידה SABCD שבסיסה טרפז ישר זווית', 'ABCD חסום במעגל'],
  ])('«%s» · «%s» — the circle line is refused, quoting the declaration', (noun, circle) => {
    const r = refusedCode([noun, circle]);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.error).toMatchObject({ code: 'inscribed-contradicts-noun', shape: 'rightTrapezoid', forced: 'rectangle', sentence: circle, other: noun, against: 'noun' });
  });

  it.each([
    ['ABCD חסום במעגל', 'טרפז ישר זווית ABCD'],
    ['מעגל חוסם את ABCD', 'טרפז ישר זווית ABCD'],
    ['ABCD is inscribed in a circle', 'right trapezoid ABCD'],
  ])('reverse order «%s» · «%s» — the noun line is refused, quoting the circle', (circle, noun) => {
    const r = refusedCode([circle, noun]);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.error).toMatchObject({ code: 'inscribed-contradicts-noun', shape: 'rightTrapezoid', forced: 'rectangle', sentence: noun, other: circle, against: 'circle' });
    expect(errorText3(he, r.error as Parameters<typeof errorText3>[1])).toContain(`«${noun}» סותר את «${circle}»`);
  });

  it('the one-line form keeps its own message (unchanged)', () => {
    const r = refusedCode(['טרפז ישר זווית ABCD חסום במעגל']);
    expect(r.error).toMatchObject({ code: 'inscribed-contradicts-noun', sentence: 'טרפז ישר זווית ABCD חסום במעגל' });
    expect(r.error.other).toBeUndefined();
    expect(errorText3(he, r.error as Parameters<typeof errorText3>[1])).toContain('טרפז ישר זווית לא יכול להיות חסום במעגל');
  });

  it('a saved file carrying both lines loads with the circle row failed (load replays the commands)', () => {
    const { st } = play(['טרפז ישר זווית ABCD']);
    const circle = play(['ABCD חסום במעגל']).st.facts[0];
    const d = derive3([...st.facts, { ...circle, id: 'late' }], st.seed);
    expect(d.status.late).toMatchObject({ code: 'inscribed-contradicts-noun', other: 'טרפז ישר זווית ABCD' });
  });

  it('only a phrase no circle passes around: an isosceles or plain trapezoid is inscribed as before', () => {
    for (const noun of ['טרפז ABCD', 'טרפז שווה שוקיים ABCD']) {
      const { outcomes } = play([noun, 'ABCD חסום במעגל']);
      expect(outcomes.map((o) => o.kind), noun).toEqual(['record', 'record']);
    }
  });
});

describe('#1918 (B) the warning — every route that DRAWS a declared trapezoid as a parallelogram', () => {
  it.each([
    [['טרפז שווה שוקיים ABCD', 'AB ⊥ AD']],
    [['טרפז ABCD', 'זווית DAB = 90', 'זווית ABC = 90']],
    [['טרפז ABCD', 'AD ⊥ AB', 'AB ⊥ BC']],
    [['טרפז ABCD', 'AB = 4', 'DC = 4']],
    [['טרפז ABCD', '|AB| = |DC|']],
    [['טרפז ABCD', 'זווית DAB = 90', 'ABCD חסום במעגל']],
    [['טרפז ABCD', 'AD ∥ BC', 'AB ∥ DC']],
    [['טרפז ABCD', 'AB ∥ DC', 'AD ∥ BC']],
    [['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,0)', 'טרפז ABCD']],
    [['טרפז ABCD', 'A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,0)']],
    [["תיבה ABCDA'B'C'D'", 'טרפז ABCD']],
    [['פירמידה SABCD שבסיסה טרפז', 'זווית DAB = 90', 'זווית ABC = 90']],
    [['פירמידה SABCD שבסיסה טרפז', 'AB = 4', 'DC = 4']],
    [['פירמידה ישרה SABCD שבסיסה טרפז ישר זווית']],
  ])('%j — records, warned at every configuration, no cyclic notice beside it', (lines) => {
    const { st, outcomes } = play(lines);
    expect(outcomes.every((o) => o.kind === 'record'), JSON.stringify(outcomes)).toBe(true);
    for (const d of walk(st, 8)) {
      expect(allOk(d)).toBe(true);
      expect(d.shapeWarnings.map((w) => w.ids.join(''))).toEqual(['ABCD']);
      expect(d.notices.filter((n) => n.kind === 'inscribed-constrained' || n.kind === 'base-constrained')).toEqual([]);
    }
  });

  it('the warning reads the DRAWING: it clears when the forcing line is muted', () => {
    const { st } = play(['טרפז שווה שוקיים ABCD', 'זווית DAB = 90']);
    const muted = st.facts.map((f, i) => (i === 1 ? { ...f, enabled: false } : f));
    expect(derive3(st.facts, st.seed).shapeWarnings).toHaveLength(1);
    expect(derive3(muted, st.seed).shapeWarnings).toEqual([]);
  });

  it('the predicate on hand-built rings: both pairs parallel warns, one pair does not', () => {
    const c: Construction3 = { ...emptyConstruction3(), quadShapes: [{ base: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }] };
    const ring = (pts: Vec3[]) => new Map(['A', 'B', 'C', 'D'].map((id, i) => [id, pts[i]]));
    expect(shapeWarnings3(c, ring([v3(0, 0, 0), v3(4, 0, 0), v3(5, 2, 0), v3(1, 2, 0)]))).toEqual([{ kind: 'trapezoid-morph', ids: ['A', 'B', 'C', 'D'] }]);
    expect(shapeWarnings3(c, ring([v3(0, 0, 0), v3(4, 0, 0), v3(3, 2, 0), v3(1, 2, 0)]))).toEqual([]);
    expect(shapeWarnings3(c, ring([v3(0, 0, 0), v3(4, 0, 0), v3(3, 2, 0), v3(1.02, 2, 0)]))).toEqual([]); // ≈ 0.6° off — not parallel
    // a ring that is not a declared trapezoid is never warned
    const par: Construction3 = { ...emptyConstruction3(), quadShapes: [{ base: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }] };
    expect(shapeWarnings3(par, ring([v3(0, 0, 0), v3(4, 0, 0), v3(5, 2, 0), v3(1, 2, 0)]))).toEqual([]);
  });
});

describe('#1918 (C) a stated pair of the other two sides becomes the trapezoid\'s pair', () => {
  it.each([
    [['טרפז ABCD', 'AD מקביל ל-BC'], 'plain'],
    [['טרפז שווה שוקיים ABCD', 'AD ∥ BC'], 'isosceles'],
    [['טרפז ישר זווית ABCD', 'AD ∥ BC'], 'right'],
    [['פירמידה SABCD שבסיסה טרפז', 'AD ∥ BC'], 'plain'],
    [['פירמידה SABCD שבסיסה טרפז', 'BC ∥ DA'], 'plain'],
  ] as [string[], string][])('%j — AD ∥ BC, AB ∦ DC, green, no warning', (lines, adj) => {
    const { st, outcomes } = play(lines);
    expect(outcomes.map((o) => o.kind)).toEqual(lines.map(() => 'record'));
    for (const d of walk(st, 8)) {
      expect(allOk(d)).toBe(true);
      expect(adBc(d)).toBeLessThan(1e-6);
      expect(abDc(d)).toBeGreaterThan(SIN1);
      expect(d.shapeWarnings).toEqual([]);
      const len = (a: string, b: string) => norm3(sub3(P(d, b), P(d, a)));
      if (adj === 'isosceles') expect(Math.abs(len('A', 'B') - len('D', 'C'))).toBeLessThan(1e-5); // the legs, as 2-D
      if (adj === 'right') {
        const cosAt = (v: string, p: string, q: string) => {
          const u = sub3(P(d, p), P(d, v));
          const w = sub3(P(d, q), P(d, v));
          return (u.x * w.x + u.y * w.y + u.z * w.z) / (norm3(u) * norm3(w));
        };
        expect(Math.abs(cosAt('A', 'D', 'B'))).toBeLessThan(1e-5); // ∠A = 90
        expect(Math.abs(cosAt('B', 'A', 'C'))).toBeLessThan(1e-5); // ∠B = 90, as 2-D
      }
    }
  });

  it('order-free: a list whose ∥ stands BEFORE the declaration draws the same re-seated trapezoid', () => {
    const { st } = play(['טרפז ABCD', 'AD ∥ BC']);
    const reordered = [st.facts[1], st.facts[0]];
    // the ∥ row cannot apply before ABCD exists; the retry pass lands it after — and the seat is read order-free
    const d = derive3(reordered, st.seed);
    expect(allOk(d)).toBe(true);
    expect(adBc(d)).toBeLessThan(1e-6);
    expect(abDc(d)).toBeGreaterThan(SIN1);
  });

  it('trapezoidRingInForce3: the named pair by default, the other pair only when it alone is stated', () => {
    const ring = ['A', 'B', 'C', 'D'];
    expect(trapezoidRingInForce3(ring, [])).toEqual(ring);
    expect(trapezoidRingInForce3(ring, [['A', 'D', 'B', 'C']])).toEqual(['B', 'C', 'D', 'A']);
    expect(trapezoidRingInForce3(ring, [['C', 'B', 'D', 'A']])).toEqual(['B', 'C', 'D', 'A']); // any letter order
    expect(trapezoidRingInForce3(ring, [['A', 'B', 'D', 'C']])).toEqual(ring); // the named pair restated
    expect(trapezoidRingInForce3(ring, [['A', 'D', 'B', 'C'], ['A', 'B', 'D', 'C']])).toEqual(ring); // both: as named
    expect(trapezoidRingInForce3(ring, [['A', 'C', 'B', 'D']])).toEqual(ring); // diagonals are not sides
  });
});

describe('#1918 (D) a trapezoid re-declared over a shape no quadrilateral is at the same time', () => {
  it.each([
    [['מקבילית ABCD', 'טרפז ABCD'], 'trapezoid', 'parallelogram'],
    [['מלבן ABCD', 'טרפז ABCD'], 'trapezoid', 'rectangle'],
    [['ריבוע ABCD', 'טרפז ABCD'], 'trapezoid', 'square'],
    [['מקבילית ABCD', 'טרפז שווה שוקיים ABCD'], 'trapezoid', 'parallelogram'],
    [['ABCD מקבילית', 'ABCD טרפז'], 'trapezoid', 'parallelogram'],
    [['פירמידה SABCD שבסיסה מקבילית', 'ABCD טרפז'], 'trapezoid', 'parallelogram'],
    [['טרפז ABCD', 'מקבילית ABCD'], 'parallelogram', 'trapezoid'],
    [['טרפז ABCD', 'מלבן ABCD'], 'rectangle', 'trapezoid'],
  ] as [string[], QuadBase, QuadBase][])('%j — refused, naming both shapes', (lines, stated, actual) => {
    const r = refusedCode(lines);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.error).toEqual({ code: 'shape-disjoint', stated, actual });
  });

  it('the words are `err.shapeLessSpecific`\'s, in both languages', () => {
    const err = refusedCode(['מקבילית ABCD', 'טרפז ABCD']).error as Parameters<typeof errorText3>[1];
    expect(errorText3(he, err)).toBe('הצורה כבר ידועה כ־מקבילית — ולכן אינה נקראת טרפז. מחקו את הנתון הקודם אם התכוונתם טרפז.');
    expect(errorText3(en, err)).toBe('The figure is already known to be a parallelogram, so it is not called a trapezoid. Remove the earlier given if you meant trapezoid.');
    const rev = refusedCode(['טרפז ABCD', 'מקבילית ABCD']).error as Parameters<typeof errorText3>[1];
    expect(errorText3(he, rev)).toBe('הצורה כבר ידועה כ־טרפז — ולכן אינה נקראת מקבילית. מחקו את הנתון הקודם אם התכוונתם מקבילית.');
  });

  it('the rule is the table: disjoint exactly when no row of QUAD_IMPLIES implies both', () => {
    const bases = Object.keys(QUAD_IMPLIES) as QuadBase[];
    for (const x of bases)
      for (const y of bases) expect(quadsDisjoint(x, y), `${x}/${y}`).toBe(!bases.some((k) => quadImplies(k, x) && quadImplies(k, y)));
    const disjointFromTrapezoid = bases.filter((b) => quadsDisjoint('trapezoid', b)).sort();
    expect(disjointFromTrapezoid).toEqual(['kite', 'parallelogram', 'rectangle', 'rhombus', 'square']);
    // compatible re-declarations still DRIVE (ADR-3D-158): a rectangle and a kite meet in the square
    expect(quadsDisjoint('rectangle', 'kite')).toBe(false);
    expect(play(['מלבן ABCD', 'דלתון ABCD']).outcomes.map((o) => o.kind)).toEqual(['record', 'record']);
    expect(play(['מקבילית ABCD', 'ריבוע ABCD']).outcomes.map((o) => o.kind)).toEqual(['record', 'record']);
  });
});

describe('#1918 the controls — unchanged', () => {
  it.each([
    [['טרפז ABCD']],
    [['טרפז ישר זווית ABCD']],
    [['טרפז שווה שוקיים ABCD']],
    [['טרפז ABCD', 'זווית DAB = 90']],
    [['טרפז ABCD', '|AD| = |BC|']],
    [['טרפז ABCD', '|AC| = |BD|']],
    [['טרפז ABCD חסום במעגל']],
    [['טרפז ישר זווית ABCD', 'זווית ABC = 90']], // the M4 row: the right angle moves to B, a true right trapezoid
  ])('%j — a true trapezoid, no warning', (lines) => {
    const { st, outcomes } = play(lines);
    expect(outcomes.every((o) => o.kind === 'record')).toBe(true);
    for (const d of walk(st, 8)) {
      expect(allOk(d)).toBe(true);
      expect(abDc(d)).toBeLessThan(1e-6);
      expect(adBc(d)).toBeGreaterThan(SIN1);
      expect(d.shapeWarnings).toEqual([]);
    }
  });

  it('«טרפז ABCD חסום במעגל» keeps its notice', () => {
    const { st } = play(['טרפז ABCD חסום במעגל']);
    expect(derive3(st.facts, st.seed).notices).toContainEqual(expect.objectContaining({ kind: 'inscribed-constrained', from: 'trapezoid', to: 'isoTrapezoid' }));
  });

  it('notCyclic3 is the one lookup the parser and the engine share', () => {
    expect(notCyclic3('trapezoid', 'right')).toEqual({ shape: 'rightTrapezoid', forced: 'rectangle' });
    expect(notCyclic3('trapezoid', 'isosceles')).toBeNull();
    expect(notCyclic3('trapezoid', undefined)).toBeNull();
  });
});

describe('#1918 the fixtures3 sweep — no saved figure is warned at its saved seed', () => {
  const DIR = join(__dirname, '..', '..', 'fixtures3');
  for (const name of readdirSync(DIR).filter((f) => f.endsWith('.geo3.json'))) {
    it(name, () => {
      const loaded = deserializeFigure3(readFileSync(join(DIR, name), 'utf8'));
      if (!loaded.ok) throw new Error(`${name}: ${loaded.reason}`);
      expect(derive3(loaded.facts, loaded.seed).shapeWarnings).toEqual([]);
    });
  }
});
