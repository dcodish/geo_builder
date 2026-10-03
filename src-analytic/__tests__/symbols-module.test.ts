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
  symSq: { value: 'x^2+y', sel: [5, 5], complete: '=25', expected: 'x^2+y²=25' }, // #1348: the button inserts the glyph on its face
  symSqrt: {
    value: 'AB = 20',
    sel: [5, 7],
    expected: 'AB = √(20)', // #1696: a WRAP — the selected radicand lands inside the brackets
    setup: ['A(0,0)', 'נקודה B'],
  },
  symEll: { value: 'נתון הישר 1: y=2x', sel: [10, 10], expected: 'נתון הישר ℓ1: y=2x' },
  symLe: { value: 'a  5', sel: [2, 2], expected: 'a ≤ 5', setup: ['a הוא פרמטר חיובי'] },
  symGe: { value: 'a  5', sel: [2, 2], expected: 'a ≥ 5', setup: ['a הוא פרמטר חיובי'] },
  symNe: { value: 'a  5', sel: [2, 2], expected: 'a ≠ 5', setup: ['a הוא פרמטר חיובי'] },
  symCube: {
    value: 'AB = 2',
    sel: [6, 6],
    expected: 'AB = 2³',
    setup: ['A(0,0)', 'נקודה B'],
  },
  symMul: {
    value: 'AB = 25',
    sel: [6, 6],
    expected: 'AB = 2·5',
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
  // #1696 (ADR-AG-212) — the 2-D chips analytic now reads.
  symPerp: { value: 'AD  BC', sel: [3, 3], expected: 'AD ⊥ BC', setup: ['משולש ABC', 'D על BC'] },
  symPar: { value: 'AB  CD', sel: [3, 3], expected: 'AB ∥ CD', setup: ['מרובע ABCD'] },
  symAngle: { value: 'ABC = 37', sel: [0, 0], expected: '∠ABC = 37', setup: ['משולש ABC'] },
  symDeg: { value: '∠ABC = 90', sel: [9, 9], expected: '∠ABC = 90°', setup: ['משולש ABC'] },
  // #1621 D2 (ADR-AG-215) — the Greek angle names: an angle named by one, free until pinned.
  symAlpha: { value: '∠ABC = 2', sel: [8, 8], expected: '∠ABC = 2α', setup: ['משולש ABC'] },
  symBeta: { value: '∠ABC = 2', sel: [8, 8], expected: '∠ABC = 2β', setup: ['משולש ABC'] },
  symGamma: { value: '∠ABC = 2', sel: [8, 8], expected: '∠ABC = 2γ', setup: ['משולש ABC'] },
  symDelta: { value: '∠ABC = 2', sel: [8, 8], expected: '∠ABC = 2δ', setup: ['משולש ABC'] },
  symTheta: { value: '∠ABC = 2', sel: [8, 8], expected: '∠ABC = 2θ', setup: ['משולש ABC'] },
  // #1621 D3 (ADR-AG-216) — an order between two measures.
  symLt: { value: 'AB  BC', sel: [3, 3], expected: 'AB < BC', setup: ['משולש ABC'] },
  // #1621 (ADR-AG-214) — the area notation, wrapped around the selected vertices.
  symArea: { value: 'ABC = 13', sel: [0, 3], expected: 'S_{ABC} = 13', setup: ['משולש ABC'] },
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
      // #1348 (ADR-W-095): changed ON PURPOSE — each face now inserts its own glyph
      ['²', '²', undefined],
      ['√()', '√(', ')'], // #1696: changed ON PURPOSE — 2-D's wrapping radical
      ['ℓ', 'ℓ', undefined],
      ['≤', '≤', undefined],
      ['≥', '≥', undefined],
      ['≠', '≠', undefined],
    ]);
  });

  /**
   * THE HELD 2-D CHIPS, asserted as held — and as UNREAD, not merely refused (#1696, ADR-AG-212).
   *
   * The row this replaces held `°` with «זווית BAC = 90°» on A(0,0) B(4,0) C(1,3) — a triangle whose angle
   * at A is fixed near 72°, so the line faulted `unsatisfiable` and the "does not parse" claim passed by
   * contradiction for as long as `°` had parsed. So each sentence here sits on a figure where it COULD
   * hold, and the fault must be a READING fault: when one of these starts to parse, this goes red and its
   * chip is owed in that notation's own PR (#1621 / #1622).
   */
  const READING = ['not-handled', 'bad-equation', 'bad-operand'];
  it.each<[string, string[], string]>([
    ['△', ['משולש ABC', 'משולש DEF'], '△ABC ≅ △DEF'],
    ['~', ['משולש ABC', 'משולש DEF'], 'ABC ~ DEF'],
    ['⌢', ['x^2+y^2=25', 'A על המעגל', 'C על המעגל'], '⌢{AC} = 60°'],
  ])('«%s» is not offered, because «%s · %s» is still not read', (glyph, setup, line) => {
    expect(SYMBOLS.some((s) => s.before.includes(glyph) || s.label.includes(glyph))).toBe(false);
    const d = derive([...setup, line]);
    expect(d.faults.filter((f) => f.index < setup.length), 'the setup itself must build').toEqual([]);
    const fault = d.faults.find((f) => f.index === setup.length);
    expect(fault?.code, `«${line}» reads now — the «${glyph}» chip is owed`).toBeDefined();
    expect(READING).toContain(fault!.code);
  });
});
