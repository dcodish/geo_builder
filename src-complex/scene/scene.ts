/**
 * THE SCENE — a pure visual model of the figure. No React, no SVG, no DOM.
 *
 * The operator's headline requirement for this product, from the first conversation: *"I want the
 * visualization part to be strong. I want students to see the polar coordinates."* That is what this
 * layer is for. A complex number is not a dot on a grid — it is a **length and a direction**, and the
 * whole topic (multiplication rotates, powers wind, roots divide the turn) is invisible unless the
 * length and the direction are drawn as things.
 *
 * So every plotted number carries, by construction:
 *
 *   - a **radius vector** from the origin — the length, as a length
 *   - an **argument arc** swept from the +Re axis — the direction, as an angle
 *   - a **modulus ring** through it — where else that magnitude could sit
 *
 * over a **polar substrate** of rings and rays, which the student can read the way they read a
 * cartesian grid.
 *
 * Pure and separately testable for the reason 2-D records four times over (ADR-044, 201, 380, 423):
 * a renderer that re-derives geometry drifts from the engine that owns it. Here the renderer maps
 * primitives and computes nothing.
 *
 * **Honesty travels with the geometry.** A sampled magnitude or direction is marked `known: false` on
 * the primitive itself, so no consumer has to remember to ask — the canvas can draw a figure the
 * givens under-determine (ADR-CX-001 D3, always visualise) while never presenting a sampled value as
 * a stated one (ADR-052).
 */

import type { Cx } from '../value/value';
import type { DerivedPoint } from '../replay/derive2';

export interface ScenePoint {
  readonly name: string;
  readonly label: string;
  readonly z: Cx;
  /** the exact polar reading when the givens force it, else null */
  readonly exact: string | null;
  readonly modulusKnown: boolean;
  readonly argumentKnown: boolean;
}

/** The origin→z arrow: the magnitude, drawn as a magnitude. */
export interface SceneRadius {
  readonly name: string;
  readonly to: Cx;
  readonly known: boolean;
  /** `√2` or `~1.25` — the text that belongs on the arrow */
  readonly label: string;
}

/** The swept angle from the +Re axis: the direction, drawn as a direction. */
export interface SceneArgArc {
  readonly name: string;
  /** where to draw it — a fraction of the figure's extent, so arcs of nested numbers do not collide */
  readonly radius: number;
  readonly fromDeg: 0;
  readonly toDeg: number;
  readonly known: boolean;
  readonly label: string;
}

/** A circle of constant modulus — the locus the magnitude alone allows. */
export interface SceneModRing {
  readonly r: number;
  readonly known: boolean;
  /** the names that sit on it; two numbers of equal modulus share one ring */
  readonly names: readonly string[];
}

/** The polar substrate: concentric rings and angular rays, at readable steps. */
export interface ScenePolarGrid {
  readonly rings: readonly number[];
  /** degrees, every `rayStepDeg` around the turn */
  readonly rays: readonly number[];
  readonly rayStepDeg: number;
}

export interface Scene {
  readonly points: readonly ScenePoint[];
  readonly radii: readonly SceneRadius[];
  readonly arcs: readonly SceneArgArc[];
  readonly rings: readonly SceneModRing[];
  readonly grid: ScenePolarGrid;
  /** world half-width the view must cover, already padded */
  readonly extent: number;
}

/** Subscript the trailing digits, the way the exam prints them. */
export const prettyName = (name: string): string =>
  name.replace(/(\d+)$/, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''));

const niceStep = (raw: number): number => {
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};

const round = (x: number, places = 2): number => {
  const f = 10 ** places;
  const r = Math.round(x * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** Rays every 30°, which lands on the exam's own angles (30/45/60/90 all readable off the grid). */
const RAY_STEP_DEG = 30;

/**
 * Build the scene from the derived figure.
 *
 * The arc radii are staggered deliberately: two numbers whose arcs both start at 0° would otherwise
 * draw on top of each other and the student could not tell which angle belonged to which number.
 */
export function buildScene(points: readonly DerivedPoint[]): Scene {
  const magnitudes = points.map((p) => Math.hypot(p.z.re, p.z.im));
  const extent = Math.max(3, ...magnitudes) * 1.25;

  const step = niceStep(extent / 4);
  const rings: number[] = [];
  for (let r = step; r <= extent; r += step) rings.push(round(r, 6));

  const rays: number[] = [];
  for (let d = 0; d < 360; d += RAY_STEP_DEG) rays.push(d);

  const scenePoints: ScenePoint[] = points.map((p) => ({
    name: p.name,
    label: prettyName(p.name),
    z: p.z,
    exact: p.exactLabel,
    modulusKnown: p.modulusKnown,
    argumentKnown: p.argumentKnown,
  }));

  const radii: SceneRadius[] = points.map((p) => ({
    name: p.name,
    to: p.z,
    known: p.modulusKnown,
    label: p.modulusKnown ? p.modulus : `~${p.modulus}`,
  }));

  const arcs: SceneArgArc[] = points.map((p, i) => ({
    name: p.name,
    // stagger inside the innermost ring so nested arcs stay legible
    radius: (extent / 4) * (0.45 + 0.18 * (i % 3)),
    fromDeg: 0,
    toDeg: ((p.argumentDeg % 360) + 360) % 360,
    known: p.argumentKnown,
    label: p.argumentKnown ? `${round(p.argumentDeg)}°` : `~${round(p.argumentDeg)}°`,
  }));

  // one ring per DISTINCT magnitude: numbers of equal modulus share it, which is the picture that
  // makes «|z₁| = |z₂| = r» and a root constellation read as ONE fact rather than several
  const byMagnitude = new Map<string, { r: number; known: boolean; names: string[] }>();
  points.forEach((p, i) => {
    const r = magnitudes[i];
    if (r <= 1e-9) return;
    const key = r.toFixed(6);
    const entry = byMagnitude.get(key) ?? { r, known: true, names: [] };
    entry.names.push(p.name);
    entry.known = entry.known && p.modulusKnown;
    byMagnitude.set(key, entry);
  });
  const modRings: SceneModRing[] = [...byMagnitude.values()].sort((a, b) => a.r - b.r);

  return {
    points: scenePoints,
    radii,
    arcs,
    rings: modRings,
    grid: { rings, rays, rayStepDeg: RAY_STEP_DEG },
    extent,
  };
}
