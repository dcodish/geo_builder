/**
 * WHAT A CURVE CLICK OFFERS FOR DISPLAY (#2238) — pure, so the lock can CALL it (the `letterOffer.ts` reason).
 *
 * Operator, 2026-10-16: *"in 2d, i can click a line and hide it or make it dashed but in analytics i cant and
 * this is needed"*. #1653 put 2-D's segment menu (`shell/frame/SegmentMenu`, ADR-W-106) on the analytic
 * builder's SEGMENTS; a curve — every line, a circle, a parabola, an ellipse — still opened only its measure
 * entries. This is the decision that turns a curve click into the same menu:
 *
 * - a LINE, PARABOLA or ELLIPSE offers hide/show **and** dashed/solid (operator, 2026-10-16: "a" — the same
 *   as a line);
 * - a CIRCLE offers hide/show alone — 2-D's circle menu (`src/render/Figure.tsx`).
 *
 * The display choice is filed under the curve's object id in the store's `curveStyle`; how it is inked is
 * `render/scene.ts` `curveInk`.
 */
import type { Figure } from '../engine/evaluate';
import type { CurveKind, Id } from '../engine/types';

export interface CurveMenuTarget {
  /** the key the choice is filed under — the curve's object id */
  id: Id;
  /** the menu's header: the curve's name (`ℓ1`, `מעגל I`), or its equation when it has no other name */
  title: string;
  kind: CurveKind;
  /** does the menu offer dashed/solid? (a circle: no — 2-D's circle menu) */
  dash: boolean;
}

/** Can this curve kind be dashed? Everything but a circle (2-D's circle menu has hide/show alone). */
export const curveDashable = (kind: CurveKind): boolean => kind !== 'circle';

/**
 * The display menu a click on curve `id` opens, or null when `id` names no DRAWN curve. Read off the FIGURE,
 * not the object list: a stated equation, a line through two points, a circle by its centre, a perpendicular
 * bisector are different object kinds, and every one of them is one drawn curve here, which is what was clicked.
 */
export function curveMenuOf(fig: Figure, id: Id): CurveMenuTarget | null {
  const o = fig.curves.find((x) => x.id === id && x.stated);
  if (!o) return null;
  const kind = o.curve.kind;
  return { id, title: o.label.name || o.label.eqSrc || '', kind, dash: curveDashable(kind) };
}
