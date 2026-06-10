/**
 * Main solver: resolves point positions from construction constraints.
 *
 * Strategy:
 * 1. Sort polygons by constraint count (most constrained first)
 * 2. Solve standalone polygons in raw coordinates
 * 3. Solve attached polygons using already-positioned shared vertices
 * 4. Global fit-to-canvas scaling
 */

import type { Construction, GeoPolygon, GeoElement, Constraint, Point2D } from '@/types/geometry';
import { solveTriangle, type TriangleKnowns } from './triangle-solver';
import { segmentKey, toRad } from './utils';

export interface FitState {
  scale: number;
  centerX: number;
  centerY: number;
}

export interface SolverResult {
  positions: Map<string, Point2D>;
  rawPositions: Map<string, Point2D>;
  fitState: FitState;
}

export function resolvePositions(
  construction: Construction,
  previousPositions?: Map<string, Point2D>,
  fitState?: FitState,
): SolverResult {
  const positions = new Map<string, Point2D>();
  const polygons = construction.elements.filter(
    (el): el is GeoPolygon => el.kind === 'polygon',
  );

  if (polygons.length === 0) {
    return { positions, rawPositions: new Map(), fitState: fitState ?? { scale: 1, centerX: 0, centerY: 0 } };
  }

  // Sort polygons: more constraints = solve first (more determined)
  const sorted = [...polygons].sort(
    (a, b) =>
      constraintScore(b.vertices, construction.constraints) -
      constraintScore(a.vertices, construction.constraints),
  );

  // Multi-pass: standalone first, then attached
  const unsolved = new Set(sorted.map((p) => p.id));

  for (let pass = 0; pass < 4 && unsolved.size > 0; pass++) {
    for (const poly of sorted) {
      if (!unsolved.has(poly.id)) continue;
      const knownCount = poly.vertices.filter((v) => positions.has(v)).length;

      if (pass === 0 && knownCount === 0) {
        solveStandalone(poly, construction.constraints, positions, previousPositions);
        unsolved.delete(poly.id);
      } else if (pass > 0 && knownCount >= 1) {
        solveAttached(poly, construction.constraints, positions, construction.elements);
        unsolved.delete(poly.id);
      }
    }
  }

  // Last resort: place any remaining
  for (const poly of sorted) {
    if (unsolved.has(poly.id)) {
      solveStandalone(poly, construction.constraints, positions, previousPositions);
    }
  }

  // Stable fit: reuse previous fitState when possible
  let newFitState: FitState;
  if (fitState && previousPositions && previousPositions.size > 0) {
    // Apply previous fit first to check if points stay on-screen
    const testPositions = new Map(positions);
    applyFit(testPositions, fitState);
    let maxCoord = 0;
    for (const p of testPositions.values()) {
      maxCoord = Math.max(maxCoord, Math.abs(p.x), Math.abs(p.y));
    }
    if (maxCoord > 7) {
      // Points would go off-screen — blend gently toward ideal fit
      const ideal = computeFitState(positions);
      newFitState = {
        scale: fitState.scale * 0.8 + ideal.scale * 0.2,
        centerX: fitState.centerX * 0.8 + ideal.centerX * 0.2,
        centerY: fitState.centerY * 0.8 + ideal.centerY * 0.2,
      };
    } else {
      newFitState = fitState;
    }
  } else {
    // First solve: compute initial fit
    newFitState = computeFitState(positions);
  }

  // Save raw positions before fitting (for use as hints in next solve)
  const rawPositions = new Map(positions);

  applyFit(positions, newFitState);
  return { positions, fitState: newFitState, rawPositions };
}

/* ── Scoring ── */

function constraintScore(vertices: string[], constraints: Constraint[]): number {
  let score = 0;
  for (const c of constraints) {
    if (c.type === 'distance' && vertices.includes(c.points[0]) && vertices.includes(c.points[1])) score += 2;
    if (c.type === 'angle-measure' && vertices.includes(c.vertex)) score += 2;
    if (c.type === 'right-angle' && vertices.includes(c.vertex)) score += 1;
    if (c.type === 'parallel') score += 0.5;
    if (c.type === 'equal-segments') score += 0.5;
  }
  return score;
}

/* ── Standalone solving (no shared vertices) ── */

