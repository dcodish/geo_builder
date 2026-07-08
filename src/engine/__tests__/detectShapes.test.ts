/**
 * Shape detection (FR-SH) — classify the NAMED shape of each polygon/circle, reported only when the
 * defining properties are FORCED across every sampled configuration.
 *
 * The load-bearing cases are the emergent one (a general quad that constraints pin into a kite IS a
 * kite) and the negatives (a free quad is NOT square just because the default drawing looks it; a
 * rhombus is NOT a square — its right angles aren't forced).
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import { detectShapes, type ShapeType, isGeoPoint, circleMembers, pointNeighbors } from '@/engine';
import type { AnyCommand } from '@/engine';

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

/** Build threading figure context to the parser (so later steps resolve "the circle", existing points). */
function buildCtx(...utterances: string[]) {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const { construction } = replay(facts);
    const ctx = {
      circles: construction.objects.flatMap((o: any) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
      points: construction.objects.filter(isGeoPoint).map((o: any) => o.id),
      circleMembers: circleMembers(construction),
      neighbors: pointNeighbors(construction),
    };
    const r = parse(u, ctx);
    if (!r.ok) throw new Error('parse failed: ' + u);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  return replay(facts, 0).construction;
}

const types = (...u: string[]): ShapeType[] => detectShapes(build(...u)).shapes.map((s) => s.type);
/** "type:SORTEDVERTS" keys, for order-independent assertions on emergent shapes. */
const shapeKeys = (c: ReturnType<typeof build>) =>
  detectShapes(c).shapes.map((s) => `${s.type}:${[...s.vertices].sort().join('')}`);

describe('quadrilateral classification (most-specific, forced)', () => {
  it('square → square', () => expect(types('square ABCD')).toContain('square'));
  it('rectangle → rectangle (not square)', () => {
    const t = types('rectangle ABCD');
    expect(t).toContain('rectangle');
    expect(t).not.toContain('square');
  });
  it('rhombus → rhombus, NOT square (right angles not forced)', () => {
    const t = types('rhombus ABCD');
    expect(t).toContain('rhombus');
    expect(t).not.toContain('square');
    expect(t).not.toContain('rectangle');
  });
  it('parallelogram → parallelogram', () => expect(types('parallelogram ABCD')).toContain('parallelogram'));
  it('kite → kite, NOT rhombus', () => {
    const t = types('kite ABCD');
    expect(t).toContain('kite');
    expect(t).not.toContain('rhombus');
  });
  it('trapezoid → trapezoid', () => expect(types('trapezoid ABCD')).toContain('trapezoid'));
  it('isosceles trapezoid → isosceles-trapezoid', () =>
    expect(types('isosceles trapezoid ABCD')).toContain('isosceles-trapezoid'));
  it('right trapezoid → right-trapezoid (the forced right angle, not plain trapezoid)', () => {
    const t = types('right trapezoid ABCD');
    expect(t).toContain('right-trapezoid');
    expect(t).not.toContain('trapezoid');
    expect(t).not.toContain('isosceles-trapezoid');
  });
});

describe('triangle classification', () => {
  it('equilateral → equilateral-triangle (not isosceles label)', () => {
    const t = types('equilateral triangle ABC');
    expect(t).toContain('equilateral-triangle');
    expect(t).not.toContain('isosceles-triangle');
  });
  it('isosceles → isosceles-triangle', () => expect(types('isosceles triangle ABC')).toContain('isosceles-triangle'));
  it('right (scalene) triangle → a single right-triangle badge (not also a plain "triangle")', () => {
    const t = types('right triangle ABC');
    expect(t).toContain('right-triangle');
    expect(t).not.toContain('triangle');
    expect(t).not.toContain('right-isosceles-triangle');
    expect(t).not.toContain('30-60-90-triangle'); // an unconstrained right triangle isn't forced to 30-60-90
  });
  it('a right triangle whose size given forces a 30° angle → 30-60-90-triangle badge (not plain right)', () => {
    // מקבילית ABCD · DE גובה לצעל BC · DC=2CE ⇒ CDE is right at E with hypotenuse DC = 2·CE ⇒ 30-60-90.
    const keys = shapeKeys(buildCtx('מקבילית ABCD', 'DE גובה לצעל BC', 'DC=2CE'));
    expect(keys).toContain('30-60-90-triangle:CDE');
    expect(keys.some((k) => k.startsWith('right-triangle:CDE'))).toBe(false);
  });
  it('right isosceles → ONE composed right-isosceles-triangle badge, not two separate ones', () => {
    // A square's diagonal AC splits it into two forced right-isosceles triangles ABC, ACD. Each must
    // surface as a single "right isosceles triangle" badge — not a separate isosceles + right pair.
    const keys = shapeKeys(build('square ABCD', 'segment AC'));
    expect(keys).toContain('right-isosceles-triangle:ABC');
    expect(keys).toContain('right-isosceles-triangle:ACD');
    expect(keys.some((k) => k.startsWith('isosceles-triangle:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('right-triangle:'))).toBe(false);
  });
});

describe('circle', () => {
  it('a drawn circle → circle badge labelled by its centre', () => {
    const r = detectShapes(build('circle O radius 5'));
    const circ = r.shapes.find((s) => s.type === 'circle');
    expect(circ).toBeTruthy();
    expect(circ!.label).toBe('O');
  });
});

describe('emergent detection (the point of sampling)', () => {
  it('a general quad forced by AB=AD, CB=CD is detected as a KITE', () => {
    const t = types('quadrilateral ABCD', 'AB=AD', 'CB=CD');
    expect(t).toContain('kite');
  });

  it('a parallelogram formed BETWEEN segments (no polygon object) is detected — operator figure', () => {
    // טרפז ABCD חסום במעגל (isosceles trapezoid, AB∥CD) + E on AB + ED∥BC ⇒ BCDE is a parallelogram,
    // sides EB (part of AB), BC, CD, DE — never declared as a polygon.
    const keys = shapeKeys(buildCtx('טרפז ABCD חסום במעגל', 'E על AB', 'ED מקביל ל BC'));
    expect(keys).toContain('parallelogram:BCDE');
    expect(keys).toContain('isosceles-trapezoid:ABCD'); // the declared quad still classifies, once (no dup)
    expect(keys.filter((k) => k === 'isosceles-trapezoid:ABCD')).toHaveLength(1);
  });
});

describe('emergent detection stays conservative', () => {
  it('a square with BOTH diagonals is NOT read as containing kites (phantom collinear-vertex quads)', () => {
    // The diagonals cross at E; a cycle like A-B-E-D has E on segment BD (B,E,D collinear), so it is
    // triangle ABD with a redundant vertex — its shoelace area is non-zero, so only the straight-vertex
    // gate (not the area test) rejects it. Without the gate it classifies as a phantom kite.
    const keys = shapeKeys(buildCtx('ריבוע ABCD', 'AC', 'BD', 'E = חיתוך AC ו-BD'));
    expect(keys.some((k) => k.startsWith('kite:')), `no phantom kite in ${keys.join(', ')}`).toBe(false);
    // The genuine content is still detected: the declared square + the eight right-isosceles triangles.
    expect(keys).toContain('square:ABCD');
    expect(keys).toContain('right-isosceles-triangle:ABE'); // a quarter triangle
    expect(keys).toContain('right-isosceles-triangle:ABC'); // a half-square triangle
  });

  it('an emergent GENERIC triangle (three free segments, no special property) gets no badge', () => {
    // Three segments forming a closed triangle, vertices free (never declared `triangle ABC`), so no
    // side/angle is forced equal → it must NOT badge a generic "triangle" (the conservative rule).
    const keys = shapeKeys(build('segment AB', 'segment BC', 'segment CA'));
    expect(keys.some((k) => k.startsWith('triangle:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('isosceles-triangle:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('equilateral-triangle:'))).toBe(false);
  });
});

describe('similar / congruent triangle classes (ADR-224)', () => {
  /** Sorted-vertex-set representation of each similar class, for order-independent assertions. */
  const simSets = (c: ReturnType<typeof build>) =>
    detectShapes(c).similar.map((cls) => ({ kind: cls.kind, sets: cls.triangles.map((t) => [...t].sort().join('')).sort() }));

  it("a square's two diagonals give ONE similar class of all 8 right-isosceles triangles (not O(n²) pairs) + its congruent sub-groups", () => {
    const sim = simSets(buildCtx('ריבוע ABCD', 'AC', 'BD', 'E = חיתוך AC ו-BD'));
    // ONE class-wide row (all 8 quarter/half triangles are 45-45-90, hence mutually similar) — the flood
    // guard: rows scale with congruence GROUPS, never O(n²) pairs. A congruent SUB-GROUP inside the mixed
    // class is a STRONGER statement and is reported alongside it (ADR-257): the 4 quarter triangles are
    // congruent, and so are the 4 half-square triangles — two extra 'congruent' rows, 3 rows total.
    const similar = sim.filter((s) => s.kind === 'similar');
    const congruent = sim.filter((s) => s.kind === 'congruent');
    expect(similar.length, `one similar class, got ${JSON.stringify(sim)}`).toBe(1);
    expect(similar[0].sets.length).toBe(8);
    expect(congruent.length, `two congruent sub-groups, got ${JSON.stringify(sim)}`).toBe(2);
    expect(congruent.map((c) => c.sets.length).sort()).toEqual([4, 4]);
  });

  it("a rectangle's diagonal splits it into two CONGRUENT triangles", () => {
    const sim = simSets(buildCtx('מלבן ABCD', 'AC'));
    const cong = sim.find((s) => s.kind === 'congruent' && s.sets.includes('ABC') && s.sets.includes('ACD'));
    expect(cong, `congruent {ABC, ACD}, got ${JSON.stringify(sim)}`).toBeTruthy();
  });

  it('a lone scalene triangle yields no similar class (nothing to compare)', () => {
    expect(detectShapes(build('triangle ABC')).similar).toEqual([]);
  });
});

describe('negatives (never a coincidence of the drawing)', () => {
  it('a free quadrilateral is NOT classified as any named quad', () => {
    const t = types('quadrilateral ABCD');
    for (const q of ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'isosceles-trapezoid'])
      expect(t).not.toContain(q);
  });
  it('a free (scalene) triangle gets NO badge (generic → nothing special to surface)', () => {
    // A generic triangle has no forced special property, so it earns no badge — a figure sprouts many
    // incidental triangles and badging every plain one floods the panel (operator 2026-07-04). Declared
    // AND emergent generic triangles are both dropped; only a forced special type (isosceles / right /
    // equilateral / 30-60-90) badges.
    const t = types('triangle ABC');
    expect(t).not.toContain('triangle');
    expect(t).not.toContain('isosceles-triangle');
    expect(t).not.toContain('equilateral-triangle');
    expect(t).not.toContain('right-triangle');
  });
});
