/**
 * The command reducer: lower a Command3 into the Construction3 (docs/20 §6.1).
 * Pure — returns a new construction or a structured error; never mutates.
 */

import { exprPointIds, exprVectorNames } from './vecExpr';
import type { ApplyResult3, Claim3, Command3, Construction3, EngineError3, Id, SolidCommand, SolidObj } from './types';

const VERTEX_COUNT: Record<SolidCommand['kind'], number> = { cube: 8, box: 8, prism3: 6, pyramid4: 5, pyramid3: 4 };

/** Edge index pairs per solid kind (indices into `ids`). */
function edgeIndices(kind: SolidCommand['kind']): [number, number][] {
  if (kind === 'prism3') {
    return [
      [0, 1], [1, 2], [2, 0], // base ring
      [3, 4], [4, 5], [5, 3], // top ring
      [0, 3], [1, 4], [2, 5], // verticals
    ];
  }
  if (kind === 'pyramid4') {
    return [
      [0, 1], [1, 2], [2, 3], [3, 0], // base ring
      [0, 4], [1, 4], [2, 4], [3, 4], // lateral edges to the apex
    ];
  }
  if (kind === 'pyramid3') {
    return [
      [0, 1], [1, 2], [2, 0], // base ring
      [0, 3], [1, 3], [2, 3], // lateral edges to the apex
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
  if (kind === 'prism3') {
    return [
      [0, 1, 2], // base
      [3, 4, 5], // top
      [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5], // sides
    ];
  }
  if (kind === 'pyramid4') {
    return [
      [0, 1, 2, 3], // base
      [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], // lateral triangles
    ];
  }
  if (kind === 'pyramid3') {
    return [
      [0, 1, 2], // base
      [0, 1, 3], [1, 2, 3], [2, 0, 3], // lateral triangles
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
    revolutions: [...c.revolutions],
  };
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
    case 'length-ratio':
      return missingPoint(c, [claim.a1, claim.b1, claim.a2, claim.b2]);
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
      return { ok: true, next: c }; // a claim adds nothing — it is verified by the store (derive3)
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
      if (!c.points.has(cmd.id)) return { ok: false, error: { code: 'unknown-point', id: cmd.id } };
      if (cmd.plane !== 'any' && !c.planes.has(cmd.plane)) return { ok: false, error: { code: 'unknown-plane', id: cmd.plane } };
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
