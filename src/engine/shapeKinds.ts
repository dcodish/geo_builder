/**
 * Which declared shape PHRASES no circle can pass around ([ADR-595](../../docs/06-decisions.md#adr-595),
 * [ADR-607](../../docs/06-decisions.md#adr-607)) — the ONE table, analytic's `SHAPES[…].notCyclic` (ADR-AG-198).
 *
 * A right trapezoid inscribed in a circle can only be a rectangle (a cyclic trapezoid is isosceles, and an
 * isosceles trapezoid with a right angle has four), and a rectangle is not a trapezoid — the 2026-10-01 ruling on
 * #1554. The parser's shape-phrase reader (`parser/shapePhrase.ts`) reads it to refuse the one-line sentence
 * («טרפז ישר זווית ABCD חסום במעגל»); the engine reads it to refuse the same pair stated in two lines, in either
 * order (`cyclicFeasibility.ts`, the 2026-10-08 ruling on #1918). It lives in the engine because the engine may
 * not import the parser, and both must answer from one table.
 */
export const NOT_CYCLIC: Readonly<Record<string, string>> = { 'right-trapezoid': 'rectangle' };
