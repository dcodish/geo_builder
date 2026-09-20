/**
 * #1195 — THE INPUT PREVIEW SHOWS THE VECTOR NOTATION AS IT WILL RENDER.
 *
 * **Operator, 2026-09-18, playing round #1193 T1:** *"I want to have the correct text appear below the
 * text like we do when hebrew is involved so the user sees the real input. the text should show like in
 * the input box with the arrow above the vector."*
 *
 * The box holds the characters they typed — `DC→=3AB→`. The step row, once submitted, shows the textbook
 * form with the arrow over the letters. Between typing and submitting there was nothing at all:
 *
 * ```
 * typed                     preview BEFORE
 * DC→=3AB→                  null      ← nothing
 * DC⃗=3AB⃗                   null
 * וקטור DC = 3 וקטור AB      "וקטור ⁦DC = 3⁩ וקטור ⁦AB⁩"   ← the Hebrew case that DID work
 * ```
 *
 * ## The lock is a COMPARISON, not a spelling
 *
 * The whole point is that the preview and the step row agree, so asserting the preview against a written-
 * out string would let the two drift apart while both tests stayed green — exactly what this issue is
 * about ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)). Every row below is asserted
 * against `factDisplay3`'s output for the same line.
 *
 * Bidi isolate characters are stripped from both sides before comparing: the preview isolates because it
 * renders inside an RTL page, the step row is isolated by its own renderer, and they are display
 * scaffolding rather than content. What must match is the NOTATION.
 */
import { describe, expect, it } from 'vitest';
import { factDisplay3, inputPreviewDisplay3 } from '../render/notation';
import { isVectorMarked3 } from '../lexicon/marks3';
import { stripFormatControls } from '../../shell/bidi';

const NO_VECTORS = new Set<string>();

/** What the step row will show, once the line is a fact. */
const rowFor = (utterance: string, cmdTypes: string[]) =>
  stripFormatControls(factDisplay3({ utterance, cmds: cmdTypes.map((type) => ({ type })) }, NO_VECTORS));

/** What the strip shows while they are still typing. */
const previewFor = (utterance: string) => {
  const p = inputPreviewDisplay3(utterance, NO_VECTORS);
  return p === null ? null : stripFormatControls(p);
};

describe('#1195 — a marked line previews what the row will show', () => {
  /**
   * The four spellings of one marking. Each is asserted against `factDisplay3` for a `vec-rel` fact —
   * which is what these lines become — so the preview cannot drift from the row.
   */
  it.each([
    ['a spacing arrow, the operator’s own line', 'DC→=3AB→'],
    ['the combining arrow', 'DC⃗=3AB⃗'],
    ['the long arrow', 'DC⟶=3AB⟶'],
    ['the vector WORD', 'וקטור DC = 3 וקטור AB'],
  ])('%s previews exactly what the step row will show', (_name, line) => {
    const preview = previewFor(line);
    const row = rowFor(line, ['vec-rel']);
    // A preview of `null` means "the box already shows this" — which is only honest when the box's own
    // text IS the row's text. Either way the two surfaces must agree.
    expect(preview ?? stripFormatControls(line)).toBe(row);
  });

  /** The reported case, stated once concretely so a reader can see what changed. */
  it('«DC→=3AB→» now previews the arrow form instead of nothing', () => {
    expect(inputPreviewDisplay3('DC→=3AB→', NO_VECTORS)).not.toBeNull();
    expect(previewFor('DC→=3AB→')).toBe('DC⃗=3AB⃗');
  });
});

/**
 * THE ANTI-ASSERTION GUARD — the row that proves the gate is load-bearing.
 *
 * `vectorNotation` is UNCONDITIONAL: measured, it turns «אורך AB = 5» into «אורך AB⃗ = 5» and a bare
 * `DC=3AB` into `DC⃗=3AB⃗`. The caller supplies the honesty gate, always. An arrow on a length statement
 * would assert vector-ness the student never claimed (#313's words), so the preview may never add one to
 * a line they did not mark.
 */
describe('#1195 — an UNMARKED line never grows an arrow', () => {
  it.each([
    ['a length statement', 'אורך AB = 5'],
    ['a bare pair equality — #1183 is the story of this being ASKED', 'DC=3AB'],
    ['ordinary prose', 'משולש ABC'],
    ['a coordinate', 'נקודה A(0,0,0)'],
  ])('%s: «%s» previews no arrow', (_name, line) => {
    const p = previewFor(line);
    expect(p ?? '').not.toContain('⃗');
  });

  /**
   * And the bidi half still works for them — an unmarked Hebrew line keeps the preview it always had.
   * Without this the guard above could be satisfied by returning `null` for everything.
   */
  it('an unmarked Hebrew line still gets its bidi preview', () => {
    expect(previewFor('אורך AB = 5')).toBe('אורך AB = 5');
  });
});

/**
 * THE `null`-WHEN-NOTHING-CHANGES CONTRACT. A plain line must not grow an empty second row under the box
 * — but the contract must not swallow `DC⃗=3AB⃗`, which is pure LTR, needs no isolation, and is the very
 * line the operator was looking at. That tension is why this block exists.
 */
describe('#1195 — the preview appears exactly when it has something to add', () => {
  it('a line already IN the final form previews null — the box is not lying', () => {
    expect(inputPreviewDisplay3('DC⃗=3AB⃗', NO_VECTORS)).toBeNull();
  });

  it('but the same line typed with a SPACING arrow does preview', () => {
    expect(inputPreviewDisplay3('DC→=3AB→', NO_VECTORS)).not.toBeNull();
  });

  it('a plain LTR line still previews null', () => {
    expect(inputPreviewDisplay3('DC=3AB', NO_VECTORS)).toBeNull();
  });
});

/**
 * THE MARKING VOCABULARY IS THE SHARED ONE (#1194's whole point).
 *
 * The predicate lives in `lexicon/marks3.ts` beside the arrows and the word, so a fifth spelling added
 * there reaches the grammar and this preview together, or not at all. Asserted by driving the predicate
 * over every spelling rather than by trusting where the code sits.
 */
describe('#1195 — one marking vocabulary', () => {
  it.each(['DC→=3AB→', 'DC⃗=3AB⃗', 'DC⟶=3AB⟶', 'וקטור DC = 3 וקטור AB', 'vector DC = 3 vector AB'])(
    '«%s» is recognised as marked',
    (line) => {
      expect(isVectorMarked3(line)).toBe(true);
    },
  );

  it.each(['אורך AB = 5', 'DC=3AB', 'משולש ABC'])('«%s» is not', (line) => {
    expect(isVectorMarked3(line)).toBe(false);
  });
});
