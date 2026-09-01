/**
 * The command reducer: lower a Command3 into the Construction3 (docs/20 §6.1).
 * Pure — returns a new construction or a structured error; never mutates.
 */

import { exprPointIds, exprVectorNames } from './vecExpr';
import { isAbsolute, isPlanar, lineDirCarriesParam, planeNormalCarriesParam, sameOperand } from './operands';
import { cross3, dot3, normalize3, v3 } from './vec3';
import { FREE_PLANE_TOKEN, freePlaneDef } from './freePlane';
import { FREE_LINE_TOKEN } from './freeLine';
import { riderPairsT } from './onSegmentRatio';
import { isScaleGivenClaim, scaleGivenSafe } from './scaleGiven';
import { resolveSolidSubject } from './solidSubject';
import { isQuadPyramid, QUAD_BASE_DIMS, QUAD_PYRAMIDS, quadImplies, quadPyramidDimCount, quadShapeConstraints, type QuadBase } from './baseShapes';
import { pinSymsOf } from './types';
import type { ApplyResult3, Claim3, Command3, ComponentTarget, Construction3, EngineError3, Id, Line3Def, LinExpr, Operand3, PartialName, SolidCommand, SolidKind, SolidObj, SymComp, VecAtom } from './types';

const VERTEX_COUNT: Record<SolidCommand['kind'], number> = { cube: 8, box: 8, prism3: 6, pyramid4: 5, pyramid3: 4, tetra: 4, prism4r: 8, pyramid4g: 5, pyramid4r: 5, pyramid4gr: 5, prism3e: 6, pyramid3e: 4, pyramidPar: 5, polygon3: 3, polygon4: 4, polygon5: 5, prism4: 8, prism4g: 8, prism4sq: 8, prismReg5: 10, prismReg6: 12, parallelepiped: 8,
  // #305 (ADR-3D-090): every quad pyramid is a 4-ring + apex, whatever its base or top
  pyramidParR: 5, pyramidRhomb: 5, pyramidRhombR: 5, pyramidKite: 5, pyramidKiteR: 5, pyramidTrap: 5, pyramidTrapR: 5, pyramidQuad: 5, pyramidQuadR: 5 };

/** The base-polygon vertex count of a 2n-vertex prism/parallelepiped (#117), or null for other solids. */
function prismBaseN(kind: SolidCommand['kind']): number | null {
  switch (kind) {
    case 'prism4': case 'prism4g': case 'prism4sq': case 'parallelepiped': return 4;
    case 'prismReg5': return 5;
    case 'prismReg6': return 6;
    default: return null;
  }
}
/** Generic prism topology for a base ring [0..n-1] + top ring [n..2n-1] + n verticals. */
function prismRing(n: number): { edges: [number, number][]; faces: number[][] } {
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    edges.push([i, (i + 1) % n]); // base ring
    edges.push([i + n, ((i + 1) % n) + n]); // top ring
    edges.push([i, i + n]); // vertical
  }
  const base = Array.from({ length: n }, (_, i) => i);
  const top = Array.from({ length: n }, (_, i) => i + n);
  const faces: number[][] = [base, top];
  for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, ((i + 1) % n) + n, i + n]); // rectangular laterals
  return { edges, faces };
}

/** The N vertex indices of a flat polygon kind, or null. */
function polygonN(kind: SolidCommand['kind']): number | null {
  return kind === 'polygon3' ? 3 : kind === 'polygon4' ? 4 : kind === 'polygon5' ? 5 : null;
}

/** Edge index pairs per solid kind (indices into `ids`). */
function edgeIndices(kind: SolidCommand['kind']): [number, number][] {
  const bn = prismBaseN(kind);
  if (bn) return prismRing(bn).edges; // #117: parallelogram/quad/square/regular prism + parallelepiped
  const pn = polygonN(kind);
  if (pn) return Array.from({ length: pn }, (_, i) => [i, (i + 1) % pn] as [number, number]); // the boundary cycle
  if (kind === 'prism3' || kind === 'prism3e') {
    return [
      [0, 1], [1, 2], [2, 0], // base ring
      [3, 4], [4, 5], [5, 3], // top ring
      [0, 3], [1, 4], [2, 5], // verticals
    ];
  }
  if (isQuadPyramid(kind)) {
    return [
      [0, 1], [1, 2], [2, 3], [3, 0], // base ring
      [0, 4], [1, 4], [2, 4], [3, 4], // lateral edges to the apex
    ];
  }
  if (kind === 'pyramid3' || kind === 'tetra' || kind === 'pyramid3e') {
    return [
      [0, 1], [1, 2], [2, 0], // base ring
      [0, 3], [1, 3], [2, 3], // lateral edges to the apex
    ];
  }
  if (kind === 'prism4r') {
    return [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
  }
  // cube / box
  return [
    [0, 1], [1, 2], [2, 3], [3, 0], // base ring
    [4, 5], [5, 6], [6, 7], [7, 4], // top ring
    [0, 4], [1, 5], [2, 6], [3, 7], // verticals
  ];
}

/** Face index rings per solid kind. Orientation is irrelevant — the renderer re-orients outward numerically. */
function faceIndices(kind: SolidCommand['kind']): number[][] {
  const bn = prismBaseN(kind);
  if (bn) return prismRing(bn).faces; // #117
  const pn = polygonN(kind);
  if (pn) {
    // a flat polygon is DOUBLE-SIDED (the ring + its reverse) so that from any viewpoint one
    // face is front-facing → its edges never dash (a 2-D figure is drawn fully solid); faces[0]
    // is still the ring so `diag-intersection`'s "the base" sentinel resolves.
    const ring = Array.from({ length: pn }, (_, i) => i);
    return [ring, [...ring].reverse()];
  }
  if (kind === 'prism3' || kind === 'prism3e') {
    return [
      [0, 1, 2], // base
      [3, 4, 5], // top
      [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5], // sides
    ];
  }
  if (isQuadPyramid(kind)) {
    return [
      [0, 1, 2, 3], // base
      [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], // lateral triangles
    ];
  }
  if (kind === 'pyramid3' || kind === 'tetra' || kind === 'pyramid3e') {
    return [
      [0, 1, 2], // base
      [0, 1, 3], [1, 2, 3], [2, 0, 3], // lateral triangles
    ];
  }
  if (kind === 'prism4r') {
    return [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
    ];
  }
  return [
    [0, 1, 2, 3], // base
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], // sides
  ];
}

function clone(c: Construction3): Construction3 {
  return {
    solids: [...c.solids],
    points: new Map(c.points),
    linePlaneMarks: [...c.linePlaneMarks],
    relMarks: [...c.relMarks],
    vectors: new Map(c.vectors),
    arrows: c.arrows.map(([f, t]) => [f, t] as [Id, Id]),
    segments: [...c.segments],
    requirements: [...c.requirements],
    quadShapes: c.quadShapes.map((q) => ({ base: q.base, ids: [...q.ids] })),
    redundantShapes: c.redundantShapes.map((q) => ({ base: q.base, ids: [...q.ids] })),
    angleMarks: [...c.angleMarks],
    planes: new Map(c.planes),
    lines: new Map(c.lines),
    param: c.param,
    planeAngles: [...c.planeAngles],
    memberships: [...c.memberships],
    linePerps: [...c.linePerps],
    onLines: [...c.onLines],
    pins: [...c.pins],
    vectorPins: [...c.vectorPins],
    signGivens: [...c.signGivens],
    partialNames: [...c.partialNames],
    componentSigns: [...c.componentSigns],
    pointPlanes: new Map(c.pointPlanes),
    pointLines: new Map(c.pointLines),
    relPlanes: new Map(c.relPlanes),
    revolutions: [...c.revolutions],
    circles3: [...c.circles3],
    vecDefs: [...c.vecDefs],
    symbolPins: [...c.symbolPins],
    claims: [...c.claims],
    scaleGivens: [...c.scaleGivens],
    scalarPins: [...c.scalarPins],
    pairPins: [...c.pairPins],
    planePins: [...c.planePins],
    paramGivens: [...c.paramGivens],
    paramSigns: [...c.paramSigns],
    coordPlanePins: [...c.coordPlanePins],
    planeLinePerps: [...c.planeLinePerps],
    lineRels: [...c.lineRels],
  };
}

/** Every point id a SymTerm list references (pair endpoints + named vectors' endpoints). */
function relPointIds(c: Construction3, from: Id, to: Id, terms: { atom: import('./types').VecAtom }[]): Id[] {
  const ids = [from, to];
  for (const t of terms) {
    if (t.atom.kind === 'pair') ids.push(t.atom.from, t.atom.to);
    else {
      const def = c.vectors.get(t.atom.name);
      if (def) ids.push(def.from, def.to);
    }
  }
  return ids;
}

/** How many FREE dims the figure's solids carry (a scalar statement on such a figure is a GIVEN, not a check). */
const DIM_COUNT: Record<SolidCommand['kind'], number> = { cube: 0, box: 2, prism3: 3, pyramid4: 1, pyramid3: 3, tetra: 5, prism4r: 2, pyramid4g: 3, pyramid4r: 2, pyramid4gr: 4, prism3e: 1, pyramid3e: 1, pyramidPar: 5, polygon3: 2, polygon4: 4, polygon5: 6, prism4: 3, prism4g: 5, prism4sq: 1, prismReg5: 1, prismReg6: 1, parallelepiped: 5,
  // #305 (ADR-3D-090): base dims + top dims, read off the registry so the count can never drift
  // from the geometry (the legacy quad-pyramid entries above agree with it — asserted by the
  // totality lock in quad-pyramid-bases.test.ts).
  pyramidParR: quadPyramidDimCount('pyramidParR')!, pyramidRhomb: quadPyramidDimCount('pyramidRhomb')!,
  pyramidRhombR: quadPyramidDimCount('pyramidRhombR')!, pyramidKite: quadPyramidDimCount('pyramidKite')!,
  pyramidKiteR: quadPyramidDimCount('pyramidKiteR')!, pyramidTrap: quadPyramidDimCount('pyramidTrap')!,
  pyramidTrapR: quadPyramidDimCount('pyramidTrapR')!, pyramidQuad: quadPyramidDimCount('pyramidQuad')!,
  pyramidQuadR: quadPyramidDimCount('pyramidQuadR')! };
/** #349: an OBLIQUE prism trades its single height for the free lateral vector w — two dims more than
 *  the right prism of the same kind (the counts above are the RIGHT ones; `parallelepiped` already
 *  counts its w, being oblique by definition). */
export const solidDimCount = (s: { kind: SolidCommand['kind']; oblique?: true }): number =>
  DIM_COUNT[s.kind] + (s.oblique && s.kind !== 'parallelepiped' ? 2 : 0);
export function freeDims(c: Construction3): number {
  let n = 0;
  for (const s of c.solids) n += solidDimCount(s);
  for (const r of c.revolutions) {
    if (r.radius === undefined) n++;
    if (r.kind !== 'sphere' && r.height === undefined) n++;
  }
  return n;
}

const samePair = (p: [Id, Id], a: Id, b: Id): boolean => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

/** Is a–b already drawn — as a solid edge or an auxiliary segment? */
function hasSegment(c: Construction3, a: Id, b: Id): boolean {
  if (c.segments.some((s) => samePair(s, a, b))) return true;
  return c.solids.some((solid) => solid.edges.some((e) => samePair(e, a, b)));
}

/** #612: two rings are the same ring whatever order they were named in. */
const sameRing = (x: Id[], y: Id[]): boolean => x.length === y.length && [...x].sort().join() === [...y].sort().join();

/**
 * #612 (ADR-3D-158): what shape is this ring ALREADY KNOWN to be — structurally, never by measurement.
 *
 * Two sources, both of them facts the figure carries rather than properties of one drawing: a SOLID's
 * base kind (the ADR-3D-090 registry answers it), and a `quad-shape` statement recorded earlier. A ring
 * that merely happens to be a square at the current seed is deliberately NOT known — refusing a student
 * on the strength of one sampled configuration is the class of dishonesty this tree exists to avoid.
 */
function knownQuadShape(c: Construction3, ids: Id[]): QuadBase | null {
  for (const s of c.quadShapes) if (sameRing(s.ids, ids)) return s.base;
  for (const sld of c.solids) {
    const spec = (QUAD_PYRAMIDS as Partial<Record<SolidKind, { base: QuadBase; right: boolean }>>)[sld.kind];
    if (!spec) continue;
    const ring = sld.ids.slice(0, 4);
    if (ring.length === 4 && sameRing(ring, ids)) return spec.base;
  }
  return null;
}

/** #612/#615: remember the stated shape, and require its drawing to stay visibly general. */
function recordShape(c: Construction3, base: QuadBase, ids: [Id, Id, Id, Id]): Construction3 {
  const next = clone(c);
  if (!next.quadShapes.some((s) => sameRing(s.ids, ids))) next.quadShapes.push({ base, ids: [...ids] });
  // #615: only a shape with room to be drawn wrongly needs the gate — a square has no freedom left,
  // and a general `quad` has no more-specific sibling it is obliged to avoid looking like.
  if (QUAD_BASE_DIMS[base] > 0 &&
      !next.requirements.some((r) => r.kind === 'quad-general' && sameRing(r.ids, ids)))
    next.requirements.push({ kind: 'quad-general', base, ids: [...ids] });
  return next;
}

/** First missing point among ids, as an error — or null when all exist. */
/**
 * THE "the base" sentinel, resolved (#834). `face: []` means *the base of the single solid* — faces[0],
 * the base-first convention `faceIndices()` keeps for every solid kind (prismRing, the quad-pyramid
 * family, the flat-polygon double-sided case; see the comment at the top of this file).
 *
 * Extracted so the two commands that speak about "the diagonals of the base" — the crossing form
 * («אלכסוני הבסיס נפגשים בנקודה O») and the point-free draw form («אלכסוני הבסיס») — resolve it through
 * ONE function. A second resolver is exactly how the two forms would drift apart, and a prism has two
 * candidate rings, so the top one must never be picked by an independent guess.
 *
 * The multi-solid refusal is deliberate and stays: with two solids present, WHICH base is meant is the
 * student's to say ([ADR-052](../../docs/06-decisions.md#adr-052)), never a silent pick.
 */
function resolveQuadRing(c: Construction3, face: Id[], errId: Id): { ok: true; face: Id[] } | { ok: false; error: EngineError3 } {
  if (face.length === 0 && c.solids.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: 'base' } };
  const ring = face.length === 0 ? c.solids[0].faces[0] : face;
  if (ring.length !== 4) return { ok: false, error: { code: 'no-solution', id: errId } }; // no diagonals without a quad
  const missing = missingPoint(c, ring);
  if (missing) return { ok: false, error: missing };
  return { ok: true, face: ring };
}

function missingPoint(c: Construction3, ids: Id[]): EngineError3 | null {
  for (const id of ids) if (!c.points.has(id)) return { code: 'unknown-point', id };
  return null;
}

/** Validate a VecAtom operand (V8-f): a named vector must be declared; a pair's points must exist. */
function atomRefError(c: Construction3, atom: import('./types').VecAtom): EngineError3 | null {
  if (atom.kind === 'named') return c.vectors.has(atom.name) ? null : { code: 'unknown-vector', id: atom.name };
  return missingPoint(c, [atom.from, atom.to]);
}

const firstAtomError = (c: Construction3, atoms: import('./types').VecAtom[]): EngineError3 | null => {
  for (const a of atoms) {
    const e = atomRefError(c, a);
    if (e) return e;
  }
  return null;
};

/** Auto-draw a VecAtom's pair (idempotent) — named vectors already draw their own segment. */
function drawAtom(next: Construction3, atom: import('./types').VecAtom): void {
  if (atom.kind === 'pair' && !hasSegment(next, atom.from, atom.to)) next.segments.push([atom.from, atom.to]);
}

/** The two endpoint ids a VecAtom spans (a pair verbatim, a named vector's from→to), or null. */
function atomEndpoints(c: Construction3, atom: import('./types').VecAtom): [Id, Id] | null {
  if (atom.kind === 'pair') return [atom.from, atom.to];
  const dv = c.vectors.get(atom.name);
  return dv ? [dv.from, dv.to] : null;
}

/** The vecDef index of a symbol-defined point whose symbol is still FREE (no symbolPin yet), or null.
 *  ADR-3D-056: the point a seg-perp/seg-par symbol-pin will drive (e.g. E on `AE=t·AS`). */
function freeSymbolDef(c: Construction3, id: Id): number | null {
  const pt = c.points.get(id);
  if (!pt || pt.kind !== 'vec-defined') return null;
  const vd = c.vecDefs[pt.def];
  if (!vd?.symbol) return null;
  return c.symbolPins.some((p) => p.def === pt.def) ? null : pt.def; // already pinned ⇒ can't pin twice
}

/** #324 (ADR-3D-079): a solid's BASE ring — the drawing convention everywhere in the engine is
 *  base ids first (prisms: first half; pyramids: all but the apex-last; flat polygons: all). */
function baseRingOf(s: SolidObj): Id[] | null {
  if (isQuadPyramid(s.kind)) return s.ids.slice(0, 4); // #305: any base × any top — one rule
  switch (s.kind) {
    case 'cube': case 'box': case 'parallelepiped':
    case 'prism4': case 'prism4g': case 'prism4sq': case 'prism4r':
      return s.ids.slice(0, 4);
    case 'prism3': case 'prism3e':
      return s.ids.slice(0, 3);
    case 'prismReg5':
      return s.ids.slice(0, 5);
    case 'prismReg6':
      return s.ids.slice(0, 6);
    case 'tetra': case 'pyramid3': case 'pyramid3e':
      return s.ids.slice(0, 3);

    case 'polygon3': case 'polygon4': case 'polygon5':
      return [...s.ids];
    default:
      return null;
  }
}

/** Apply-time validation of a claim's references (order matters, like every fact). */
/** S2 (#378, ADR-3D-103): every reference a line-rel names must exist — the operand's points /
 *  vector / line / plane, and the named line itself (a typed or derived line in `lines`, or a
 *  through-line in `pointLines`). Shared by the command case and claimRefsError so the two can
 *  never drift apart. */