function solveStandalone(
  polygon: GeoPolygon,
  constraints: Constraint[],
  positions: Map<string, Point2D>,
  previousPositions?: Map<string, Point2D>,
): void {
  if (polygon.vertices.length === 3) {
    solveTriangleStandalone(polygon.vertices, constraints, positions, previousPositions);
  } else if (polygon.vertices.length === 4) {
    solveQuadStandalone(polygon.vertices, constraints, positions, previousPositions);
  } else {
    placeRegular(polygon.vertices, 3, positions);
  }
}

function solveTriangleStandalone(
  vertices: string[],
  constraints: Constraint[],
  positions: Map<string, Point2D>,
  previousPositions?: Map<string, Point2D>,
): void {
  const [vA, vB, vC] = vertices;
  const knowns: TriangleKnowns = { sides: {}, angles: {} };

  const triVerts = new Set(vertices);
  for (const c of constraints) {
    if (c.type === 'distance') {
      const key = segmentKey(c.points[0], c.points[1]);
      if (key === segmentKey(vA, vB)) knowns.sides.c = c.value;
      else if (key === segmentKey(vB, vC)) knowns.sides.a = c.value;
      else if (key === segmentKey(vC, vA)) knowns.sides.b = c.value;
    } else if (c.type === 'angle-measure') {
      // Only match angles whose rays belong to this triangle (or no rays specified)
      if (c.ray1 && c.ray2 && (!triVerts.has(c.ray1) || !triVerts.has(c.ray2))) continue;
      if (c.vertex === vA) knowns.angles.A = c.value;
      else if (c.vertex === vB) knowns.angles.B = c.value;
      else if (c.vertex === vC) knowns.angles.C = c.value;
    } else if (c.type === 'right-angle') {
      if (c.vertex === vA) knowns.angles.A = 90;
      else if (c.vertex === vB) knowns.angles.B = 90;
      else if (c.vertex === vC) knowns.angles.C = 90;
    }
  }

  // Extract previous vertex positions as hints for stable defaults
  let prevHint: { A: Point2D; B: Point2D; C: Point2D } | undefined;
  if (previousPositions) {
    const pA = previousPositions.get(vA);
    const pB = previousPositions.get(vB);
    const pC = previousPositions.get(vC);
    if (pA && pB && pC) {
      prevHint = { A: pA, B: pB, C: pC };
    }
  }

  const solution = solveTriangle(knowns, prevHint);
  if (solution) {
    positions.set(vA, solution.vertices.A);
    positions.set(vB, solution.vertices.B);
    positions.set(vC, solution.vertices.C);
  } else {
    placeRegular(vertices, 3, positions);
  }
}

