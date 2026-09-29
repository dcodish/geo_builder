/**
 * #1442 ([ADR-552](../../docs/06-decisions.md#adr-552)) — HOW A STUDENT-FACING SURFACE NAMES A CIRCLE.
 *
 * A circle has no label of its own; every surface that wanted to name one reached for `o.center`. That is
 * the student's letter only when the centre is a point the student can see. Two kinds of circle break it:
 *
 *  - a HIDDEN scaffold circle (the tangent construction's Thales circle `tanaux-OE`, centre `~tanmid-OE`)
 *    is machinery — the student never made it and the canvas never draws it, so no surface may name it;
 *  - an UNNAMED circle («מעגל ברדיוս 3») has an ADR-342 anonymous centre `@ctr-O`. Its letter is the
 *    circle's REFERENCE TOKEN («מעגל O» resolves to it, and «הצג מרכזים» draws it), never a point.
 *
 * This is the circle edition of the ADR-447 anonymous-id seam (`src/render/pointDescriptions.ts`), kept
 * in the engine because the values panel is computed here and the engine may not import render. It
 * returns a STRUCTURED reference, never words — the display layer owns the wording.
 */
import { isScaffoldId } from './relations';
import type { Construction, Id } from './types';

export type CircleRef =
  /** the centre is a point the student sees — named by its letter, «רדיוס O» (unchanged since ADR-410). */
  | { via: 'centre'; name: Id }
  /** the only drawn circle, and its centre is anonymous — «רדיוס המעגל». */
  | { via: 'sole' }
  /** one of several drawn circles, centre anonymous — named by its ADR-342 reference token, «רדיוס מעגל O». */
  | { via: 'token'; name: string };

/** A circle the canvas draws: not `hidden`, and not a scaffold id (the `inkCrossings` predicate). */
export const isDrawnCircle = (o: { id: Id; hidden?: boolean }): boolean => !o.hidden && !isScaffoldId(o.id);

/** '@ctr-O' → 'O' (ADR-342's token), or a plain `circle-X` id's X; null when neither is a label. */
const tokenOf = (id: Id, center: Id): string | null => {
  const t = center.startsWith('@ctr-') ? center.slice(5) : id.startsWith('circle-') ? id.slice(7) : null;
  return t && /^[A-Z][A-Za-z0-9'′]*$/.test(t) ? t : null;
};

/**
 * The reference of every DRAWN circle, keyed by circle id. A hidden/scaffold circle is absent — a caller
 * that finds no entry must not name it at all.
 */
export function circleRefs(c: Construction): Map<Id, CircleRef> {
  const drawn = (c.objects.filter((o) => o.kind === 'circle') as { id: Id; center: Id; hidden?: boolean }[]).filter(isDrawnCircle);
  const out = new Map<Id, CircleRef>();
  for (const o of drawn) {
    if (!isScaffoldId(o.center)) out.set(o.id, { via: 'centre', name: o.center });
    else if (drawn.length === 1) out.set(o.id, { via: 'sole' });
    else {
      const token = tokenOf(o.id, o.center);
      // Several circles and no token: «המעגל» would be ambiguous and the id is not a word — so the circle
      // is not named. Unreached today (every drawn anonymous centre is an ADR-342 `@ctr-` id); recorded so
      // a future emitter cannot leak its id through this seam.
      if (token) out.set(o.id, { via: 'token', name: token });
    }
  }
  return out;
}
