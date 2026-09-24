/**
 * #1401 (ADR-W-088) — the fact-row DIRECTION suite, asserted by RENDERING the shared `FactList`.
 *
 * Operator, 2026-09-24: *"we solved this for 2d so we need to ensure that fix works for all tools"* —
 * analytic's list showed «∠ABC = ∠ACB» as «ABC = ∠ACB∠». The row's base direction was each caller's
 * job, set (or not) inside its own `rows={…}` callback; 2-D set it, analytic did not, complex forced
 * `ltr` on Hebrew lines. The decision now lives in `FactList`, which takes the product's `textDir` and
 * derives each row's `dir` from `FactRow.text`.
 *
 * ## Why the rows are here and the assertions are in four files
 *
 * `shell/` may never import a product tree (ADR-W-016 rule 2), so one test cannot call four products'
 * `textDir`. The rows and checks live once, each tree runs them against its own function, and a
 * meta-lock (`issue-1401-suite-bites.test.tsx`) proves they can go red — the docs/28 §5c pattern.
 *
 * Test-only data: nothing here is imported by runtime code.
 */
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactList as SharedFactList, type FactListProps } from '../../frame/FactList';

/**
 * Rows with NO Hebrew letter: the base must be LTR, or a leading neutral (`∠`, `|`, `(`) resolves to
 * the app's RTL and lands at the far end. The first two are the operator's own #1401 lines.
 */
export const LTR_ROWS = ['∠ABC = ∠ACB', '∠ABC = 90', '|AB| = 5', 'A(0,0)'];

/**
 * Rows WITH Hebrew: the base must be RTL, including the ones that OPEN with a Latin label — that is
 * the `dir="auto"` failure (#118, #934), where the first strong character decided and the Hebrew
 * words reordered against each other.
 */
export const RTL_ROWS = ['משולש ABC', 'K על AB', 'E אמצע AB', '∠ABC = 90 במשולש ABC'];

export interface FactRowDirExpectations {
  /** The product's name, for test titles. */
  product: string;
  /**
   * How the product RENDERS a row's content from its text. Default: the text itself. A product whose
   * row renderer is callable (3-D's `FactRowText3`) passes it, so the check also sees the real content.
   */
  render?: (text: string) => ReactNode;
  /** The chrome under test. Default: the shared `FactList`; the meta-lock substitutes broken ones. */
  List?: (props: FactListProps) => ReactNode;
}

/** Every `data-fact-text` scope in rendered markup: its `dir` and its text, in row order. */
function scopes(html: string): { dir: string | null; text: string }[] {
  const out: { dir: string | null; text: string }[] = [];
  const open = /<div([^>]*)data-fact-text=""([^>]*)>/g;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const attrs = m[1] + m[2];
    const dir = /\bdir="(rtl|ltr|auto)"/.exec(attrs)?.[1] ?? null;
    // the scope's text: up to the matching close, tags stripped (the content is shallow here)
    let depth = 1;
    const i = open.lastIndex;
    const tag = /<(\/?)div\b[^>]*>/g;
    tag.lastIndex = i;
    let end = html.length;
    for (let t = tag.exec(html); t; t = tag.exec(html)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    const text = html.slice(i, end).replace(/<[^>]+>/g, '').replace(/[\u2066-\u2069]/g, '');
    out.push({ dir, text });
  }
  return out;
}

/**
 * THE CHECKS, as a pure function returning human-readable faults — empty means the rows are right.
 * Both the per-tree locks and the meta-lock call THIS, never a copy (ADR-W-053).
 */
export function factRowDirFaults(textDir: (s: string) => 'rtl' | 'ltr', opts: FactRowDirExpectations): string[] {
  const { product, render = (s: string) => s, List = SharedFactList } = opts;
  const all = [...LTR_ROWS, ...RTL_ROWS];
  const html = renderToStaticMarkup(
    <List rows={all.map((text, i) => ({ id: String(i), text, content: render(text) }))} emptyHint="" textDir={textDir} />,
  );
  const got = scopes(html);
  const faults: string[] = [];
  if (got.length !== all.length) {
    faults.push(`${product}: ${all.length} rows rendered ${got.length} direction scopes — a row with no content direction`);
    return faults;
  }
  all.forEach((row, i) => {
    const want = LTR_ROWS.includes(row) ? 'ltr' : 'rtl';
    if (got[i].dir !== want) faults.push(`${product}: «${row}» got dir=${got[i].dir ?? 'none'}, want ${want}`);
  });
  // the reported shape: the `∠` is the FIRST character of the scope's logical order, so an LTR base
  // puts it in front of «ABC» on screen — not after «90», where an RTL base puts it
  LTR_ROWS.forEach((row, i) => {
    if (row.startsWith('∠') && !got[i].text.trimStart().startsWith('∠')) {
      faults.push(`${product}: «${row}» — the ∠ is not first in the row's text («${got[i].text}»)`);
    }
  });
  return faults;
}

/** The thin per-tree wrapper: one `it` per concern, over `factRowDirFaults`. */
export function factRowDirSuite(textDir: (s: string) => 'rtl' | 'ltr', opts: FactRowDirExpectations): void {
  describe(`#1401 — ${opts.product}: a fact row's direction comes from its CONTENT, through the shared FactList`, () => {
    it('a ∠-first row is LTR, a Hebrew row (even Latin-first) is RTL', () => {
      expect(factRowDirFaults(textDir, opts)).toEqual([]);
    });
  });
}
