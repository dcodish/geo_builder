/**
 * Carrier descriptor — the single source of truth for "which point kinds carry a driveable /
 * countable degree of freedom, and how many" (ADR-043 / R3 Piece 2).
 *
 * Before this, the same kind-sets were hand-listed across ~7 sites (the `resolveDriven` filters,
 * `carrierSpec`/`setCarrierVals`, `sample.ts` `freeDofs`/`rawMovableDof`/the sampler, `step.ts`
 * `freeDrivableAncestors`/`markDriven`) — and a kind added to the `GeoPoint` union but forgotten
 * in one of them was a *silent* dropped DOF, not a type error. `carrierOf` is an EXHAUSTIVE switch
 * over `GeoPointKind`, so adding a point kind forces a decision here (a missing case is a compile
 * error). The callers that classify by family read `carrierOf` instead of re-typing the lists.
 *
 * Scope: `carrierOf` owns the CLASSIFICATION (family + DOF count). The per-kind *value* math —
 * the sampler's jitter magnitudes (sample.ts) and the solver's seed/scale/write (carrierSpec /
 * setCarrierVals in evaluate.ts) — is figure-tuned and stays where it is; those switches branch on
 * the same kinds and could later delegate their classification here too.
 */

import type { GeoObject } from './types';
import { isGeoPoint } from './types';

/**
 * The kind of freedom a carrier contributes:
 *  - `free`  — a 2-DOF free vertex (x, y); the solver moves it jointly, the sampler perturbs it.
 *  - `param` — a bounded 1-DOF parametric point (on-segment `t` ∈ [0,1] / on-circle `θ` ∈ [0,2π]).
 *  - `line`  — an unbounded 1-DOF on-line offset (slides along an infinite line).
 *  - `shape` — a shape scalar (perp-offset `dist` / rotated `angleDeg` / scaled-offset `k`).
 */
export type CarrierFamily = 'free' | 'param' | 'line' | 'shape';

export interface Carrier {
  family: CarrierFamily;
  /** Raw movable DOF the kind carries before constraints / pinning: a free vertex 2, everything else 1. */
  dof: 1 | 2;
}

/**
 * The carrier classification of an object, or null if it carries no driveable DOF (a derived /
 * intersection / solved point, a segment / polygon / line / circle / arc). Exhaustive over every
 * {@link GeoObject} point kind — a new kind without a case here fails the build.
 */
export function carrierOf(o: GeoObject): Carrier | null {
  if (!isGeoPoint(o)) return null;
  switch (o.kind) {
    case 'free-point':
      return { family: 'free', dof: 2 };
    case 'on-segment':
    case 'on-circle':
      return { family: 'param', dof: 1 };
    case 'on-line':
      return { family: 'line', dof: 1 };
    case 'perp-offset':
    case 'rotated':
    case 'scaled-offset':
      return { family: 'shape', dof: 1 };
    // 0-DOF point kinds — fully determined by their parents, never driven/sampled.
    case 'derived':
    case 'intersection':
    case 'parallelogram-vertex':
    case 'line-line-intersection':
    case 'on-segment-solved':
    case 'line-intersection':
    case 'foot':
    case 'midpoint':
    case 'circumcenter':
    case 'antipode':
    case 'arc-midpoint':
    case 'line-circle':
    case 'circle-circle':
    case 'radial-toward':
      return null;
  }
}

/** Whether `o` is a SHAPE-scalar carrier (perp-offset / rotated / scaled-offset). The triple that
 *  recurred verbatim across the sampler, the DOF cue, the ancestor walk, and the driven-solver. */
export function isShapeCarrier(o: GeoObject): boolean {
  return carrierOf(o)?.family === 'shape';
}

/** Whether `o` is a bounded PARAMETRIC carrier (on-segment / on-circle). */
export function isParamCarrier(o: GeoObject): boolean {
  return carrierOf(o)?.family === 'param';
}
