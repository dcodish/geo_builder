/**
 * Pure scene builder (docs/20 §6.4): Construction3 + positions + camera + viewport
 * → flat 2-D SVG primitives. No React, no DOM — fully unit-testable, and the
 * renderer component is a dumb map over the output (the 2-D tool's proven split).
 *
 * Hidden-edge rule (V0, convex solids): a solid's face is front-facing iff its
 * OUTWARD normal points toward the camera; an edge is drawn dashed iff every face
 * it borders is back-facing. Outward orientation is derived numerically (normal
 * flipped to point away from the solid's centroid) so face-ring order can't be
 * a silent bug source. Exact for convex solids; plane patches come later and
 * never occlude (docs/20 §11).
 */

import { openCrossings3 } from '../engine/crossings3';
import { cleanMag } from '../engine/dataView';
import { hasAbsoluteFrameObject, intersectPlanes, paramIsKnowledge, type Resolved3, type ResolvedLine, type ResolvedPlane } from '../engine/evaluate';
import { distanceWitness, resolveOperand } from '../engine/operands';
import type { Construction3, Id, Positions3 } from '../engine/types';
import { add3, centroid3, cross3, dist3, dot3, lerp3, norm3, normalize3, scale3, sub3, v3, type Vec3 } from '../engine/vec3';
import { cameraFrame, project3, type Camera3 } from './camera';
import { planeBasis, projectOntoLine, projectOntoPlane } from './planeGeom';
import { isRightAngleValue, rightAngles3 } from './rightAngles';

export interface ScenePoint3 {
  id: Id;
  x: number;
  y: number;
  /** Typographic label — prime rendered as ′. */
  label: string;
  labelDx: number;
  labelDy: number;
}

export interface SceneEdge3 {
  id: string;
  a: Id;
  b: Id;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hidden: boolean;
}

/**
 * A named vector's on-figure notation (ADR-3D-003, amended per operator: the
 * ARROWHEAD sits at the HEAD — e.g. at A′ for AA′ — and the vector is drawn in
 * its own colour so tail and head are unmistakable): a coloured overlay line
 * along the full from→to segment ending in an arrowhead at `to`, plus the name
 * label beside the midpoint in the textbook style — the letter with an ARROW
 * ABOVE and an UNDERLINE, in the same colour.
 */
export interface SceneVector3 {
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The vector rides a hidden edge / interior segment — its overlay dashes too (depth cue kept). */
  hidden: boolean;
  labelX: number;
  labelY: number;
  /** Screen-space direction of the vector, degrees (for the arrowhead's rotation at `to`). */
  angleDeg: number;
}

/** A coordinate axis (Lane A — drawn when the figure carries algebraic objects). */
export interface SceneAxis3 {
  axis: 'x' | 'y' | 'z';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
}

/** A plane's translucent patch (4 projected corners) + its name label. */
export interface ScenePlane3 {
  name: string;
  corners: { x: number; y: number }[];
  labelX: number;
  labelY: number;
}

/** A drawn (infinite) line, clipped to the figure's neighbourhood, echoed in parametric form. */
export interface SceneLine3 {
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  /** The textbook echo: `ℓ: x = (0, -5, 3) + t·(1, 0, 0)`. */
  form: string;
}

/**
 * #483 — an UNNAMED ℓ∩π crossing, offered as a clickable dot. Carries the operands (not just the
 * screen position) because clicking must produce a real utterance naming them, not a bare coordinate.
 */
export interface SceneCrossing3 {
  line: string;
  plane: string;
  x: number;
  y: number;
}

/** A right-angle knee mark at a ⟂ foot: a 3-point screen polyline. */
export interface SceneMark3 {
  pts: { x: number; y: number }[];
}

/** The FOLD between two intersecting planes — drawn even before the student names ℓ
 *  (a textbook drawing always shows where the planes meet). */
