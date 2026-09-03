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
import { prettyName } from '../model/naming';
import type {
  DerivedObject,
  DerivedPoint,
  DerivedRotation,
  DerivedSequence,
} from '../replay/derive2';
import { type SceneChain, type SceneSpiral, chainsOf, spiralsOf } from './series';
import { type SceneRotationArc, rotationArcsOf } from './rotation';
import { type SceneCycle, cyclesOf } from './cycle';
import { type SceneRegion, regionsOf } from './region';

export interface ScenePoint {
  readonly name: string;
  readonly label: string;
  readonly z: Cx;
  /**
   * The full text this point carries, composed by stage 5d and printed verbatim.
   *
   * Not `exact: string | null`, which is what it was: a nullable field makes the renderer decide what
   * to say when it is null, and the renderer has nothing to decide it with — so it said nothing, and
   * `z1 = 3+4i` drew a bare name (#675). A reading is always present, and the choice of `=` / `≈` /
   * `~` was made where the knowledge lives.
   */
  readonly reading: string;
  /** #703 — the a+bi form of the same reading, for the cartesian view. */
  readonly readingCart: string;
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

/**
 * A stated object — a segment, a polygon, or a circle (F6).
 *
 * Deliberately one primitive rather than three: the renderer draws a path and a circle, and the only
 * thing it needs to vary is how many points the path joins and whether it closes. Splitting it would
 * put the same honesty flag on three types and invite two of them to drift.
 */
export interface SceneShape {
  readonly key: string;
  readonly label: string;
  /** the vertices to join, in order; empty for a circle */
  readonly vertices: readonly Cx[];
  /** true for a polygon — the path returns to its first vertex */
  readonly closed: boolean;
  readonly center?: Cx;
  readonly radius?: number;
  /** every position it rests on is FORCED by the givens; otherwise it moves with the configuration */
  readonly known: boolean;
}

export interface Scene {
  readonly points: readonly ScenePoint[];
  readonly radii: readonly SceneRadius[];
  readonly arcs: readonly SceneArgArc[];
  readonly rings: readonly SceneModRing[];
  readonly shapes: readonly SceneShape[];
  /** the log-spiral through a sequence's terms — a circle or a ray in the degenerate cases */
  readonly spirals: readonly SceneSpiral[];
  /** the partial sums, head to tail */
  readonly chains: readonly SceneChain[];
  /** `w = z·u` as the turn and the stretch it is */
  readonly rotations: readonly SceneRotationArc[];
  /** the finite ring of directions a power visits, with the `n` stepper's current one marked */
  readonly cycles: readonly SceneCycle[];
  /** a stated polygon, with every plotted number placed inside / on / outside it */
  readonly regions: readonly SceneRegion[];
  readonly grid: ScenePolarGrid;
  /** world half-width the view must cover, already padded */
  readonly extent: number;
}

/**
 * What the scene is built FROM — the figure, named rather than positional.
 *
 * `Derived2` satisfies it structurally, which is the point: the app hands the fold's own output
 * straight in, and a test can hand in a figure it assembled itself.
 */
export interface SceneInput {
  readonly points: readonly DerivedPoint[];
  readonly objects?: readonly DerivedObject[];
  readonly sequences?: readonly DerivedSequence[];
  readonly rotations?: readonly DerivedRotation[];
}

/**
 * DISPLAY STATE — the parts of the picture the student steers, which are not part of the figure.
 *
 * `n` steps through a power cycle. It is an ARGUMENT and never a stored value
 * ([ADR-CX-001](../../docs/06d-decisions-complex.md#adr-cx-001) D3): it is outside the store, outside
 * undo, and it cannot reach the parser or the engine — stepping it changes which power is highlighted
 * and nothing else. The polar/cartesian toggle is the same kind of thing at the renderer.
 */
export interface SceneDisplay {
  readonly n?: number;
}

/** One definition of how a name is written, shared with every other surface (`model/naming`). */
export { prettyName };

/** #885 — the view for a figure with nothing in it: no points, no objects. Arbitrary by definition,
 *  so it is named rather than left as a magic 3 inside the extent expression. */
const EMPTY_FIGURE_EXTENT = 3;

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
export function buildScene(figure: SceneInput, display: SceneDisplay = {}): Scene {
  const { points, objects = [], sequences = [], rotations = [] } = figure;
  const magnitudes = points.map((p) => Math.hypot(p.z.re, p.z.im));
  /**
   * A circle must fit in the view, not just its centre.
   *
   * The extent was computed from the plotted NUMBERS alone, so «המעגל שמרכזו O ורדיוסו 8» over small
   * numbers drew a circle running off every edge — the figure was correct and unreadable, which for a
   * product whose thesis is *the figure answers the question* is the same as being wrong.
   */
  const reach = objects.flatMap((o) =>
    o.kind === 'circle' && o.center && o.radius !== undefined
      ? [Math.hypot(o.center.re, o.center.im) + o.radius]
      : o.vertices.map((v) => Math.hypot(v.re, v.im)),
  );
  /**
   * #885 — FIT TO THE CONTENT, and fall back to a default only when there is no content.
   *
   * This was `Math.max(3, …)`, a hard floor. It fires even when nothing is missing, and then it is pure
   * dead space: «z^6 = 1» — the tool's most canonical figure, and the one every roots question opens
   * with — has every root at modulus 1, so a view spanning 7.5 was drawn for content spanning 2 and the
   * figure filled about a QUARTER of the canvas (operator, 2026-09-03: "the zoom is wrong too. it can be
   * bigger on screen").
   *
   * The floor was guarding against UNDER-reaching — content that is not a plotted point, like
   * «המעגל שמרכזו O ורדיוסו 8». But `reach` above already brings that in (a circle contributes
   * centre + radius, every other object its vertices), so the floor was covering a hole that is closed.
   * What remains is the genuinely EMPTY figure, where there is nothing to fit to and any frame is
   * arbitrary — that, and only that, keeps a default.
   *
   * Deliberately not fed by `arcs`, `rings` or `spirals`: those are sized FROM `extent`
   * (`radius: (extent / 4) * …`), so letting them contribute would be a feedback loop that grows the
   * view every render.
   */
  const content = [...magnitudes, ...reach].filter((r) => Number.isFinite(r) && r > 1e-9);
  const extent = (content.length ? Math.max(...content) : EMPTY_FIGURE_EXTENT) * 1.25;

  const step = niceStep(extent / 4);
  const rings: number[] = [];
  for (let r = step; r <= extent; r += step) rings.push(round(r, 6));

  const rays: number[] = [];
  for (let d = 0; d < 360; d += RAY_STEP_DEG) rays.push(d);

  const scenePoints: ScenePoint[] = points.map((p) => ({
    name: p.name,
    label: p.display, // #791: composed once at stage 5d — «A (z₁)» when a binding dual-names the point
    z: p.z,
    reading: p.reading,
    readingCart: p.readingCart,
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

  const shapes: SceneShape[] = objects.map((o) => ({
    key: o.key,
    label: o.label,
    vertices: o.vertices,
    closed: o.kind === 'polygon',
    center: o.center,
    radius: o.radius,
    known: o.known,
  }));

  return {
    points: scenePoints,
    radii,
    arcs,
    rings: modRings,
    shapes,
    spirals: spiralsOf(sequences),
    chains: chainsOf(sequences),
    rotations: rotationArcsOf(rotations, points),
    cycles: cyclesOf(points, display.n ?? 1),
    regions: regionsOf(objects, points),
    grid: { rings, rays, rayStepDeg: RAY_STEP_DEG },
    extent,
  };
}
