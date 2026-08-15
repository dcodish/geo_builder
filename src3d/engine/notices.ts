/**
 * BUILD NOTICES (#305, ADR-3D-090) — "the step committed, and here is what changed."
 *
 * Before this there was no channel for a successful-but-adjusted build: `guidanceNote` in App3 is
 * refusal-only (it fires when the parse fails and then clears `lastError`), and an error would be
 * wrong here — nothing failed. The 2-D `coincidences` notice (ADR-123: a forced coincidence is
 * ALLOWED, with a notice) is the pattern this copies; per docs/20 §12 the pattern is copied, never
 * imported across the product boundary.
 *
 * The notice is what keeps the ADR-3D-090 auto-fix honest. «פירמידה ישרה שבסיסה דלתון» constrains
 * the kite into a RIGHT kite so the right pyramid can exist at all — a consequence of two statements
 * the student made, not an invented given — but the student must be able to SEE that it happened.
 *
 * Derived purely from the construction, so it is identical for a typed figure and a loaded one, and
 * it needs no plumbing through the submit path.
 */

import { CYCLIC_MEMBER, CYCLIC_MEMBER_NAME, QUAD_PYRAMIDS } from './baseShapes';
import { isSelfDetermined, lineDirCarriesParam, operandLabel, planeNormalCarriesParam } from './operands';
import type { QuadBase } from './baseShapes';
import type { Construction3, Id, Operand3, SolidKind } from './types';

/** A non-error message attached to a successfully built figure. */
export type BuildNotice3 =
  | {
      /** A stated base was constrained into the cyclic member of its family so «ישרה» could hold. */
      kind: 'base-constrained';
      /** The solid's vertex ids (so the UI can name the solid the way the student did). */
      ids: Id[];
      /** The base the student stated, and the shape it became — both i18n keys. */
      from: QuadBase;
      to: string;
    }
  | {
      /** #375: the student called a LINE a plane («ACD אנך למישור ℓ1»). The kinds are known, so the
       *  relation is built — and the wording is corrected here rather than silently ignored. */
      kind: 'line-called-plane';
      ids: Id[];
      line: string;
    }
  | {
      /** S2 (#378): the same slip on a general line relation («AB מקביל למישור l1») — the relation
       *  is built against the line, and the wording is corrected. */
      kind: 'line-rel-noun';
      line: string;
    }
  | {
      /** #396 (ADR-3D-108): a stated relation between two ABSOLUTE objects (equation planes, typed
       *  lines) verified true but could never have driven anything — the objects are fully determined
       *  by their own defining equations, so the statement adds no information. The student sees the
       *  ✓ AND learns the given was redundant. Deliberately NOT emitted for claims on figure points:
       *  there a claim is the verify-your-answer register (the tool's charter), not redundancy. */
      kind: 'redundant-relation';
      a: string;
      b: string;
    }
  | {
      /** #333 (ADR-3D-153): the student named an intersection line `ℓ` while `ℓ` was already another
       *  line, so it was auto-indexed. Operator ruling 2026-07-25: auto-index and SAY SO, rather than
       *  refuse with a bare `already-defined` the student cannot act on. Derived from the line's
       *  stored `requested`, so it survives reload and undo like every other notice here. */
      kind: 'line-auto-named';
      requested: string;
      assigned: string;
    };

/**
 * Every notice the figure currently warrants. Recomputed on each derive — a notice is a property of
 * the built figure, never a one-shot event, so undo/redo and load all show the right thing.
 */
export function buildNotices3(c: Construction3): BuildNotice3[] {
  const out: BuildNotice3[] = [];
  // #375: derived from the pin's own flag, so it survives save/load and undo exactly like every notice
  for (const pin of c.planeLinePerps) {
    if (pin.statedAsPlane) out.push({ kind: 'line-called-plane', ids: [...pin.ids], line: pin.line });
  }
  // S2 (#378): the same flag on the general line-relation family
  for (const r of c.lineRels) {
    if (r.statedAsPlane) out.push({ kind: 'line-rel-noun', line: r.line });
  }
  // #333 (ADR-3D-153): an intersection line that did not get the name the student wrote
  for (const [name, def] of c.lines) {
    if (def.kind === 'plane-plane' && def.requested && def.requested !== name) {
      out.push({ kind: 'line-auto-named', requested: def.requested, assigned: name });
    }
  }
  for (const s of c.solids) {
    const spec = (QUAD_PYRAMIDS as Partial<Record<SolidKind, { base: QuadBase; right: boolean }>>)[s.kind];
    if (!spec?.right) continue;
    const entry = CYCLIC_MEMBER[spec.base];
    if (entry.fix.kind === 'none') continue; // square / rectangle are cyclic already — nothing changed
    out.push({ kind: 'base-constrained', ids: [...s.ids], from: spec.base, to: CYCLIC_MEMBER_NAME[spec.base] });
  }
  // #396 (ADR-3D-108): a relation between two SELF-DETERMINED objects that could never drive is
  // REDUNDANT — say so (it was verified at commit, or it would have refused claim-refuted).
  // Excluded: any side whose direction/normal carries the figure parameter — there the
  // statement PINNED the parameter (2024-Q2's «ℓ ⟂ π»), which is real information.
  // #500: the predicate is `isSelfDetermined`, NOT `isAbsolute` — a FREE plane (#487) is absolute
  // and carries no parameter, yet the stated relation is the very thing that orients it, so the
  // notice would have been a false statement about the student's own given.
  {
    const carriesParam = (op: Operand3): boolean =>
      op.kind === 'line' ? lineDirCarriesParam(c, op.name)
      : op.kind === 'plane-named' ? planeNormalCarriesParam(c, op.name)
      : false;
    const pairOf = (cl: Construction3['claims'][number]): [Operand3, Operand3] | null =>
      cl.type === 'plane-rel' || cl.type === 'mutual-rel' || cl.type === 'distance-rel' ? [cl.a, cl.b]
      : cl.type === 'line-rel' ? [cl.op, { kind: 'line', name: cl.line }] : null;
    for (const cl of c.claims) {
      const pair = pairOf(cl);
      if (!pair) continue;
      const [a, b] = pair;
      if (!isSelfDetermined(c, a) || !isSelfDetermined(c, b)) continue;
      if (carriesParam(a) || carriesParam(b)) continue;
      out.push({ kind: 'redundant-relation', a: operandLabel(a), b: operandLabel(b) });
    }
  }
  return out;
}