function solveQuadStandalone(
  vertices: string[],
  constraints: Constraint[],
  positions: Map<string, Point2D>,
  previousPositions?: Map<string, Point2D>,
): void {
  const [vA, vB, vC, vD] = vertices;
  const shape = detectQuadShape(vertices, constraints);
  const dists = collectDistances(constraints);

  // Use previous side lengths as fallback defaults
  let prevAB: number | undefined, prevBC: number | undefined;
  let prevCD: number | undefined, prevDA: number | undefined;
  if (previousPositions) {
    const pA = previousPositions.get(vA);
    const pB = previousPositions.get(vB);
    const pC = previousPositions.get(vC);
    const pD = previousPositions.get(vD);
    if (pA && pB) prevAB = Math.sqrt((pB.x - pA.x) ** 2 + (pB.y - pA.y) ** 2);
    if (pB && pC) prevBC = Math.sqrt((pC.x - pB.x) ** 2 + (pC.y - pB.y) ** 2);
    if (pC && pD) prevCD = Math.sqrt((pD.x - pC.x) ** 2 + (pD.y - pC.y) ** 2);
    if (pD && pA) prevDA = Math.sqrt((pA.x - pD.x) ** 2 + (pA.y - pD.y) ** 2);
  }

  const sAB = dists.get(segmentKey(vA, vB));
  const sBC = dists.get(segmentKey(vB, vC));
  const sCD = dists.get(segmentKey(vC, vD));
  const sDA = dists.get(segmentKey(vD, vA));

  if (shape === 'square') {
    const side = sAB ?? sBC ?? sCD ?? sDA ?? prevAB ?? 5;
    const h = side / 2;
    positions.set(vA, { x: -h, y: -h });
    positions.set(vB, { x: h, y: -h });
    positions.set(vC, { x: h, y: h });
    positions.set(vD, { x: -h, y: h });
  } else if (shape === 'rectangle') {
    const w = sAB ?? sCD ?? prevAB ?? prevCD ?? 6;
    const h = sBC ?? sDA ?? prevBC ?? prevDA ?? w * 0.6;
    positions.set(vA, { x: -w / 2, y: -h / 2 });
    positions.set(vB, { x: w / 2, y: -h / 2 });
    positions.set(vC, { x: w / 2, y: h / 2 });
    positions.set(vD, { x: -w / 2, y: h / 2 });
  } else if (shape === 'rhombus') {
    const side = sAB ?? sBC ?? sCD ?? sDA ?? prevAB ?? 5;
    let angle = 60;
    for (const c of constraints) {
      if (c.type === 'angle-measure' && vertices.includes(c.vertex)) {
        angle = c.value;
        break;
      }
    }
    const rad = toRad(angle);
    const dx = side * Math.cos(rad);
    const dy = side * Math.sin(rad);
    positions.set(vA, { x: 0, y: 0 });
    positions.set(vB, { x: side, y: 0 });
    positions.set(vC, { x: side + dx, y: dy });
    positions.set(vD, { x: dx, y: dy });
  } else if (shape === 'parallelogram') {
    const w = sAB ?? sCD ?? prevAB ?? prevCD ?? 6;
    const h = sBC ?? sDA ?? prevBC ?? prevDA ?? 4;
    let angle = 70;
    for (const c of constraints) {
      if (c.type === 'angle-measure' && vertices.includes(c.vertex)) {
        angle = c.value;
        break;
      }
    }
    const rad = toRad(angle);
    const dx = h * Math.cos(rad);
    const dy = h * Math.sin(rad);
    positions.set(vA, { x: 0, y: 0 });
    positions.set(vB, { x: w, y: 0 });
    positions.set(vC, { x: w + dx, y: dy });
    positions.set(vD, { x: dx, y: dy });
  } else if (shape === 'trapezoid') {
    const w = sAB ?? prevAB ?? 6;
    const topW = sCD ?? prevCD ?? w * 0.6;
    const h = sBC ?? sDA ?? prevBC ?? prevDA ?? 4;
    const offset = (w - topW) / 2;
    positions.set(vA, { x: 0, y: 0 });
    positions.set(vB, { x: w, y: 0 });
    positions.set(vC, { x: w - offset, y: h });
    positions.set(vD, { x: offset, y: h });
  } else {
    const w = sAB ?? prevAB ?? 6;
    const h = sBC ?? prevBC ?? 4;
    positions.set(vA, { x: 0, y: 0 });
    positions.set(vB, { x: w, y: 0 });
    positions.set(vC, { x: w * 0.8, y: h });
    positions.set(vD, { x: w * 0.2, y: h });
  }
}

/* ── Attached solving (some vertices already positioned) ── */

function solveAttached(
  polygon: GeoPolygon,
  constraints: Constraint[],
  positions: Map<string, Point2D>,
  elements: GeoElement[],
): void {
  if (polygon.vertices.length === 4) {
    solveQuadAttached(polygon.vertices, constraints, positions, elements, polygon.flipped);
  } else if (polygon.vertices.length === 3) {
    solveTriangleAttached(polygon.vertices, constraints, positions, polygon.flipped);
  } else {
    placeUnknown(polygon.vertices, positions);
  }
}

function solveQuadAttached(
  vertices: string[],
  constraints: Constraint[],
  positions: Map<string, Point2D>,
  elements: GeoElement[],
  flipped?: boolean,
): void {
  const shape = detectQuadShape(vertices, constraints);
  const dists = collectDistances(constraints);

  // Find a pair of adjacent known vertices
  for (let i = 0; i < 4; i++) {
    const v0 = vertices[i];
    const v1 = vertices[(i + 1) % 4];
    const v2 = vertices[(i + 2) % 4];
    const v3 = vertices[(i + 3) % 4];

    if (positions.has(v0) && positions.has(v1)) {
      const p0 = positions.get(v0)!;
      const p1 = positions.get(v1)!;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const edgeLen = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular direction (rotate edge 90° CCW)
      let perpX = -dy;
      let perpY = dx;

      // Point away from any other polygon sharing these vertices
      const centroid = findOtherCentroid(v0, v1, vertices, positions, elements);
      if (centroid) {
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        const dot = perpX * (centroid.x - midX) + perpY * (centroid.y - midY);
        if (dot > 0) { perpX = -perpX; perpY = -perpY; }
      }

      // User requested flip: reverse the direction
      if (flipped) { perpX = -perpX; perpY = -perpY; }

      // Normalize
      const pLen = Math.sqrt(perpX * perpX + perpY * perpY);
      if (pLen > 0) { perpX /= pLen; perpY /= pLen; }

      // Determine height (distance perpendicular to the shared edge)
      let height: number;
      if (shape === 'square' || shape === 'rhombus') {
        height = edgeLen;
      } else {
        height =
          dists.get(segmentKey(v1, v2)) ??
          dists.get(segmentKey(v0, v3)) ??
          edgeLen * 0.6;
      }

      if (!positions.has(v2)) {
        positions.set(v2, { x: p1.x + perpX * height, y: p1.y + perpY * height });
      }
      if (!positions.has(v3)) {
        positions.set(v3, { x: p0.x + perpX * height, y: p0.y + perpY * height });
      }
      return;
    }
  }

  // Only 1 known vertex: use it as anchor + place others around it
  placeUnknown(vertices, positions);
}

