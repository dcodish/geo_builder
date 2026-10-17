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
 *
 * #2264 ([ADR-714](../../docs/06-decisions.md#adr-714)) — a centre letter names a circle only while it is
 * UNIQUE. Two drawn circles that share a centre («שני מעגלים בעלי מרכז משותף O») both answered «O»; the
 * construction already tells them apart by the concentric pair's own record (`innerOf`, stamped by
 * `set-radius-order`, ADR-244), so they are named by that ROLE — «המעגל החיצוני» / «המעגל הפנימי»
 * (operator ruling 2026-10-16, option A).
 */
import { isScaffoldId } from './relations';
import type { Construction, Id } from './types';

export type CircleRef =
  /** the centre is a point the student sees — named by its letter, «רדיוס O» (unchanged since ADR-410). */
  | { via: 'centre'; name: Id }
  /** the only drawn circle, and its centre is anonymous — «רדיוס המעגל». */
  | { via: 'sole' }
  /** one of several drawn circles, centre anonymous — named by its ADR-342 reference token, «רדיוס מעגל O». */
  | { via: 'token'; name: string }
  /** one of a concentric PAIR (exactly two drawn circles on one centre, ordered by `innerOf`) — named by its
   *  role, «רדיוס המעגל החיצוני» / «רדיוס המעגל הפנימי» (#2264). */
  | { via: 'role'; role: 'outer' | 'inner' };

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
  const drawn = (c.objects.filter((o) => o.kind === 'circle') as { id: Id; center: Id; hidden?: boolean; innerOf?: Id }[]).filter(isDrawnCircle);
  const out = new Map<Id, CircleRef>();
  // #2264: a centre shared by exactly two drawn circles, one recorded as the other's inner (`innerOf`), names
  // neither — each is its role. A shared centre with no recorded order (or three circles on one centre) keeps
  // the branches below: no role the construction does not record is invented.
  const byCentre = new Map<Id, (typeof drawn)[number][]>();
  for (const o of drawn) byCentre.set(o.center, [...(byCentre.get(o.center) ?? []), o]);
  for (const pair of byCentre.values()) {
    if (pair.length !== 2) continue;
    const [a, b] = pair as [(typeof drawn)[number] & { innerOf?: Id }, (typeof drawn)[number] & { innerOf?: Id }];
    const inner = a.innerOf === b.id ? a : b.innerOf === a.id ? b : null;
    if (!inner) continue;
    out.set(inner.id, { via: 'role', role: 'inner' });
    out.set((inner === a ? b : a).id, { via: 'role', role: 'outer' });
  }
  for (const o of drawn) {
    if (out.has(o.id)) continue;
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
