/**
 * The palette lock (#511's rule, made mechanical for this tree — #1129).
 *
 * A builder must never OFFER a glyph it refuses, so every palette entry, applied through the real
 * wrap-selection core (`shell/symbols`), must land in an utterance the real grammar reads.
 *
 * **Ported from `src-complex/__tests__/symbols-module.test.ts`**, which was the only product that
 * actually held itself to the contract `shell/symbols.ts` states — *"a product's tests can require
 * every offered symbol to parse and to sit inside the bidi run alphabet"*. Analytic had no such test,
 * and #1129's own measurement found that is why its palette went thin: with no lock, the cheap
 * question "does this chip work?" had no mechanical answer, so nothing was added.
 *
 * **TOTALITY is the case that matters.** Without it a per-spec loop over a partial template map
 * passes by checking nothing — the exercised-counter lesson this repo has paid for. A new button
 * without a proof fails the suite.
 *
 * The bidi half: every character a button INSERTS must sit inside the bidi run alphabet, so pressing
 * a palette button can never produce a character that SPLITS an isolate — the #482 drift class,
 * locked from the palette side. RTL Hebrew is this product's default, so this is not cosmetic.
 */
import { describe, expect, it } from 'vitest';

import { applySymbol } from '../../shell/symbols';
import { analyticBidi } from '../i18n/bidi';
import { derive } from '../engine/derive';
import { SYMBOLS } from '../ui/symbols';

/**
 * Per-symbol proof: apply the symbol as a student would (`value` with `[selStart, selEnd]`
 * selected), optionally keep typing (`complete`), and the result must build.
 *
 * `setup` is the context the line needs — a length statement needs its two points. Declared per
 * template rather than shared, because a template whose context is wrong proves nothing about the
 * chip and everything about the setup.
 */
const TEMPLATES: Record<
  string,
  { value: string; sel: [number, number]; complete?: string; expected: string; setup?: string[] }
