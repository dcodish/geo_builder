/**
 * Recompute derived properties from elements + constraints.
 * This is the input to the theorem detection engine.
 */

import type {
  Construction, ComputedProperties, GeoElement, GeoPolygon,
  Constraint, PolygonClassification, TriangleSubtype, QuadrilateralSubtype,
} from '@/types/geometry';
import { distance, angleBetween, segmentKey, angleKey, approxEqual } from '../solver/utils';

export function recomputeProperties(construction: Construction): ComputedProperties {
  const computed: ComputedProperties = {
    distances: new Map(),
    angleMeasures: new Map(),
    polygonClassifications: new Map(),
    parallelPairs: [],
    perpendicularPairs: [],
  };

  const points = new Map<string, { x: number; y: number }>();
  for (const el of construction.elements) {
    if (el.kind === 'point') {
      points.set(el.id, el.position);
    }
  }

  // Compute distances between all pairs of points in polygons
  for (const el of construction.elements) {
    if (el.kind === 'polygon') {
      const verts = el.vertices;
      for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
          const pA = points.get(verts[i]);
          const pB = points.get(verts[j]);
          if (pA && pB) {
            computed.distances.set(segmentKey(verts[i], verts[j]), distance(pA, pB));
          }
        }
      }
    }
  }

  // Compute angle measures at each vertex of each polygon
  for (const el of construction.elements) {
    if (el.kind === 'polygon') {
      const verts = el.vertices;
      const n = verts.length;
      for (let i = 0; i < n; i++) {
        const prev = verts[(i + n - 1) % n];
        const curr = verts[i];
        const next = verts[(i + 1) % n];
        const pPrev = points.get(prev);
        const pCurr = points.get(curr);
        const pNext = points.get(next);
        if (pPrev && pCurr && pNext) {
          const angle = angleBetween(pPrev, pCurr, pNext);
          computed.angleMeasures.set(angleKey(curr, prev, next), angle);
        }
      }
    }
  }

  // Also store constraint-specified angles
  for (const c of construction.constraints) {
    if (c.type === 'angle-measure') {
      computed.angleMeasures.set(angleKey(c.vertex, c.ray1, c.ray2), c.value);
    }
    if (c.type === 'right-angle') {
      // Find the polygon containing this vertex and figure out the angle
      const polygon = findPolygonWithVertex(construction.elements, c.vertex);
      if (polygon) {
        const idx = polygon.vertices.indexOf(c.vertex);
        const n = polygon.vertices.length;
        const prev = polygon.vertices[(idx + n - 1) % n];
        const next = polygon.vertices[(idx + 1) % n];
        computed.angleMeasures.set(angleKey(c.vertex, prev, next), 90);
      }
    }
    if (c.type === 'distance') {
      computed.distances.set(segmentKey(c.points[0], c.points[1]), c.value);
    }
    if (c.type === 'parallel') {
      computed.parallelPairs.push([
        segmentKey(c.line1[0], c.line1[1]),
        segmentKey(c.line2[0], c.line2[1]),
      ]);
    }
    if (c.type === 'perpendicular') {
      computed.perpendicularPairs.push([
        segmentKey(c.line1[0], c.line1[1]),
        segmentKey(c.line2[0], c.line2[1]),
      ]);
    }
  }

  // Classify polygons
  for (const el of construction.elements) {
    if (el.kind === 'polygon') {
      const classification = classifyPolygon(el, computed, construction.constraints);
      if (classification) {
        computed.polygonClassifications.set(el.id, classification);
      }
    }
  }

  return computed;
}

function findPolygonWithVertex(elements: GeoElement[], vertex: string): GeoPolygon | undefined {
  return elements.find(
    (el): el is GeoPolygon => el.kind === 'polygon' && el.vertices.includes(vertex)
  );
}

function classifyPolygon(
  polygon: GeoPolygon,
  computed: ComputedProperties,
  constraints: Constraint[],
): PolygonClassification | null {
  const n = polygon.vertices.length;

  if (n === 3) return classifyTriangle(polygon, computed, constraints);
  if (n === 4) return classifyQuadrilateral(polygon, computed, constraints);
  return null;
}

