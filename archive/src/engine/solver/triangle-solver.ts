/**
 * Triangle solver: given partial side/angle information, compute all
 * vertices, sides, and angles using law of sines, law of cosines,
 * and angle sum = 180.
 *
 * Convention: vertices A, B, C; sides a=BC, b=CA, c=AB;
 * angles A (at vertex A), B (at vertex B), C (at vertex C).
 *
 * Output places A at origin, B on the positive x-axis.
 */

import type { Point2D } from '@/types/geometry';
import { toRad, toDeg, distance } from './utils';

export interface TriangleKnowns {
  sides: { a?: number; b?: number; c?: number }; // a=BC, b=CA, c=AB
  angles: { A?: number; B?: number; C?: number }; // degrees
}

export interface TriangleSolution {
  vertices: { A: Point2D; B: Point2D; C: Point2D };
  sides: { a: number; b: number; c: number };
  angles: { A: number; B: number; C: number };
  isFullyDetermined: boolean;
}

export function solveTriangle(
  known: TriangleKnowns,
  previousVertices?: { A: Point2D; B: Point2D; C: Point2D },
): TriangleSolution | null {
  const s = { ...known.sides };
  const a = { ...known.angles };

  // Fill in third angle if two are known
  fillThirdAngle(a);

  // Try to determine all sides and angles
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    fillThirdAngle(a);
    changed = applyLawOfCosines(s, a) || changed;
    changed = applyLawOfSines(s, a) || changed;
    if (fillThirdAngle(a)) changed = true;
  }

  // Count what we know
  const knownSides = [s.a, s.b, s.c].filter(v => v != null).length;
  const knownAngles = [a.A, a.B, a.C].filter(v => v != null).length;

  // Compute previous triangle geometry for deriving stable defaults
  const prev = previousVertices ? computePrevGeometry(previousVertices) : undefined;

  // Handle underdetermined cases by making reasonable assumptions
  if (knownSides + knownAngles < 3) {
    fillDefaults(s, a, knownSides, knownAngles, prev);
    // Re-run solver with defaults
    changed = true;
    iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;
      fillThirdAngle(a);
      changed = applyLawOfCosines(s, a) || changed;
      changed = applyLawOfSines(s, a) || changed;
      if (fillThirdAngle(a)) changed = true;
    }
  }

  // Ensure we have side c (AB) for placement
  if (s.c == null) {
    if (a.A != null && a.B != null && a.C != null) {
      s.c = 5;
      applyLawOfSines(s, a);
    } else {
      // Pick any known side as c by swapping
      if (s.a != null && s.c == null) {
        s.c = s.a;
        s.a = undefined;
        // Swap angles too
        const tmp = a.C; a.C = a.A; a.A = tmp;
      } else if (s.b != null && s.c == null) {
        s.c = s.b;
        s.b = undefined;
        const tmp = a.C; a.C = a.B; a.B = tmp;
      }
    }
  }

  if (s.c == null) return null;

  // Fill remaining using law of sines
  fillRemainingSides(s, a);
  fillThirdAngle(a);

  // Place vertices: A at origin, B on positive x-axis
  const A: Point2D = { x: 0, y: 0 };
  const B: Point2D = { x: s.c, y: 0 };

  let C: Point2D;
  if (a.A != null && s.b != null) {
    const angleA = toRad(a.A);
    C = { x: s.b * Math.cos(angleA), y: s.b * Math.sin(angleA) };
  } else if (a.B != null && s.a != null) {
    const angleB = toRad(a.B);
    C = { x: s.c - s.a * Math.cos(angleB), y: s.a * Math.sin(angleB) };
  } else if (s.a != null && s.b != null) {
    const cosA = (s.b ** 2 + s.c ** 2 - s.a ** 2) / (2 * s.b * s.c);
    const clampedCosA = Math.max(-1, Math.min(1, cosA));
    const angleA = Math.acos(clampedCosA);
    C = { x: s.b * Math.cos(angleA), y: s.b * Math.sin(angleA) };
    if (a.A == null) a.A = toDeg(angleA);
  } else if (s.a != null) {
    // Only know c and a: place C at a reasonable position
    // Use default angle of 60° at A
    const defaultAngle = toRad(60);
    // Compute b from triangle with c, a, and angle
    const b = Math.sqrt(s.c ** 2 + s.a ** 2 - 2 * s.c * s.a * Math.cos(defaultAngle));
    s.b = b;
    C = { x: b * Math.cos(defaultAngle), y: b * Math.sin(defaultAngle) };
  } else if (s.b != null) {
    // Only know c and b: place C using default angle
    const defaultAngle = toRad(50);
    C = { x: s.b * Math.cos(defaultAngle), y: s.b * Math.sin(defaultAngle) };
  } else {
    // Only know c: draw a reasonable triangle
    const defaultAngle = toRad(55);
    const defaultB = s.c * 0.8;
    s.b = defaultB;
    C = { x: defaultB * Math.cos(defaultAngle), y: defaultB * Math.sin(defaultAngle) };
  }

  // Compute remaining sides from coordinates
  if (s.a == null) s.a = Math.sqrt((C.x - B.x) ** 2 + (C.y - B.y) ** 2);
  if (s.b == null) s.b = Math.sqrt(C.x ** 2 + C.y ** 2);

  // Compute remaining angles from final side lengths
  if (s.a != null && s.b != null && s.c != null) {
    if (a.A == null) {
      const cosA = (s.b ** 2 + s.c ** 2 - s.a ** 2) / (2 * s.b * s.c);
      a.A = toDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
    }
    if (a.B == null) {
      const cosB = (s.a ** 2 + s.c ** 2 - s.b ** 2) / (2 * s.a * s.c);
      a.B = toDeg(Math.acos(Math.max(-1, Math.min(1, cosB))));
    }
    fillThirdAngle(a);
  }

  const isFullyDetermined =
    s.a != null && s.b != null && s.c != null &&
    a.A != null && a.B != null && a.C != null &&
    (knownSides + knownAngles >= 3);

  return {
    vertices: { A, B, C },
    sides: { a: s.a!, b: s.b!, c: s.c! },
    angles: { A: a.A ?? 0, B: a.B ?? 0, C: a.C ?? 0 },
    isFullyDetermined,
  };
}