export interface SceneSeam3 {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A STATED dihedral angle (e.g. "the angle between the planes is 45°"): an arc at the seam + the value. */
export interface SceneAngle3 {
  pts: { x: number; y: number }[];
  labelX: number;
  labelY: number;
  text: string;
}

/** A sampled curve (revolution-solid outlines, V6): dashed when `hidden` (a back arc / the axis). */
export interface SceneCurve3 {
  pts: { x: number; y: number }[];
  hidden: boolean;
}

/** #397 (ADR-3D-108): a stated distance's WITNESS — the closest-point segment + its stated value. */
export interface SceneWitness3 {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  text: string;
}

export interface Scene3 {
  points: ScenePoint3[];
  edges: SceneEdge3[];
  vectors: SceneVector3[];
  axes: SceneAxis3[];
  planes: ScenePlane3[];
  lines: SceneLine3[];
  marks: SceneMark3[];
  seams: SceneSeam3[];
  angles: SceneAngle3[];
  curves: SceneCurve3[];
  witnesses: SceneWitness3[];
  /** #483 — determined-but-unnamed line∩plane crossings the student can click to name. */
  crossings: SceneCrossing3[];
}

export interface Viewport {
  width: number;
  height: number;
}

const MARGIN = 44;
const LABEL_OFFSET = 15;

export const displayLabel = (id: Id): string => id.replace(/'/g, '′');

const edgeKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** World-space face normal (first-two-edges cross), oriented OUTWARD from `center`. */
function outwardNormal(ring: Vec3[], center: Vec3): Vec3 {
  const n = cross3(sub3(ring[1], ring[0]), sub3(ring[2], ring[0]));
  const toFace = sub3(centroid3(ring), center);
  return dot3(n, toFace) >= 0 ? n : { x: -n.x, y: -n.y, z: -n.z };
}

/** Set of edge keys hidden from this camera (both bordering faces back-facing). */
export function hiddenEdgeKeys(c: Construction3, positions: Positions3, cam: Camera3): Set<string> {
  const { eye } = cameraFrame(cam);
  const hidden = new Set<string>();

  for (const solid of c.solids) {
    const center = centroid3(solid.ids.map((id) => positions.get(id)!));
    // edge key → is any bordering face front-facing?
    const anyFront = new Map<string, boolean>();
    for (const face of solid.faces) {
      const ring = face.map((id) => positions.get(id)!);
      const front = dot3(outwardNormal(ring, center), eye) > 1e-12;
      for (let i = 0; i < face.length; i++) {
        const k = edgeKey(face[i], face[(i + 1) % face.length]);
        anyFront.set(k, (anyFront.get(k) ?? false) || front);
      }
    }
    for (const [a, b] of solid.edges) {
      const k = edgeKey(a, b);
      if (anyFront.get(k) === false) hidden.add(k);
    }
  }
  return hidden;
}

/**
 * Is an auxiliary segment drawn DASHED? The textbook convention (docs/20 §6.4):
 * a construction line running through a solid's interior is dashed (the solid
 * body would occlude it), and one lying ON a face is dashed iff every face it
 * lies on is back-facing (e.g. a bottom-face diagonal). Judged at the segment's
 * midpoint — exact for a straight segment against convex solids.
 */
export function auxSegmentHidden(c: Construction3, positions: Positions3, a: Id, b: Id, cam: Camera3): boolean {
  const pa = positions.get(a);
  const pb = positions.get(b);
  if (!pa || !pb) return false;
  const mid = lerp3(pa, pb, 0.5);
  const { eye } = cameraFrame(cam);
  const EPS = 1e-7;

  for (const solid of c.solids) {
    const center = centroid3(solid.ids.map((id) => positions.get(id)!));
    let inside = true;
    let onAnyFrontFace = false;
    let onAnyFace = false;
    for (const face of solid.faces) {
      const ring = face.map((id) => positions.get(id)!);
      const n = normalize3(outwardNormal(ring, center));
      const d = dot3(n, sub3(mid, ring[0]));
      if (d > EPS) {
        inside = false;
        break;
      }
      if (Math.abs(d) <= EPS) {
        onAnyFace = true;
        if (dot3(n, eye) > EPS) onAnyFrontFace = true;
      }
    }
    if (!inside) continue;
    if (!onAnyFace) return true; // strictly interior — always dashed
    if (!onAnyFrontFace) return true; // on hidden face(s) only
  }
  return false;
}

/** Largest-open-wedge label direction (screen space): bisect the widest angular gap between incident edges. */
function labelDir(incident: { dx: number; dy: number }[]): { dx: number; dy: number } {
  const angles = incident
    .filter((d) => Math.hypot(d.dx, d.dy) > 1e-9)
    .map((d) => Math.atan2(d.dy, d.dx))
    .sort((p, q) => p - q);
  if (angles.length === 0) return { dx: Math.SQRT1_2, dy: -Math.SQRT1_2 }; // default NE (SVG y down)
  let bestGap = -1;
  let bestMid = 0;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const b = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    if (b - a > bestGap) {
      bestGap = b - a;
      bestMid = (a + b) / 2;
    }
  }
  return { dx: Math.cos(bestMid), dy: Math.sin(bestMid) };
}

/**
 * #481 — the canvas uses the SAME number formatter as the data panel (`cleanMag`: integer / p·q⁻¹ /
 * surd / 2 decimals). It used to own a private 3-decimal rounder justified by "the bagrut answers are
 * clean numbers", which is false precisely where the parameter lane lives: a root of a quadratic
 * residual is a surd by default, and √2 printed as `1.414`. A second formatter on a user-facing surface
 * is a second set of rounding rules to keep in step, so there is now one.
 */
/** #491: the canvas asks for THREE decimal places. #481 replaced this surface's private 3-decimal
 *  rounder with the panel's formatter — correctly, so there is one set of rounding rules — but it also
 *  inherited the panel's 2-place fallback, coarsening an unrepresentable component from -0.586 to
 *  -0.59. That was collateral, not the intent. Precision is a property of the SURFACE (the canvas has
 *  room a panel row does not); the tiers stay shared, so a component with an exact form still prints
 *  it and a triple can read `(-0.586, √2, 3.414)` — mixed, and honest about which parts are exact. */
const fmt = (x: number): string => cleanMag(Object.is(x, -0) ? 0 : x, 3);


export function buildScene3(
  c: Construction3,
  resolved: Resolved3,
  cam: Camera3,
  viewport: Viewport,
  zoom = 1,
  /** #318: per-plane patch display — 'face' draws a point-run plane's patch as EXACTLY its
   *  defining polygon; absent/'full' keeps the growing fold-anchored patch (the default). */
  planeDisplay: Record<string, 'face' | 'full' | 'hidden'> = {},
  /** #397 (ADR-3D-108): draw the closest-point WITNESS of every stated distance (dashed + value). */
  showWitnesses = true,
): Scene3 {
  const positions = resolved.positions;
  const frame = cameraFrame(cam);
  // #367: "is anything in this figure absolute?" is ONE question — it decides both whether the
  // solid's placement is a gauge (evaluate) and whether the coordinate axes are drawn (here). It
  // used to be answered by two separate enumerations, and this one omitted a typed parametric
  // line, so a figure framed by a line drew no axes. One predicate, no drift (the `scalePinned`
  // precedent, ADR-3D-054).
  const laneA = hasAbsoluteFrameObject(c);

  // ---- world-space auxiliary geometry, computed BEFORE the fit so it's always in frame
  const worldPts = [...positions.values()];
  const center = worldPts.length ? centroid3(worldPts) : v3(0, 0, 0);
  let radius = 1.5;
  for (const p of worldPts) radius = Math.max(radius, dist3(p, center));

  // #397 (ADR-3D-108): the WITNESS of every stated distance — the closest-point segment whose
  // length IS the stated value (the "height" the operator asked to see). World-space, BEFORE the
  // patch sweep (a foot on a plane must grow that plane's patch — the ADR-3D-097 rule: the patch
  // must cover what a relation is read against) and before the fit (so it is always in frame).
  const wWitnesses: { a: Vec3; b: Vec3; text: string; planeFeet: { n: Vec3; d: number }[]; wedge?: { vertex: Vec3; u1: Vec3; u2: Vec3; planeN?: Vec3 } }[] = [];
  if (showWitnesses) {
    const atW = (id: Id) => positions.get(id) ?? null;
    const absW = { lines: resolved.lines, planes: resolved.planes };
    const statedD = [
      ...c.scalarPins.flatMap((p) => (p.kind === 'distance' ? [{ a: p.a, b: p.b, value: p.value }] : [])),
      ...c.claims.flatMap((cl) => (cl.type === 'distance-rel' ? [{ a: cl.a, b: cl.b, value: cl.value }] : [])),
    ];
    const seenD = new Set<string>();
    for (const st of statedD) {
      const key = JSON.stringify([st.a, st.b]);
      if (seenD.has(key)) continue;
      seenD.add(key);
      const ga = resolveOperand(st.a, c, absW)(atW);
      const gb = resolveOperand(st.b, c, absW)(atW);
      const w = ga && gb ? distanceWitness(ga, gb) : null;
      if (!w || dist3(w[0], w[1]) < 1e-9) continue; // met objects have no gap to draw
      // the ⟂ KNEE at a foot: on a plane the second arm is arbitrary in-plane (legibility-rotated
      // via planeN, the rightAngles3 convention); on a line it IS the line — a real object.
      const planeFeet: { n: Vec3; d: number }[] = [];
      let wedge: { vertex: Vec3; u1: Vec3; u2: Vec3; planeN?: Vec3 } | undefined;
      for (const [g, foot, other] of [[ga!, w[1], w[0]], [gb!, w[0], w[1]]] as const) {
        if (g.normal && !g.dir && g.d !== undefined) {
          planeFeet.push({ n: g.normal, d: g.d });
          wedge = { vertex: foot, u1: normalize3(sub3(other, foot)), u2: planeBasis(g.normal).e1, planeN: g.normal };
        } else if (g.dir && !g.normal && !wedge) {
          wedge = { vertex: foot, u1: normalize3(sub3(other, foot)), u2: normalize3(g.dir) };
        }
      }
      wWitnesses.push({ a: w[0], b: w[1], text: fmt(st.value), planeFeet, wedge });
    }
  }

  // Intersecting planes must VISIBLY cross (operator: "the visualization of planes is
  // critical"): every pair's fold line is computed, and each such plane's patch is
  // CENTRED on a shared focus point ON the fold, with one patch axis ALONG it — the
  // crossing is then geometrically guaranteed on screen, not left to luck.
  const planeEntries = [...resolved.planes.entries()];
  const pairLines: { n1: string; n2: string; line: ResolvedLine; focus: Vec3 }[] = [];
  for (let i = 0; i < planeEntries.length; i++) {
    for (let j = i + 1; j < planeEntries.length; j++) {
      const line = intersectPlanes(planeEntries[i][1], planeEntries[j][1]);
      if (line) pairLines.push({ n1: planeEntries[i][0], n2: planeEntries[j][0], line, focus: projectOntoLine(center, line) });
    }
  }
  const h = radius * 0.8;
  const patchFrame = new Map<string, { center: Vec3; e1: Vec3; e2: Vec3 }>();
  for (const { n1, n2, line, focus } of pairLines) {
    for (const name of [n1, n2]) {
      if (patchFrame.has(name)) continue;
      const pl = resolved.planes.get(name)!;
      patchFrame.set(name, { center: focus, e1: normalize3(line.dir), e2: normalize3(cross3(pl.n, line.dir)) });
    }
  }
  // A patch must COVER every figure point that lies ON its plane (operator: a point
  // "on one of the planes" drawn outside the patch visually contradicts the given).
  // Extents grow asymmetrically from the frame centre — the fold anchoring is kept.
  const POINT_MARGIN = radius * 0.28;
  const patchExtent = new Map<string, { u1: number; u2: number; v1: number; v2: number }>();
  const frameOf = (name: string, pl: ResolvedPlane) =>
    patchFrame.get(name) ??
    (() => {
      const { e1, e2 } = planeBasis(pl.n);
      return { center: projectOntoPlane(center, pl), e1, e2 };
    })();
  const wPlanes: { name: string; corners: Vec3[] }[] = [];
  const facePatches = new Set<string>(); // planes actually drawn as their defining polygon (#318)
  for (const [name, pl] of resolved.planes) {
    // #395 (ADR-3D-108): a HIDDEN plane draws no patch (and no label/seam below) — the RELATION
    // stays enforced in the engine; only the ink is suppressed, per the operator's show/hide ask.
    if (planeDisplay[name] === 'hidden') continue;
    // #318 'face' display: the patch IS the defining point-run polygon, in the stated order —
    // no growing extents, no fold-anchored frame. Only a point-run plane has a face to show;
    // an equation plane (or an unplaced run) falls through to the 'full' patch unchanged.
    if (planeDisplay[name] === 'face') {
      const run = c.pointPlanes.get(name);
      const facePts = run?.map((id) => positions.get(id));
      if (facePts && facePts.length >= 3 && facePts.every((p): p is Vec3 => p !== undefined)) {
        wPlanes.push({ name, corners: facePts });
        facePatches.add(name);
        continue;
      }
    }
    const fr = frameOf(name, pl);
    const ext = { u1: -h, u2: h, v1: -h, v2: h };
    const grow = (p: Vec3) => {
      const q = sub3(p, fr.center);
      const u = dot3(q, fr.e1);
      const v = dot3(q, fr.e2);
      ext.u1 = Math.min(ext.u1, u - POINT_MARGIN);
      ext.u2 = Math.max(ext.u2, u + POINT_MARGIN);
      ext.v1 = Math.min(ext.v1, v - POINT_MARGIN);
      ext.v2 = Math.max(ext.v2, v + POINT_MARGIN);
    };
    for (const p of positions.values()) {
      if (Math.abs(dot3(pl.n, p) + pl.d) > 1e-6 * (1 + norm3(pl.n))) continue; // only points ON the plane
      grow(p);
    }
    // #397: a distance witness FOOT on this plane is read against the patch — same coverage rule
    // as an on-plane point (ADR-3D-097's "the patch must cover what a relation is read against")
    for (const wt of wWitnesses) {
      for (const p of [wt.a, wt.b]) {
        if (Math.abs(dot3(pl.n, p) + pl.d) <= 1e-6 * (1 + norm3(pl.n))) grow(p);
      }
    }
    // a point stated ABOVE/BELOW this plane floats off it — its ⟂ projection must still
    // land INSIDE the patch (the patch is what the student reads the side against)
    for (const [id, def] of c.points) {
      if (def.kind !== 'on-plane' || def.plane !== name || !def.side) continue;
      const p = positions.get(id);
      if (p) grow(projectOntoPlane(p, pl));
    }
    // Where a drawn LINE crosses this plane is a point ON the plane, and it is the one place the
    // student reads a line↔plane relation. A patch that stops short of it draws `ℓ ⟂ π` as a line
    // and a rectangle that never meet — the same visual contradiction as an on-plane point drawn
    // outside the patch (the rule this sweep already states), one member short.
    for (const ln of resolved.lines.values()) {
      const denom = dot3(pl.n, ln.dir);
      if (Math.abs(denom) < 1e-9) continue; // parallel to the plane — no crossing
      grow(add3(ln.anchor, scale3(ln.dir, -(dot3(pl.n, ln.anchor) + pl.d) / denom)));
    }
    patchExtent.set(name, ext);
    const at = (u: number, v: number) => add3(fr.center, add3(scale3(fr.e1, u), scale3(fr.e2, v)));
    wPlanes.push({ name, corners: [at(ext.u1, ext.v1), at(ext.u2, ext.v1), at(ext.u2, ext.v2), at(ext.u1, ext.v2)] });
  }

  // The fold itself — drawn as an implicit seam unless the student has NAMED a line
  // for that pair; its reach follows the UNION of the two patches' along-fold extents.
  const namedPairs = new Set(
    [...c.lines.values()].flatMap((def) => (def.kind === 'plane-plane' ? [[def.p1, def.p2].sort().join('|')] : [])),
  );
  const wSeams: { a: Vec3; b: Vec3 }[] = [];
  for (const { n1, n2, line, focus } of pairLines) {
    if (namedPairs.has([n1, n2].sort().join('|'))) continue;
    if (planeDisplay[n1] === 'hidden' || planeDisplay[n2] === 'hidden') continue; // #395: no patch ⇒ no seam
    const d = normalize3(line.dir);
    const e1 = patchExtent.get(n1);
    const e2 = patchExtent.get(n2);
    const lo = Math.min(e1?.u1 ?? -h, e2?.u1 ?? -h);
    const hi = Math.max(e1?.u2 ?? h, e2?.u2 ?? h);
    wSeams.push({ a: add3(focus, scale3(d, lo)), b: add3(focus, scale3(d, hi)) });
  }

  // A STATED angle between planes gets a dihedral arc at the seam + its value (mark it
  // only because the student said it — the 2-D tool's stated-angle rule).
  const wAngles: { pts: Vec3[]; label: Vec3; text: string }[] = [];
  for (const g of c.planeAngles) {
    const pair = pairLines.find((p) => (p.n1 === g.p1 && p.n2 === g.p2) || (p.n1 === g.p2 && p.n2 === g.p1));
    if (!pair) continue;
    const pl1 = resolved.planes.get(g.p1)!;
    const pl2 = resolved.planes.get(g.p2)!;
    const d = normalize3(pair.line.dir);
    const u1 = normalize3(cross3(pl1.n, d));
    let u2 = normalize3(cross3(pl2.n, d));
    const deg = (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2)))) * 180) / Math.PI;
    if (Math.abs(deg - g.deg) > Math.abs(180 - deg - g.deg)) u2 = scale3(u2, -1);
    const r = h * 0.38;
    const pts: Vec3[] = [];
    for (let s = 0; s <= 12; s++) {
      const m = add3(scale3(u1, 1 - s / 12), scale3(u2, s / 12));
      if (norm3(m) < 1e-9) continue;
      pts.push(add3(pair.focus, scale3(normalize3(m), r)));
    }
    const bis = add3(u1, u2);
    const label = add3(pair.focus, scale3(norm3(bis) > 1e-9 ? normalize3(bis) : u1, r * 1.55));
    wAngles.push({ pts, label, text: `${g.deg}°` });
  }

  // A STATED angle between two segments from a shared vertex (ADR-3D-032 Am.) gets an
  // arc + its value at the vertex — marked only because the student said it (the 2-D
  // stated-angle rule). Sources: vangle scalar pins (driving givens) and recorded
  // shared-apex angle claims (incl. paramGivens — they live in claims too).
  {
    const stated = [
      ...c.scalarPins.flatMap((sp) => (sp.kind === 'vangle' ? [{ vertex: sp.vertex, p: sp.p, q: sp.q, deg: sp.deg }] : [])),
      ...c.claims.flatMap((cl) =>
        cl.type === 'angle-seg-eq' && cl.a1 === cl.a2 ? [{ vertex: cl.a1, p: cl.b1, q: cl.b2, deg: cl.deg }] : [],
      ),
    ];
    const seen = new Set<string>();
    for (const g of stated) {
      // #307: a right angle is drawn as a KNEE (the textbook mark), not an arc labelled "90°"
      if (isRightAngleValue(g.deg)) continue;
      const key = `${g.vertex}|${[g.p, g.q].sort().join('|')}|${g.deg}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = positions.get(g.vertex);
      const p = positions.get(g.p);
      const q = positions.get(g.q);
      if (!v || !p || !q) continue;
      const d1 = dist3(p, v);
      const d2 = dist3(q, v);
      if (d1 < 1e-9 || d2 < 1e-9) continue;
      const u1 = normalize3(sub3(p, v));
      const u2 = normalize3(sub3(q, v));
      const r = Math.min(d1, d2) * 0.3;
      const pts: Vec3[] = [];
      for (let s = 0; s <= 12; s++) {
        const m = add3(scale3(u1, 1 - s / 12), scale3(u2, s / 12));
        if (norm3(m) < 1e-9) continue;
        pts.push(add3(v, scale3(normalize3(m), r)));
      }
      const bis = add3(u1, u2);
      const label = add3(v, scale3(norm3(bis) > 1e-9 ? normalize3(bis) : u1, r * 1.6));
      wAngles.push({ pts, label, text: `${g.deg}°` });
    }
  }

  // #94 — named-angle MARKERS (`∠SDB` / `∠SDB = α`): a pedagogical arc at the vertex, drawing NO numeric
  // value on the canvas (a single-seed number would violate the ADR-3D-030 knowledge rule — the measure is
  // a seed-invariant panel derivation). The arc carries the display LABEL (α) when one was named, else blank.
  for (const mk of c.angleMarks) {
    const v = positions.get(mk.vertex), p = positions.get(mk.p), q = positions.get(mk.q);
    if (!v || !p || !q) continue;
    const d1 = dist3(p, v), d2 = dist3(q, v);
    if (d1 < 1e-9 || d2 < 1e-9) continue;
    const u1 = normalize3(sub3(p, v)), u2 = normalize3(sub3(q, v));
    const r = Math.min(d1, d2) * 0.3;
    const pts: Vec3[] = [];
    for (let sIdx = 0; sIdx <= 12; sIdx++) {
      const mid = add3(scale3(u1, 1 - sIdx / 12), scale3(u2, sIdx / 12));
      if (norm3(mid) < 1e-9) continue;
      pts.push(add3(v, scale3(normalize3(mid), r)));
    }
    const bis = add3(u1, u2);
    const label = add3(v, scale3(norm3(bis) > 1e-9 ? normalize3(bis) : u1, r * 1.6));
    wAngles.push({ pts, label, text: mk.label ?? '' });
  }

  // #371: a number on the canvas must be seed-invariant KNOWLEDGE ([ADR-3D-030](docs/06b-decisions-3d.md)
  // Am. 2 — the rule that removed sampled coordinate labels from nodes). A line whose components carry a
  // parameter the givens do not FORCE is drawn at one value of it, so echoing the resolved numbers shows
  // ONE configuration's line as if it were the given (measured: the same `l1:x=t(0,m,2m-2)` echoed four
  // different directions over four seeds). Echo the student's own symbolic form instead. Once the givens
  // determine the parameter the numbers ARE knowledge, so they come back.
  //
  // #479: "the givens determine it" is asked of the engine (`paramIsKnowledge`), not re-derived here. The
  // predicate this replaced — "nothing pins the parameter" — was a proxy that held only while every pin had
  // a single root; the operator's `ℓ ∥ π1` pins m to ±√2, whereupon the echo printed one branch's numbers
  // and CHANGED them on "show another configuration".
  const paramUnforced = !!c.param && !paramIsKnowledge(resolved.param);
  const wLines: { name: string; a: Vec3; b: Vec3; form: string }[] = [];
  for (const [name, ln] of resolved.lines) {
    const mid = projectOntoLine(center, ln);
    // #372: a direction vector's MAGNITUDE is arbitrary — `(0, m, 2m-2)` has whatever length the sampled
    // m gives it — so the drawn reach must be taken along the UNIT direction. Unnormalized, a line with
    // |dir| ≈ 8 drew eight times too long, which blew out the isotropic fit and shrank the rest of the
    // figure to a corner: the operator's vertices sat 4 px from the line while genuinely clearing it by
    // 0.3 world units. The line is infinite; how much of it we draw is a presentation choice and must
    // not depend on how the student happened to scale its direction.
    const dir = norm3(ln.dir) > 1e-9 ? normalize3(ln.dir) : ln.dir;
    const reach = radius * 1.1;
    const def = c.lines.get(name);
    const carriesParam =
      def?.kind === 'parametric' && [...def.anchor, ...def.dir].some((e) => e.p !== 0);
    wLines.push({
      name,
      a: sub3(mid, scale3(dir, reach)),
      b: add3(mid, scale3(dir, reach)),
      form:
        // #552: a FREE line's anchor/direction are SAMPLED, never knowledge — a printed equation
        // would assert numbers the student never stated (the ADR-052 canvas rule), so the echo is
        // the bare name. The free PLANE precedent: its patch carries a name, never an equation.
        def?.kind === 'free'
          ? name
          : carriesParam && paramUnforced && def?.kind === 'parametric'
          ? `${name}: ${def.src}`
          // #422: the student's own running letter, when they chose one — the numeric echo used to
          // rewrite «m» back to «t», telling them their line in a notation they did not use.
          : `${name}: x = (${fmt(ln.anchor.x)}, ${fmt(ln.anchor.y)}, ${fmt(ln.anchor.z)}) + ${def?.kind === 'parametric' ? (def.runner ?? 't') : 't'}·(${fmt(ln.dir.x)}, ${fmt(ln.dir.y)}, ${fmt(ln.dir.z)})`,
    });
  }

  const wAxes: { axis: 'x' | 'y' | 'z'; a: Vec3; b: Vec3 }[] = [];
  if (laneA) {
    const bboxPts = [...worldPts, v3(0, 0, 0), ...wPlanes.flatMap((p) => p.corners), ...wLines.flatMap((l) => [l.a, l.b])];
    for (const axis of ['x', 'y', 'z'] as const) {
      const vals = bboxPts.map((p) => p[axis]);
      const lo = Math.min(0, ...vals) - radius * 0.2;
      const hi = Math.max(0, ...vals) + radius * 0.35;
      const at = (t: number): Vec3 => v3(axis === 'x' ? t : 0, axis === 'y' ? t : 0, axis === 'z' ? t : 0);
      wAxes.push({ axis, a: at(lo), b: at(hi) });
    }
  }

  // Revolution solids (V6): sampled outlines — base circle split front/back, the
  // silhouette generators, the top circle (cylinder), the eye-facing silhouette
  // circle (sphere), and a dashed axis. Textbook style, exact under orthographic
  // projection (the cone's ±s generators are the standard-view approximation).
  const wCurves: { pts: Vec3[]; hidden: boolean }[] = [];
  const N = 48;
  const circlePts = (centre: Vec3, r: number, b1: Vec3, b2: Vec3, from: number, to: number): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i <= N; i++) {
      const th = from + ((to - from) * i) / N;
      out.push(add3(centre, add3(scale3(b1, r * Math.cos(th)), scale3(b2, r * Math.sin(th)))));
    }
    return out;
  };
  {
    const eye = cameraFrame(cam).eye;
    for (const rev of resolved.revolutions) {
      if (!rev.center) continue;
      // horizontal circles split front/back by the eye's ground direction
      const g = Math.hypot(eye.x, eye.y) > 1e-9 ? normalize3(v3(eye.x, eye.y, 0)) : v3(1, 0, 0);
      const phi = Math.atan2(g.y, g.x); // the "front" azimuth
      const ex = v3(1, 0, 0);
      const ey = v3(0, 1, 0);
      const splitCircle = (centre: Vec3, r: number) => {
        wCurves.push({ pts: circlePts(centre, r, ex, ey, phi - Math.PI / 2, phi + Math.PI / 2), hidden: false });
        wCurves.push({ pts: circlePts(centre, r, ex, ey, phi + Math.PI / 2, phi + (3 * Math.PI) / 2), hidden: true });
      };
      const s = normalize3(cross3(v3(0, 0, 1), eye)); // silhouette direction on a horizontal circle
      if (rev.kind === 'sphere') {
        // the exact orthographic silhouette: the great circle ⊥ the eye
        const b1 = normalize3(cross3(eye, Math.abs(eye.z) < 0.9 ? v3(0, 0, 1) : v3(1, 0, 0)));
        const b2 = normalize3(cross3(eye, b1));
        wCurves.push({ pts: circlePts(rev.center, rev.r, b1, b2, 0, 2 * Math.PI), hidden: false });
        splitCircle(rev.center, rev.r); // the equator, front solid / back dashed
      } else if (rev.kind === 'cylinder') {
        const top = add3(rev.center, v3(0, 0, rev.h));
        splitCircle(rev.center, rev.r);
        wCurves.push({ pts: circlePts(top, rev.r, ex, ey, 0, 2 * Math.PI), hidden: false });
        for (const sign of [1, -1]) {
          const off = scale3(s, sign * rev.r);
          wCurves.push({ pts: [add3(rev.center, off), add3(top, off)], hidden: false });
        }
        wCurves.push({ pts: [rev.center, top], hidden: true }); // the axis
      } else {
        // cone
        const apex = rev.apex ?? add3(rev.center, v3(0, 0, rev.h));
        splitCircle(rev.center, rev.r);
        for (const sign of [1, -1]) {
          wCurves.push({ pts: [apex, add3(rev.center, scale3(s, sign * rev.r))], hidden: false });
        }
        wCurves.push({ pts: [rev.center, apex], hidden: true }); // the height
      }
    }
    // V8-i: circles in R³ — one full outline each, sampled in its own in-plane basis (projects to an ellipse)
    for (const k of resolved.circles3) {
      wCurves.push({ pts: circlePts(k.center, k.radius, k.e1, k.e2, 0, 2 * Math.PI), hidden: false });
    }
  }

  // #307: a knee for EVERY right angle the figure asserts — stated (`AB ⊥ AD`, `u ⊥ v`,
  // `∠ABC = 90`, `CA' ⊥ plane BC'D`) as well as constructed (every foot kind). The wedges come
  // from the shared collector; the legs are built in WORLD space along the two arm directions and
  // projected below, so the knee lies in the plane of the arms and foreshortens with the orbit.
  // Their SIZE, however, is a screen quantity — see below, after the fit.
  const wedges = rightAngles3(c, resolved, radius);
  // #397: the witness meets its plane/line at a genuine right angle — mark it with the same
  // knee pipeline (screen-sized, foreshortening-preserving, in-plane arm legibility-rotated).
  for (const wt of wWitnesses) {
    if (wt.wedge) wedges.push(wt.wedge);
  }

  // ---- projection + isotropic fit (over the points AND the auxiliary geometry)
  const projOf = (p: Vec3): { x: number; y: number } => {
    const q = project3(p, frame);
    return { x: q.x, y: -q.y }; // SVG y grows downward
  };
  const proj = new Map<Id, { x: number; y: number }>();
  for (const [id, p] of positions) proj.set(id, projOf(p));
  const extras = [
    ...wPlanes.flatMap((p) => p.corners),
    ...wLines.flatMap((l) => [l.a, l.b]),
    ...wAxes.flatMap((a) => [a.a, a.b]),
    ...wSeams.flatMap((s) => [s.a, s.b]),
    ...wAngles.flatMap((a) => [...a.pts, a.label]),
    ...wCurves.flatMap((cu) => cu.pts),
    ...wWitnesses.flatMap((wt) => [wt.a, wt.b]), // #397: the witness stays in frame
  ].map(projOf);
  const all = [...proj.values(), ...extras];
  if (all.length === 0) {
    return { points: [], edges: [], vectors: [], axes: [], planes: [], lines: [], marks: [], seams: [], angles: [], curves: [], witnesses: [], crossings: [] };
  }

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const k = zoom * Math.min((viewport.width - 2 * MARGIN) / spanX, (viewport.height - 2 * MARGIN) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toScreen = (p: { x: number; y: number }) => ({
    x: viewport.width / 2 + (p.x - cx) * k,
    y: viewport.height / 2 + (p.y - cy) * k,
  });
  const w2s = (p: Vec3) => toScreen(projOf(p));

  // #374: a knee is an ANNOTATION — its size belongs to the screen, not to the world. It used to be
  // `radius * 0.07`, where `radius` measures the spread of the figure's POINTS; a figure whose content
  // is a line and a plane has no points at all, so radius fell back to its floor of 1.5 while the
  // drawing spanned ~10 units, and the knee came out 2.11 px × 0.38 px — emitted, correct, invisible.
  // (The same proxy inflates the knee when a far-flung point stretches `radius` — the other half of the
  // complaint.) `k` is the fit's world→screen scale, so `KNEE_PX / k` is the world length that draws at
  // a fixed pixel size; legs still run along the world arm directions, so an arm pointing away from the
  // camera still foreshortens and the knee stays three-dimensional. Marks take no part in computing `k`
  // (they are not in `extras`), so reading it here is not circular.
  const KNEE_PX = 13;
  /** Projected length of a unit world direction — how much of an arm survives the foreshortening. */
  const projLen = (u: Vec3): number => {
    const o = projOf(v3(0, 0, 0));
    const p = projOf(u);
    return Math.hypot(p.x - o.x, p.y - o.y);
  };
  const wMarks: Vec3[][] = wedges.map((m) => {
    const s = KNEE_PX / k;
    // A ⟂-to-plane knee's second arm is ARBITRARY — every direction in the plane witnesses the same
    // assertion — so pick the one that reads best from this camera instead of the first that came to
    // hand. Without this the operator's figure drew a 12.8 px leg against a 2.3 px one: correct, and
    // unreadable. A wedge whose both arms are real objects carries no `planeN` and is never rotated.
    let u2 = m.u2;
    if (m.planeN) {
      const { e1, e2 } = planeBasis(m.planeN);
      let best = projLen(u2);
      for (let i = 0; i < 24; i++) {
        const th = (i * Math.PI) / 24;
        const cand = normalize3(add3(scale3(e1, Math.cos(th)), scale3(e2, Math.sin(th))));
        const len = projLen(cand);
        if (len > best) {
          best = len;
          u2 = cand;
        }
      }
    }
    const l1 = scale3(m.u1, s);
    const l2 = scale3(u2, s);
    return [add3(m.vertex, l1), add3(m.vertex, add3(l1, l2)), add3(m.vertex, l2)];
  });

  const screen = new Map<Id, { x: number; y: number }>();
  for (const [id, p] of proj) screen.set(id, toScreen(p));

  // Edges: the solids' own (hidden = both bordering faces back-facing) plus the
  // auxiliary segments (hidden = interior / on a hidden face — `auxSegmentHidden`).
  const hidden = hiddenEdgeKeys(c, positions, cam);
  const edges: SceneEdge3[] = [];
  for (const solid of c.solids) {
    for (const [a, b] of solid.edges) {
      const pa = screen.get(a)!;
      const pb = screen.get(b)!;
      edges.push({ id: `edge-${edgeKey(a, b)}`, a, b, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, hidden: hidden.has(edgeKey(a, b)) });
    }
  }
  const solidEdgeKeys = new Set(c.solids.flatMap((s) => s.edges.map(([a, b]) => edgeKey(a, b))));
  for (const [a, b] of c.segments) {
    if (solidEdgeKeys.has(edgeKey(a, b))) continue; // a recorded pair on a solid edge — the edge already draws this ink
    const pa = screen.get(a);
    const pb = screen.get(b);
    if (!pa || !pb) continue;
    edges.push({ id: `seg-${edgeKey(a, b)}`, a, b, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, hidden: auxSegmentHidden(c, positions, a, b, cam) });
  }
  // Dashed first so solid edges draw over them at crossings.
  edges.sort((e1, e2) => Number(e2.hidden) - Number(e1.hidden));

  // Incident screen directions per point, for label placement.
  const incident = new Map<Id, { dx: number; dy: number }[]>();
  const addIncident = (at: Id, toward: Id) => {
    const p = screen.get(at)!;
    const q = screen.get(toward)!;
    const list = incident.get(at) ?? [];
    list.push({ dx: q.x - p.x, dy: q.y - p.y });
    incident.set(at, list);
  };
  for (const solid of c.solids) {
    for (const [a, b] of solid.edges) {
      addIncident(a, b);
      addIncident(b, a);
    }
  }
  for (const [a, b] of c.segments) {
    if (solidEdgeKeys.has(edgeKey(a, b))) continue; // the solid-edge pass above already counted this direction
    if (!screen.has(a) || !screen.has(b)) continue;
    addIncident(a, b);
    addIncident(b, a);
  }
  for (const [id, def] of c.points) {
    if (def.kind === 'on-segment' && screen.has(id)) {
      addIncident(id, def.a);
      addIncident(id, def.b);
    }
  }

  const points: ScenePoint3[] = [];
  for (const [id] of c.points) {
    const p = screen.get(id);
    if (!p) continue;
    const dir = labelDir(incident.get(id) ?? []);
    points.push({
      id,
      x: p.x,
      y: p.y,
      label: displayLabel(id),
      labelDx: dir.dx * LABEL_OFFSET,
      labelDy: dir.dy * LABEL_OFFSET,
    });
  }

  // Named vectors (ADR-3D-003 as amended): a coloured overlay from tail to head
  // with the ARROWHEAD AT THE HEAD (`to`), dashed when its carrier is hidden;
  // the name label sits beside the midpoint on the side facing AWAY from the
  // figure centre (the figure is fit-centred, so the viewport centre stands in).
  const vectors: SceneVector3[] = [];
  // #72: UNNAMED ink arrows (`חץ A'C`) ride the same overlay with an empty label.
  const vectorEntries: [string, { from: Id; to: Id }][] = [
    ...c.vectors,
    ...c.arrows.map(([from, to]) => ['', { from, to }] as [string, { from: Id; to: Id }]),
  ];
  for (const [name, def] of vectorEntries) {
    const a = screen.get(def.from);
    const b = screen.get(def.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let px = -dy / len;
    let py = dx / len;
    const mx = a.x + dx / 2;
    const my = a.y + dy / 2;
    if ((viewport.width / 2 - mx) * px + (viewport.height / 2 - my) * py > 0) {
      px = -px;
      py = -py;
    }
    const key = edgeKey(def.from, def.to);
    const carrierHidden = hidden.has(key) ? true : auxSegmentHidden(c, positions, def.from, def.to, cam);
    vectors.push({
      name,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      hidden: carrierHidden,
      labelX: mx + px * 17,
      labelY: my + py * 17,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }

  // ---- the algebraic overlay (V2): axes, plane patches, drawn lines, ⟂ marks
  const axes: SceneAxis3[] = wAxes.map(({ axis, a, b }) => {
    const sa = w2s(a);
    const sb = w2s(b);
    const d = Math.max(Math.hypot(sb.x - sa.x, sb.y - sa.y), 1e-6);
    return {
      axis,
      x1: sa.x,
      y1: sa.y,
      x2: sb.x,
      y2: sb.y,
      labelX: sb.x + ((sb.x - sa.x) / d) * 12,
      labelY: sb.y + ((sb.y - sa.y) / d) * 12,
    };
  });

  const scenePlanes: ScenePlane3[] = wPlanes.map(({ name, corners }) => {
    const sc = corners.map(w2s);
    // a 'face' patch's corners ARE labelled vertices — its name label moves to the centroid
    // so it never sits on a point label; 'full' patches keep the first-corner label as before
    if (facePatches.has(name)) {
      const lx = sc.reduce((s, p) => s + p.x, 0) / sc.length;
      const ly = sc.reduce((s, p) => s + p.y, 0) / sc.length;
      return { name, corners: sc, labelX: lx, labelY: ly };
    }
    return { name, corners: sc, labelX: sc[0].x, labelY: sc[0].y - 8 };
  });

  const sceneLines: SceneLine3[] = wLines.map(({ name, a, b, form }) => {
    const sa = w2s(a);
    const sb = w2s(b);
    return { name, x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y, labelX: sb.x, labelY: sb.y - 10, form };
  });

  const marks: SceneMark3[] = wMarks.map((pts) => ({ pts: pts.map(w2s) }));

  const seams: SceneSeam3[] = wSeams.map(({ a, b }) => {
    const sa = w2s(a);
    const sb = w2s(b);
    return { x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y };
  });

  const angles: SceneAngle3[] = wAngles.map(({ pts, label, text }) => {
    const sl = w2s(label);
    return { pts: pts.map(w2s), labelX: sl.x, labelY: sl.y, text };
  });

  const curves: SceneCurve3[] = wCurves.map(({ pts, hidden }) => ({ pts: pts.map(w2s), hidden }));

  // #397: the distance witnesses — dashed segment + the stated value beside the midpoint
  const witnesses: SceneWitness3[] = wWitnesses.map((wt) => {
    const p = w2s(wt.a);
    const q = w2s(wt.b);
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y, labelX: (p.x + q.x) / 2 + 9, labelY: (p.y + q.y) / 2 - 7, text: wt.text };
  });

  // #483 — the crossings the givens determine and nobody has named. The SET is the engine's call
  // (`openCrossings3` owns the honesty gate); the renderer only says where each one lands on screen.
  const crossings: SceneCrossing3[] = openCrossings3(c, resolved).map((k) => {
    const s = w2s(k.point);
    return { line: k.line, plane: k.plane, x: s.x, y: s.y };
  });

  return { points, edges, vectors, axes, planes: scenePlanes, lines: sceneLines, marks, seams, angles, curves, witnesses, crossings };
}
