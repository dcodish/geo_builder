/**
 * The command reducer: lower a Command3 into the Construction3 (docs/20 §6.1).
 * Pure — returns a new construction or a structured error; never mutates.
 */

import { exprPointIds, exprVectorNames } from './vecExpr';
import { cross3, dot3, normalize3, v3 } from './vec3';
import type { ApplyResult3, Claim3, Command3, Construction3, EngineError3, Id, LinExpr, SolidCommand, SolidObj } from './types';

const VERTEX_COUNT: Record<SolidCommand['kind'], number> = { cube: 8, box: 8, prism3: 6, pyramid4: 5, pyramid3: 4, tetra: 4, prism4r: 8, pyramid4g: 5, pyramid4r: 5, pyramid4gr: 5, prism3e: 6, pyramid3e: 4, pyramidPar: 5, polygon3: 3, polygon4: 4, polygon5: 5, prism4: 8, prism4g: 8, prism4sq: 8, prismReg5: 10, prismReg6: 12, parallelepiped: 8 };

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
  if (kind === 'pyramid4' || kind === 'pyramid4g' || kind === 'pyramid4r' || kind === 'pyramid4gr' || kind === 'pyramidPar') {
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
  if (kind === 'pyramid4' || kind === 'pyramid4g' || kind === 'pyramid4r' || kind === 'pyramid4gr' || kind === 'pyramidPar') {
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
    vectors: new Map(c.vectors),
    arrows: c.arrows.map(([f, t]) => [f, t] as [Id, Id]),
    segments: [...c.segments],
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
    pointPlanes: new Map(c.pointPlanes),
    pointLines: new Map(c.pointLines),
    relPlanes: new Map(c.relPlanes),
    revolutions: [...c.revolutions],
    circles3: [...c.circles3],
    vecDefs: [...c.vecDefs],
    symbolPins: [...c.symbolPins],
    claims: [...c.claims],
    scalarPins: [...c.scalarPins],
    pairPins: [...c.pairPins],
    planePins: [...c.planePins],
    paramGivens: [...c.paramGivens],
    paramSigns: [...c.paramSigns],
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
const DIM_COUNT: Record<SolidCommand['kind'], number> = { cube: 0, box: 2, prism3: 3, pyramid4: 1, pyramid3: 3, tetra: 5, prism4r: 2, pyramid4g: 3, pyramid4r: 2, pyramid4gr: 4, prism3e: 1, pyramid3e: 1, pyramidPar: 5, polygon3: 2, polygon4: 4, polygon5: 6, prism4: 3, prism4g: 5, prism4sq: 1, prismReg5: 1, prismReg6: 1, parallelepiped: 5 };
function freeDims(c: Construction3): number {
  let n = 0;
  for (const s of c.solids) n += DIM_COUNT[s.kind];
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

/** First missing point among ids, as an error — or null when all exist. */
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

/** Apply-time validation of a claim's references (order matters, like every fact). */
function claimRefsError(c: Construction3, claim: Claim3): EngineError3 | null {
  switch (claim.type) {
    case 'length-rel':
      return missingPoint(c, [claim.a1, claim.b1, claim.a2, claim.b2]);
    case 'volume-eq-poly':
      return missingPoint(c, [...claim.ids1, ...claim.ids2]);
    case 'vec-eq': {
      const pointErr = missingPoint(c, [...exprPointIds(claim.lhs), ...exprPointIds(claim.rhs)]);
      if (pointErr) return pointErr;
      for (const name of [...exprVectorNames(claim.lhs), ...exprVectorNames(claim.rhs)]) {
        if (!c.vectors.has(name)) return { code: 'unknown-vector', id: name };
      }
      return null;
    }
    case 'perp-plane':
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
      return null;
    case 'plane-eq':
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
    case 'volume-poly':
      return claim.ids.length === 4 ? missingPoint(c, claim.ids) : { code: 'no-such-solid', id: claim.ids.join('') };
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

export function applyCommand3(c: Construction3, cmd: Command3): ApplyResult3 {
  switch (cmd.type) {
    case 'solid': {
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
      if (flat && cmd.ids.every((id) => c.points.has(id))) return { ok: true, next: c };
      // #199 M1 (ADR-3D-047): re-DECLARING an existing solid (same kind, same ids) is a statement
      // about the figure, not a re-creation — idempotent no-op (the solid-shaped sibling of the
      // #116 flat-polygon path above and the segment3 convention below). A different kind or a
      // partial id overlap keeps the honest conflict error.
      if (c.solids.some((sld) => sld.kind === cmd.kind && sld.ids.length === cmd.ids.length && sld.ids.every((id, i) => id === cmd.ids[i]))) {
        return { ok: true, next: c };
      }
      const taken = cmd.ids.find((id) => c.points.has(id));
      if (taken !== undefined) return { ok: false, error: { code: 'already-defined', id: taken } };

      const next = clone(c);
      const at = (i: number): Id => cmd.ids[i];
      const solid: SolidObj = {
        kind: cmd.kind,
        ids: [...cmd.ids],
        edges: edgeIndices(cmd.kind).map(([i, j]) => [at(i), at(j)] as [Id, Id]),
        faces: faceIndices(cmd.kind).map((ring) => ring.map(at)),
      };
      const solidIndex = next.solids.length;
      next.solids.push(solid);
      cmd.ids.forEach((id, index) => next.points.set(id, { kind: 'solid-vertex', solid: solidIndex, index }));
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
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      if (cmd.a === cmd.b) return { ok: false, error: { code: 'unknown-point', id: cmd.b } };
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
      // face: [] is the "the base" sentinel — resolve HERE (one chokepoint) to the
      // single solid's base ring (faces[0], base-first convention across every kind)
      if (cmd.face.length === 0 && c.solids.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: 'base' } };
      const face = cmd.face.length === 0 ? c.solids[0].faces[0] : cmd.face;
      if (face.length !== 4) return { ok: false, error: { code: 'no-solution', id: cmd.id } }; // no diagonals without a quad
      const missing = missingPoint(c, face);
      if (missing) return { ok: false, error: missing };
      // a parallelogram's diagonals bisect ⇒ the crossing = midpoint of a diagonal
      // (1st & 3rd cyclic vertices); reuses the on-segment point kind (no eval change)
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'on-segment', a: face[0], b: face[2], t: 0.5 });
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
      const missing = missingPoint(c, [cmd.from]);
      if (missing) return { ok: false, error: missing };
      if (c.solids.length !== 1) return { ok: false, error: { code: 'unknown-plane', id: 'base' } };
      const face = c.solids[0].ids.slice(0, 3);
      let foot: Id | null = null;
      for (const ch of 'EFGHKLMNPQRSTUVWXYZABCD') {
        if (!c.points.has(ch)) {
          foot = ch;
          break;
        }
      }
      if (!foot) return { ok: false, error: { code: 'already-defined', id: 'foot' } };
      return applyCommand3(c, { type: 'height-to-face', id: foot, from: cmd.from, face });
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
      // M1 (V7 T2): a scalar statement on a figure with FREE dims is a GIVEN — it
      // drives the solve instead of being "checked" against an arbitrary sample.
      if (freeDims(c) > 0) {
        if (cmd.claim.type === 'length-eq') {
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
      next.claims.push(cmd.claim); // recorded — derive3 verifies EVERY recorded claim (fact-attributed)
      return { ok: true, next };
    }

    // --- V2: the algebraic lane ---

    case 'point3': {
      if (c.points.has(cmd.id)) {
        // the id EXISTS — a coordinate statement about an existing point is a GIVEN,
        // never an error: it becomes a pivot pin (the 2-D M1 principle; V4 ADR-3D-007)
        const next = clone(c);
        next.pins.push({ id: cmd.id, x: cmd.x, y: cmd.y, z: cmd.z });
        return { ok: true, next };
      }
      if (cmd.x === null || cmd.y === null || cmd.z === null) {
        // ADR-3D-032: a NEW point whose symbolic components all carry ONE letter is a
        // coord-sym point — the letter becomes the figure's single parameter (a sampled
        // free DOF until a recorded given pins it, ADR-052). Distinct letters stay the
        // honest under-determination refusal.
        const letters = [...new Set((cmd.syms ?? []).flatMap((s) => (s !== null ? [s] : [])))];
        if (letters.length === 1) {
          const sym = letters[0];
          if (c.param && c.param !== sym) return { ok: false, error: { code: 'two-params' } };
          const comp = (v: number | null, s: string | null): { k: number; p: number } =>
            v !== null ? { k: v, p: 0 } : s ? { k: 0, p: 1 } : { k: 0, p: 0 };
          const next = clone(c);
          next.points.set(cmd.id, {
            kind: 'coord-sym',
            x: comp(cmd.x, cmd.syms![0]),
            y: comp(cmd.y, cmd.syms![1]),
            z: comp(cmd.z, cmd.syms![2]),
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

    case 'param-sign': {
      if (c.param !== cmd.sym) return { ok: false, error: { code: 'unknown-symbol', id: cmd.sym } };
      const next = clone(c);
      next.paramSigns.push(cmd);
      return { ok: true, next };
    }

    case 'inject-vector': {
      if (!c.vectors.has(cmd.name)) return { ok: false, error: { code: 'unknown-vector', id: cmd.name } };
      const next = clone(c);
      next.vectorPins.push({ name: cmd.name, x: cmd.x, y: cmd.y, z: cmd.z });
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
      if (c.planes.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      if (cmd.param && c.param && cmd.param !== c.param) return { ok: false, error: { code: 'two-params' } };
      const next = clone(c);
      next.planes.set(cmd.name, cmd.plane);
      if (cmd.param) next.param = cmd.param;
      return { ok: true, next };
    }

    case 'plane-angle': {
      for (const p of [cmd.p1, cmd.p2]) {
        if (!c.planes.has(p)) return { ok: false, error: { code: 'unknown-plane', id: p } };
      }
      const next = clone(c);
      next.planeAngles.push(cmd);
      return { ok: true, next };
    }

    case 'on-planes': {
      if (cmd.plane !== 'any' && !c.planes.has(cmd.plane) && !c.pointPlanes.has(cmd.plane))
        return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      if (!c.points.has(cmd.id)) {
        // M1 dual (the 2-D ADR-236 shape): a NEW id stated onto — or above/below — a NAMED
        // plane is CREATED as a free point riding it (2 DOF; 3 with a stated side)
        if (cmd.plane === 'any') return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
        const next = clone(c);
        next.points.set(
          cmd.id,
          cmd.side
            ? { kind: 'on-plane', plane: cmd.plane, side: cmd.side === 'above' ? 1 : -1 }
            : { kind: 'on-plane', plane: cmd.plane },
        );
        return { ok: true, next };
      }
      const next = clone(c);
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
      if (c.lines.has(cmd.name)) return { ok: false, error: { code: 'already-defined', id: cmd.name } };
      for (const p of [cmd.p1, cmd.p2]) {
        if (!c.planes.has(p) && !c.pointPlanes.has(p)) return { ok: false, error: { code: 'unknown-plane', id: p } };
      }
      const next = clone(c);
      next.lines.set(cmd.name, { kind: 'plane-plane', p1: cmd.p1, p2: cmd.p2 });
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
      if (cmd.param && c.param && cmd.param !== c.param) return { ok: false, error: { code: 'two-params' } };
      const next = clone(c);
      next.lines.set(cmd.name, { kind: 'parametric', anchor: cmd.anchor, dir: cmd.dir, src: cmd.src });
      if (cmd.param) next.param = cmd.param;
      return { ok: true, next };
    }

    case 'line-perp-plane': {
      if (!c.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      if (!c.planes.has(cmd.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
      const next = clone(c);
      next.linePerps.push(cmd);
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
      if (!c.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      if (!c.points.has(cmd.id)) {
        // M1 dual (ADR-3D-031, the on-planes shape): a NEW id stated onto a named line is
        // CREATED as a free rider (1 sampled DOF); the store's status pass still checks
        // membership on final coordinates, so nothing escapes verification
        const next = clone(c);
        next.points.set(cmd.id, { kind: 'on-line', line: cmd.line });
        return { ok: true, next };
      }
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
      if (missing) return { ok: false, error: missing };
      // V7 T2: on a figure with FREE dims the relation is a DRIVING given (M1)
      if (freeDims(c) > 0) {
        const next = clone(c);
        next.scalarPins.push({ kind: cmd.rel === 'perp' ? 'seg-perp-plane' : 'seg-par-plane', a: cmd.a, b: cmd.b, plane });
        if (!hasSegment(next, cmd.a, cmd.b)) next.segments.push([cmd.a, cmd.b]);
        return { ok: true, next };
      }
      if (cmd.rel === 'perp' && plane.length === 3) {
        const asClaim = applyCommand3(c, { type: 'claim', claim: { type: 'perp-plane', seg: [cmd.a, cmd.b], plane: [plane[0], plane[1], plane[2]] } });
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
      if (idx < 0) return { ok: false, error: { code: 'unknown-symbol', id: cmd.symbol } };
      const next = clone(c);
      next.symbolPins = next.symbolPins.filter((p) => p.def !== idx);
      next.symbolPins.push({ rel: 'value', value: cmd.value, def: idx });
      return { ok: true, next };
    }

    case 'rect-complete': {
      // `WXYZ מלבן`: exactly ONE unknown corner completes as the parallelogram point
      // (opposite + both neighbours), then the corner right angle is VERIFIED — a base
      // that isn't right-angled refuses the "rectangle" honestly.
      const unknowns = cmd.ids.filter((id) => !c.points.has(id));
      if (unknowns.length !== 1) {
        return unknowns.length === 0
          ? { ok: false, error: { code: 'already-defined', id: cmd.ids[0] } }
          : { ok: false, error: { code: 'two-unknowns', id: unknowns[1] } };
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
      const withAngle = applyCommand3(asDef.next, {
        type: 'claim',
        claim: { type: 'angle-seg-eq', a1: n1, b1: opp, a2: n1, b2: unknowns[0], deg: 90 },
      });
      if (!withAngle.ok) return withAngle;
      const next = clone(withAngle.next);
      for (let j = 0; j < 4; j++) {
        const [a, b] = [cmd.ids[j], cmd.ids[(j + 1) % 4]];
        if (!hasSegment(next, a, b)) next.segments.push([a, b]);
      }
      return { ok: true, next };
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
      const next = clone(c);
      next.pairPins.push({ a: cmd.a, b: cmd.b, x: cmd.x, y: cmd.y, z: cmd.z });
      return { ok: true, next };
    }

    // V8-i (G13): a circle in R³. `tangent-line`: centered at `center`, in the plane through the
    // centre & the line, tangent to it — the touch point is the ⟂ foot of the centre onto the line.
    case 'circle3': {
      if (c.circles3.some((k) => k.id === cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      if (cmd.def.kind === 'tangent-line') {
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
      if (freeDims(c) > 0 && c.solids.length > 0) next.scalarPins.push({ kind: 'cos-angle', u: cmd.u, v: cmd.v, cos: cmd.cos });
      else next.claims.push({ type: 'cos-angle-eq', u: cmd.u, v: cmd.v, cos: cmd.cos });
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
      if (freeDims(c) > 0 && c.solids.length > 0)
        next.scalarPins.push({ kind: 'line-plane-angle', a: cmd.a, b: cmd.b, plane: [...cmd.plane], deg: cmd.deg });
      else next.claims.push({ type: 'line-plane-angle', a: cmd.a, b: cmd.b, plane: [...cmd.plane], deg: cmd.deg });
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
