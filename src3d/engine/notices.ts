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
import type { QuadBase } from './baseShapes';
import type { Construction3, Id, SolidKind } from './types';

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
  for (const s of c.solids) {
    const spec = (QUAD_PYRAMIDS as Partial<Record<SolidKind, { base: QuadBase; right: boolean }>>)[s.kind];
    if (!spec?.right) continue;
    const entry = CYCLIC_MEMBER[spec.base];
    if (entry.fix.kind === 'none') continue; // square / rectangle are cyclic already — nothing changed
    out.push({ kind: 'base-constrained', ids: [...s.ids], from: spec.base, to: CYCLIC_MEMBER_NAME[spec.base] });
  }
  return out;
}