interface PrevGeometry {
  sides: { a: number; b: number; c: number };
  angles: { A: number; B: number; C: number };
}

/** Compute previous triangle's sides and angles from vertex positions. */
function computePrevGeometry(
  verts: { A: Point2D; B: Point2D; C: Point2D },
): PrevGeometry {
  const a = distance(verts.B, verts.C);
  const b = distance(verts.C, verts.A);
  const c = distance(verts.A, verts.B);
  // Law of cosines for angles
  const cosA = Math.max(-1, Math.min(1, (b ** 2 + c ** 2 - a ** 2) / (2 * b * c)));
  const cosB = Math.max(-1, Math.min(1, (a ** 2 + c ** 2 - b ** 2) / (2 * a * c)));
  const A = toDeg(Math.acos(cosA));
  const B = toDeg(Math.acos(cosB));
  const C = 180 - A - B;
  return { sides: { a, b, c }, angles: { A, B, C } };
}

/**
 * When we have fewer than 3 known values, fill in reasonable defaults
 * so the triangle can be drawn (even if not uniquely determined).
 * If `prev` is available, derive defaults from the previous shape for visual stability.
 */
function fillDefaults(
  s: { a?: number; b?: number; c?: number },
  a: { A?: number; B?: number; C?: number },
  knownSides: number,
  knownAngles: number,
  prev?: PrevGeometry,
): void {
  if (prev) {
    // Derive defaults from previous shape for stability
    if (knownSides === 0 && knownAngles === 0) {
      s.a ??= prev.sides.a;
      s.b ??= prev.sides.b;
      s.c ??= prev.sides.c;
      return;
    }
    if (knownSides === 1 && knownAngles === 0) {
      // Need 2 more: fill 2 angles from prev (third angle comes free)
      if (s.c != null) { a.A ??= prev.angles.A; a.B ??= prev.angles.B; }
      else if (s.a != null) { a.B ??= prev.angles.B; a.C ??= prev.angles.C; }
      else if (s.b != null) { a.A ??= prev.angles.A; a.C ??= prev.angles.C; }
      return;
    }
    if (knownSides === 0 && knownAngles === 1) {
      // Need 2 more: fill 2 sides from prev
      s.c ??= prev.sides.c;
      if (s.a == null) s.a = prev.sides.a;
      else if (s.b == null) s.b = prev.sides.b;
      return;
    }
    if (knownSides === 2 && knownAngles === 0) {
      if (s.a != null && s.c != null && s.b == null) a.B ??= prev.angles.B;
      else if (s.b != null && s.c != null && s.a == null) a.A ??= prev.angles.A;
      else if (s.a != null && s.b != null && s.c == null) a.C ??= prev.angles.C;
      return;
    }
    // For other combos (e.g. 1 side + 1 angle), fill 1 more angle from prev
    // (filling sides could conflict with the user's angle constraint)
    if (a.A == null) a.A = prev.angles.A;
    else if (a.B == null) a.B = prev.angles.B;
    else if (a.C == null) a.C = prev.angles.C;
    return;
  }

  // Fallback: no previous state (first input ever)
  if (knownSides === 0 && knownAngles === 0) {
    s.c = 5; s.a = 4; s.b = 4;
    return;
  }

  if (knownSides === 1 && knownAngles === 0) {
    // Need 2 more: fill 2 angles
    if (s.c != null) { a.A ??= 55; a.B ??= 65; }
    else if (s.a != null) { a.B ??= 55; a.C ??= 65; }
    else if (s.b != null) { a.A ??= 55; a.C ??= 65; }
    return;
  }

  if (knownSides === 0 && knownAngles === 1) {
    // Need 2 more: fill 2 sides
    s.c ??= 5;
    s.a ??= 4;
    return;
  }

  if (knownSides === 2 && knownAngles === 0) {
    if (s.a != null && s.c != null && s.b == null) a.B = 55;
    else if (s.b != null && s.c != null && s.a == null) a.A = 55;
    else if (s.a != null && s.b != null && s.c == null) a.C = 55;
    return;
  }

  // Catch-all (e.g. 1 side + 1 angle without prev): fill 1 more angle
  if (a.A == null) a.A = 55;
  else if (a.B == null) a.B = 55;
  else if (a.C == null) a.C = 55;
}

