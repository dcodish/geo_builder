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
  it('right triangle → triangle + right-triangle', () => {
    const t = types('right triangle ABC');
    expect(t).toContain('right-triangle');
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
  it('an emergent GENERIC triangle (three free segments, no special property) gets no badge', () => {
    // Three segments forming a closed triangle, vertices free (never declared `triangle ABC`), so no
    // side/angle is forced equal → it must NOT badge a generic "triangle" (the conservative rule).
    const keys = shapeKeys(build('segment AB', 'segment BC', 'segment CA'));
    expect(keys.some((k) => k.startsWith('triangle:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('isosceles-triangle:'))).toBe(false);
    expect(keys.some((k) => k.startsWith('equilateral-triangle:'))).toBe(false);
  });
});

describe('negatives (never a coincidence of the drawing)', () => {
  it('a free quadrilateral is NOT classified as any named quad', () => {
    const t = types('quadrilateral ABCD');
    for (const q of ['square', 'rectangle', 'rhombus', 'parallelogram', 'kite', 'trapezoid', 'isosceles-trapezoid'])
      expect(t).not.toContain(q);
  });
  it('a free (scalene) triangle is NOT isosceles/equilateral/right', () => {
    const t = types('triangle ABC');
    expect(t).not.toContain('isosceles-triangle');
    expect(t).not.toContain('equilateral-triangle');
    expect(t).not.toContain('right-triangle');
    expect(t).toContain('triangle'); // the general-triangle badge still surfaces (it has fundamental theorems)
  });
});
