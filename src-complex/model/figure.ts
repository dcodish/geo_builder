/**
 * F6 — OBJECTS: the things a student names on the plane that are not numbers.
 *
 * A segment between two numbers, a polygon over any number of them, a circle. These carry **no
 * constraint**: «המרובע OZ₁Z₂Z₃» does not say the quadrilateral is anything in particular, it says
 * *draw it*. That is the whole family — the exam prints a figure with the vertices joined up, and the
 * student needs the same picture in order to reason about it.
 *
 * Keeping them constraint-free is a deliberate honesty line. Reading «the quadrilateral OZ₁Z₂Z₃» as
 * "these four points form a *convex* quadrilateral in this order" would assert a shape the question
 * never gave ([ADR-052](../../docs/06-decisions.md#adr-052)); the exam's own figures are frequently
 * non-convex, and which configuration is drawn is what "show another configuration" is for. The
 * classification families (F11: מקבילית, מלבן …) are where a shape becomes a *claim* — checked, never
 * assumed.
 *
 * **The origin is always available.** `O` is a point of the plane, not a number the student declared,
 * so it may appear in any object without being introduced and it never becomes an unknown of the
 * system. Every corpus polygon uses it («המרובע OZ₁Z₂Z₃» is the §2b figure).
 */

import type { Expr } from './expr';

/** The reserved name of the origin. A student never declares it and never redefines it. */
export const ORIGIN = 'o';

export const isOrigin = (name: string): boolean => name.toLowerCase() === ORIGIN;

export type FigureObject =
  /** «הקטע Z₁Z₂» — exactly two endpoints */
  | { readonly kind: 'segment'; readonly points: readonly string[]; readonly src: string }
  /** «המשולש OZ₁Z₂», «המרובע OZ₁Z₂Z₃», «המצולע …» — three or more vertices, in the stated order */
  | { readonly kind: 'polygon'; readonly points: readonly string[]; readonly src: string }
  /** «המעגל שמרכזו O ורדיוסו r» — a centre and a radius the student stated */
  | { readonly kind: 'circle'; readonly center: string; readonly radius: Expr; readonly src: string }
  /** «המעגל החוסם את המשולש ABC» — the circle through three named points */
  | { readonly kind: 'circumcircle'; readonly points: readonly string[]; readonly src: string };

/** Every name an object mentions, the origin included. */
export const objectPoints = (o: FigureObject): readonly string[] =>
  o.kind === 'circle' ? [o.center] : o.points;

/**
 * The names an object brings into the figure — the origin excluded.
 *
 * An object DECLARES its vertices, so «המרובע OZ₁Z₂Z₃» is enough to put Z₁, Z₂ and Z₃ on the canvas
 * (always visualise). The origin is not declared because it is not an unknown: adding it to the
 * solver's name list would give the system a variable that is not free and not determined by anything,
 * and it would show up in the free-DOF count as a degree of freedom the question does not have.
 */
export const objectDeclares = (o: FigureObject): string[] =>
  objectPoints(o).filter((n) => !isOrigin(n));
