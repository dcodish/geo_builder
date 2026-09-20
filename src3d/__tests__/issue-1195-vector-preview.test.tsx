/**
 * #1195 — THE INPUT PREVIEW SHOWS THE VECTOR NOTATION AS IT WILL RENDER.
 * #1312 — …AS IT WILL RENDER, which means these locks are on the RENDERED OUTPUT.
 *
 * **Operator, 2026-09-18, playing round #1193 T1:** *"I want to have the correct text appear below the
 * text like we do when hebrew is involved so the user sees the real input. the text should show like in
 * the input box with the arrow above the vector."*
 *
 * ## Why this file was rewritten, and it is the point of the issue
 *
 * The first version of this lock compared the preview STRING against `factDisplay3`'s string and called
 * that parity with the step row. It was green, and the feature was visibly broken: the operator played it
 * and asked *"why isnt the display showing a proper vector sign?"*
 *
 * `factDisplay3` returns a string carrying `U+20D7`, and **the arrow is drawn by the wrapper the row puts
 * around it** — `VecMath` STRIPS that character and rebuilds the arrow as a `<mover>` with a stretchy
 * arrow spanning the whole pair (its own docblock: *"`<mover>` … spans the WHOLE pair name (SD⃗ over both
 * letters)"*). The preview returned the bare string, so the combining mark reached the DOM as text and
 * attached to the single preceding letter: the arrow sat over `B` in `AB⃗`, or was tofu (#1185).
 *
 * So the string comparison compared the half that was already correct. This is the gap
 * `issue-900-power-rendering.test.tsx` names in its own header — *"locks on the RENDERED OUTPUT rather
 * than on the gate's return value"* — reached one surface later.
 *
 * The parity assertion is still a COMPARISON and never a spelling ([ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053)):
 * every row is rendered through the real `FactRowText3` and compared to the real preview node.
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactRowText3, inputPreviewNode3 } from '../render/FactRow3';
import { isVectorMarked3 } from '../lexicon/marks3';

const NO_VECTORS = new Set<string>();
const COMBINING_ARROW = '⃗';

/** What the step row will show once the line is a fact, as MARKUP. */
const rowMarkup = (utterance: string, cmdTypes: string[] = ['vec-rel']) =>
  renderToStaticMarkup(
    React.createElement(FactRowText3, {
      f: { utterance, cmds: cmdTypes.map((type) => ({ type })) },
      vecNames: NO_VECTORS,
    }),
  );

/** What the strip shows while they are still typing, as MARKUP — `null` when there is no strip. */
const previewMarkup = (text: string): string | null => {
  const node = inputPreviewNode3(text, NO_VECTORS);
  return node === null ? null : renderToStaticMarkup(node);
};

const MARKED: [string, string][] = [
  ['a spacing arrow, the operator’s own line', 'DC→=3AB→'],
  ['the combining arrow', 'DC⃗=3AB⃗'],
  ['the long arrow', 'DC⟶=3AB⟶'],
  ['the vector WORD', 'וקטור DC = 3 וקטור AB'],
];

/**
 * THE DEFECT, STATED AS AN ABSENCE — the one assertion that would have caught #1312.
 *
 * `U+20D7` is an internal marker in these strings, never something to display. If it survives into the
 * rendered output, it is being shown as a character and the vector sign is wrong however the rest reads.
 */
describe('#1312 — the combining arrow never survives into the rendered output', () => {
  it.each(MARKED)('%s: the PREVIEW renders a mover, not a combining mark', (_name, line) => {
    const out = previewMarkup(line) ?? '';
    expect(out, 'the raw combining mark reached the DOM').not.toContain(COMBINING_ARROW);
    expect(out, 'no stretchy arrow spanning the pair').toContain('<mover');
    expect(out).toContain('stretchy="true"');
  });

  it.each(MARKED)('%s: and the STEP ROW does the same', (_name, line) => {
    const out = rowMarkup(line);
    expect(out).not.toContain(COMBINING_ARROW);
    expect(out).toContain('<mover');
  });

  /** The arrow spans the PAIR, not one letter — `<mi>AB</mi>`, never `<mi>A</mi><mi>B</mi>`. */
  it('the arrow spans both letters of the pair', () => {
    const out = previewMarkup('DC→=3AB→') ?? '';
    expect(out).toContain('<mi mathvariant="normal">DC</mi>');
    expect(out).toContain('<mi mathvariant="normal">AB</mi>');
  });
});