export function operandRefsError(c: Construction3, op: Operand3): EngineError3 | null {
  switch (op.kind) {
    case 'point':
      return missingPoint(c, [op.id]);
    case 'segment':
      return missingPoint(c, [op.a, op.b]);
    case 'plane-run':
      return missingPoint(c, op.ids);
    case 'vector':
      return c.vectors.has(op.name) ? null : { code: 'unknown-vector', id: op.name };
    case 'line':
      return c.lines.has(op.name) || c.pointLines.has(op.name) ? null : { code: 'unknown-line', id: op.name };
    // #512: the coordinate frame names nothing the figure has to declare — it is always available, in
    // every figure, which is the whole reason it needed no existence check and no new engine concept.
    case 'plane-coord':
    case 'axis':
      return null;
    case 'plane-named':
      return c.planes.has(op.name) || c.pointPlanes.has(op.name) || c.relPlanes.has(op.name) ? null : { code: 'unknown-plane', id: op.name };
  }
}

function lineRelRefsError(c: Construction3, op: Operand3, line: string): EngineError3 | null {
  const opErr = operandRefsError(c, op);
  if (opErr) return opErr;
  return c.lines.has(line) || c.pointLines.has(line) ? null : { code: 'unknown-line', id: line };
}

/**
 * #801 (ADR-3D-174) — WHICH MECHANISM OWNS THE LETTER an equation carries. The figure has two
 * symbol-resolving mechanisms and a letter belongs to exactly one of them: a letter the figure
 * ALREADY carries as a pin symbol (`pinSymsOf` — the point/vector/pair injections, solved jointly
 * inside the pivot) is that symbol, and only a letter no mechanism owns opens the algebraic lane
 * (`c.param`, the `chooseParam` root-find).
 *
 * #794 guarded one direction of this (an injection may not steal `c.param`); the equation side was
 * unguarded, so «משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)» after `AB=(k-1,k,3)` opened a SECOND
 * mechanism for k — the root-find lane then sampled k ≈ 0 for the line while the pivot held k = 2
 * for the figure, and the same letter had two values in one drawing. Asked in ONE place so a third
 * equation kind cannot answer it differently.
 */
const paramLane = (c: Construction3, param: string | undefined): { sym?: string; figureParam?: string } =>
  param === undefined ? {} : pinSymsOf(c).includes(param) ? { sym: param } : { figureParam: param };

/**
 * #814 (ADR-3D-175) — RECORD WHAT THE STUDENT CALLED A FREE COMPONENT, for all three injection lanes
 * at once. A bare letter still lowers to a null component (it does not constrain, and it must not:
 * promoting these letters to pivot unknowns is what breaks the partial-injection exam gates). This
 * only binds the NAME, so `param-sign` can address the component afterwards.
 *
 * Bound only where the component actually ended up FREE — a letter the tuple resolved to a number or
 * to a pivot symbol already has an owner, and a second binding would be the two-mechanisms bug (#801)
 * arriving through the naming door. One recorder for the three lanes: the `pinSymsOf` discipline.
 */
function bindPartialNames(
  next: Construction3,
  target: ComponentTarget,
  syms: [string | null, string | null, string | null] | undefined,
  comps: [number | null | SymComp, number | null | SymComp, number | null | SymComp],
): void {
  if (!syms) return;
  const axes = ['x', 'y', 'z'] as const;
  syms.forEach((sym, i) => {
    if (!sym || comps[i] !== null) return; // named a number, or a pivot symbol that owns it already
    if (next.partialNames.some((b) => b.sym === sym)) return; // first binding wins; a re-use is not a re-bind
    next.partialNames.push({ sym, target, axis: axes[i] });
  });
}

/** #814 — the letter's binding, if it names a free component. Derived, never enumerated. */
const partialNameOf = (c: Construction3, sym: string): PartialName | undefined =>
  c.partialNames.find((b) => b.sym === sym);

/**
 * #801 (ADR-3D-174) — the same one-owner question arriving in the OTHER ORDER, answered by M2
 * RE-HOMING rather than by entry order. «x = (8,-1,-1) + t(k+1,0,k-3)» typed FIRST makes k the
 * algebraic lane's parameter; the injection «AB=(k-1,k,3)» that follows would then be the second
 * mechanism, and #794 refuses it. But the set of statements is the same one that builds in the other
 * order, and satisfiability must not depend on the order they were typed in (docs/17 M2, law i).
 *
 * So the letter is handed to the mechanism that can DETERMINE it — the pivot — whenever the algebraic
 * lane holds nothing capable of pinning it: no angle / ⟂ / line-relation given to root-find over, and
 * no coord-sym point (there the letter DEFINES the point's coordinates and the lane cannot be left).
 * Each equation written in it is re-marked pin-symbol-parametric and `c.param` is released.
 *
 * `null` = refuse (the #794 answer), kept for exactly the case where both lanes have a real claim to
 * the letter: which one the student meant is not something a silent choice may decide.
 */
function adoptParamAsPinSym(c: Construction3, exprs: (SymComp | null)[]): Construction3 | null {
  const sym = c.param;
  if (!sym || !exprs.some((e) => e !== null && e.sym === sym)) return c; // nothing to re-home
  return releaseParamToPivot(c);
}

/**
 * #815 — the SAME re-homing, arriving through the MEMBERSHIP door. A letter carried only by equations
 * is not a pivot unknown: with no pinning given the algebraic lane merely SAMPLES it (ADR-052), so a
 * stated «A על הישר AC» against «x=(8,-1,-1)+t(k+1,0,k-3)» could be verified but never satisfied —
 * the lane has no membership drive, and the refusal blamed the point. Yet that membership is exactly
 * the given that determines k (the pivot solves gauge + k jointly, ADR-3D-174 §4) — so when an EXISTING
 * point is stated onto an algebraic-lane carrier, the letter re-homes to the mechanism that can drive
 * it, under the same conditions as the injection door. The class: *a letter reaches the mechanism
 * that can DETERMINE it, whichever statement makes that determinable* — one body, two doors.
 *
 * No refusal exists at this door: when the lane holds a pinning given it keeps the letter and the
 * membership stays a verify/selection (`chooseParam`), exactly as before.
 */
function adoptParamForCarrier(c: Construction3, carrier: { kind: 'line' | 'plane'; name: string }): Construction3 {
  if (!c.param) return c;
  let exprs: LinExpr[] = [];
  if (carrier.kind === 'line') {
    const def = c.lines.get(carrier.name);
    if (def?.kind === 'parametric' && def.sym === undefined) exprs = [...def.anchor, ...def.dir];
  } else {
    const def = c.planes.get(carrier.name);
    if (def && !def.free && def.sym === undefined) exprs = [def.cx, def.cy, def.cz, def.d];
  }
  if (!exprs.some((e) => e.p !== 0)) return c; // a numeric carrier — nothing to re-home
  return releaseParamToPivot(c) ?? c;
}

/**
 * The re-homing body shared by both doors (#801 injection, #815 membership): the algebraic lane
 * releases its letter to the pivot when it holds nothing capable of pinning it — no angle / ⟂ /
 * line-relation given to root-find over, no param given, and no coord-sym point (there the letter
 * DEFINES the point's coordinates and the lane cannot be left). Every equation written in the letter
 * is re-marked pin-symbol-parametric and `c.param` is released.
 *
 * `null` = the lane has a real claim on the letter; each door decides what that means.
 */
function releaseParamToPivot(c: Construction3): Construction3 | null {
  const sym = c.param;
  if (!sym) return c;
  if (c.planeAngles.length > 0 || c.linePerps.length > 0 || c.lineRels.length > 0 || c.paramGivens.length > 0) return null;
  for (const def of c.points.values()) if (def.kind === 'coord-sym') return null;
  const next = clone(c);
  delete next.param;
  for (const [name, def] of next.lines) {
    if (def.kind === 'parametric' && [...def.anchor, ...def.dir].some((e) => e.p !== 0)) next.lines.set(name, { ...def, sym });
  }
  for (const [name, def] of next.planes) {
    if ([def.cx, def.cy, def.cz, def.d].some((e) => e.p !== 0)) next.planes.set(name, { ...def, sym });
  }
  return next;
}

/** #552 (the on-planes ruling-1 mirror): a relation or membership naming an UNDECLARED line CREATES
 *  it as a free line — bounded to the CONVENTION token (canonical `ℓ<digits?>`), which cannot collide
 *  with a point (uppercase), a plane (π…) or a vector (`[a-w]`), so no bare-symbol ambiguity exists.
 *  A non-convention name («k») still means "declare it first" — its kind is only ever stated by the
 *  noun, and a mistyped name must refuse, not conjure. Returns `c` untouched when nothing is created. */
function withFreeLines(c: Construction3, names: string[]): Construction3 {
  const create = [...new Set(names)].filter((n) => FREE_LINE_TOKEN.test(n) && !c.lines.has(n) && !c.pointLines.has(n));
  if (create.length === 0) return c;
  const next = clone(c);
  for (const n of create) next.lines.set(n, { kind: 'free' });
  return next;
}

/** #393/#335 (ADR-3D-107): a vector EXPRESSION's references — pair points + named vectors. */
function exprRefsError(c: Construction3, expr: import('./types').VecExpr): EngineError3 | null {
  const pointErr = missingPoint(c, exprPointIds(expr));
  if (pointErr) return pointErr;
  for (const name of exprVectorNames(expr)) {
    if (!c.vectors.has(name)) return { code: 'unknown-vector', id: name };
  }
  return null;
}

function claimRefsError(c: Construction3, claim: Claim3): EngineError3 | null {
  switch (claim.type) {
    case 'length-rel':
      return missingPoint(c, [claim.a1, claim.b1, claim.a2, claim.b2]);
    case 'volume-eq-poly':
      return missingPoint(c, [...claim.ids1, ...claim.ids2]);
    case 'concyclic':
      return missingPoint(c, claim.ids);
    case 'plane-line-perp':
      return missingPoint(c, claim.ids) ?? (c.lines.has(claim.line) ? null : { code: 'unknown-line', id: claim.line });
    case 'line-rel':
      return lineRelRefsError(c, claim.op, claim.line);
    case 'mutual-rel':
    case 'plane-rel':
    case 'distance-rel':
      return operandRefsError(c, claim.a) ?? operandRefsError(c, claim.b);
    case 'vec-eq': {
      const pointErr = missingPoint(c, [...exprPointIds(claim.lhs), ...exprPointIds(claim.rhs)]);
      if (pointErr) return pointErr;
      for (const name of [...exprVectorNames(claim.lhs), ...exprVectorNames(claim.rhs)]) {
        if (!c.vectors.has(name)) return { code: 'unknown-vector', id: name };
      }
      return null;
    }
    // #393/#335 (ADR-3D-107): magnitude claims validate exactly like vec-eq — every pair
    // atom's points and every named vector must exist.
    case 'mag-rel':
      return exprRefsError(c, [...claim.e1, ...claim.e2]);
    case 'mag-val':
      return exprRefsError(c, claim.e);
    case 'perp-plane':
    case 'par-plane': // #833: the ∥ twin validates identically — both are segment × 3-point plane
      return missingPoint(c, [...claim.seg, ...claim.plane]);
    case 'collinear3':
      return missingPoint(c, claim.ids);
    case 'length-eq':
      return missingPoint(c, [claim.a, claim.b]);
    case 'area-eq':
      return missingPoint(c, claim.ids);
    case 'coords-eq':
      return missingPoint(c, [claim.id]);
    case 'never-parallel':
      if (!c.lines.has(claim.line)) return { code: 'unknown-line', id: claim.line };
      if (!c.planes.has(claim.plane)) return { code: 'unknown-plane', id: claim.plane };
      // #487: "∦ for EVERY parameter value" quantifies over an equation's parameter — a FREE plane has
      // no equation to quantify over, and scanning its placeholder would answer about z=0 instead.
      if (c.planes.get(claim.plane)!.free) return { code: 'plane-not-determined', id: claim.plane };
      return null;
    case 'plane-eq':
      return missingPoint(c, claim.ids);
    case 'coord-plane-rel':
      return missingPoint(c, claim.ids);
    case 'angle-seg-eq':
      return missingPoint(c, [claim.a1, claim.b1, claim.a2, claim.b2]);
    case 'cos-angle-eq':
      return firstAtomError(c, [claim.u, claim.v]);
    case 'dot-eq':
    case 'cos-eq':
      return firstAtomError(c, [claim.a, claim.b, claim.c, claim.d]);
    case 'line-plane-angle':
      return missingPoint(c, [claim.a, claim.b, ...claim.plane]);
    case 'lines-rel':
      return missingPoint(c, [claim.a1, claim.b1, claim.a2, claim.b2]);
    case 'length-ratio':
      return missingPoint(c, [claim.a1, claim.b1, claim.a2, claim.b2]);
    case 'volume-poly': {
      // #766/#765 (ADR-3D-169): WHICH solid the sentence denotes is decided HERE, against the declared
      // figure — never assumed from the letter count. The old line read «4 letters ⇒ a tetrahedron», so
      // «נפח הפירמידה ABCD» on a square-base pyramid named the coplanar BASE and was refuted arithmetically
      // (a true given told it was false), while «= 0» on the same run was accepted as true.
      const subject = resolveSolidSubject(c, claim.noun, claim.ids);
      if (subject.kind === 'tetra') return missingPoint(c, claim.ids);
      // Several candidates: ASK for more specific letters. Picking one would assert a given the student
      // never stated (ADR-052) — the operator's ruling, and the 2-D ADR-164 shape.
      if (subject.kind === 'ambiguous') return { code: 'ambiguous-solid', id: claim.ids.join(''), count: subject.count };
      if (subject.kind === 'none') return { code: 'no-such-solid', id: claim.ids.join('') || claim.noun };
      return null;
    }
    case 'volume-eq':
    case 'lateral-area-eq': {
      const matches = c.revolutions.filter((r) => r.kind === claim.solid);
      if (matches.length !== 1) return { code: 'no-such-solid', id: claim.solid };
      const r = matches[0];
      const needsHeight = r.kind !== 'sphere';
      if (r.radius === undefined || (needsHeight && r.height === undefined)) {
        return { code: 'free-size-claim', id: claim.solid }; // sizes unstated ⇒ the value is a scale statement, not a check
      }
      return null;
    }
  }
}

/** Drop DEEP-EQUAL duplicates from a pin/claim list, keeping the first (#322). Re-typing a constraint-macro
 *  utterance (the #199 equal-edges tetra, the #321 rhombus/rectangle/square base macros) re-emits its
 *  `length-rel`/`cos-angle` on every submit — a SECOND identical ScalarPin, which drops the DOF cue once per
 *  re-type and carries a redundant residual. The M1 re-declare no-op (ADR-3D-047) covers only the SOLID; this
 *  is the same idempotence for the constraints, at the one PUSH chokepoint (the apply wrapper). */
const dedupDeep = <T>(arr: T[]): T[] => {
  const seen = new Set<string>();
  return arr.filter((x) => { const k = JSON.stringify(x); return seen.has(k) ? false : (seen.add(k), true); });
};

/** #584 (ADR-3D-148, the #383/ADR-3D-109 rule made ONE rule): a statement that references an
 *  EXPLICIT point-run plane materialises it as a drawn plane — the patch then exists, grows, and
 *  carries the full/face/hidden display cycle like any stated «מישור XYZ». Idempotent; a same-named
 *  equation plane wins (never shadow a `planes` entry). Mutates `next` (call on a clone). */
function materializePlaneRun(next: Construction3, ids: Id[]): void {
  if (ids.length < 3) return;
  const name = ids.join('');
  if (!next.pointPlanes.has(name) && !next.planes.has(name)) next.pointPlanes.set(name, [...ids]);
}

/**
 * #748: the two halves of an on-segment rider's host, as stated by a ratio — `(pair1, pair2, k)`
 * meaning `|pair1| = k·|pair2|`. Reads the THREE command shapes the same statement can arrive as, so
 * the utterance family has ONE semantics:
 *
 * - `AE = 2*EA'`    → `vec-rel` (single pair term, no π, no symbol)
 * - `|AE| = 2|EA'|` → `length-rel`
 * - `AE:EA' = 2:1`  → the `length-ratio` claim
 */
function ratioHalves(
  c: Construction3,
  cmd: Command3,
): { pair1: [Id, Id]; pair2: [Id, Id]; k: number; directed: boolean } | null {
  if (cmd.type === 'vec-rel') {
    const [term] = cmd.terms;
    if (cmd.symbol || cmd.terms.length !== 1 || term.atom.kind !== 'pair' || term.coeff.p !== 0) return null;
    // DIRECTED: `AE = 2·A'E` is a different statement from `AE = 2·EA'` (t = 2 vs t = ⅔), so the rider
    // must be the shared MIDDLE letter — the one shape where the vector and length readings agree.
    return { pair1: [cmd.from, cmd.to], pair2: [term.atom.from, term.atom.to], k: term.coeff.k, directed: true };
  }
  if (cmd.type === 'length-rel') {
    const pair2: [Id, Id] | null =
      'pair' in cmd.rhs
        ? cmd.rhs.pair
        : (() => {
            const d = c.vectors.get(cmd.rhs.vec);
            return d ? ([d.from, d.to] as [Id, Id]) : null;
          })();
    return pair2 ? { pair1: [cmd.a1, cmd.b1], pair2, k: cmd.c, directed: false } : null;
  }
  if (cmd.type === 'claim' && cmd.claim.type === 'length-ratio') {
    const { a1, b1, a2, b2, p, q } = cmd.claim;
    return { pair1: [a1, b1], pair2: [a2, b2], k: p / q, directed: false };
  }
  return null;
}

/**
 * #748: a ratio over the two HALVES of a FREE rider's host DETERMINES that rider — rewrite the
 * statement into the `point-on-segment3` given it actually is.
 *
 * The arithmetic (and the chain-form contract that makes the vector and length readings agree) lives in
 * {@link riderChainT}, shared with parse3's «כך ש-AE = 2EA'» clause. Before this, only that clause could
 * reach it: the same ratio typed as its OWN fact fell to the M1 claim-vs-drive fork, which chose *claim*
 * and refuted a satisfiable given — the tool accusing the student over a configuration it had picked
 * itself (ADR-052). The reading belongs to the RIDER, not to the utterance that happened to declare it
 * (docs/17 — a capability bound to one code path rather than to the concept).
 *
 * Deliberately narrow; every guard is load-bearing:
 * - the rider must be the shared MIDDLE letter and the outer letters its host's endpoints (`riderChainT`)
 * - the rider's `t` must be **absent**. A rider whose `t` is already stated is genuinely being *claimed*
 *   about, so it falls through to the ordinary claim lane, where an inconsistent ratio still refuses.
 * - `k > 0`, which is also why a driven `t` can never leave the segment (`riderChainT`)
 */
