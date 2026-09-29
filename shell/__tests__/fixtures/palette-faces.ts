/**
 * #1348 (ADR-W-095) — A PALETTE BUTTON INSERTS WHAT ITS FACE SHOWS.
 *
 * The analytic `≥` button inserted `>=`: its face promised the glyph and its payload was the keyboard
 * form, so a student pressed the symbol and got the two characters they pressed it to avoid. The rule,
 * checked per product over its own palette: a ONE-character face inserts exactly that character, unless
 * the entry says why not (`keyboardForm`). Multi-character faces are templates («|z|», «S_{}», «cis»)
 * and are not covered — their payload is a wrap by design.
 */
import type { SymbolSpec } from '../../symbols';

export function paletteFaceViolations(specs: readonly SymbolSpec[]): string[] {
  return specs
    .filter((s) => Array.from(s.label).length === 1)
    .filter((s) => (s.before !== s.label || (s.after ?? '') !== '') && !s.keyboardForm?.trim())
    .map((s) => `«${s.label}» inserts «${s.before}${s.after ? '…' + s.after : ''}»`);
}