describe('#1195 — a marked line previews exactly what the step row will show', () => {
  it.each(MARKED)('%s renders identically on both surfaces', (_name, line) => {
    // Every marked line previews now (#1312), and must render exactly what the row will render.
    expect(previewMarkup(line)).toBe(rowMarkup(line));
  });

  it('«DC→=3AB→» previews the arrow form instead of nothing', () => {
    expect(previewMarkup('DC→=3AB→')).not.toBeNull();
  });
});

/**
 * THE ANTI-ASSERTION GUARD — the row that proves the gate is load-bearing.
 *
 * `VecMath`'s own `PAIR` regex matches a bare `AB` with **no mark required**, so handing it an unmarked
 * line would arrow «אורך AB = 5». The caller supplies the honesty gate, always. An arrow on a length
 * statement asserts a vector-ness the student never claimed (#313's words).
 */
describe('#1195 — an UNMARKED line never grows an arrow', () => {
  it.each([
    ['a length statement', 'אורך AB = 5'],
    ['a bare pair equality — #1183 is the story of this being ASKED', 'DC=3AB'],
    ['ordinary prose', 'משולש ABC'],
    ['a coordinate', 'נקודה A(0,0,0)'],
  ])('%s: «%s» renders no arrow at all', (_name, line) => {
    const out = previewMarkup(line) ?? '';
    expect(out).not.toContain(COMBINING_ARROW);
    expect(out, 'an unmarked line was given a vector mover').not.toContain('<mover');
  });

  /**
   * And the bidi half still works — without this, the guard above could be satisfied by returning
   * `null` for everything.
   */
  it('an unmarked Hebrew line still gets its bidi preview', () => {
    const out = previewMarkup('אורך AB = 5');
    expect(out).not.toBeNull();
    expect(out).toContain('AB = 5');
  });
});

/**
 * THE `null`-WHEN-NOTHING-CHANGES CONTRACT. A plain line must not grow an empty second row under the
 * box — and the contract must not swallow the case the operator was looking at.
 */
describe('#1195 — the preview appears exactly when it has something to add', () => {
  /**
   * #1312 reversed this row deliberately, and it is the one behaviour change in that fix.
   *
   * #1195 returned `null` here on the rule "the box already shows this". The box is a plain `<input>`:
   * it shows `U+20D7` as a combining mark over the single preceding letter and can never show the
   * `mover` that spans the pair. The premise was a property of the preview being a STRING, and it did
   * not survive the preview becoming a node.
   */
  it('a line typed with the COMBINING arrow still previews — the box cannot show a spanning arrow', () => {
    const out = previewMarkup('DC⃗=3AB⃗');
    expect(out, 'the student is left looking at the malformed arrow').not.toBeNull();
    expect(out).toContain('<mover');
    expect(out).not.toContain(COMBINING_ARROW);
  });

  it('and so does the same line typed with a SPACING arrow', () => {
    expect(inputPreviewNode3('DC→=3AB→', NO_VECTORS)).not.toBeNull();
  });

  it('a plain LTR line still previews null', () => {
    expect(inputPreviewNode3('DC=3AB', NO_VECTORS)).toBeNull();
  });

  it('an empty box previews null', () => {
    expect(inputPreviewNode3('', NO_VECTORS)).toBeNull();
  });
});

/**
 * THE MARKING VOCABULARY IS THE SHARED ONE (#1194's whole point).
 *
 * The predicate lives in `lexicon/marks3.ts` beside the arrows and the word, so a fifth spelling added
 * there reaches the grammar and this preview together, or not at all.
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