function solveTriangleAttached(
  vertices: string[],
  constraints: Constraint[],
  positions: Map<string, Point2D>,
  flipped?: boolean,
): void {
  const known = vertices.filter((v) => positions.has(v));
  const unknown = vertices.filter((v) => !positions.has(v));

  if (known.length === 2 && unknown.length === 1) {
    const p1 = positions.get(known[0])!;
    const p2 = positions.get(known[1])!;
    const d = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const triVerts = new Set(vertices);

    // Collect distance constraints involving the unknown vertex
    const distToKnown: Map<string, number> = new Map();
    for (const c of constraints) {
      if (c.type === 'distance') {
        const key = segmentKey(c.points[0], c.points[1]);
        if (key === segmentKey(unknown[0], known[0])) distToKnown.set(known[0], c.value);
        if (key === segmentKey(unknown[0], known[1])) distToKnown.set(known[1], c.value);
      }
    }

    // Check for angle constraint at a known vertex (involving the unknown vertex)
    for (const c of constraints) {
      let angleVertex: string | null = null;
      let angleDeg: number | null = null;

      if (c.type === 'angle-measure' && known.includes(c.vertex)) {
        // Only match angles whose rays belong to this triangle
        if (c.ray1 && c.ray2) {
          if (!triVerts.has(c.ray1) || !triVerts.has(c.ray2)) continue;
        }
        angleVertex = c.vertex;
        angleDeg = c.value;
      } else if (c.type === 'right-angle' && known.includes(c.vertex)) {
        angleVertex = c.vertex;
        angleDeg = 90;
      }

      if (angleVertex && angleDeg != null) {
        const pAngle = positions.get(angleVertex)!;
        const otherKnown = known.find((v) => v !== angleVertex)!;
        const pOther = positions.get(otherKnown)!;

        // Direction from angle vertex to other known vertex
        const dx = pOther.x - pAngle.x;
        const dy = pOther.y - pAngle.y;
        const baseAngle = Math.atan2(dy, dx);

        // Distance from angle vertex to unknown
        const armLen = distToKnown.get(angleVertex) ?? d * 0.866;

        // Rotate by the constraint angle to place unknown
        const sign = flipped ? -1 : 1;
        const targetAngle = baseAngle + sign * toRad(angleDeg);

        positions.set(unknown[0], {
          x: pAngle.x + armLen * Math.cos(targetAngle),
          y: pAngle.y + armLen * Math.sin(targetAngle),
        });
        return;
      }
    }

    // Fallback: perpendicular placement at midpoint
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    let perpX = -(p2.y - p1.y);
    let perpY = p2.x - p1.x;
    if (flipped) { perpX = -perpX; perpY = -perpY; }
    const pLen = Math.sqrt(perpX * perpX + perpY * perpY);
    const h = distToKnown.values().next().value ?? d * 0.866;

    positions.set(unknown[0], {
      x: midX + (perpX / pLen) * h,
      y: midY + (perpY / pLen) * h,
    });
  } else {
    placeUnknown(vertices, positions);
  }
}

/* ── Shape detection ── */

