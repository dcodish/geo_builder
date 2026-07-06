/**
 * The command reducer: lower a Command3 into the Construction3 (docs/20 §6.1).
 * Pure — returns a new construction or a structured error; never mutates.
 */

import { exprPointIds, exprVectorNames } from './vecExpr';
import type { ApplyResult3, Claim3, Command3, Construction3, EngineError3, Id, SolidCommand, SolidObj } from './types';

const VERTEX_COUNT: Record<SolidCommand['kind'], number> = { cube: 8, box: 8, prism3: 6 };

/** Edge index pairs per solid kind (indices into `ids`). */
function edgeIndices(kind: SolidCommand['kind']): [number, number][] {
  if (kind === 'prism3') {
    return [
      [0, 1], [1, 2], [2, 0], // base ring
      [3, 4], [4, 5], [5, 3], // top ring
      [0, 3], [1, 4], [2, 5], // verticals
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
  return [
    [0, 1, 2, 3], // base
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], // sides
  ];
}

function clone(c: Construction3): Construction3 {
  return { solids: [...c.solids], points: new Map(c.points), vectors: new Map(c.vectors), segments: [...c.segments] };
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
  }
}
