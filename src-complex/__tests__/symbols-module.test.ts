/**
 * The palette lock (#511's rule, made mechanical for this tree): a builder must never OFFER a
 * glyph it refuses — so every palette entry, applied through the real wrap-selection core
 * (shell/symbols), must land in an utterance the real grammar reads.
 *
 * TOTALITY: every entry in `ui/symbols.ts` must have a template here — a new button without a
 * proof fails the suite, which is what makes the palette a module worth asserting (#482).
 *
 * The bidi half: every character a button INSERTS must sit inside the bidi run alphabet (or be a
 * hugging delimiter / an interior expression neutral), so pressing a palette button can never
 * produce a character that SPLITS an isolate — the #482 drift class, locked from the palette side.
 */
import { describe, expect, it } from 'vitest';

import { applySymbol } from '../../shell/symbols';
import { complexBidi } from '../i18n';
import { parseLineV2 } from '../parser/rules';
import { SYMBOLS } from '../ui/symbols';

/**
 * Per-symbol proof: apply the symbol as a student would (`value` with `[selStart, selEnd]`
 * selected), optionally keep typing (`complete`), and the result must parse.
 */
const TEMPLATES: Record<
  string,
  { value: string; sel: [number, number]; complete?: string; expected: string }
> = {
  symConj: { value: 'w = z1', sel: [4, 6], expected: 'w = conj(z1)' },
  symAbs: { value: 'w = z1', sel: [4, 6], expected: 'w = |z1|' },
  symInv: { value: 'w = z1', sel: [4, 6], expected: 'w = 1/(z1)' },
  symRe: { value: 'w = z1', sel: [4, 6], expected: 'w = re(z1)' },
  symIm: { value: 'w = z1', sel: [4, 6], expected: 'w = im(z1)' },
  symCis: { value: 'z1 = 2', sel: [6, 6], complete: '150', expected: 'z1 = 2cis 150' },
  symI: { value: 'z1 = 3+4', sel: [8, 8], expected: 'z1 = 3+4i' },
  symDeg: { value: 'z1 = 2cis30', sel: [11, 11], expected: 'z1 = 2cis30°' },
  symPow: { value: 'w = z1', sel: [6, 6], complete: '2', expected: 'w = z1^2' },
  symMul: { value: 'w = z1', sel: [6, 6], complete: 'z2', expected: 'w = z1*z2' },
  symDist: { value: 'z1z2', sel: [0, 4], expected: 'd_{z1z2}' },
  symTheta: { value: 'z1 = 2cis(', sel: [10, 10], complete: ')', expected: 'z1 = 2cis(θ)' },
  symAlpha: { value: 'z1 = 2cis(', sel: [10, 10], complete: ')', expected: 'z1 = 2cis(α)' },
  symBeta: { value: 'z1 = 2cis(', sel: [10, 10], complete: ')', expected: 'z1 = 2cis(β)' },
};

describe('the symbol palette parses — every offered button, through the real grammar', () => {
  it('every palette entry has a proof template (totality)', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(SYMBOLS.map((s) => s.titleKey).sort());
  });

  for (const spec of SYMBOLS) {
    it(`${spec.titleKey} (“${spec.label}”) lands in a parsing utterance`, () => {
      // complex's palette always carries titleKey (the tooltip i18n key); shell made it optional
      // for products without per-symbol tooltips (3-D)
      const tpl = TEMPLATES[spec.titleKey as string];
      expect(tpl, `no template for ${spec.titleKey}`).toBeDefined();
      const applied = applySymbol(tpl.value, tpl.sel[0], tpl.sel[1], spec);
      const final = applied.value + (tpl.complete ?? '');
      expect(final, `template drifted from the palette's insert`).toBe(tpl.expected);
      const parsed = parseLineV2(final);
      expect(parsed.ok, `«${final}» does not parse — the palette offers what the grammar refuses`).toBe(true);
    });
  }

  it('every inserted character stays inside the bidi run vocabulary (never splits an isolate)', () => {
    // Interior expression neutrals: legal between the first and last CORE character of a run,
    // where the isolation algorithm carries them; a palette insert never starts or ends a
    // completed statement with one of these alone.
    const INTERIOR = ' */^';
    for (const spec of SYMBOLS) {
      for (const ch of (spec.before + (spec.after ?? '')).split('')) {
        const ok =
          complexBidi.RUN_CORE.test(ch) ||
          complexBidi.RUN_DELIMS.includes(ch) ||
          INTERIOR.includes(ch);
        expect(ok, `palette inserts “${ch}” (in ${spec.titleKey}) — outside the bidi run vocabulary`).toBe(true);
      }
    }
  });
});
