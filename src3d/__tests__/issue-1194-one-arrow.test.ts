/**
 * #1194 — ONE MARKING, ONE ARROW. The display formatter knows every spelling the grammar accepts.
 *
 * **Operator, 2026-09-18, playing round #1193 T1**, on the spelling the tool itself now recommends:
 *
 * ```
 * typed    DC→=3AB→
 * row      DC⃗→=3AB⃗→        ← the arrow twice: once typeset, once left behind
 * ```
 *
 * *"we dont need the forward arrow now since we put the arrow above the vector."*
 *
 * ## Root cause — one vocabulary, three copies, and only two were updated
 *
 * The grammar accepts four spellings of one marking. `parse3` spelled the arrows out twice (the
 * normaliser's strip, and `markVectorContext`); `vectorNotation`'s *"this pair is already marked"*
 * guard spelled out **one** of them, `U+20D7`. So [ADR-3D-250](../../docs/06b-decisions-3d.md#adr-3d-250)
 * making `→` the character the palette inserts and the message teaches walked straight into the one
 * spelling the display had never learned.
 *
 * Fixed where `lexicon/nouns3.ts` already says this class of defect belongs — a leaf module that imports
 * nothing and that `parser/` and `render/` may both depend on, so a fifth spelling reaches the grammar
 * and the display together or not at all.
 *
 * ## What this file asserts, and why it is a comparison
 *
 * The rendered row is never spelled out beside the input: a lock that wrote `"DC⃗=3AB⃗"` by hand would
 * re-implement the formatter and agree with its next bug (ADR-W-053). The property is **parity** —
 * every spelling of one statement produces the same row — plus one absolute rule that is genuinely
 * about the output rather than about agreement: a finished row carries no spacing arrow.
 */
import { describe, expect, it } from 'vitest';
import { factDisplay3, vectorNotation } from '../render/notation';
import { parse3 } from '../parser/parse3';
import { COMBINING_ARROW, SPACING_ARROWS } from '../lexicon/marks3';

/** A `vec-rel` fact carrying `u` — the shape the step list hands the formatter. */
const row = (utterance: string) => factDisplay3({ utterance, cmds: [{ type: 'vec-rel' }] }, new Set());

/** The student's own spacing is theirs and is preserved; parity is about the NOTATION. */
const squash = (s: string) => s.replace(/\s+/g, '');

/** Four spellings of ONE statement. None is the "expected" one. */
const SPELLINGS = [
  ['U+2192 →', `DC→=3AB→`],
  ['U+27F6 ⟶', `DC⟶=3AB⟶`],
  ['U+20D7 ⃗', `DC${COMBINING_ARROW}=3AB${COMBINING_ARROW}`],
  ['the Hebrew word', 'וקטור DC = 3 וקטור AB'],
  ['the English word', 'vector DC = 3 vector AB'],
] as const;

describe('#1194 — every spelling of the marking renders the same row', () => {
  it('all five agree', () => {
    const rendered = SPELLINGS.map(([label, u]) => [label, squash(row(u))] as const);
    const [, first] = rendered[0];
    for (const [label, got] of rendered) {
      expect(got, `${label} must render what every other spelling renders`).toBe(first);
    }
  });

  it.each(SPELLINGS)('%s leaves no spacing arrow in the row', (_label, utterance) => {
    const out = row(utterance);
    for (const mark of SPACING_ARROWS) {
      expect(out.includes(mark), `a typeset row must not also carry ${JSON.stringify(mark)}`).toBe(false);
    }
  });

  it.each(SPELLINGS)('%s marks each pair exactly ONCE', (_label, utterance) => {
    const out = row(utterance);
    const arrows = [...out].filter((c) => c === COMBINING_ARROW).length;
    expect(arrows, 'two pairs, two arrows — a doubled mark is the reported defect').toBe(2);
  });

  /**
   * THE GRAMMAR IS UNTOUCHED. The vocabulary moved to `lexicon/`; what the parser makes of it did not.
   * If this moves, the refactor changed meaning rather than removing a copy.
   */
  it.each(SPELLINGS)('%s still parses as an explicitly MARKED vector relation', (_label, utterance) => {
    const r = parse3(utterance);
    expect(r.ok, utterance).toBe(true);
    if (!r.ok) return;
    const cmd = r.commands.find((c) => c.type === 'vec-rel');
    expect(cmd && 'marked' in cmd ? cmd.marked : undefined, 'ADR-3D-250 must be unaffected').toBe(true);
  });

  /**
   * The UNMARKED sentence is a different statement, and the formatter's job on it is unchanged: a row
   * for a vec-rel fact gets the notation whatever spelling produced the fact. Asserted so the
   * spacing-arrow conversion cannot be mistaken for "only marked rows get arrows".
   */
  it('an unmarked pair statement still renders with the notation', () => {
    expect(squash(row('DC=3AB'))).toBe(squash(row(`DC→=3AB→`)));
  });

  /**
   * A stray arrow that follows no pair is the student's own character in a position this formatter does
   * not claim to understand. Left alone deliberately — the conversion is targeted, not a blanket strip.
   */
  it('an arrow that follows no pair is left where the student put it', () => {
    const out = vectorNotation(`→ DC=3AB`, new Set());
    expect(out.startsWith('→'), 'a leading stray arrow is not consumed').toBe(true);
  });
});
