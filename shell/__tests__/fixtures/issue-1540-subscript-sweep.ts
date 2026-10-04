/**
 * #1540 (ADR-W-111) — the CATALOG SUBSCRIPT SWEEP, run by each product against its own catalog.
 *
 * The shared renderer used to typeset only the braced `x_{B}`, while the catalogs teach the bare `x_B`.
 * The sweep: every catalog example, rendered the way rows are (`hasMath ? mathHtml : text`), leaves no
 * literal `_` outside MathML, and renders identically in its bare and braced spellings.
 *
 * `shell/` may never import a product tree, and no tree may import all four, so the sweep lives here
 * once and each product's `__tests__` hands it its own catalog (the `issue-1152-preview-rows.ts` shape).
 *
 * Test-only data: nothing here is imported by runtime code.
 */
import { describe, expect, it } from 'vitest';
import { hasMath, mathHtml } from '../../math';

/** What every product's row does: typeset when `hasMath`, else the verbatim text. */
export const display = (t: string): string => (hasMath(t) ? mathHtml(t) : t);
/** The text that is NOT inside a MathML island. */
export const outsideMath = (html: string): string => html.replace(/<math>[\s\S]*?<\/math>/g, '');
/** Rewrite every bare subscript to the braced spelling (same lone-letter rule as the renderer). */
export const braced = (t: string): string => t.replace(/(?<![A-Za-z0-9])([A-Za-z])_([A-Za-z0-9]+)/g, '$1_{$2}');

/** Every example string of a catalog whose entries carry `he` and `en`. */
export const examplesOf = (catalog: ReadonlyArray<{ he: string; en: string }>): string[] =>
  catalog.flatMap((e) => [e.he, e.en]);

/** The examples that would show a literal underscore, or render differently bare vs braced. */
export function subscriptSweepFaults(examples: readonly string[]): string[] {
  const faults: string[] = [];
  for (const t of examples) {
    if (outsideMath(display(t)).includes('_')) faults.push(`raw _ in «${t}»`);
    if (display(t) !== display(braced(t))) faults.push(`bare≠braced for «${t}»`);
  }
  return faults;
}

/**
 * Register the sweep for one product. `bareRows` is the minimum number of examples carrying a bare
 * subscript (0 for a catalog that has none today), so the sweep cannot pass by reading nothing.
 */
export function subscriptSweepSuite(product: string, examples: readonly string[], bareRows: number): void {
  describe(`#1540 — ${product} catalog: no example shows a literal subscript underscore`, () => {
    it('the sweep is not vacuous', () => {
      expect(examples.length).toBeGreaterThan(20);
      expect(examples.filter((t) => braced(t) !== t).length).toBeGreaterThanOrEqual(bareRows);
    });
    it('every example typesets its subscripts, identically in both spellings', () => {
      expect(subscriptSweepFaults(examples)).toEqual([]);
    });
  });
}