function classifyTriangle(
  polygon: GeoPolygon,
  computed: ComputedProperties,
  constraints: Constraint[],
): PolygonClassification {
  const [A, B, C] = polygon.vertices;
  const subtypes: TriangleSubtype[] = [];

  // Get side lengths
  const ab = computed.distances.get(segmentKey(A, B));
  const bc = computed.distances.get(segmentKey(B, C));
  const ca = computed.distances.get(segmentKey(C, A));

  // Get angles
  const angles: number[] = [];
  for (const [, val] of computed.angleMeasures) {
    angles.push(val);
  }

  // Check for right angle
  const hasRightAngle = constraints.some(c => c.type === 'right-angle') ||
    angles.some(a => approxEqual(a, 90, 0.5));
  if (hasRightAngle) subtypes.push('right');

  // Check equal sides
  if (ab != null && bc != null && ca != null) {
    const sides = [ab, bc, ca].sort((x, y) => x - y);
    if (approxEqual(sides[0], sides[2], 0.01)) {
      subtypes.push('equilateral');
    } else if (
      approxEqual(sides[0], sides[1], 0.01) ||
      approxEqual(sides[1], sides[2], 0.01)
    ) {
      subtypes.push('isosceles');
    } else {
      subtypes.push('scalene');
    }

    // Acute/obtuse
    if (!hasRightAngle) {
      const maxAngle = Math.max(...angles.filter(a => !isNaN(a)));
      if (maxAngle > 90.5) subtypes.push('obtuse');
      else if (maxAngle < 89.5) subtypes.push('acute');
    }
  }

  // Check from equal-segments constraints
  const eqSegs = constraints.filter(c => c.type === 'equal-segments');
  for (const c of eqSegs) {
    if (c.type === 'equal-segments') {
      const s1 = segmentKey(c.seg1[0], c.seg1[1]);
      const s2 = segmentKey(c.seg2[0], c.seg2[1]);
      const polySegs = [
        segmentKey(A, B), segmentKey(B, C), segmentKey(C, A),
      ];
      if (polySegs.includes(s1) && polySegs.includes(s2)) {
        if (!subtypes.includes('isosceles')) subtypes.push('isosceles');
      }
    }
  }

  return { base: 'triangle', subtypes };
}

function classifyQuadrilateral(
  polygon: GeoPolygon,
  computed: ComputedProperties,
  constraints: Constraint[],
): PolygonClassification {
  const subtypes: QuadrilateralSubtype[] = [];
  const [A, B, C, D] = polygon.vertices;

  // Check parallel pairs
  const parallelABCD = computed.parallelPairs.some(
    ([s1, s2]) =>
      (s1 === segmentKey(A, B) && s2 === segmentKey(D, C)) ||
      (s1 === segmentKey(D, C) && s2 === segmentKey(A, B))
  );
  const parallelADBC = computed.parallelPairs.some(
    ([s1, s2]) =>
      (s1 === segmentKey(A, D) && s2 === segmentKey(B, C)) ||
      (s1 === segmentKey(B, C) && s2 === segmentKey(A, D))
  );

  if (parallelABCD && parallelADBC) {
    subtypes.push('parallelogram');

    // Check for rectangle (has a right angle)
    const hasRight = constraints.some(c => c.type === 'right-angle');
    if (hasRight) subtypes.push('rectangle');

    // Check for rhombus (equal adjacent sides)
    const ab = computed.distances.get(segmentKey(A, B));
    const bc = computed.distances.get(segmentKey(B, C));
    const isRhombus = ab != null && bc != null && approxEqual(ab, bc, 0.01);
    const eqAdjacentFromConstraint = constraints.some(
      c => c.type === 'equal-segments' && c.seg1 != null && c.seg2 != null
    );
    if (isRhombus || eqAdjacentFromConstraint) subtypes.push('rhombus');

    if (subtypes.includes('rectangle') && subtypes.includes('rhombus')) {
      subtypes.push('square');
    }
  } else if (parallelABCD || parallelADBC) {
    subtypes.push('trapezoid');
  }

  if (subtypes.length === 0) subtypes.push('general');

  return { base: 'quadrilateral', subtypes };
}
