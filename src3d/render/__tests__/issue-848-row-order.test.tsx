/**
 * #848 (ADR-3D-196) — AN EQUATION INSIDE A HEBREW ROW IS ONE ISLAND, SO IT READS FORWARD.
 *
 * Operator, 2026-08-31, third report on this row: *"the bidi issue is still there and i thought we
 * fixed it."*
 *
 * ADR-3D-190 Am. 1 split a Hebrew row into per-token islands ordered by the RTL container. Right in
 * principle, one level too far in practice: EVERY space counted as prose, so «AB = u» became three
 * islands — `AB`, `=`, `u` — and three islands in an RTL container lay right-to-left. The clause
 * rendered **«u = AB»**: the equation backwards.
 *
 * «BE מוכל במישור ABCD» hid it, which is why #838 read as fixed: no expression, so atomising it
 * changed nothing. The defect needs an `=` to show.
 *
 * **These assert STRUCTURE AND ORDER, never `textContent`.** The logical text has been correct
 * through all three reports — a textContent assertion passed on every broken build, which is exactly
 * why this shipped twice. DOM order is the lock, because under `dir="rtl"` the visual order is the
 * reverse of DOM order: children `[prose, island]` render as `island` on the left and `prose` on the
 * right, which is what a Hebrew reader needs.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VecMath } from '../VecMath';

const NAMES = new Set(['u', 'v', 'w']);
const html = (text: string) => renderToStaticMarkup(<VecMath text={text} vecNames={NAMES} />);
/** The math islands, in DOM order, stripped to their visible characters. */
const islands = (h: string) =>
  [...h.matchAll(/<math[^>]*>([\s\S]*?)<\/math>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

const NOTE = "נסמן: AB = u, AD = v, AA' = w";

describe('#848 — the expression is ONE island', () => {
  it('«נסמן: AB = u, AD = v, AA\' = w» yields exactly one math island', () => {
    // The heart of it. Eleven islands is the bug; one island is the fix.
    expect(islands(html(NOTE))).toHaveLength(1);
  });

  it('and that island carries the WHOLE expression, in source order', () => {
    const [only] = islands(html(NOTE));
    // Source order, left to right: AB before u, u before AD, AD before v…
    expect(only.indexOf('AB')).toBeLessThan(only.indexOf('u'));
    expect(only.indexOf('u')).toBeLessThan(only.indexOf('AD'));
    expect(only.indexOf('AD')).toBeLessThan(only.indexOf('v'));
    expect(only.indexOf('v')).toBeLessThan(only.indexOf('w'));
  });

  it('the Hebrew word comes FIRST in DOM order, so it renders rightmost under dir=rtl', () => {
    const h = html(NOTE);
    const firstSpan = h.indexOf('<span', h.indexOf('<span') + 1); // the prose child, after the wrapper
    const firstMath = h.indexOf('<math');
    expect(firstSpan).toBeGreaterThan(-1);
    expect(firstSpan, 'prose before the island in DOM ⇒ prose on the right in RTL').toBeLessThan(firstMath);
  });

  it('the colon stays with «נסמן», not stranded at the far end of the row', () => {
    // Sentence punctuation belongs to the sentence. In the island it drifted to the opposite edge
    // of the row from the word it punctuates.
    const h = html(NOTE);
    expect(h).toMatch(/<span[^>]*>[^<]*נסמן[^<]*:/);
    expect(islands(h)[0], 'the island starts at the expression').toMatch(/^AB/);
  });
});

describe('#848 — what must not change', () => {
  it('«BE מוכל במישור ABCD» keeps its ADR-3D-190 order: pair island first, then prose', () => {
    const h = html('BE מוכל במישור ABCD');
    expect(islands(h)).toEqual(['BE→']);
    expect(h.indexOf('<math'), 'the pair leads in DOM ⇒ rightmost in RTL').toBeLessThan(h.lastIndexOf('<span'));
  });

  it('a pure expression row is untouched — one ltr math element, no splitting', () => {
    const h = html('|AB| = 4');
    expect(h).toContain('<math dir="ltr"');
    expect(islands(h)).toHaveLength(1);
  });

  it('an opening delimiter stays with its expression, not with the prose', () => {
    // The edge the sentence-punctuation rule must not over-reach into: `|` after Hebrew is part of
    // the magnitude, unlike a colon which is part of the sentence.
    const h = html('נתון |AB| = 4');
    expect(islands(h)[0]).toMatch(/^\|AB/);
  });

  it('a fraction row still renders as one island', () => {
    expect(islands(html('FE = u/6 - v/6'))).toHaveLength(1);
  });
});
