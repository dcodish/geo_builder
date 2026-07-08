/**
 * The command reducer: lower a Command3 into the Construction3 (docs/20 §6.1).
 * Pure — returns a new construction or a structured error; never mutates.
 */

import { exprPointIds, exprVectorNames } from './vecExpr';
import type { ApplyResult3, Claim3, Command3, Construction3, EngineError3, Id, SolidCommand, SolidObj } from './types';

const VERTEX_COUNT: Record<SolidCommand['kind'], number> = { cube: 8, box: 8, prism3: 6, pyramid4: 5, pyramid3: 4, tetra: 4, prism4r: 8, pyramid4g: 5, pyramid4r: 5, pyramid4gr: 5, prism3e: 6, pyramid3e: 4, pyramidPar: 5 };

/** Edge index pairs per solid kind (indices into `ids`). */
function edgeIndices(kind: SolidCommand['kind']): [number, number][] {
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
    segments: [...c.segments],
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
    vecDefs: [...c.vecDefs],
    symbolPins: [...c.symbolPins],
    claims: [...c.claims],
    scalarPins: [...c.scalarPins],
    pairPins: [...c.pairPins],
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
const DIM_COUNT: Record<SolidCommand['kind'], number> = { cube: 0, box: 2, prism3: 3, pyramid4: 1, pyramid3: 3, tetra: 5, prism4r: 2, pyramid4g: 3, pyramid4r: 2, pyramid4gr: 4, prism3e: 1, pyramid3e: 1, pyramidPar: 5 };
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
      if (c.points.has(cmd.id)) return { ok: false, error: { code: 'already-defined', id: cmd.id } };
      const missing = missingPoint(c, [cmd.a, cmd.b]);
      if (missing) return { ok: false, error: missing };
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'on-segment', a: cmd.a, b: cmd.b, t: cmd.t });
      return { ok: true, next };
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
      if (hasSegment(c, cmd.a, cmd.b)) return { ok: true, next: c }; // idempotent — the 2-D convention
      const next = clone(c);
      next.segments.push([cmd.a, cmd.b]);
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
        return { ok: false, error: { code: 'symbolic-new-point', id: cmd.id } }; // a NEW point needs numbers
      }
      const next = clone(c);
      next.points.set(cmd.id, { kind: 'coord', x: cmd.x, y: cmd.y, z: cmd.z });
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
      if (!c.points.has(cmd.id)) return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
      if (!c.lines.has(cmd.line)) return { ok: false, error: { code: 'unknown-line', id: cmd.line } };
      const next = clone(c);
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