function riderRatioRetarget(c: Construction3, cmd: Command3): Command3 | null {
  const halves = ratioHalves(c, cmd);
  if (!halves) return null;
  const { pair1, pair2, k, directed } = halves;
  // either side may carry the rider's half first — «|EA'| = ½|AE|» is «|AE| = 2|EA'|»
  for (const [P, Q, kk] of [
    [pair1, pair2, k],
    [pair2, pair1, 1 / k],
  ] as const) {
    // The rider is a label the two pairs SHARE. A directed statement additionally fixes where it must
    // sit (`X→R` against `R→Y`); for a LENGTH statement a pair is an unordered set, so every shared
    // label is a candidate — «|AE| = 2|A'E|» must reach the same given as «|AE| = 2|EA'|».
    const candidates = directed ? (P[1] === Q[0] ? [P[1]] : []) : P.filter((l) => Q.includes(l));
    for (const rider of candidates) {
      const def = c.points.get(rider);
      if (def?.kind !== 'on-segment' || def.t !== undefined) continue;
      const t = riderPairsT(rider, def.a, def.b, P[0], P[1], Q[0], Q[1], kk);
      if (t !== 'invalid') return { type: 'point-on-segment3', id: rider, a: def.a, b: def.b, t };
    }
  }
  return null;
}

/** The public reducer (#322): run the case reducer, then idempotently dedup the ScalarPin list so a
 *  re-typed macro utterance is a true no-op (mirrors ADR-3D-047's solid re-declare). Claims are left
 *  untouched — derive3 attributes them by COUNT-DELTA, and a re-verify of the same claim is harmless. */
/**
 * #841 — is `cmd` aimed at a point that is only a PLACEHOLDER? Returns the construction without it, so
 * the command can define it properly; null when there is nothing to yield.
 *
 * A placeholder is a point the student never positioned: one minted free by a bare segment (#840), or
 * re-homed onto a plane by a relation (#839). A rider the student STATED is not one.
 */
function placeholderYields(c: Construction3, cmd: Command3): Construction3 | null {
  const id = (cmd as { id?: unknown }).id;
  if (typeof id !== 'string') return null;
  const def = c.points.get(id);
  if (!def) return null;
  const placeholder = def.kind === 'free3' || (def.kind === 'on-plane' && def.implied === true);
  if (!placeholder) return null;
  const points = new Map(c.points);
  points.delete(id);
  return { ...c, points };
}

export function applyCommand3(c: Construction3, cmd: Command3): ApplyResult3 {
  const r = applyCommand3Inner(c, cmd);
  if (r.ok) r.next.scalarPins = dedupDeep(r.next.scalarPins);
  return r;
}