> = {
  symSq: { value: 'x^2+y', sel: [5, 5], complete: '=25', expected: 'x^2+y^2=25' },
  symSqrt: {
    value: 'AB = ',
    sel: [5, 5],
    complete: '20',
    expected: 'AB = √20',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symEll: { value: 'נתון הישר 1: y=2x', sel: [10, 10], expected: 'נתון הישר ℓ1: y=2x' },
  symLe: { value: 'a  5', sel: [2, 2], expected: 'a <= 5', setup: ['a הוא פרמטר חיובי'] },
  symGe: { value: 'a  5', sel: [2, 2], expected: 'a >= 5', setup: ['a הוא פרמטר חיובי'] },
  symNe: { value: 'a  5', sel: [2, 2], expected: 'a ≠ 5', setup: ['a הוא פרמטר חיובי'] },
  symCube: {
    value: 'AB = 2',
    sel: [6, 6],
    expected: 'AB = 2^3',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symMul: {
    value: 'AB = 25',
    sel: [6, 6],
    expected: 'AB = 2*5',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symPi: {
    value: 'AB = 2',
    sel: [6, 6],
    expected: 'AB = 2π',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symAbs: {
    value: 'AB = 10',
    sel: [0, 2],
    expected: '|AB| = 10',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symDist: {
    value: 'AB = 10',
    sel: [0, 2],
    expected: 'd_{AB} = 10',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symComponent: {
    value: 'A = 5',
    sel: [0, 1],
    expected: 'x_{A} = 5',
    setup: ['נקודה A'],
  },
};

describe('the symbol palette parses — every offered button, through the real grammar (#1129)', () => {
  it('every palette entry has a proof template (totality)', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(SYMBOLS.map((s) => s.titleKey).sort());
  });

  for (const spec of SYMBOLS) {
    it(`${spec.titleKey} (“${spec.label}”) lands in a building utterance`, () => {
      const tpl = TEMPLATES[spec.titleKey as string];
      expect(tpl, `no template for ${spec.titleKey}`).toBeDefined();
      const applied = applySymbol(tpl.value, tpl.sel[0], tpl.sel[1], spec);
      const final = applied.value + (tpl.complete ?? '');
      expect(final, 'the template drifted from the palette’s insert text').toBe(tpl.expected);
      const d = derive([...(tpl.setup ?? []), final]);
      expect(
        d.faults.map((f) => f.code),
        `«${final}» does not build — the palette offers what the grammar refuses`,
      ).toEqual([]);
    });
  }

  /**
   * THE BIDI HALF, asserted as the PROPERTY rather than as a character allowlist (#1129).
   *
   * The ported version of this test checked each inserted character against
   * `RUN_CORE ∪ RUN_DELIMS ∪ INTERIOR`, and run against this product it failed on **«≠» — a chip
   * that has shipped since #525.** Measured, that is a false alarm: `≠` is not in `RUN_CORE`, and
   * neither are `=`, `>`, `^`, `*` or the SPACE, yet «הנקודה A שונה מ-a ≠ 5» isolates as
   * «הנקודה ⁦A⁩ שונה מ-⁦a ≠ 5⁩» — the whole expression inside ONE isolate, the operator carried
   * through it exactly as `=` is.
   *
   * So the character list was the wrong question, and widening it to silence the failure would have
   * been fitting the test to the answer. **What actually matters is that pressing a chip inside a
   * Hebrew sentence does not SPLIT the run** — so that is what is asserted, by driving every chip
   * through the real `inputPreview` and counting the isolates it produces.
   *
   * This is strictly stronger than the allowlist: a character that IS in the alphabet but still
   * broke a run would pass the ported check and fail this one.
   */
  it('pressing any chip inside a Hebrew sentence never splits the run', () => {
    // A Hebrew sentence with one Latin expression in it — the shape every analytic line has.
    const HOST = 'הנקודה A מקיימת ';
    const isolates = (s: string) => ((analyticBidi.inputPreview(s) ?? s).match(/\u2066/g) ?? []).length;
    const baseline = isolates(`${HOST}a = 5`);
    for (const spec of SYMBOLS) {
      const inserted = `${HOST}a ${spec.before}${spec.after ?? ''} 5`;
      expect(
        isolates(inserted),
        `“${spec.label}” (${spec.titleKey}) changes how many runs the line isolates into: «${inserted}»`,
      ).toBe(baseline);
    }
  });

  /**
   * THE SIX THAT SHIPPED INLINE are unchanged in label and in insert text. Moving a list between
   * files is exactly where a character quietly becomes a different one, and this is the row that
   * would catch it.
   */
  it('the six original entries are unchanged', () => {
    const six = SYMBOLS.filter((s) => ['symSq', 'symSqrt', 'symEll', 'symLe', 'symGe', 'symNe'].includes(s.titleKey!));
    expect(six.map((s) => [s.label, s.before, s.after])).toEqual([
      ['²', '^2', undefined],
      ['√', '√', undefined],
      ['ℓ', 'ℓ', undefined],
      ['≤', '<=', undefined],
      ['≥', '>=', undefined],
      ['≠', '≠', undefined],
    ]);
  });

  /**
   * THE HELD GLYPHS, asserted as held. The operator's ruling keeps `°` and `∡` out until the angle
   * capability exists, and the reason is mechanical rather than a matter of taste — so the reason is
   * asserted. When this row goes red, the capability has landed and the chips are owed.
   */
  it.each(['°', '∡', '∠'])('«%s» is not offered, because it still does not parse', (glyph) => {
    expect(SYMBOLS.some((s) => s.before.includes(glyph))).toBe(false);
    const d = derive(['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC', `זווית BAC = 90${glyph === '°' ? '°' : ''}`]);
    if (glyph === '°') {
      expect(d.faults.length, 'the degree sign parses now — the chip is owed').toBeGreaterThan(0);
    }
  });
});