function detectQuadShape(
  vertices: string[],
  constraints: Constraint[],
): 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'general' {
  const [vA, vB, vC, vD] = vertices;
  let parallelAB_DC = false;
  let parallelAD_BC = false;
  let hasRightAngle = false;
  let hasEqualAdjacentSides = false;

  for (const c of constraints) {
    if (c.type === 'right-angle' && vertices.includes(c.vertex)) hasRightAngle = true;
    if (c.type === 'angle-measure' && vertices.includes(c.vertex) && Math.abs(c.value - 90) < 0.5)
      hasRightAngle = true;

    if (c.type === 'parallel') {
      const k1 = segmentKey(c.line1[0], c.line1[1]);
      const k2 = segmentKey(c.line2[0], c.line2[1]);
      const ab = segmentKey(vA, vB);
      const cd = segmentKey(vC, vD);
      const ad = segmentKey(vA, vD);
      const bc = segmentKey(vB, vC);
      if ((k1 === ab && k2 === cd) || (k1 === cd && k2 === ab)) parallelAB_DC = true;
      if ((k1 === ad && k2 === bc) || (k1 === bc && k2 === ad)) parallelAD_BC = true;
    }

    if (c.type === 'equal-segments') {
      const s1 = segmentKey(c.seg1[0], c.seg1[1]);
      const s2 = segmentKey(c.seg2[0], c.seg2[1]);
      const sides = [
        segmentKey(vA, vB), segmentKey(vB, vC),
        segmentKey(vC, vD), segmentKey(vD, vA),
      ];
      if (sides.includes(s1) && sides.includes(s2)) {
        const i1 = sides.indexOf(s1);
        const i2 = sides.indexOf(s2);
        if (Math.abs(i1 - i2) === 1 || Math.abs(i1 - i2) === 3) {
          hasEqualAdjacentSides = true;
        }
      }
    }
  }

  const isPar = parallelAB_DC && parallelAD_BC;
  if (isPar && hasRightAngle && hasEqualAdjacentSides) return 'square';
  if (isPar && hasRightAngle) return 'rectangle';
  if (isPar && hasEqualAdjacentSides) return 'rhombus';
  if (isPar) return 'parallelogram';
  if (parallelAB_DC || parallelAD_BC) return 'trapezoid';
  return 'general';
}

/* ── Helpers ── */

function collectDistances(constraints: Constraint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of constraints) {
    if (c.type === 'distance') m.set(segmentKey(c.points[0], c.points[1]), c.value);
  }
  return m;
}

function findOtherCentroid(
  v0: string,
  v1: string,
  currentVertices: string[],
  positions: Map<string, Point2D>,
  elements: GeoElement[],
): Point2D | null {
  for (const el of elements) {
    if (el.kind !== 'polygon') continue;
    // Skip the current polygon
    if (
      el.vertices.length === currentVertices.length &&
      el.vertices.every((v) => currentVertices.includes(v))
    ) continue;
    // Must share at least one of the anchors
    if (!el.vertices.includes(v0) && !el.vertices.includes(v1)) continue;

    // Centroid of the other polygon's non-shared vertices
    const others = el.vertices.filter((v) => v !== v0 && v !== v1);
    let cx = 0, cy = 0, n = 0;
    for (const v of others) {
      const p = positions.get(v);
      if (p) { cx += p.x; cy += p.y; n++; }
    }
    if (n > 0) return { x: cx / n, y: cy / n };
  }
  return null;
}

function placeUnknown(vertices: string[], positions: Map<string, Point2D>): void {
  let cx = 0, cy = 0, n = 0;
  for (const v of vertices) {
    const p = positions.get(v);
    if (p) { cx += p.x; cy += p.y; n++; }
  }
  if (n > 0) { cx /= n; cy /= n; }

  const unknown = vertices.filter((v) => !positions.has(v));
  for (let i = 0; i < unknown.length; i++) {
    const angle = Math.PI / 2 + (2 * Math.PI * i) / unknown.length;
    positions.set(unknown[i], {
      x: cx + 3 * Math.cos(angle),
      y: cy + 3 * Math.sin(angle),
    });
  }
}

function placeRegular(vertices: string[], radius: number, positions: Map<string, Point2D>): void {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const angle = Math.PI / 2 + (2 * Math.PI * i) / n;
    positions.set(vertices[i], {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
  }
}

/** Compute the fit transform (center + scale) to map positions into [-5.5, 5.5]. */
function computeFitState(positions: Map<string, Point2D>): FitState {
  if (positions.size < 2) return { scale: 1, centerX: 0, centerY: 0 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }

  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const target = 11; // fit within [-5.5, 5.5]
  return {
    scale: Math.min(target / w, target / h),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/** Apply a fit transform to all positions (center and scale). */
function applyFit(positions: Map<string, Point2D>, fit: FitState): void {
  for (const [id, p] of positions) {
    positions.set(id, {
      x: (p.x - fit.centerX) * fit.scale,
      y: (p.y - fit.centerY) * fit.scale,
    });
  }
}
