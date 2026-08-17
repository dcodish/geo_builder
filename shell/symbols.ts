/**
 * The symbol-palette core — the module mechanism of #482 ("a module can be asserted") plus the
 * WRAP-SELECTION insert behaviour, which is the settled target for every builder (docs/28 §4a D5:
 * complex's wrap-selection strictly subsumes caret-insert — an empty selection IS a caret insert,
 * and the 2-D `caretBack` case falls out of `after`).
 *
 * The palette DATA stays per product (the operator's #525 ruling: shared core + per-tool
 * extension — "only relevant symbols appear per tool"); what is shared is the SHAPE that makes a
 * palette assertable and the one insert function, so a product's tests can require every offered
 * symbol to parse and to sit inside the bidi run alphabet.
 */

export interface SymbolSpec {
  /** Shown on the button. Display only — never inserted. */
  label: string;
  /** The i18n key of the button's tooltip (translated by the product). */
  titleKey: string;
  /** Inserted before the selection (or at the caret when the selection is empty). */
  before: string;
  /** Inserted after the selection — the wrapping half. Omitted = plain insert. */
  after?: string;
}

/**
 * Apply a palette symbol to an input value: wrap the `[selStart, selEnd)` selection in
 * `before`/`after`, returning the next value and where the caret lands — after the selection,
 * before `after`, so an empty selection leaves the caret between the wrap (`|` + `|` → `|·|` with
 * the caret inside; `conj(` + `)` → caret between the parens). Pure, so it is testable without a
 * DOM; the caller owns focus and `setSelectionRange`.
 */
export function applySymbol(
  value: string,
  selStart: number,
  selEnd: number,
  spec: SymbolSpec,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selStart, value.length));
  const end = Math.max(start, Math.min(selEnd, value.length));
  const selected = value.slice(start, end);
  return {
    value: value.slice(0, start) + spec.before + selected + (spec.after ?? '') + value.slice(end),
    caret: start + spec.before.length + selected.length,
  };
}