function fillRemainingSides(
  s: { a?: number; b?: number; c?: number },
  a: { A?: number; B?: number; C?: number },
): void {
  // Try each known side-angle pair as ratio source
  const pairs: Array<[number | undefined, number | undefined, keyof typeof s, keyof typeof a]> = [
    [s.a, a.A, 'a', 'A'],
    [s.b, a.B, 'b', 'B'],
    [s.c, a.C, 'c', 'C'],
  ];

  for (const [side, angle] of pairs) {
    if (side != null && angle != null && angle > 0 && angle < 180) {
      const ratio = side / Math.sin(toRad(angle));
      if (s.a == null && a.A != null) s.a = ratio * Math.sin(toRad(a.A));
      if (s.b == null && a.B != null) s.b = ratio * Math.sin(toRad(a.B));
      if (s.c == null && a.C != null) s.c = ratio * Math.sin(toRad(a.C));
      break;
    }
  }
}

function fillThirdAngle(a: { A?: number; B?: number; C?: number }): boolean {
  const known = [a.A, a.B, a.C].filter((v) => v != null);
  if (known.length === 2) {
    if (a.A == null) { a.A = 180 - a.B! - a.C!; return true; }
    if (a.B == null) { a.B = 180 - a.A! - a.C!; return true; }
    if (a.C == null) { a.C = 180 - a.A! - a.B!; return true; }
  }
  return false;
}

function applyLawOfCosines(
  s: { a?: number; b?: number; c?: number },
  a: { A?: number; B?: number; C?: number },
): boolean {
  let changed = false;

  if (s.b != null && s.c != null && a.A != null && s.a == null) {
    s.a = Math.sqrt(s.b ** 2 + s.c ** 2 - 2 * s.b * s.c * Math.cos(toRad(a.A)));
    changed = true;
  }
  if (s.a != null && s.c != null && a.B != null && s.b == null) {
    s.b = Math.sqrt(s.a ** 2 + s.c ** 2 - 2 * s.a * s.c * Math.cos(toRad(a.B)));
    changed = true;
  }
  if (s.a != null && s.b != null && a.C != null && s.c == null) {
    s.c = Math.sqrt(s.a ** 2 + s.b ** 2 - 2 * s.a * s.b * Math.cos(toRad(a.C)));
    changed = true;
  }

  if (s.a != null && s.b != null && s.c != null) {
    if (a.A == null) {
      const cosA = (s.b ** 2 + s.c ** 2 - s.a ** 2) / (2 * s.b * s.c);
      a.A = toDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
      changed = true;
    }
    if (a.B == null) {
      const cosB = (s.a ** 2 + s.c ** 2 - s.b ** 2) / (2 * s.a * s.c);
      a.B = toDeg(Math.acos(Math.max(-1, Math.min(1, cosB))));
      changed = true;
    }
    if (a.C == null) {
      const cosC = (s.a ** 2 + s.b ** 2 - s.c ** 2) / (2 * s.a * s.b);
      a.C = toDeg(Math.acos(Math.max(-1, Math.min(1, cosC))));
      changed = true;
    }
  }

  return changed;
}

function applyLawOfSines(
  s: { a?: number; b?: number; c?: number },
  a: { A?: number; B?: number; C?: number },
): boolean {
  let changed = false;

  let ratio: number | null = null;
  if (s.a != null && a.A != null && a.A > 0 && a.A < 180) {
    ratio = s.a / Math.sin(toRad(a.A));
  } else if (s.b != null && a.B != null && a.B > 0 && a.B < 180) {
    ratio = s.b / Math.sin(toRad(a.B));
  } else if (s.c != null && a.C != null && a.C > 0 && a.C < 180) {
    ratio = s.c / Math.sin(toRad(a.C));
  }

  if (ratio == null) return false;

  if (s.a == null && a.A != null) { s.a = ratio * Math.sin(toRad(a.A)); changed = true; }
  if (s.b == null && a.B != null) { s.b = ratio * Math.sin(toRad(a.B)); changed = true; }
  if (s.c == null && a.C != null) { s.c = ratio * Math.sin(toRad(a.C)); changed = true; }

  if (a.A == null && s.a != null) {
    const sinA = s.a / ratio;
    if (sinA >= -1 && sinA <= 1) { a.A = toDeg(Math.asin(sinA)); changed = true; }
  }
  if (a.B == null && s.b != null) {
    const sinB = s.b / ratio;
    if (sinB >= -1 && sinB <= 1) { a.B = toDeg(Math.asin(sinB)); changed = true; }
  }
  if (a.C == null && s.c != null) {
    const sinC = s.c / ratio;
    if (sinC >= -1 && sinC <= 1) { a.C = toDeg(Math.asin(sinC)); changed = true; }
  }

  return changed;
}