function applyCommand3Inner(c: Construction3, cmd: Command3): ApplyResult3 {
  // #748: normalize a ratio stated over a free rider's two halves into the point-on-segment given it
  // is — HERE, at the one entry point every command passes through (the ADR-3D-089 `parallelepiped`
  // precedent), so all three spellings share one path instead of three routing sites.
  const retarget = riderRatioRetarget(c, cmd);
  if (retarget) return applyCommand3(c, retarget);

  /**
   * #841 — A PLACEHOLDER YIELDS TO A REAL DEFINITION, at the one entry every command passes through
   * (the `riderRatioRetarget` precedent directly above).
   *
   * #840 made an unstated endpoint a free point, and #839 re-homes it onto a plane. Both are
   * PLACEHOLDERS: they say "this point has no position yet", not "this point is defined". But every
   * later definition asks `c.points.has(id)` and then either refuses `already-defined` (13 sites) or
   * degrades into a CLAIM about a position the point does not have — so «קטע BE» + «BE מוכל במישור
   * ABCD» + «E אמצע BD» came back `claim-refuted`, while the same three lines in a different order
   * built fine. That is docs/17 M2 law (i) — satisfiability must not depend on entry order — and it
   * was introduced by #840/#839 rather than found by them.
   *
   * So a definition landing on a placeholder is tried against a construction WITHOUT it: the
   * placeholder was never a definition, and the real one takes its place. The student's own givens are
   * untouched — a rider THEY stated carries no `implied` mark and is never stripped — and the
   * relation that implied the placeholder survives as its claim, which re-verifies against the new
   * definition (so «E אמצע B'D'», which would leave the plane, still refuses).
   */
  const yielded = placeholderYields(c, cmd);
  if (yielded) {
    const r = applyCommand3(yielded, cmd);
    if (r.ok) return r;
  }
  switch (cmd.type) {
    case 'solid': {
      // #349 (ADR-3D-089): `parallelepiped` is the legacy spelling of `prism4` + `oblique` — normalize it
      // HERE, at the one entry point every construction passes through (typed commands and loaded
      // `.geo3.json` files alike), so the engine downstream has exactly ONE oblique code path.
      if (cmd.kind === 'parallelepiped') {
        return applyCommand3(c, { ...cmd, kind: 'prism4', oblique: true });
      }
      const n = VERTEX_COUNT[cmd.kind];
      if (cmd.ids.length !== n || new Set(cmd.ids).size !== n) {
        return { ok: false, error: { code: 'bad-solid', kind: cmd.kind } };
      }
      // M1 (issue #116): a FLAT polygon whose ids ALL already exist is a statement ABOUT those points, not a
      // re-creation — reference them idempotently instead of erroring `already-defined`. This lets a
      // right-triangle / bare-polygon statement land on an existing prism/pyramid base (its vertices are
      // `solid-vertex` points) so the accompanying constraint (e.g. the ∠=90) applies. A polygon that adds
      // NEW points still builds; a genuine SOLID (cube/prism/…) re-declaration keeps the conflict error.
      const flat = polygonN(cmd.kind) !== null;
      if (flat && cmd.ids.every((id) => c.points.has(id))) {
        // #774 Am. (#807 play): a stated flat shape must leave its VISIBLE trace (ADR-3D-035) even
        // when it only references existing points — «מרובע ABCE» after «משולש SEC» was green with
        // the AE side missing. Draw the boundary ring idempotently (sides already drawn as solid
        // edges or segments are skipped); with nothing to draw this stays the #116 pure no-op.
        const nextRef = clone(c);
        let drew = false;
        const nRef = cmd.ids.length;
        for (let j = 0; j < nRef; j++) {
          const [a, b] = [cmd.ids[j], cmd.ids[(j + 1) % nRef]];
          if (!hasSegment(nextRef, a, b)) {
            nextRef.segments.push([a, b]);
            drew = true;
          }
        }
        return { ok: true, next: drew ? nextRef : c };
      }
      // #774 (ADR-3D-172): the MIXED run — some labels exist, some are new. Ownership is explicit
      // and total (docs/17: one rule owns the form, never an accident downstream): all-new declares
      // a free shape (below), all-existing binds (above), and a mixed run BINDS the known labels
      // and MINTS the undeclared ones as genuinely free points. The old path walked into the
      // `already-defined` refusal below and blamed the FIRST existing label («משולש SEC» → "S") —
      // an error message naming an operand that was never the problem. Ruling 2026-08-25: the
      // consistency argument — «משולש XYZ» already builds three free points, so one free point in
      // a partially-bound run is the same mechanism; 2-D and 3-D's own «מלבן» lane already behave
      // this way.
      if (flat && cmd.ids.some((id) => c.points.has(id))) {
        const fresh = cmd.ids.filter((id) => !c.points.has(id));
        const known = cmd.ids.filter((id) => c.points.has(id));
        const next = clone(c);
        if (polygonN(cmd.kind) === 3) {
          // a triangle is planar whatever its corners: each minted point is free3 (3 sampled DOFs,
          // ADR-052 — counted by freeDofCount3, moving on «show another configuration»)
          for (const id of fresh) next.points.set(id, { kind: 'free3' });
        } else if (fresh.length === 1 && known.length >= 3) {
          // a quad/pentagon is FLAT by its own definition — the one minted corner rides the plane
          // of the known ones (2 free DOFs; planarity is the shape's meaning, not an invented given)
          materializePlaneRun(next, known);
          next.points.set(fresh[0], { kind: 'on-plane', plane: known.join('') });
        } else {
          // not mintable (a flat quad with two unknown corners has no owner yet): the refusal
          // names the UNDECLARED label — never a label that was fine (the honesty invariant)
          return { ok: false, error: { code: 'unknown-point', id: fresh[0] } };
        }
        // the ring's ink — the minted point's only visible meaning is the shape it closes
        const ringN = cmd.ids.length;
        for (let j = 0; j < ringN; j++) {
          const [a, b] = [cmd.ids[j], cmd.ids[(j + 1) % ringN]];
          if (!hasSegment(next, a, b)) next.segments.push([a, b]);
        }
        return { ok: true, next };
      }
      // #199 M1 (ADR-3D-047): re-DECLARING an existing solid (same kind, same ids) is a statement
      // about the figure, not a re-creation — idempotent no-op (the solid-shaped sibling of the
      // #116 flat-polygon path above and the segment3 convention below). A different kind or a
      // partial id overlap keeps the honest conflict error.
      const sameIds = (sld: SolidObj): boolean =>
        sld.kind === cmd.kind && sld.ids.length === cmd.ids.length && sld.ids.every((id, i) => id === cmd.ids[i]);
      if (c.solids.some((sld) => sameIds(sld) && !!sld.oblique === !!cmd.oblique)) {
        return { ok: true, next: c };
      }
      // #349: the SAME prism re-declared with the tilt resolved — «מנסרה משולשת» then «מנסרה ישרה שבסיסה
      // משולש» — is the M1 statement that it is right, not a re-creation: straighten it (the shared
      // `make-right-prism` path), never a silent no-op that would drop the stated rightness (ADR-3D-058).
      // The converse (a RIGHT prism re-declared oblique) contradicts the figure and keeps the honest
      // `already-defined` conflict below.
      if (!cmd.oblique && c.solids.some((sld) => sameIds(sld) && sld.oblique)) {
        return applyCommand3(c, { type: 'make-right-prism' });
      }
      // ADR-3D-080 (M1): a PYRAMID whose ids ALL exist is a statement ABOUT those points —
      // «SBCD פירמידה ישרה» on a figure carrying S, B, C, D (operator, 2026-07-25). Draw the
      // pyramid's ink; a RIGHT kind adds the rightness: a free plane-rider apex is SEATED at
      // the closed-form right-apex (the ⊥ line through the base's centre cut with its carrier
      // plane — the ADR-255 reseat pattern), any other apex takes equal-lateral-edge givens
      // (apex over the circumcentre ⇔ |apex·bᵢ| all equal), M1-routed to drive or verify.
      const PYR_BASE: Partial<Record<SolidKind, number>> = {
        tetra: 3, pyramid3: 3, pyramid3e: 3,
        ...(Object.fromEntries((Object.keys(VERTEX_COUNT) as SolidKind[]).filter(isQuadPyramid).map((k) => [k, 4])) as Partial<Record<SolidKind, number>>),
      };
      const baseN = PYR_BASE[cmd.kind];
      // NOT a statement: ids that are exactly an existing solid's id SET (a CONTRADICTING
      // re-declare — pyramidPar vs pyramid4g on SABCD) or that lie within ONE FACE of an
      // existing solid (flat by construction — «טטראדר ABCD» over a cube's base) keep the
      // honest already-defined refusal below (the ADR-3D-047 locks).
      const statementConflict = (): boolean => {
        const idSet = new Set(cmd.ids);
        return c.solids.some(
          (sld) =>
            (sld.ids.length === idSet.size && sld.ids.every((id) => idSet.has(id))) ||
            sld.faces.some((ring) => cmd.ids.every((id) => ring.includes(id))),
        );
      };
      if (baseN !== undefined && cmd.ids.length === baseN + 1 && cmd.ids.every((id) => c.points.has(id)) && !statementConflict()) {
        // ADR-3D-080 Am. 1: the APEX of an all-existing pyramid statement is identified
        // SEMANTICALLY, never by letter position — «SBCE פירמידה ישרה» defeated the parser's
        // consecutive-run apex-first heuristic (E is a CONSTRUCTED letter, so B,C,E is not a
        // run) and read base S,B,C with apex E. The unique free plane-rider (or already-seated
        // right-apex) IS the apex; with none or several, the template order (apex last) stands.
        let ids = cmd.ids;
        const apexish = cmd.ids.filter((id) => {
          const d = c.points.get(id);
          return d?.kind === 'on-plane' || d?.kind === 'right-apex';
        });
        if (apexish.length === 1 && ids[baseN] !== apexish[0]) ids = [...ids.filter((id) => id !== apexish[0]), apexish[0]];
        const base = ids.slice(0, baseN);
        const apex = ids[baseN];
        const next = clone(c);
        for (let i = 0; i < baseN; i++) {
          const a = base[i];
          const b = base[(i + 1) % baseN];
          if (!hasSegment(next, a, b)) next.segments.push([a, b]);
          if (!hasSegment(next, apex, a)) next.segments.push([apex, a]);
        }
        const right = cmd.kind === 'pyramid3' || cmd.kind === 'pyramid3e' || cmd.kind === 'pyramid4' || cmd.kind === 'pyramid4r';
        if (!right) return { ok: true, next };
        const apexDef = next.points.get(apex);
        if (apexDef?.kind === 'on-plane' && !apexDef.side && c.pointPlanes.has(apexDef.plane)) {
          next.points.set(apex, { kind: 'right-apex', base, plane: apexDef.plane });
          return { ok: true, next };
        }
        let acc: Construction3 = next;
        for (let i = 1; i < baseN; i++) {
          const r = applyCommand3(acc, { type: 'length-rel', a1: apex, b1: base[0], rhs: { pair: [apex, base[i]] }, c: 1 });
          if (!r.ok) return r;
          acc = r.next;
        }
        return { ok: true, next: acc };
      }

      const taken = cmd.ids.find((id) => c.points.has(id));
      if (taken !== undefined) return { ok: false, error: { code: 'already-defined', id: taken } };

      const next = clone(c);
      const at = (i: number): Id => cmd.ids[i];
      const solid: SolidObj = {
        kind: cmd.kind,
        ids: [...cmd.ids],
        // #349: an oblique prism has the SAME topology as the right prism of its kind (same ring) — only
        // its dims and positions differ, which is what lets the tilt be a flag rather than a kind.
        edges: edgeIndices(cmd.kind).map(([i, j]) => [at(i), at(j)] as [Id, Id]),
        faces: faceIndices(cmd.kind).map((ring) => ring.map(at)),
        ...(cmd.oblique ? { oblique: true as const } : {}),
      };
      const solidIndex = next.solids.length;
      next.solids.push(solid);
      cmd.ids.forEach((id, index) => next.points.set(id, { kind: 'solid-vertex', solid: solidIndex, index }));
      return { ok: true, next };
    }

    case 'make-right-prism': {
      // #289 (M1): "the prism is right" — a statement about THE existing solid, never a re-construction.
      // #349 (ADR-3D-089): straightening is now CLEARING THE OBLIQUE FLAG, for any base — the lateral
      // vector w is replaced by a height ⟂ the base (2 DOF fewer) while the kind, vertex order and
      // topology are untouched, so no id is re-declared. Works uniformly for the triangular / quad /
      // parallelogram (מקבילון) prisms because they share one oblique mechanism.
      // An already-right prism is an idempotent no-op (the statement already holds).
      const RIGHT_PRISM = new Set(['prism3', 'prism3e', 'prism4', 'prism4g', 'prism4sq', 'prism4r', 'prismReg5', 'prismReg6', 'box', 'cube']);
      const oblique = c.solids.filter((s) => s.oblique);
      const rightOnes = c.solids.filter((s) => !s.oblique && RIGHT_PRISM.has(s.kind));
      if (oblique.length === 0 && rightOnes.length === 0) return { ok: false, error: { code: 'no-prism-to-make-right' } };
      if (oblique.length === 0) return { ok: true, next: c }; // every prism-like solid is already right — idempotent
      if (oblique.length > 1) return { ok: false, error: { code: 'ambiguous-prism' } }; // which oblique prism?
      const target = oblique[0];
      const next = clone(c);
      const idx = next.solids.findIndex(
        (s) => s.oblique && s.kind === target.kind && s.ids.length === target.ids.length && s.ids.every((id, i) => id === target.ids[i]),
      );
      const { oblique: _wasOblique, ...right } = next.solids[idx]; // same ids/edges/faces; lateral now ⟂ base
      next.solids[idx] = right;
      return { ok: true, next };
    }

    case 'point-on-segment3': {
      if (c.points.has(cmd.id)) {
        // #199 M1 (ADR-3D-047): placing an EXISTING point on a segment is a GIVEN about it, never a
        // re-creation. A numeric t (median foot, stated ratio) lowers to the vec-rel dual —
        // A→id = t·(A→B), all endpoints known ⇒ a multi-seed verified claim (a false statement now
        // refuses `claim-refuted`, naming the actual conflict instead of `already-defined`). A free
        // t (bare membership) lowers to the collinear3 claim (the ADR-3D-031 on-line M1 shape;
        // betweenness is deliberately not asserted without a stated t).
        const missingSeg = missingPoint(c, [cmd.a, cmd.b]);
        if (missingSeg) return { ok: false, error: missingSeg };
        // #748: the point is ALREADY a free rider of THIS host, so a stated `t` is the given that
        // DETERMINES it — a definition update, not a claim about a position it does not yet have.
        // (The vec-rel dual below would ask "does it hold?" of a point whose whole point is that it
        // has not been placed yet, and refute the given that was about to place it.) A rider whose
        // `t` is already stated falls through: that IS a claim, and it is verified as one.
        const rider = c.points.get(cmd.id);
        if (cmd.t !== undefined && rider?.kind === 'on-segment' && rider.t === undefined) {
          const flipped = rider.a === cmd.b && rider.b === cmd.a; // the host named the other way round
          if ((rider.a === cmd.a && rider.b === cmd.b) || flipped) {
            const next = clone(c);
            next.points.set(cmd.id, { kind: 'on-segment', a: rider.a, b: rider.b, t: flipped ? 1 - cmd.t : cmd.t });
            return { ok: true, next };
          }
        }
        if (cmd.t !== undefined) {
          return applyCommand3(c, {
            type: 'vec-rel',
            from: cmd.a,
            to: cmd.id,
            terms: [{ coeff: { k: cmd.t, p: 0 }, atom: { kind: 'pair', from: cmd.a, to: cmd.b } }],
          });
        }
        return applyCommand3(c, { type: 'claim', claim: { type: 'collinear3', ids: [cmd.a, cmd.id, cmd.b] } });
      }
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'on-segment', a: cmd.a, b: cmd.b, t: cmd.t });
      return { ok: true, next };
    }

    case 'vertex-angle': {
      // #251 (ADR-3D-049): the arms of a vertex-named angle are resolved HERE, where the figure is
      // known. Exactly two distinct edges at the vertex ⇒ delegate to the ordinary ∠PVQ lowering;
      // anything else is honestly ambiguous — the student names all three letters.
      if (!c.points.has(cmd.vertex)) return { ok: false, error: { code: 'unknown-point', id: cmd.vertex } };
      const nbrs = new Set<Id>();
      for (const sld of c.solids) for (const [ea, eb] of sld.edges) { if (ea === cmd.vertex) nbrs.add(eb); else if (eb === cmd.vertex) nbrs.add(ea); }
      for (const [sa, sb] of c.segments) { if (sa === cmd.vertex) nbrs.add(sb); else if (sb === cmd.vertex) nbrs.add(sa); }
      if (nbrs.size !== 2) return { ok: false, error: { code: 'ambiguous-angle', id: cmd.vertex } };
      const [p, q] = [...nbrs];
      let r = applyCommand3(c, { type: 'segment3', a: cmd.vertex, b: p });
      if (r.ok) r = applyCommand3(r.next, { type: 'segment3', a: cmd.vertex, b: q });
      if (r.ok) r = applyCommand3(r.next, { type: 'claim', claim: { type: 'angle-seg-eq', a1: cmd.vertex, b1: p, a2: cmd.vertex, b2: q, deg: cmd.deg } });
      return r;
    }

    case 'midpoint-auto': {
      // #225 (ADR-3D-048): the un-named `אמצע BB'` — pick the first free letter HERE (apply knows the
      // taken ids; parse3 is context-free) and delegate to the ordinary on-segment midpoint. The 2-D
      // freeLabel pattern, copied per docs/20 §12 (M first — the letter students use for midpoints).
      const missingMid = missingPoint(c, [cmd.a, cmd.b]);
      if (missingMid) return { ok: false, error: missingMid };
      const pool = [...'MNKLPQRSTUVWXYZGHIJ'];
      const label = pool.find((l) => !c.points.has(l));
      if (!label) return { ok: false, error: { code: 'already-defined', id: 'M' } }; // 19 letters taken — practically unreachable
      return applyCommand3(c, { type: 'point-on-segment3', id: label, a: cmd.a, b: cmd.b, t: 0.5 });
    }

    case 'name-vector': {
      if (!/^[a-z]$/.test(cmd.name)) return { ok: false, error: { code: 'bad-name', id: cmd.name } };
      if (c.vectors.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      const missing = missingPoint(c, [cmd.from, cmd.to]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.vectors.set(cmd.name, { from: cmd.from, to: cmd.to });
      return { ok: true, next };
    }

    case 'segment3': {
      if (cmd.a === cmd.b) return { ok: false, error: { code: 'unknown-point', id: cmd.b } };
      /**
       * #840 (ADR-3D-191) — AN UNSTATED ENDPOINT IS A FREE POINT, not a refusal.
       *
       * «קטע BE» on a figure with no `E` was refused `unknown-point`, so the segment never existed and
       * nothing could be said about it — the operator deleted «E אמצע AC» and watched both that row and
       * the containment statement go inert (2026-08-31).
       *
       * [ADR-052](../../docs/06-decisions.md#adr-052) is the rule: a student enters only what the
       * question shows, and every unstated magnitude is a FREE DOF rather than a fixed value. `E` is
       * unstated, so it is free — 3 sampled DOFs that «הציגו תצורה אחרת» resamples — and the segment
       * draws and moves. That is also what makes a later «BE מוכל במישור ABCD» able to REMOVE a degree
       * of freedom instead of being inert (#839).
       *
       * The mechanism is not new: the polygon lane above mints `free3` corners on exactly this argument
       * («משולש XYZ already builds three free points»), and it does so only when the run has at least
       * one KNOWN point. The same guard applies here and is what keeps a typo catchable: «קטע BE»
       * extends from a `B` that exists, while «קטע QZ» — both ends unknown — is still refused, so a
       * mistyped pair names the undeclared label rather than silently inventing two points.
       *
       * `bare` is the second half of that guard. Many commands emit a `segment3` as a CARRIER —
       * «נסמן: AB = u, AC = v» draws the vector's segment before naming it — and minting there would
       * let a NAMING introduce its own subject. `v7-t1` locks that refusal («naming needs existing
       * points») and it caught this: the first version of this fix minted on every `segment3`. Only
       * the drawing register may introduce a point.
       */
      const fresh = [cmd.a, cmd.b].filter((id) => !c.points.has(id));
      if (cmd.bare && fresh.length > 0 && fresh.length < 2) {
        const next = clone(c);
        for (const id of fresh) next.points.set(id, { kind: 'free3' });
        if (!hasSegment(next, cmd.a, cmd.b)) next.segments.push([cmd.a, cmd.b]);
        return { ok: true, next };
      }
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      if (c.segments.some((s) => samePair(s, cmd.a, cmd.b))) return { ok: true, next: c }; // idempotent — the 2-D convention
      // a pair that IS a solid edge is still RECORDED (ADR-3D-030 Am. 2): the student
      // naming `BB'` is a deliberate act — the data panel organizes that pair's
      // knowledge (derived |BB'|); the scene draws the ink ONCE (the solid edge wins)
      const next = clone(c);
      next.segments.push([cmd.a, cmd.b]);
      return { ok: true, next };
    }

    case 'angle-mark': {
      // #94 — a pedagogical angle highlight: draw the arc + its two arms, drive nothing. All three points
      // must exist (a marker references the figure, never invents it); the two arms are distinct.
      const missing = missingPoint(c, [cmd.vertex, cmd.p, cmd.q]);
      if (missing) return { ok: false, error: missing };
      if (cmd.p === cmd.vertex || cmd.q === cmd.vertex || cmd.p === cmd.q) return { ok: false, error: { code: 'unknown-point', id: cmd.vertex } };
      const next = clone(c);
      const same = (m: { vertex: Id; p: Id; q: Id }) =>
        m.vertex === cmd.vertex && ((m.p === cmd.p && m.q === cmd.q) || (m.p === cmd.q && m.q === cmd.p));
      const existing = next.angleMarks.find(same);
      if (!existing) {
        next.angleMarks.push({ vertex: cmd.vertex, p: cmd.p, q: cmd.q, ...(cmd.label ? { label: cmd.label } : {}) });
      } else if (cmd.label && existing.label !== cmd.label) {
        // «∠SDB» then «∠SDB = α» — naming an already-marked angle UPGRADES its display label (new object, no
        // prior-construction mutation since clone shares the refs).
        next.angleMarks = next.angleMarks.map((m) => (m === existing ? { ...m, label: cmd.label } : m));
      }
      for (const arm of [cmd.p, cmd.q]) if (!next.segments.some((s) => samePair(s, cmd.vertex, arm))) next.segments.push([cmd.vertex, arm]);
      // ADR-3D-052 (#271) — REUSING a label is how a student says "these two angles are equal". It used
      // to record a second cosmetic sticker and assert nothing, so the canvas drew α on two angles the
      // figure did not make equal: a stated given silently dropped. A label BINDS to its angle, and a
      // second binding of the same letter is the equality (M1-routed exactly like the explicit form).
      if (cmd.label) {
        const prior = c.angleMarks.find((m) => m.label === cmd.label && !same(m));
        if (prior) {
          const pair = (v: Id, x: Id): VecAtom => ({ kind: 'pair', from: v, to: x });
          const [a, b, cc, d] = [pair(prior.vertex, prior.p), pair(prior.vertex, prior.q), pair(cmd.vertex, cmd.p), pair(cmd.vertex, cmd.q)];
          if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'cos-eq', a, b, c: cc, d });
          else next.claims.push({ type: 'cos-eq', a, b, c: cc, d });
        }
      }
      return { ok: true, next };
    }

    case 'centroid3': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const missing = missingPoint(c, cmd.of);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'centroid', of: cmd.of });
      return { ok: true, next };
    }

    case 'diag-intersection': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      // face: [] is the "the base" sentinel — resolved by the ONE helper both diagonal forms share
      const ring = resolveQuadRing(c, cmd.face, cmd.id);
      if (!ring.ok) return { ok: false, error: ring.error };
      const face = ring.face;
      // a parallelogram's diagonals bisect ⇒ the crossing = midpoint of a diagonal
      // (1st & 3rd cyclic vertices); reuses the on-segment point kind (no eval change)
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'on-segment', a: face[0], b: face[2], t: 0.5 });
      return { ok: true, next };
    }

    case 'quad-diagonals': {
      // #834 — «אלכסוני הבסיס»: DRAW the two diagonals, naming no crossing. Two prod users typed this
      // (and «הוסף אלכסוני בסיס») on a square pyramid; only the crossing form existed, so both were
      // not-handled and escalated to the paid LLM, which built something for one and failed the other.
      //
      // This is a missing ARM of an existing construct, not a new construct: the base carrier and the
      // diagonal pair both already existed and were reachable only through the naming-the-crossing
      // form. It shares `resolveQuadRing`, so «the base» keeps meaning exactly what it means there.
      const ring = resolveQuadRing(c, cmd.face, 'diagonals');
      if (!ring.ok) return { ok: false, error: ring.error };
      const [a, b, d, e] = ring.face;
      const next = clone(c);
      for (const [p, q] of [[a, d], [b, e]] as const) {
        if (!next.segments.some((seg) => samePair(seg, p, q))) next.segments.push([p, q]);
      }
      return { ok: true, next };
    }

    case 'rel-plane': {
      const clash = c.planes.has(cmd.name) || c.pointPlanes.has(cmd.name) || c.relPlanes.has(cmd.name) || c.lines.has(cmd.name);
      if (clash) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      const missing = missingPoint(c, [...cmd.through, cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      if (cmd.a === cmd.b) return { ok: false, error: { code: 'unknown-point', id: cmd.b } };
      const next = clone(c);
      if (cmd.rel === 'perp') next.relPlanes.set(cmd.name, { kind: 'perp', through: cmd.through[0], a: cmd.a, b: cmd.b });
      else next.relPlanes.set(cmd.name, { kind: 'par', through: [cmd.through[0], cmd.through[1]], a: cmd.a, b: cmd.b });
      return { ok: true, next };
    }

    case 'plane-cut': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (!c.planes.has(cmd.plane) && !c.pointPlanes.has(cmd.plane) && !c.relPlanes.has(cmd.plane))
        return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'plane-cut', plane: cmd.plane, a: cmd.a, b: cmd.b });
      // #780 — the student REFERENCED a straight carrier. If it is not already ink (a solid's edge or a
      // drawn segment), draw it as a SEGMENT so the crossing has something to sit on. That visibility is
      // the one thing the retired `line-through` lowering did right, kept here BOUNDED: the referenced
      // edge/diagonal becomes visible without an edge being misrepresented as an infinite line.
      // `hasSegment` already looks in both the solids' edges and the segment list, so this is idempotent.
      if (!hasSegment(next, cmd.a, cmd.b)) next.segments.push([cmd.a, cmd.b]);
      return { ok: true, next };
    }

    case 'height-to-face': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const missing = missingPoint(c, [cmd.from, ...cmd.face]);
      if (missing) return { ok: false, error: missing };
      if (cmd.face.length < 3) return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'foot-face', from: cmd.from, face: [...cmd.face] });
      if (!hasSegment(next, cmd.from, cmd.id)) next.segments.push([cmd.from, cmd.id]); // draw the height
      return { ok: true, next };
    }

    case 'draw-arrow': {
      // #72: `חץ A'C` — pure ink: record the unnamed arrow + draw its carrier segment.
      const missing = missingPoint(c, [cmd.from, cmd.to]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      if (!next.arrows.some(([f, t]) => f === cmd.from && t === cmd.to)) next.arrows.push([cmd.from, cmd.to]);
      if (!hasSegment(next, cmd.from, cmd.to)) next.segments.push([cmd.from, cmd.to]);
      return { ok: true, next };
    }

    case 'perp-to-base': {
      // #72: `אנך יורד מ-M לבסיס` — the ⟂ from a point onto the solid's BASE plane. The foot
      // carries no stated name (parse3 is context-free), so the first unused label is minted
      // HERE and the command delegates to the height-to-face foot machinery (V8-e).
      //
      // #503 (ADR-3D-142): the APEX-LESS «גובה הפירמידה» carries no `from` — the apex is derived
      // from the figure's SINGLE solid by the engine-wide layout convention (base ids first, apex
      // LAST — exactly when `baseRingOf` covers all-but-one id). Several solids stay the honest
      // ambiguity refusal, and a solid with no derivable apex (prism/box) refuses `bad-solid` —
      // its height is not a vertex-to-base perpendicular, and guessing a vertex would assert a
      // figure the student never stated (ADR-052).
      if (!cmd.from && c.solids.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: 'base' } };
      let from = cmd.from;
      if (!from) {
        const s0 = c.solids[0];
        const ring = baseRingOf(s0);
        if (!ring || ring.length !== s0.ids.length - 1) return { ok: false, error: { code: 'bad-solid', kind: s0.kind } };
        from = s0.ids[s0.ids.length - 1];
      }
      const missing = missingPoint(c, [from, ...(cmd.face ?? [])]);
      if (missing) return { ok: false, error: missing };
      // A STATED base wins (#448): «גובה מנקודה D לבסיס ABC» names the face, so resolving the solid's
      // first face instead would silently drop the student's own words onto a different plane. Only the
      // UNSTATED case needs the figure, and it stays honest about ambiguity — several solids, no answer.
      if (!cmd.face && c.solids.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: 'base' } };
      const face = cmd.face ?? c.solids[0].ids.slice(0, 3);
      let foot: Id | null = null;
      for (const ch of 'EFGHKLMNPQRSTUVWXYZABCD') {
        if (!c.points.has(ch)) {
          foot = ch;
          break;
        }
      }
      if (!foot) return { ok: false, error: { code: 'already-defined', id: 'foot' } };
      return applyCommand3(c, { type: 'height-to-face', id: foot, from, face });
    }

    case 'point-in-span': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const missing = missingPoint(c, [cmd.a, cmd.b, cmd.vecFrom]);
      if (missing) return { ok: false, error: missing };
      for (const name of cmd.span) {
        if (!c.vectors.has(name)) return { ok: false, error: { code: 'unknown-vector', id: name } };
      }
      // the closed-form drive needs a full declared basis with a 1-dim complement (docs/20 §6.2)
      if (c.vectors.size !== 3 || new Set(cmd.span).size !== 2) return { ok: false, error: { code: 'need-basis' } };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'in-span', a: cmd.a, b: cmd.b, vecFrom: cmd.vecFrom, span: cmd.span });
      return { ok: true, next };
    }

    case 'claim': {
      const err = claimRefsError(c, cmd.claim);
      if (err) return { ok: false, error: err };
      const next = clone(c);
      // ADR-3D-032: a given referencing a coord-sym point PINS the figure parameter —
      // it must NOT enter the pivot (M rides a provisional sampled k there); it is
      // root-found post-pivot over final positions (1-DOF, the D3 boundary). Recorded
      // as a claim too — the final verification stays the arbiter.
      const refsCoordSym = (ids: Id[]): boolean => ids.some((id) => c.points.get(id)?.kind === 'coord-sym');
      if (
        (cmd.claim.type === 'length-eq' && refsCoordSym([cmd.claim.a, cmd.claim.b])) ||
        (cmd.claim.type === 'angle-seg-eq' && refsCoordSym([cmd.claim.a1, cmd.claim.b1, cmd.claim.a2, cmd.claim.b2]))
      ) {
        next.paramGivens.push(cmd.claim);
        next.claims.push(cmd.claim);
        return { ok: true, next };
      }
      // #754 (ADR-3D-171): a stated MAGNITUDE on a gauge-frozen figure pins the SCALE — a given,
      // never a refusal («size-on-solid») and never a false accusation («claim-refuted» about a
      // size the tool invented). The FIRST eligible magnitude becomes the scale given; the
      // resolver applies it as one uniform factor per configuration, so the shape DOFs stay
      // free. Recorded as a claim too — the final verification stays the arbiter (it holds
      // exactly on the rescaled figure). A length on a figure with free dims keeps its existing
      // scalar-pin route below (byte-identical prism/pyramid behaviour, and the pivot honours
      // it through the same gauge scale); volume and area have no pin kind, so they take this
      // lane at any dim count.
      if (
        isScaleGivenClaim(cmd.claim) &&
        scaleGivenSafe(c) &&
        c.scaleGivens.length === 0 &&
        (cmd.claim.type !== 'length-eq' || freeDims(c) === 0)
      ) {
        next.scaleGivens.push(cmd.claim);
        next.claims.push(cmd.claim);
        return { ok: true, next };
      }
      // M1 (V7 T2): a scalar statement on a figure with FREE dims is a GIVEN — it
      // drives the solve instead of being "checked" against an arbitrary sample.
      if (freeDims(c) > 0) {
        // #316 (ADR-3D-075): the COORDS twin — «D=(8,10,-12)» on an under-determined figure is the
        // same statement as «D(8,10,-12)» (one statement, one semantics, docs/17 §2.3; the `=` sign
        // must not turn a GIVEN into a refused claim). It lowers to the pivot pin exactly like
        // point3-on-an-existing-id; on a DETERMINED figure it falls through to the claim lane below,
        // so the V2 verify-your-answer register (claim-refuted) is byte-preserved.
        const cl = cmd.claim; // const so the narrowing survives into the closure below
        if (
          cl.type === 'coords-eq' &&
          c.points.has(cl.id) &&
          // …but never for a SYMBOL-defined point (SN=k·SC): its position belongs to the symbol/
          // root-find lane, and a pivot pin on it perturbs the k-pinning chain (the ADR-3D-030
          // rule — symbol-defined points are skipped in pin residuals — applied at the entry).
          !c.vecDefs.some((vd) => vd.symbol && vd.unknown === cl.id)
        ) {
          // pin AND claim — the ADR-3D-030 plane-eq pattern: the pin lets the pivot DRIVE the free
          // figure toward the stated coords; the recorded claim stays the FINAL ARBITER, so an
          // inconsistent statement (the 2020 wrong-K gate) still refuses with the claim register
          // even where the pivot only best-efforts its pins.
          next.pins.push({ id: cl.id, x: cl.x, y: cl.y, z: cl.z });
          next.claims.push(cl);
          return { ok: true, next };
        }
        // #754: once a scale given is in force the rescale owns the figure's size — a second
        // length must not ALSO enter the pivot as a scale-fixing pin (the two mechanisms would
        // double-apply); it falls through to the claim lane, where the store refuses it honestly
        // against still-free dims and checks it exactly against a rigid one.
        if (cmd.claim.type === 'length-eq' && c.scaleGivens.length === 0) {
          next.scalarPins.push({ kind: 'length', a: cmd.claim.a, b: cmd.claim.b, value: cmd.claim.value });
          return { ok: true, next };
        }
        if (cmd.claim.type === 'angle-seg-eq' && cmd.claim.a1 === cmd.claim.a2) {
          next.scalarPins.push({ kind: 'vangle', vertex: cmd.claim.a1, p: cmd.claim.b1, q: cmd.claim.b2, deg: cmd.claim.deg });
          return { ok: true, next };
        }
      }
      // M1 (ADR-3D-030): a plane-EQUATION statement on a SOLID-bearing figure is ALSO a
      // GIVEN — it pins the pivot (each named point satisfies n·P + d = 0), driving the
      // free gauge/dims exactly like a coordinate injection; contradictory ⇒
      // `injection-unsatisfiable`. The claim record is KEPT (fall through): points the
      // pivot cannot place (symbol-defined, resolved post-pivot) skip the residual, so
      // the final claim verification is what guarantees EVERY named point. A coord-only
      // figure (no solid, nothing to drive) is the plain verified claim.
      if (cmd.claim.type === 'plane-eq' && c.solids.length > 0) {
        next.planePins.push({ ids: [...cmd.claim.ids], cx: cmd.claim.cx, cy: cmd.claim.cy, cz: cmd.claim.cz, d: cmd.claim.d });
      }
      // #584 (ADR-3D-148): a claim naming an explicit plane RUN («המישור ABS: x=0») references a
      // plane the student stated — materialise it so the patch draws and carries the display cycle.
      if (cmd.claim.type === 'plane-eq' || cmd.claim.type === 'coord-plane-rel') materializePlaneRun(next, cmd.claim.ids);
      next.claims.push(cmd.claim); // recorded — derive3 verifies EVERY recorded claim (fact-attributed)
      return { ok: true, next };
    }

    // --- V2: the algebraic lane ---

    case 'point3': {
      if (c.points.has(cmd.id)) {
        // the id EXISTS — a coordinate statement about an existing point is a GIVEN,
        // never an error: it becomes a pivot pin (the 2-D M1 principle; V4 ADR-3D-007).
        // #325 (ADR-3D-079): a symbolic AFFINE component (`B(2t,t,k)`) pins too — each
        // distinct symbol joins the pivot as an extra unknown, OPEN until data pins it.
        // The letters share one namespace per role: a pin symbol that is ALSO the figure's
        // coord-sym parameter would be resolved by two different mechanisms — refused.
        const exprs = cmd.symExprs ?? [null, null, null];
        const adopted = adoptParamAsPinSym(c, exprs); // #801: the letter re-homes to the pivot when it can
        if (!adopted) return { ok: false, error: { code: 'two-params' } };
        const next = clone(adopted);
        const comp = (v: number | null, e: SymComp | null): number | null | SymComp => (v !== null ? v : e);
        const comps: [number | null | SymComp, number | null | SymComp, number | null | SymComp] =
          [comp(cmd.x, exprs[0]), comp(cmd.y, exprs[1]), comp(cmd.z, exprs[2])];
        next.pins.push({ id: cmd.id, x: comps[0], y: comps[1], z: comps[2] });
        bindPartialNames(next, { kind: 'point', id: cmd.id }, cmd.syms, comps); // #814
        return { ok: true, next };
      }
      if (cmd.x === null || cmd.y === null || cmd.z === null) {
        // ADR-3D-032: a NEW point whose symbolic components all carry ONE letter is a
        // coord-sym point — the letter becomes the figure's single parameter (a sampled
        // free DOF until a recorded given pins it, ADR-052). Distinct letters stay the
        // honest under-determination refusal (#325 lifts this only for EXISTING points,
        // where the solid gives the symbols a figure to ride).
        const letters = [...new Set((cmd.syms ?? []).flatMap((s) => (s !== null ? [s] : [])))];
        // ADR-3D-094 (#276): NO letters at all means the nulls are simply UNSTATED numeric
        // components («D על החלק החיובי של ציר ה-x» → y=z=0, x free) — the M1 dual of the
        // existing-point partial PIN: a NEW id becomes a `partial` point whose null
        // components are free sampled DOFs (the on-plane/on-line rider shape, axis edition;
        // a stated sign-given selects the sample's sign at resolve time).
        if (letters.length === 0) {
          const next = clone(c);
          next.points.set(cmd.id, { kind: 'partial', x: cmd.x, y: cmd.y, z: cmd.z });
          return { ok: true, next };
        }
        if (letters.length === 1) {
          const sym = letters[0];
          if (c.param && c.param !== sym) return { ok: false, error: { code: 'two-params' } };
          // #801: the third site of the one-owner-per-letter rule. A coord-sym point DEFINES its letter
          // as the figure parameter, so unlike a line/plane equation (whose numbers the owner can simply
          // supply) it cannot be routed — a letter the pivot already owns is refused rather than reborn
          // in a second mechanism. The mirror of #794's injection guard.
          if (pinSymsOf(c).includes(sym)) return { ok: false, error: { code: 'two-params' } };
          // #325: a coefficient/const on the symbol (`M(2k,1,3)`) flows into the LinExpr
          const exprs = cmd.symExprs ?? [null, null, null];
          const comp = (v: number | null, s: string | null, e: SymComp | null): { k: number; p: number } =>
            v !== null ? { k: v, p: 0 } : e ? { k: e.c, p: e.k } : s ? { k: 0, p: 1 } : { k: 0, p: 0 };
          const next = clone(c);
          next.points.set(cmd.id, {
            kind: 'coord-sym',
            x: comp(cmd.x, cmd.syms![0], exprs[0]),
            y: comp(cmd.y, cmd.syms![1], exprs[1]),
            z: comp(cmd.z, cmd.syms![2], exprs[2]),
          });
          next.param = sym;
          return { ok: true, next };
        }
        return { ok: false, error: { code: 'symbolic-new-point', id: cmd.id } }; // a NEW point needs numbers
      }
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'coord', x: cmd.x, y: cmd.y, z: cmd.z });
      return { ok: true, next };
    }

    case 'coord-plane-rel': {
      // #324 (ADR-3D-079): the named ring's relation to a COORDINATE plane/axis is a GIVEN —
      // a pivot residual family (drives the free gauge/dims, like injections) + a recorded
      // claim (the final arbiter on the final coordinates, the ADR-3D-030 pattern).
      // The definite bare «הבסיס» (ids []) resolves to THE one solid's base ring here, where
      // the figure is known (the ADR-3D-048 context-at-apply pattern).
      let ids = cmd.ids;
      if (ids.length === 0) {
        if (c.solids.length !== 1) return { ok: false, error: { code: 'no-such-solid', id: 'בסיס' } };
        const ring = baseRingOf(c.solids[0]);
        if (!ring) return { ok: false, error: { code: 'no-such-solid', id: 'בסיס' } };
        ids = ring;
      }
      const missing = missingPoint(c, ids);
      if (missing) return { ok: false, error: missing };
      if (ids.length < 3) return { ok: false, error: { code: 'unknown-point', id: ids[0] ?? '?' } };
      const next = clone(c);
      // #584 (ADR-3D-148): a STATED run materialises its plane (patch + display toggle); the bare
      // «הבסיס» form named no plane and the solid's base is already visible as its face — excluded.
      if (cmd.ids.length > 0) materializePlaneRun(next, ids);
      next.coordPlanePins.push({ ids, axis: cmd.axis, mode: cmd.mode });
      next.claims.push({ type: 'coord-plane-rel', ids, axis: cmd.axis, mode: cmd.mode });
      return { ok: true, next };
    }

    // #375: «מישור ACD אנך לישר ℓ1» — a POINT-RUN plane ⟂ a named LINE. Both operands must already
    // exist (M1: this is a statement ABOUT the figure, never a construction), and it lowers to the
    // ADR-3D-079 pair: a pin that drives the free gauge rotation + a claim that is the final arbiter.
    case 'plane-line-perp': {
      const missing = missingPoint(c, cmd.ids);
      if (missing) return { ok: false, error: missing };
      if (cmd.ids.length < 3) return { ok: false, error: { code: 'unknown-point', id: cmd.ids[0] ?? '?' } };
      const c2 = withFreeLines(c, [cmd.line]); // #552: «l ⊥ BCK» on an undeclared convention line creates it
      if (!c2.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      const next = clone(c2);
      // #383 (ADR-3D-109): the stated relation's point-run CARRIER is drawn (the ADR-3D-015 /
      // S3 rule) — without a drawn plane, the ADR-3D-097 patch-growth sweep has nothing to grow
      // to the crossing and the relation leaves no visible trace where the objects meet.
      materializePlaneRun(next, cmd.ids);
      next.planeLinePerps.push({ ids: [...cmd.ids], line: cmd.line, ...(cmd.statedAsPlane ? { statedAsPlane: true as const } : {}) });
      next.claims.push({ type: 'plane-line-perp', ids: [...cmd.ids], line: cmd.line });
      return { ok: true, next };
    }

    // S2 (#378, ADR-3D-103): ∥/⟂/angle with a NAMED LINE on one side — the whole named-line
    // column lowers to ONE family. The frame classifier routes each instance at evaluate by its
    // operands (gauge op → pivot residual; absolute op with a symbolic direction → parameter
    // root-find); the recorded claim is always the final arbiter, so no instance can escape
    // verification whatever lane it solves in.
    case 'line-rel': {
      // #552: BOTH sides may be undeclared convention lines («l1 ∥ l2» cold) — the subject and a
      // line-kind operand each auto-create; a later free line reads the earlier one's resolution.
      const c2 = withFreeLines(c, [cmd.line, ...(cmd.op.kind === 'line' ? [cmd.op.name] : [])]);
      const err = lineRelRefsError(c2, cmd.op, cmd.line);
      if (err) return { ok: false, error: err };
      const next = clone(c2);
      // a stated relation draws its operand (the ADR-3D-035 rule — the statement must leave ink)
      if (cmd.op.kind === 'segment') drawAtom(next, { kind: 'pair', from: cmd.op.a, to: cmd.op.b });
      // #383 (ADR-3D-109): a POINT-RUN operand is materialised as a drawn plane (the S3 rule,
      // plane-rel's exact block) — so the patch exists and grows to the line's crossing.
      if (cmd.op.kind === 'plane-run') materializePlaneRun(next, cmd.op.ids);
      // #523: a LABELLED angle NAMES the measure the question is about — «…היא α» states no value, so
      // it must not drive and must not be verified as a claim; it marks, and the panel derives its
      // degrees when the angle is seed-stable. Same semantics #319 gave the (segment × point-run)
      // form, now reached from every operand pairing rather than the one rule that happened to get it.
      if (cmd.label !== undefined) {
        if (!next.relMarks.some((mk) => mk.label === cmd.label && sameOperand(mk.a, { kind: 'line', name: cmd.line }) && sameOperand(mk.b, cmd.op)))
          next.relMarks.push({ a: { kind: 'line', name: cmd.line }, b: cmd.op, label: cmd.label });
        return { ok: true, next };
      }
      next.lineRels.push({
        rel: cmd.rel,
        ...(cmd.deg !== undefined ? { deg: cmd.deg } : {}),
        op: cmd.op,
        line: cmd.line,
        ...(cmd.statedAsPlane ? { statedAsPlane: true as const } : {}),
      });
      next.claims.push({ type: 'line-rel', rel: cmd.rel, ...(cmd.deg !== undefined ? { deg: cmd.deg } : {}), op: cmd.op, line: cmd.line });
      return { ok: true, next };
    }

    case 'mutual-rel': {
      const err = operandRefsError(c, cmd.a) ?? operandRefsError(c, cmd.b);
      if (err) return { ok: false, error: err };
      // a relation between an object and ITSELF says nothing — refuse rather than record a vacuous truth
      if (sameOperand(cmd.a, cmd.b)) return { ok: false, error: { code: 'vacuous-relation' } };
      const next = clone(c);
      // a stated relation draws its operands (the ADR-3D-035 rule — the statement must leave ink);
      // #584: a point-run operand materialises its plane like the sibling relation cases (the App3
      // display toggle already enumerated mutual-rel runs — the toggle now has a patch behind it)
      for (const op of [cmd.a, cmd.b]) {
        if (op.kind === 'segment') drawAtom(next, { kind: 'pair', from: op.a, to: op.b });
        if (op.kind === 'plane-run') materializePlaneRun(next, op.ids);
      }

      // (1) the REQUIREMENT — always. It carries `skew` entirely, and the open half (really meeting,
      // and meeting WITHIN the segments) of the closed relations. Sample-and-gate, never least-squares.
      next.requirements.push({ kind: 'mutual', rel: cmd.rel, a: cmd.a, b: cmd.b });

      // (2) the DRIVE — only for a CLOSED relation whose operands both ride the gauge (the frame
      // classifier, docs/26 §2.3). A relation against an ABSOLUTE object would have to MOVE the
      // figure, which is the pivot's lane, not a similarity-invariant pin's; it stays claim-gated.
      if (cmd.rel !== 'skew' && !isAbsolute(cmd.a) && !isAbsolute(cmd.b)) {
        next.scalarPins.push({ kind: 'mutual', rel: cmd.rel, a: cmd.a, b: cmd.b });
      }

      // (3) the CLAIM — the final arbiter on the finished figure, per the ADR-3D-079 shape
      next.claims.push({ type: 'mutual-rel', rel: cmd.rel, a: cmd.a, b: cmd.b });
      return { ok: true, next };
    }

    case 'plane-rel': {
      const err = operandRefsError(c, cmd.a) ?? operandRefsError(c, cmd.b);
      if (err) return { ok: false, error: err };
      if (sameOperand(cmd.a, cmd.b)) return { ok: false, error: { code: 'vacuous-relation' } };
      const next = clone(c);
      // the statement leaves ink; a POINT-RUN side is also materialised as a plane so the patch
      // exists to grow toward the other operand (#383 — a stated relation must leave a visible trace)
      for (const op of [cmd.a, cmd.b]) {
        if (op.kind === 'segment') drawAtom(next, { kind: 'pair', from: op.a, to: op.b });
        if (op.kind === 'plane-run') materializePlaneRun(next, op.ids);
      }
      // #523: a LABELLED angle NAMES the measure rather than stating one — it marks, never drives or
      // verifies (the #319 semantics, now reachable from every operand pairing).
      if (cmd.label !== undefined) {
        if (!next.relMarks.some((mk) => mk.label === cmd.label && sameOperand(mk.a, cmd.a) && sameOperand(mk.b, cmd.b)))
          next.relMarks.push({ a: cmd.a, b: cmd.b, label: cmd.label });
        return { ok: true, next };
      }
      /**
       * #839 (ADR-3D-191) — CONTAINMENT OF A SEGMENT DRIVES THROUGH ITS ENDPOINTS.
       *
       * The `plane-rel` pin below solves the GAUGE and the shape DIMS — it moves the whole figure. A
       * free point's position is SAMPLED, not part of that unknown vector, so the pin can verify a
       * containment and can never bring a loose endpoint into the plane: «BE מוכל במישור ABCD» with a
       * free `E` came back `claim-refuted` instead of placing E (operator, 2026-08-31).
       *
       * #614's analysis pointed at memberships, and measurement said one step further: a membership on
       * an ALREADY-SAMPLED point only verifies it. What actually removes the freedom is re-homing the
       * point itself — a `free3` endpoint becomes an `on-plane` RIDER, which `evaluate` already places
       * and already counts as **2 degrees of freedom instead of 3** (`evaluate.ts:765`). That is the
       * operator's sentence made literal: *"having it part of ABCD should limit the degree of freedom
       * even more."* The relation's own claim stays, so the panel and the verdict are unchanged.
       */
      if (cmd.rel === 'contained') {
        const planeSide = isPlanar(cmd.a) ? cmd.a : cmd.b;
        const linear = planeSide === cmd.a ? cmd.b : cmd.a;
        const planeName =
          planeSide.kind === 'plane-run' ? planeSide.ids.join('')
          : planeSide.kind === 'plane-named' ? planeSide.name
          : null;
        if (planeName !== null && linear.kind === 'segment') {
          for (const id of [linear.a, linear.b]) {
            // ONLY a point the figure leaves free is re-homed. A bound endpoint (a solid vertex, a
            // midpoint, a foot) already has an owner and keeps it — re-kinding one would unbind it
            // from the construction that defines it, and its containment is the CLAIM's business.
            // `implied` (#841): the student did not state this rider, the relation did — so a later
            // real definition of the point replaces it instead of colliding with it.
            if (next.points.get(id)?.kind === 'free3') next.points.set(id, { kind: 'on-plane', plane: planeName, implied: true });
          }
        }
      }
      // the DRIVE — only when both operands ride the gauge (an absolute side would have to MOVE the
      // figure, which is the pivot's lane; those instances stay claim-verified, see #386's sibling)
      if (!isAbsolute(cmd.a) && !isAbsolute(cmd.b)) {
        next.scalarPins.push({ kind: 'plane-rel', rel: cmd.rel, ...(cmd.deg !== undefined ? { deg: cmd.deg } : {}), a: cmd.a, b: cmd.b });
      }
      next.claims.push({ type: 'plane-rel', rel: cmd.rel, ...(cmd.deg !== undefined ? { deg: cmd.deg } : {}), a: cmd.a, b: cmd.b });
      return { ok: true, next };
    }

    case 'distance-rel': {
      const err = operandRefsError(c, cmd.a) ?? operandRefsError(c, cmd.b);
      if (err) return { ok: false, error: err };
      if (sameOperand(cmd.a, cmd.b)) return { ok: false, error: { code: 'vacuous-relation' } };
      const next = clone(c);
      for (const op of [cmd.a, cmd.b]) {
        if (op.kind === 'segment') drawAtom(next, { kind: 'pair', from: op.a, to: op.b });
        if (op.kind === 'plane-run') materializePlaneRun(next, op.ids);
      }
      // A distance carries UNITS, so it is meaningful against an absolute object too — but the
      // gauge×absolute DRIVE is the pivot's lane (#386); those instances stay claim-verified.
      if (!isAbsolute(cmd.a) && !isAbsolute(cmd.b)) next.scalarPins.push({ kind: 'distance', a: cmd.a, b: cmd.b, value: cmd.value });
      next.claims.push({ type: 'distance-rel', a: cmd.a, b: cmd.b, value: cmd.value });
      return { ok: true, next };
    }

    case 'param-sign': {
      // #325: the sign given also applies to a PIN symbol (`t פרמטר חיובי` after `B(2t,t,k)`) —
      // it selects among pivot solutions the way it selects among root branches for c.param.
      // #814 (ADR-3D-175): the THIRD thing a letter can be. Beside the figure parameter and a pin
      // symbol, a letter may NAME a free component («D(3,p,0)» — D's y is unknown and the student
      // called it p). That letter is not a solver unknown and never was; the sign it carries is the
      // component branch selection the engine already performs, so it lowers to exactly that rather
      // than refusing a given the student made.
      if (c.param !== cmd.sym && !pinSymsOf(c).includes(cmd.sym)) {
        const bound = partialNameOf(c, cmd.sym);
        if (!bound) return { ok: false, error: { code: 'unknown-symbol', id: cmd.sym } };
        const next = clone(c);
        next.componentSigns.push({ target: bound.target, axis: bound.axis, positive: cmd.positive });
        return { ok: true, next };
      }
      const next = clone(c);
      next.paramSigns.push(cmd);
      return { ok: true, next };
    }

    case 'inject-vector': {
      if (!c.vectors.has(cmd.name)) return { ok: false, error: { code: 'unknown-vector', id: cmd.name } };
      // #794 (ADR-3D-168): symbolic components join exactly as point3 pins do — same combine, same
      // one-namespace-per-role guard. #801: the letter RE-HOMES to the pivot when the algebraic lane
      // has no claim on it, so the same statements build in either order; refused only when both lanes
      // genuinely resolve it.
      const exprs = cmd.symExprs ?? [null, null, null];
      const adopted = adoptParamAsPinSym(c, exprs);
      if (!adopted) return { ok: false, error: { code: 'two-params' } };
      const next = clone(adopted);
      const comp = (v: number | null, e: SymComp | null): number | null | SymComp => (v !== null ? v : e);
      const comps: [number | null | SymComp, number | null | SymComp, number | null | SymComp] =
        [comp(cmd.x, exprs[0]), comp(cmd.y, exprs[1]), comp(cmd.z, exprs[2])];
      next.vectorPins.push({ name: cmd.name, x: comps[0], y: comps[1], z: comps[2] });
      bindPartialNames(next, { kind: 'vector', name: cmd.name }, cmd.syms, comps); // #814
      return { ok: true, next };
    }

    case 'sign-given': {
      if (!c.points.has(cmd.id)) return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
      const next = clone(c);
      next.signGivens.push(cmd);
      return { ok: true, next };
    }

    case 'plane-through': {
      const missing = missingPoint(c, cmd.ids);
      if (missing) return { ok: false, error: missing };
      if (cmd.ids.length < 3) return { ok: false, error: { code: 'unknown-point', id: cmd.ids[0] ?? '?' } };
      const existing = c.pointPlanes.get(cmd.name);
      if (existing) {
        // idempotent when it names the same point set; a DIFFERENT set under the same name refuses
        return existing.join(',') === cmd.ids.join(',')
          ? { ok: true, next: c }
          : { ok: false, error: { code: 'already-defined', id: cmd.name } };
      }
      if (c.planes.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      const next = clone(c);
      next.pointPlanes.set(cmd.name, cmd.ids);
      return { ok: true, next };
    }

    case 'plane3': {
      // #487 (M1, the plane3 edition): an equation stated for an already-FREE plane is not a clash —
      // it is the given that PINS it. The free placeholder yields to the stated equation.
      const existing = c.planes.get(cmd.name);
      if (existing && !existing.free) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      // #801: the line3 routing, verbatim — the same letter question, the same owner.
      const lane = paramLane(c, cmd.param);
      if (lane.figureParam && c.param && lane.figureParam !== c.param) return { ok: false, error: { code: 'two-params' } };
      const next = clone(c);
      next.planes.set(cmd.name, lane.sym ? { ...cmd.plane, sym: lane.sym } : cmd.plane);
      if (lane.figureParam) next.param = lane.figureParam;
      return { ok: true, next };
    }

    case 'free-plane': {
      // #487 (ADR-3D-124): «מישור π2» — a named plane with NOTHING yet known about it. Idempotent when
      // the free plane already exists (re-declaring is the deterministic-id convention); a clash with a
      // DEFINED plane of any lane (or a line) is refused — the name is taken by an object that is not
      // "free to be told about later".
      if (c.planes.get(cmd.name)?.free) return { ok: true, next: c };
      if (c.planes.has(cmd.name) || c.pointPlanes.has(cmd.name) || c.relPlanes.has(cmd.name) || c.lines.has(cmd.name))
        return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      const next = clone(c);
      next.planes.set(cmd.name, freePlaneDef(cmd.name));
      return { ok: true, next };
    }

    case 'free-line': {
      // #552 — «ישר k» / bare «l1»: a named line with NOTHING yet known about it (the free-plane
      // case, line edition). Idempotent on an existing FREE line; a name taken by a defined line, a
      // through-line, a plane of any lane or a named VECTOR (a line named `u` beside vector `u`
      // would make every later mention ambiguous) is refused — it is not free to be told about later.
      if (c.lines.get(cmd.name)?.kind === 'free') return { ok: true, next: c };
      if (c.lines.has(cmd.name) || c.pointLines.has(cmd.name) || c.planes.has(cmd.name) || c.pointPlanes.has(cmd.name) || c.vectors.has(cmd.name))
        return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      const next = clone(c);
      next.lines.set(cmd.name, { kind: 'free' });
      return { ok: true, next };
    }

    case 'plane-angle': {
      for (const p of [cmd.p1, cmd.p2]) {
        if (!c.planes.has(p)) return { ok: false, error: { code: 'unknown-plane', id: p } };
        // #487 honest boundary: an angle given between planes drives the PARAMETER machinery, which
        // reads equations — a FREE plane has none, and its placeholder would fabricate roots. Pinning a
        // free plane's orientation to a stated dihedral angle is the follow-up on the issue, not silent
        // wrongness here.
        if (c.planes.get(p)!.free) return { ok: false, error: { code: 'plane-not-determined', id: p } };
      }
      const next = clone(c);
      next.planeAngles.push(cmd);
      return { ok: true, next };
    }

    case 'on-planes': {
      // #487 ruling 1 (ADR-3D-124): a membership naming an UNDECLARED plane CREATES it as a free plane —
      // the operator chose the forgiving incremental flow over refuse-with-guidance, accepting that a
      // typo'd name conjures a plane. Bounded by ruling 2 at the grammar: every on-planes rule requires
      // the plane NOUN («על המישור π2»), so no bare-symbol path can create anything. Only a NAMED-plane
      // token (π-style) qualifies — a missing point-run name (ABC) still means mistyped labels, refused.
      const autoCreate =
        cmd.plane !== 'any' && !c.planes.has(cmd.plane) && !c.pointPlanes.has(cmd.plane) && FREE_PLANE_TOKEN.test(cmd.plane);
      if (!autoCreate && cmd.plane !== 'any' && !c.planes.has(cmd.plane) && !c.pointPlanes.has(cmd.plane))
        return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      if (!c.points.has(cmd.id)) {
        // M1 dual (the 2-D ADR-236 shape): a NEW id stated onto — or above/below — a NAMED
        // plane is CREATED as a free point riding it (2 DOF; 3 with a stated side)
        if (cmd.plane === 'any') return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
        const next = clone(c);
        if (autoCreate) next.planes.set(cmd.plane, freePlaneDef(cmd.plane));
        next.points.set(
          cmd.id,
          cmd.side
            ? { kind: 'on-plane', plane: cmd.plane, side: cmd.side === 'above' ? 1 : -1 }
            : { kind: 'on-plane', plane: cmd.plane },
        );
        return { ok: true, next };
      }
      // #815: a stated membership against an algebraic-lane plane re-homes its letter to the pivot (a side
      // given is an inequality — sampled + verified, never driven — so it opens no door)
      if (!cmd.side && cmd.plane !== 'any') c = adoptParamForCarrier(c, { kind: 'plane', name: cmd.plane });
      const next = clone(c);
      if (autoCreate) next.planes.set(cmd.plane, freePlaneDef(cmd.plane));
      next.memberships.push(cmd);
      return { ok: true, next };
    }

    case 'foot-on-plane': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (!c.points.has(cmd.from)) return { ok: false, error: { code: 'unknown-point', id: cmd.from } };
      if (!c.planes.has(cmd.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'foot-plane', from: cmd.from, plane: cmd.plane });
      next.segments.push([cmd.from, cmd.id]); // the dropped perpendicular is drawn
      return { ok: true, next };
    }

    case 'plane-plane-line': {
      for (const p of [cmd.p1, cmd.p2]) {
        if (!c.planes.has(p) && !c.pointPlanes.has(p)) return { ok: false, error: { code: 'unknown-plane', id: p } };
      }
      // #333 (ADR-3D-153), operator ruling 2026-07-25: students name both intersection lines `ℓ` —
      // the generic line symbol. A collision is resolved by AUTO-INDEXING to the next free `ℓN` with
      // a notice, never by a bare `already-defined` the student cannot act on. Resolved HERE because
      // only apply knows which names are taken (`parse3` is context-free) — the ADR-3D-048 pattern.
      const samePair = (d: Line3Def | undefined): boolean =>
        !!d && d.kind === 'plane-plane' && ((d.p1 === cmd.p1 && d.p2 === cmd.p2) || (d.p1 === cmd.p2 && d.p2 === cmd.p1));
      // an IDENTICAL restatement is an M1 no-op — the same line, said twice, is one line
      if (cmd.name !== undefined && samePair(c.lines.get(cmd.name))) return { ok: true, next: c };
      const taken = (n: string): boolean => c.lines.has(n) || c.pointLines.has(n);
      let name = cmd.name;
      if (name === undefined || taken(name)) {
        // the pool is the line-naming convention itself: ℓ, then ℓ1, ℓ2, … (ADR-3D-038)
        let free: string | undefined;
        for (let i = 0; i <= c.lines.size + c.pointLines.size + 1; i++) {
          const cand = i === 0 ? 'ℓ' : `ℓ${i}`;
          if (!taken(cand)) { free = cand; break; }
        }
        if (!free) return { ok: false, error: { code: 'already-defined', id: name ?? 'ℓ' } };
        // the student's own name is kept only when it differs — that difference IS the notice
        const requested = name !== undefined && name !== free ? name : undefined;
        const next = clone(c);
        next.lines.set(free, { kind: 'plane-plane', p1: cmd.p1, p2: cmd.p2, ...(requested ? { requested } : {}) });
        return { ok: true, next };
      }
      const next = clone(c);
      next.lines.set(name, { kind: 'plane-plane', p1: cmd.p1, p2: cmd.p2 });
      return { ok: true, next };
    }

    // V8-h (G8): the common perpendicular of two lines — resolved from the two (already-named) lines.
    case 'line-common-perp': {
      if (c.lines.has(cmd.name) || c.pointLines.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      for (const ln of [cmd.line1, cmd.line2]) {
        if (!c.lines.has(ln) && !c.pointLines.has(ln)) return { ok: false, error: { code: 'unknown-line', id: ln } };
      }
      const next = clone(c);
      next.lines.set(cmd.name, { kind: 'common-perp', line1: cmd.line1, line2: cmd.line2 });
      return { ok: true, next };
    }

    // V8-h (G8): the projection of a line onto a plane.
    case 'line-projection': {
      if (c.lines.has(cmd.name) || c.pointLines.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      if (!c.lines.has(cmd.line) && !c.pointLines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      if (!c.planes.has(cmd.plane) && !c.pointPlanes.has(cmd.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      const next = clone(c);
      next.lines.set(cmd.name, { kind: 'line-projection', line: cmd.line, plane: cmd.plane });
      return { ok: true, next };
    }

    case 'foot-on-line': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (!c.points.has(cmd.from)) return { ok: false, error: { code: 'unknown-point', id: cmd.from } };
      if (!c.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'foot-line', from: cmd.from, line: cmd.line });
      next.segments.push([cmd.from, cmd.id]);
      return { ok: true, next };
    }

    // --- V3: parameters in lines ---

    case 'line3': {
      if (c.lines.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      // #801: the letter routes to its OWNER (`paramLane`) — a pin symbol stays the pivot's, and only
      // an unowned letter is a new figure parameter. Two figure parameters are still refused.
      const lane = paramLane(c, cmd.param);
      if (lane.figureParam && c.param && lane.figureParam !== c.param) return { ok: false, error: { code: 'two-params' } };
      const next = clone(c);
      next.lines.set(cmd.name, {
        kind: 'parametric', anchor: cmd.anchor, dir: cmd.dir, src: cmd.src,
        ...(cmd.runner ? { runner: cmd.runner } : {}), ...(lane.sym ? { sym: lane.sym } : {}),
      });
      if (lane.figureParam) next.param = lane.figureParam;
      return { ok: true, next };
    }

    case 'line-perp-plane': {
      const c2 = withFreeLines(c, [cmd.line]); // #552: «l ⊥ π» on an undeclared convention line creates it
      if (!c2.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      if (!c2.planes.has(cmd.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      const next = clone(c2);
      next.linePerps.push(cmd);
      // S2 (#378): when NEITHER direction carries the figure parameter there is nothing to pin —
      // the statement is a pure claim, so record it (M1 duality): a false numeric ⟂ now refuses
      // `claim-refuted` instead of silently passing. With a parameter in play the root-find's
      // `no-roots` refusal is the arbiter, and a recorded claim would double-report.
      if (!lineDirCarriesParam(c, cmd.line) && !planeNormalCarriesParam(c, cmd.plane)) {
        next.claims.push({ type: 'line-rel', rel: 'perp', op: { kind: 'plane-named', name: cmd.plane }, line: cmd.line });
      }
      return { ok: true, next };
    }

    case 'line-plane-point': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (!c.lines.has(cmd.line) && !c.pointLines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      if (!c.planes.has(cmd.plane) && !c.pointPlanes.has(cmd.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'line-plane', line: cmd.line, plane: cmd.plane });
      return { ok: true, next };
    }

    case 'on-line': {
      // #552 (the on-planes shape exactly): a membership naming an undeclared convention line creates it
      const c0 = withFreeLines(c, [cmd.line]);
      if (!c0.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      c = c0;
      if (!c.points.has(cmd.id)) {
        // M1 dual (ADR-3D-031, the on-planes shape): a NEW id stated onto a named line is
        // CREATED as a free rider (1 sampled DOF); the store's status pass still checks
        // membership on final coordinates, so nothing escapes verification
        const next = clone(c);
        next.points.set(cmd.id, { kind: 'on-line', line: cmd.line });
        return { ok: true, next };
      }
      c = adoptParamForCarrier(c, { kind: 'line', name: cmd.line }); // #815: the letter re-homes through the membership door
      const next = clone(c);
      // M1 (ADR-3D-031 Am., the ADR-3D-030 shape): an EXISTING point stated onto a NUMERIC
      // typed line on a SOLID-bearing figure is ALSO a GIVEN — a point on a line is a point
      // on TWO planes through it, so the statement lowers to two plane pins and the whole
      // plane-drive machinery (normal-solve exclusion, unmet check, failure-path retry,
      // Stage-A placement, degeneracy filter) absorbs it with no new solver code. The
      // onLines record is KEPT (below) — the store's not-on-line check on final
      // coordinates is the arbiter either way.
      const lineDef = c.lines.get(cmd.line)!;
      if (lineDef.kind === 'parametric' && c.solids.length > 0) {
        const num = (e: LinExpr): number | null => (e.p === 0 ? e.k : null);
        const a = lineDef.anchor.map(num);
        const d = lineDef.dir.map(num);
        if (a.every((x) => x !== null) && d.every((x) => x !== null)) {
          const anchor = v3(a[0]!, a[1]!, a[2]!);
          const u = normalize3(v3(d[0]!, d[1]!, d[2]!));
          const axisSeed = Math.abs(u.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
          const e1 = normalize3(cross3(u, axisSeed));
          const e2 = cross3(u, e1);
          for (const n of [e1, e2]) next.planePins.push({ ids: [cmd.id], cx: n.x, cy: n.y, cz: n.z, d: -dot3(n, anchor) });
        }
      }
      next.onLines.push(cmd);
      return { ok: true, next };
    }

    case 'line-through': {
      if (c.lines.has(cmd.name) || c.pointLines.has(cmd.name)) {
        const existing = c.pointLines.get(cmd.name);
        return existing && existing.a === cmd.a && existing.b === cmd.b
          ? { ok: true, next: c } // idempotent for the same pair
          : { ok: false, error: { code: 'already-defined', id: cmd.name } };
      }
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.pointLines.set(cmd.name, { a: cmd.a, b: cmd.b });
      return { ok: true, next };
    }

    // --- V7: vector relations (the M1 reinterpretation shape) ---

    case 'vec-rel': {
      // `AB = u` WITHOUT נסמן: a bare pair equated to one UNKNOWN name, coefficient 1,
      // is the student NAMING the vector (M1 — apply decides; a KNOWN name stays a claim)
      if (
        cmd.terms.length === 1 &&
        cmd.terms[0].atom.kind === 'named' &&
        !cmd.symbol &&
        cmd.terms[0].coeff.k === 1 &&
        cmd.terms[0].coeff.p === 0 &&
        !c.vectors.has(cmd.terms[0].atom.name) &&
        c.points.has(cmd.from) &&
        c.points.has(cmd.to)
      ) {
        return applyCommand3(c, { type: 'name-vector', name: cmd.terms[0].atom.name, from: cmd.from, to: cmd.to });
      }
      // named vectors must exist
      for (const t of cmd.terms) {
        if (t.atom.kind === 'named' && !c.vectors.has(t.atom.name)) {
          return { ok: false, error: { code: 'unknown-vector', id: t.atom.name } };
        }
      }
      const unknowns = [...new Set(relPointIds(c, cmd.from, cmd.to, cmd.terms).filter((id) => !c.points.has(id)))];
      if (unknowns.length === 0) {
        // the CEVIAN pair: a second symbol-relation naming an already vec-defined point
        if (cmd.symbol) {
          const target = relPointIds(c, cmd.from, cmd.to, cmd.terms).find((id) => {
            const d = c.points.get(id);
            return d?.kind === 'vec-defined' && c.vecDefs[d.def].symbol !== undefined && !c.symbolPins.some((p) => p.def === d.def);
          });
          if (target) {
            const d = c.points.get(target) as { kind: 'vec-defined'; def: number };
            const next = clone(c);
            const def2 = next.vecDefs.length;
            next.vecDefs.push({ from: cmd.from, to: cmd.to, terms: cmd.terms, unknown: target, symbol: cmd.symbol });
            next.points.set(target, { kind: 'vec-pair', def1: d.def, def2 });
            return { ok: true, next };
          }
          return { ok: false, error: { code: 'no-solution', id: cmd.from } };
        }
        const asClaim = applyCommand3(c, {
          type: 'claim',
          claim: { type: 'vec-eq', lhs: [{ coeff: 1, atom: { kind: 'pair', from: cmd.from, to: cmd.to } }], rhs: cmd.terms.map((t) => ({ coeff: t.coeff.k, atom: t.atom })) },
        });
        if (!asClaim.ok) return asClaim;
        // the stated vector is drawn (the V1 auto-draw convention, preserved through the relation path)
        if (hasSegment(asClaim.next, cmd.from, cmd.to)) return asClaim;
        const withSeg = clone(asClaim.next);
        withSeg.segments.push([cmd.from, cmd.to]);
        return { ok: true, next: withSeg };
      }
      if (unknowns.length > 1) return { ok: false, error: { code: 'two-unknowns', id: unknowns[1] } };
      const unknown = unknowns[0];
      const next = clone(c);
      const defIndex = next.vecDefs.length;
      next.vecDefs.push({ from: cmd.from, to: cmd.to, terms: cmd.terms, unknown, symbol: cmd.symbol });
      next.points.set(unknown, { kind: 'vec-defined', def: defIndex });
      if (!hasSegment(next, cmd.from, cmd.to)) next.segments.push([cmd.from, cmd.to]); // the stated vector is drawn
      return { ok: true, next };
    }

    case 'seg-plane-rel': {
      // plane: [] is the הבסיס/"the base" sentinel — resolve it HERE (the one
      // chokepoint) to the single solid's base ring; every kind lists its base first
      if (cmd.plane.length === 0 && c.solids.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: 'base' } };
      const plane = cmd.plane.length === 0 ? c.solids[0].ids.slice(0, 3) : cmd.plane;
      const missingPlane = missingPoint(c, plane);
      if (missingPlane) return { ok: false, error: missingPlane };
      // an endpoint that is a SYMBOLIC vec-defined point → this condition PINS its symbol
      for (const end of [cmd.a, cmd.b]) {
        const def = c.points.get(end);
        if (def?.kind === 'vec-defined') {
          const vd = c.vecDefs[def.def];
          if (vd.symbol && !c.symbolPins.some((p) => p.def === def.def)) {
            const other = end === cmd.a ? cmd.b : cmd.a;
            if (!c.points.has(other)) return { ok: false, error: { code: 'unknown-point', id: other } };
            const next = clone(c);
            next.symbolPins.push({ rel: cmd.rel, a: cmd.a, b: cmd.b, plane, def: def.def });
            next.segments.push([cmd.a, cmd.b]);
            return { ok: true, next };
          }
        }
      }
      // otherwise: ⟂ is the existing claim; ∥-to-plane as a claim is not yet demanded
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) {
        // #579 (ADR-3D-146): a ⟂-to-plane statement naming its segment where exactly ONE endpoint
        // is a not-yet-defined label («SO גובה הפירמידה», O new) uniquely determines the foot — it
        // is a creation, not a reference error. Delegate to the height-to-face funnel, the same
        // convergence the named-face, tetra-altitude and 2-D ADR-263 branches already made; the
        // unknown letter is the foot regardless of position (⟂ is symmetric, covers SO and OS).
        // ∥ with a new letter and both-unknown stay honest refusals — neither determines a point.
        const known = c.points.has(cmd.a) ? cmd.a : c.points.has(cmd.b) ? cmd.b : null;
        if (cmd.rel === 'perp' && known !== null && plane.length >= 3) {
          const foot = known === cmd.a ? cmd.b : cmd.a;
          return applyCommand3(c, { type: 'height-to-face', id: foot, from: known, face: plane });
        }
        return { ok: false, error: missing };
      }
      // V7 T2: on a figure with FREE dims the relation is a DRIVING given (M1)
      if (freeDims(c) > 0) {
        const next = clone(c);
        next.scalarPins.push({ kind: cmd.rel === 'perp' ? 'seg-perp-plane' : 'seg-par-plane', a: cmd.a, b: cmd.b, plane });
        if (!hasSegment(next, cmd.a, cmd.b)) next.segments.push([cmd.a, cmd.b]);
        return { ok: true, next };
      }
      // #380: a point-run plane is THREE OR FOUR labels — the `RUN_3_4` shape this product uses
      // everywhere, and what the S1 operand resolver already accepts (`newellNormal` over the whole
      // run). This branch demanded exactly 3, so a stated box FACE fell through to `no-solution`, and
      // that engine limitation is precisely why the parser had been truncating «MO ⊥ ABCD» to ABC —
      // a silent drop covering for a refusal. The claim's geometry needs three points to fix the
      // plane; the remaining labels of a well-formed run lie on it by construction.
      /**
       * #833 (ADR-3D-193) — ⟂ AND ∥ BOTH LOWER TO A CLAIM ON A DETERMINED FIGURE.
       *
       * ⟂ got this in #380; ∥ never did, and the comment above used to say so out loud
       * («∥-to-plane as a claim is not yet demanded»). The consequence was not a missing feature but
       * a FALSE NEGATIVE: with no free dims to drive, «AB מקביל למישור A'B'C'D'» on a cube — true by
       * construction, AB a bottom edge and A'B'C'D' the top face — fell off the end of this switch
       * into `no-solution` naming a point that was never the problem (the operator's `{"code":
       * "no-solution","id":"A"}`). `relationTable` had advertised `claim` for
       * `parallel|segment|plane-run` the whole time; nothing implemented it.
       *
       * The class, and what the locks state: a relation ENTAILED by the construction is never
       * refused — for ∥ and ⟂ alike, anchored and un-anchored. A search or lowering failure must
       * never be presented to a student as an impossibility (#816's honesty rule).
       */
      if (plane.length >= 3) {
        const claim = cmd.rel === 'perp' ? ('perp-plane' as const) : ('par-plane' as const);
        const asClaim = applyCommand3(c, { type: 'claim', claim: { type: claim, seg: [cmd.a, cmd.b], plane: [plane[0], plane[1], plane[2]] } });
        if (!asClaim.ok || hasSegment(asClaim.next, cmd.a, cmd.b)) return asClaim;
        const withSeg = clone(asClaim.next);
        withSeg.segments.push([cmd.a, cmd.b]); // the stated segment is drawn (V1 convention preserved)
        return { ok: true, next: withSeg };
      }
      return { ok: false, error: { code: 'no-solution', id: cmd.a } };
    }

    case 'length-rel': {
      // |a1b1| = c·|rhs| — the abs-value given. Routing (M1): a symbolic endpoint →
      // pins the symbol; free dims → a driving scalar pin (similarity-INVARIANT — a
      // ratio of lengths); fully pinned → a verified claim.
      const pair2: [Id, Id] | null =
        'pair' in cmd.rhs
          ? cmd.rhs.pair
          : (() => {
              const d = c.vectors.get((cmd.rhs as { vec: string }).vec);
              return d ? ([d.from, d.to] as [Id, Id]) : null;
            })();
      if (!pair2) return { ok: false, error: { code: 'unknown-vector', id: 'vec' in cmd.rhs ? cmd.rhs.vec : '?' } };
      const missing = missingPoint(c, [cmd.a1, cmd.b1, ...pair2]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      if (!hasSegment(next, cmd.a1, cmd.b1)) next.segments.push([cmd.a1, cmd.b1]);
      for (const end of [cmd.a1, cmd.b1, ...pair2]) {
        const def = next.points.get(end);
        if (def?.kind === 'vec-defined') {
          const vd = next.vecDefs[def.def];
          if (vd.symbol && !next.symbolPins.some((p) => p.def === def.def)) {
            next.symbolPins.push({ rel: 'length-rel', a: cmd.a1, b: cmd.b1, pair2, c: cmd.c, def: def.def });
            return { ok: true, next };
          }
        }
      }
      if (freeDims(next) > 0) {
        next.scalarPins.push({ kind: 'length-rel', a1: cmd.a1, b1: cmd.b1, a2: pair2[0], b2: pair2[1], c: cmd.c });
        return { ok: true, next };
      }
      next.claims.push({ type: 'length-rel', a1: cmd.a1, b1: cmd.b1, a2: pair2[0], b2: pair2[1], c: cmd.c });
      return { ok: true, next };
    }

    case 'vec-mag': {
      const d = c.vectors.get(cmd.name);
      if (!d) return { ok: false, error: { code: 'unknown-vector', id: cmd.name } };
      return applyCommand3(c, { type: 'claim', claim: { type: 'length-eq', a: d.from, b: d.to, value: cmd.value } });
    }

    case 'symbol-value': {
      // הציבו k = ½: pin the named parameter directly — replaces any prior pin on it
      // (the student substituting the value the earlier relation produced)
      const idx = c.vecDefs.findIndex((vd) => vd.symbol === cmd.symbol);
      if (idx < 0) {
        // ADR-3D-052 (#272) — the letter may instead name an ANGLE («∠SAB = α» then «α = 70»). Resolved
        // HERE, where the figure is known (parse3 is context-free), and delegated to the ordinary angle
        // claim so the value DRIVES a free-dim solid and VERIFIES a determined one (M1) like any other
        // stated angle. Every angle wearing the label is pinned — that is what sharing a name means.
        const marks = c.angleMarks.filter((m) => m.label === cmd.symbol);
        if (marks.length > 0) {
          let r: ApplyResult3 = { ok: true, next: c };
          for (const mk of marks) {
            if (!r.ok) return r;
            r = applyCommand3(r.next, { type: 'claim', claim: { type: 'angle-seg-eq', a1: mk.vertex, b1: mk.p, a2: mk.vertex, b2: mk.q, deg: cmd.value } });
          }
          return r;
        }
        return { ok: false, error: { code: 'unknown-symbol', id: cmd.symbol } };
      }
      const next = clone(c);
      next.symbolPins = next.symbolPins.filter((p) => p.def !== idx);
      next.symbolPins.push({ rel: 'value', value: cmd.value, def: idx });
      return { ok: true, next };
    }

    // #587 (ADR-3D-152): `ABEC מלבן` is the RECTANGLE instance of the general stated-quad-shape
    // command — one vocabulary, one semantics. Kept as its own command type so saved `.geo3.json`
    // files written before this land, and the three frozen phrasings, keep working unchanged.
    case 'rect-complete':
      return applyCommand3(c, { type: 'quad-shape', base: 'rectangle', ids: cmd.ids });

    case 'quad-shape': {
      // The three arms of a stated flat quad shape, dispatched on how many corners already exist —
      // HERE and not in the parser, because `parse3` is context-free and cannot know.
      const unknowns = cmd.ids.filter((id) => !c.points.has(id));
      const constraints = quadShapeConstraints(cmd.base, cmd.ids);
      /** Lower the family's constraint set; M1 routes each command to a drive or a verification. */
      const lower = (from: Construction3): ApplyResult3 => {
        let r: ApplyResult3 = { ok: true, next: from };
        for (const k of constraints) {
          if (!r.ok) return r;
          r = applyCommand3(r.next, k);
        }
        return r;
      };
      /** The ring's ink — a stated shape must leave a visible trace (the ADR-3D-035 rule). */
      const drawRing = (from: Construction3): Construction3 => {
        const next = clone(from);
        for (let j = 0; j < 4; j++) {
          const [a, b] = [cmd.ids[j], cmd.ids[(j + 1) % 4]];
          if (!hasSegment(next, a, b)) next.segments.push([a, b]);
        }
        return next;
      };

      // ARM 3 — all four known: a STATEMENT about existing points (the operator's own case, «ABCD
      // ריבוע» on a pyramid's square base). The constraints M1-route to claims on a determined
      // figure, so a FALSE statement is refused by claim verification rather than drawn.
      if (unknowns.length === 0) {
        // #612 (ADR-3D-158), operator ruling 2026-08-15 — "naming error". Before lowering anything,
        // ask what the ring is ALREADY KNOWN to be. Structural knowledge only (a solid's base kind, or
        // a shape stated earlier) — never a measurement, so this can only fire on a shape the figure
        // demonstrably has, and a ring that is a square by coincidence is left alone.
        const known = knownQuadShape(c, cmd.ids);
        if (known) {
          // the ring already IMPLIES what was said. Two different situations, and the difference is
          // the whole ruling: the same name adds nothing, a LESS SPECIFIC name is a mis-naming.
          if (quadImplies(known, cmd.base)) {
            if (known === cmd.base) {
              // redundant — true, already known, changes nothing. Recorded so `buildNotices3` can say
              // so; the figure is returned untouched rather than accumulating inert pins.
              const next = clone(c);
              if (!next.redundantShapes.some((r) => r.base === cmd.base && sameRing(r.ids, cmd.ids)))
                next.redundantShapes.push({ base: cmd.base, ids: [...cmd.ids] });
              return { ok: true, next };
            }
            return { ok: false, error: { code: 'shape-less-specific', stated: cmd.base, actual: known } };
          }
          // NOT implied ⇒ the statement is new information (a rectangle told it is a square). It
          // drives, exactly as before — refusing here would mean a student could never SPECIALISE a
          // shape they had already drawn, which is ADR-052 upside down.
        }
        const r = lower(c);
        return r.ok ? { ok: true, next: recordShape(drawRing(r.next), cmd.base, cmd.ids) } : r;
      }

      // ARM 2 — exactly one unknown corner, completed FROM THE FAMILY'S OWN DEFINITION.
      // Only the parallelogram family determines the fourth corner as the parallelogram point; a
      // KITE determines it differently (the reflection of `b` across the axis `ac`, #601) and a
      // TRAPEZOID/general QUAD does not determine it at all — one free DOF the student never
      // stated. Completing those anyway would assert an unstated given, the ADR-052 cardinal sin,
      // so they refuse honestly and name the corner instead.
      if (unknowns.length === 1) {
        const PARALLELOGRAM_FAMILY: QuadBase[] = ['square', 'rectangle', 'rhombus', 'parallelogram'];
        if (!PARALLELOGRAM_FAMILY.includes(cmd.base)) {
          return { ok: false, error: { code: 'unknown-point', id: unknowns[0] } };
        }
        const i = cmd.ids.indexOf(unknowns[0]);
        const opp = cmd.ids[(i + 2) % 4];
        const n1 = cmd.ids[(i + 1) % 4];
        const n2 = cmd.ids[(i + 3) % 4];
        const asDef = applyCommand3(c, {
          type: 'vec-rel',
          from: opp,
          to: unknowns[0],
          terms: [
            { coeff: { k: 1, p: 0 }, atom: { kind: 'pair', from: opp, to: n1 } },
            { coeff: { k: 1, p: 0 }, atom: { kind: 'pair', from: opp, to: n2 } },
          ],
        });
        if (!asDef.ok) return asDef;
        // the corner is now DERIVED, so every constraint lands on a determined ring and verifies —
        // a ring that isn't the stated shape refuses it honestly (today's rectangle behaviour, now
        // for four nouns instead of one).
        const r = lower(asDef.next);
        return r.ok ? { ok: true, next: recordShape(drawRing(r.next), cmd.base, cmd.ids) } : r;
      }

      // ARM 1 — two or more unknown corners: a DECLARATION. The flat `polygon4` is itself the
      // carrier of the four free dims, so declare it and let the constraint set take them away;
      // whatever the family does not state stays free and sampled (ADR-052).
      const declared = applyCommand3(c, { type: 'solid', kind: 'polygon4', ids: cmd.ids });
      if (!declared.ok) return declared;
      const r = lower(declared.next);
      return r.ok ? { ok: true, next: recordShape(drawRing(r.next), cmd.base, cmd.ids) } : r;
    }

    case 'dot-given': {
      for (const nm of [cmd.v1, cmd.v2]) {
        if (!c.vectors.has(nm)) return { ok: false, error: { code: 'unknown-vector', id: nm } };
      }
      const next = clone(c);
      next.scalarPins.push({ kind: 'dot', v1: cmd.v1, v2: cmd.v2, value: cmd.value });
      return { ok: true, next };
    }

    case 'inject-pair': {
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      // #794 (ADR-3D-168): same symbolic-component path as inject-vector / point3 pins — and the same
      // #801 re-homing, so a pair injection after a line equation in the same letter is not order-bound.
      const exprs = cmd.symExprs ?? [null, null, null];
      const adopted = adoptParamAsPinSym(c, exprs);
      if (!adopted) return { ok: false, error: { code: 'two-params' } };
      const next = clone(adopted);
      const comp = (v: number | null, e: SymComp | null): number | null | SymComp => (v !== null ? v : e);
      const comps: [number | null | SymComp, number | null | SymComp, number | null | SymComp] =
        [comp(cmd.x, exprs[0]), comp(cmd.y, exprs[1]), comp(cmd.z, exprs[2])];
      next.pairPins.push({ a: cmd.a, b: cmd.b, x: comps[0], y: comps[1], z: comps[2] });
      bindPartialNames(next, { kind: 'pair', a: cmd.a, b: cmd.b }, cmd.syms, comps); // #814
      return { ok: true, next };
    }

    // V8-i (G13): a circle in R³. `tangent-line`: centered at `center`, in the plane through the
    // centre & the line, tangent to it — the touch point is the ⟂ foot of the centre onto the line.
    case 'circle3': {
      if (c.circles3.some((k) => k.id === cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (cmd.def.kind === 'circum' || cmd.def.kind === 'incircle') {
        // #442: every ring vertex must exist — the circle is DERIVED from them (M1: the statement is
        // about the polygon the student already drew, never a re-creation of its vertices).
        const missingRing = missingPoint(c, cmd.def.ring);
        if (missingRing) return { ok: false, error: missingRing };
        if (cmd.def.kind === 'incircle' && cmd.def.ring.length !== 3)
          return { ok: false, error: { code: 'incircle-needs-triangle' } };
      } else if (cmd.def.kind === 'tangent-line') {
        if (!c.points.has(cmd.def.center)) return { ok: false, error: { code: 'unknown-point', id: cmd.def.center } };
        if (!c.lines.has(cmd.def.line) && !c.pointLines.has(cmd.def.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.def.line } };
      } else {
        if (!c.points.has(cmd.def.center)) return { ok: false, error: { code: 'unknown-point', id: cmd.def.center } };
        if (!c.planes.has(cmd.def.plane) && !c.pointPlanes.has(cmd.def.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.def.plane } };
      }
      if (cmd.touch && c.points.has(cmd.touch)) return { ok: false, error: { code: 'already-defined', id: cmd.touch } };
      const next = clone(c);
      next.circles3.push({ id: cmd.id, def: cmd.def });
      if (cmd.touch && cmd.def.kind === 'tangent-line') {
        next.points.set(cmd.touch, { kind: 'foot-line', from: cmd.def.center, line: cmd.def.line }); // the tangent point = foot ⟂ from centre
      }
      return { ok: true, next };
    }

    // V8-i: `A נמצאת על המעגל` — a verified membership (checked in the store vs the resolved circle).
    case 'point-on-circle3': {
      const missing = missingPoint(c, [cmd.point]);
      if (missing) return { ok: false, error: missing };
      // '' = the single circle (ADR-029 implicit-reference); a named id must exist
      if (cmd.circle === '' ? c.circles3.length !== 1 : !c.circles3.some((k) => k.id === cmd.circle)) {
        return { ok: false, error: { code: 'unknown-line', id: cmd.circle || 'circle' } };
      }
      return { ok: true, next: c };
    }

    // V8-f (G6): cos of the angle between two operands. M1 (the ADR-3D-010 shape): on a
    // figure with FREE solid dims it is a driving GIVEN (a scalar pin); on a determined
    // figure it is a verified CLAIM. Either way its pairs auto-draw.
    case 'cos-angle': {
      const err = firstAtomError(c, [cmd.u, cmd.v]);
      if (err) return { ok: false, error: err };
      const next = clone(c);
      drawAtom(next, cmd.u);
      drawAtom(next, cmd.v);
      // ADR-3D-056 (#286): a PERPENDICULAR whose one arm carries a free symbol-defined point (E on AS
      // via `AE=t·AS`) PINS that symbol — E slides to the foot of the perpendicular. Otherwise the ⊥ was
      // pushed onto the free solid dims and held only at lucky seeds. Only when exactly ONE arm carries a
      // still-unpinned symbol point (the other arm being the fixed reference); else the dims/claim path.
      if (Math.abs(cmd.cos) < 1e-9) {
        const up = atomEndpoints(c, cmd.u);
        const vp = atomEndpoints(c, cmd.v);
        const uDef = up && (freeSymbolDef(c, up[0]) ?? freeSymbolDef(c, up[1]));
        const vDef = vp && (freeSymbolDef(c, vp[0]) ?? freeSymbolDef(c, vp[1]));
        if (up && vp && uDef != null && vDef == null) {
          next.symbolPins.push({ rel: 'seg-perp', a: up[0], b: up[1], c: vp[0], d: vp[1], def: uDef });
          return { ok: true, next };
        }
        if (up && vp && vDef != null && uDef == null) {
          next.symbolPins.push({ rel: 'seg-perp', a: vp[0], b: vp[1], c: up[0], d: up[1], def: vDef });
          return { ok: true, next };
        }
      }
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'cos-angle', u: cmd.u, v: cmd.v, cos: cmd.cos });
      else next.claims.push({ type: 'cos-angle-eq', u: cmd.u, v: cmd.v, cos: cmd.cos });
      return { ok: true, next };
    }

    // #393/#335 (ADR-3D-107): |e1| = c·|e2| over vector EXPRESSIONS. Simple unit-coefficient
    // atoms NORMALIZE onto the existing owners at this one entry point (the parallelepiped
    // precedent, #349) — so |u|=|v| gets length-rel's whole machinery (symbolPins included)
    // and only genuine expressions reach the mag-rel pin/claim lanes. M1 routes the rest.
    case 'mag-rel': {
      const err = exprRefsError(c, [...cmd.e1, ...cmd.e2]);
      if (err) return { ok: false, error: err };
      const single = (e: import('./types').VecExpr): VecAtom | null =>
        e.length === 1 && Math.abs(e[0].coeff - 1) < 1e-12 ? e[0].atom : null;
      const a1 = single(cmd.e1);
      const a2 = single(cmd.e2);
      if (a1?.kind === 'pair' && a2) {
        return applyCommand3(c, {
          type: 'length-rel', a1: a1.from, b1: a1.to,
          rhs: a2.kind === 'pair' ? { pair: [a2.from, a2.to] } : { vec: a2.name }, c: cmd.c,
        });
      }
      if (a1?.kind === 'named' && a2?.kind === 'pair' && cmd.c > 1e-12) {
        // |u| = c·|pair| ⟺ |pair| = (1/c)·|u| — the pair-LHS spelling length-rel owns
        return applyCommand3(c, { type: 'length-rel', a1: a2.from, b1: a2.to, rhs: { vec: a1.name }, c: 1 / cmd.c });
      }
      const next = clone(c);
      for (const t of [...cmd.e1, ...cmd.e2]) {
        if (t.atom.kind === 'pair' && !hasSegment(next, t.atom.from, t.atom.to)) next.segments.push([t.atom.from, t.atom.to]);
      }
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'mag-rel', e1: cmd.e1, e2: cmd.e2, c: cmd.c });
      else next.claims.push({ type: 'mag-rel', e1: cmd.e1, e2: cmd.e2, c: cmd.c });
      return { ok: true, next };
    }

    // #393/#335: |e| = value — the absolute-size twin. Same normalization: a bare named
    // vector is vec-mag verbatim, a bare pair is the ordinary length given.
    case 'mag-val': {
      const err = exprRefsError(c, cmd.e);
      if (err) return { ok: false, error: err };
      if (cmd.e.length === 1 && Math.abs(cmd.e[0].coeff - 1) < 1e-12) {
        const a = cmd.e[0].atom;
        if (a.kind === 'named') return applyCommand3(c, { type: 'vec-mag', name: a.name, value: cmd.value });
        return applyCommand3(c, { type: 'claim', claim: { type: 'length-eq', a: a.from, b: a.to, value: cmd.value } });
      }
      const next = clone(c);
      for (const t of cmd.e) {
        if (t.atom.kind === 'pair' && !hasSegment(next, t.atom.from, t.atom.to)) next.segments.push([t.atom.from, t.atom.to]);
      }
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'mag-val', e: cmd.e, value: cmd.value });
      else next.claims.push({ type: 'mag-val', e: cmd.e, value: cmd.value });
      return { ok: true, next };
    }

    // #305 (ADR-3D-090): A,B,C,D are CONCYCLIC — emitted by «ישרה» over a general-quad base
    // (a right pyramid needs a cyclic base). M1, like every relation: a free-dim figure is
    // DRIVEN into shape, a determined one is VERIFIED.
    case 'concyclic': {
      const miss = missingPoint(c, cmd.ids);
      if (miss) return { ok: false, error: miss };
      if (cmd.ids.length !== 4) return { ok: false, error: { code: 'bad-solid', kind: 'pyramidQuadR' } };
      const next = clone(c);
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'concyclic', ids: cmd.ids });
      else next.claims.push({ type: 'concyclic', ids: cmd.ids });
      return { ok: true, next };
    }

    // V8-f (G9): a chain `u·v = v·w = u·w` — each consecutive equality is one relation.
    case 'dot-eq-chain': {
      if (cmd.ops.length < 2) return { ok: false, error: { code: 'unknown-vector', id: '·' } };
      const err = firstAtomError(c, cmd.ops.flatMap(([a, b]) => [a, b]));
      if (err) return { ok: false, error: err };
      const next = clone(c);
      for (const [a, b] of cmd.ops) {
        drawAtom(next, a);
        drawAtom(next, b);
      }
      const drive = freeDims(c) > 0 && c.solids.length > 0;
      for (let i = 1; i < cmd.ops.length; i++) {
        const [a, b] = cmd.ops[i - 1];
        const [cc, d] = cmd.ops[i];
        if (drive) next.scalarPins.push({ kind: 'dot-eq', a, b, c: cc, d });
        else next.claims.push({ type: 'dot-eq', a, b, c: cc, d });
      }
      return { ok: true, next };
    }

    // V8-f (G10): `base` makes equal angles with `a` and `b` ⇒ ∠(base,a) = ∠(base,b).
    case 'angle-eq': {
      const err = firstAtomError(c, [cmd.base, cmd.a, cmd.b]);
      if (err) return { ok: false, error: err };
      const next = clone(c);
      drawAtom(next, cmd.base);
      drawAtom(next, cmd.a);
      drawAtom(next, cmd.b);
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'cos-eq', a: cmd.base, b: cmd.a, c: cmd.base, d: cmd.b });
      else next.claims.push({ type: 'cos-eq', a: cmd.base, b: cmd.a, c: cmd.base, d: cmd.b });
      return { ok: true, next };
    }

    // ADR-3D-053 (#273) — a stated numeric BOUND on an angle. NOT an equation: it determines nothing,
    // so it becomes a REQUIREMENT (which sampled configuration may be shown) rather than a pin or a
    // claim. The angle keeps its DOF; "show another configuration" varies it inside the bound.
    case 'angle-bound3': {
      let vertex = cmd.vertex, p = cmd.p, q = cmd.q;
      if (cmd.label !== undefined) {
        // the letter names the angle («∠SAB = α» then «60 < α < 90») — resolved HERE, where the marks
        // are known (parse3 is context-free). Sharing a name means sharing the bound.
        const marks = c.angleMarks.filter((m) => m.label === cmd.label);
        if (marks.length === 0) return { ok: false, error: { code: 'unknown-symbol', id: cmd.label } };
        let r: ApplyResult3 = { ok: true, next: c };
        for (const mk of marks) {
          if (!r.ok) return r;
          r = applyCommand3(r.next, { type: 'angle-bound3', vertex: mk.vertex, p: mk.p, q: mk.q, min: cmd.min, max: cmd.max });
        }
        return r;
      }
      if (vertex === undefined || p === undefined || q === undefined) return { ok: false, error: { code: 'ambiguous-angle', id: vertex ?? '?' } };
      const missing = missingPoint(c, [vertex, p, q]);
      if (missing) return { ok: false, error: missing };
      if (cmd.min !== undefined && cmd.max !== undefined && cmd.min >= cmd.max) return { ok: false, error: { code: 'bound-unsatisfiable', id: vertex } };
      const next = clone(c);
      for (const arm of [p, q]) if (!hasSegment(next, vertex, arm)) next.segments.push([vertex, arm]);
      next.requirements.push({ kind: 'angle-bound', vertex, p, q, min: cmd.min, max: cmd.max });
      return { ok: true, next };
    }

    // ADR-3D-052 (#271) — a general angle equality between two independently-named angles. Same M1
    // routing as `angle-eq`: a free-dim solid is DRIVEN into shape, a determined figure is VERIFIED.
    // (This is the kept #271 implementation; main's standalone `angles-equal` was the duplicate.)
    case 'angle-pair-eq': {
      const err = firstAtomError(c, [cmd.a, cmd.b, cmd.c, cmd.d]);
      if (err) return { ok: false, error: err };
      const next = clone(c);
      for (const at of [cmd.a, cmd.b, cmd.c, cmd.d]) drawAtom(next, at);
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'cos-eq', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      else next.claims.push({ type: 'cos-eq', a: cmd.a, b: cmd.b, c: cmd.c, d: cmd.d });
      return { ok: true, next };
    }

    // V8-f (G11): D on segment a–b, root-found so ray apex→D bisects ∠(a)(apex)(b).
    case 'bisector-point': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const missing = missingPoint(c, [cmd.a, cmd.b, cmd.apex]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'bisector-seg', a: cmd.a, b: cmd.b, apex: cmd.apex });
      if (!hasSegment(next, cmd.apex, cmd.id)) next.segments.push([cmd.apex, cmd.id]); // draw OD
      return { ok: true, next };
    }

    // triage 3-D: altitude from a vertex to the opposite face of THE tetrahedron. The face
    // is resolved here (the ADR-3D-011 sentinel pattern) = the tetra's other 3 vertices → foot-face.
    case 'tetra-altitude': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const tetras = c.solids.filter((s) => s.kind === 'tetra' || s.kind === 'pyramid3' || s.kind === 'pyramid3e');
      if (tetras.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: cmd.id } }; // 0 or many → ambiguous
      const t = tetras[0];
      if (!t.ids.includes(cmd.from)) return { ok: false, error: { code: 'unknown-point', id: cmd.from } };
      const face = t.ids.filter((v) => v !== cmd.from);
      if (face.length !== 3) return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'foot-face', from: cmd.from, face });
      if (!hasSegment(next, cmd.from, cmd.id)) next.segments.push([cmd.from, cmd.id]); // draw the altitude
      return { ok: true, next };
    }

    // triage 3-D: the angle between a line (a–b) and a plane (point-run). M1: on a free-dim solid
    // it DRIVES (a similarity-invariant scalar pin), else it VERIFIES as a claim.
    case 'line-plane-angle': {
      if (cmd.plane.length < 3) return { ok: false, error: { code: 'not-coplanar', id: cmd.plane.join('') } };
      const missing = missingPoint(c, [cmd.a, cmd.b, ...cmd.plane]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      if (!hasSegment(next, cmd.a, cmd.b)) next.segments.push([cmd.a, cmd.b]); // draw the line
      materializePlaneRun(next, cmd.plane); // #584: the stated plane leaves ink + gets the toggle
      // #319: a LABELED angle («… היא α») NAMES the measure — a pedagogical mark, never a driver;
      // the panel derives `α = X°` when the angle is seed-stable.
      if (cmd.label !== undefined) {
        if (!next.linePlaneMarks.some((mk) => mk.a === cmd.a && mk.b === cmd.b && mk.label === cmd.label))
          next.linePlaneMarks.push({ a: cmd.a, b: cmd.b, plane: [...cmd.plane], label: cmd.label });
        return { ok: true, next };
      }
      const deg = cmd.deg!;
      if (freeDims(c) > 0 && c.solids.length > 0)
        next.scalarPins.push({ kind: 'line-plane-angle', a: cmd.a, b: cmd.b, plane: [...cmd.plane], deg });
      else next.claims.push({ type: 'line-plane-angle', a: cmd.a, b: cmd.b, plane: [...cmd.plane], deg });
      return { ok: true, next };
    }

    // V8-j (G12): the apex on segment a–b positioned so pyramid(base, apex) is RIGHT.
    case 'right-pyramid-point': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (cmd.base.length !== 4) return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
      const missing = missingPoint(c, [cmd.a, cmd.b, ...cmd.base]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'right-pyramid-apex', a: cmd.a, b: cmd.b, base: [...cmd.base] });
      for (const v of cmd.base) if (!hasSegment(next, cmd.id, v)) next.segments.push([cmd.id, v]); // lateral edges
      for (let j = 0; j < 4; j++) {
        const [p, q] = [cmd.base[j], cmd.base[(j + 1) % 4]];
        if (!hasSegment(next, p, q)) next.segments.push([p, q]); // base ring
      }
      return { ok: true, next };
    }

    // V8-g: the foot of a triangle altitude — D = foot of ⟂ from vertex `from` onto side a–b.
    case 'altitude-foot': {
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const missing = missingPoint(c, [cmd.from, cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'foot-seg', from: cmd.from, a: cmd.a, b: cmd.b });
      if (!hasSegment(next, cmd.from, cmd.id)) next.segments.push([cmd.from, cmd.id]); // draw the altitude
      return { ok: true, next };
    }

    case 'revolution': {
      const owned = [...(cmd.center ? [cmd.center] : []), ...(cmd.apex ? [cmd.apex] : [])];
      const taken = owned.find((id) => c.points.has(id));
      if (taken !== undefined) return { ok: false, error: { code: 'already-defined', id: taken } };
      const next = clone(c);
      const rev = next.revolutions.length;
      next.revolutions.push({ kind: cmd.kind, center: cmd.center, apex: cmd.apex, radius: cmd.radius, height: cmd.height });
      if (cmd.center) next.points.set(cmd.center, { kind: 'rev-point', rev, role: 'center' });
      if (cmd.apex) next.points.set(cmd.apex, { kind: 'rev-point', rev, role: 'apex' });
      return { ok: true, next };
    }
  }
}
