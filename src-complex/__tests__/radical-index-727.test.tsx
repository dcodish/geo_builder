/**
 * #727 — the n-th-root INDEX must be legible at canvas size.
 *
 * The operator read «⁵√5·cis10.63°» as the retired `~` mark (2026-08-18): the exam typography from
 * #702 spells the index with Unicode superscript digits, which are drawn hairline-thin at ~0.58 em,
 * and the canvas draws at 13 px. The value was correct; the glyph was not readable.
 *
 * What is locked here is the SPLIT, not the pixel size — the split is the contract that decides which
 * characters get the treatment, and it is shared by the two reading surfaces (SVG canvas, HTML panel)
 * so they cannot drift. Two properties matter and both are asserted:
 *
 *  1. an index run (any number of digits) immediately before `√` is lifted out as a real digit;
 *  2. a superscript that is NOT indexing a radical — an exponent like `z²` — is left alone, because
 *     an exponent sits at the top of the line where it was always legible.
 *
 * The formatter is deliberately unchanged: `value/modulus.format` is the ONE spelling of a number and
 * every surface calls it, so the treatment has to be display-level or the surfaces could disagree.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RadicalText, RadicalTspans } from '../render/radicalText';
import { splitRadical, hasRadicalIndex } from '../value/radical';
import { format } from '../value/modulus';
import { rat } from '../value/rational';

const mod = (p: bigint, n: bigint, d: bigint) => format(new Map([[p, rat(n, d)]]) as never);
/** The visible reading, with the markup stripped — what a student actually sees. */
const text = (html: string) => html.replace(/<[^>]*>/g, '');

describe('#727 — the radical index is rendered legibly', () => {
  it('the formatter still spells roots the exam way (unchanged — this is the input, not the fix)', () => {
    expect(mod(5n, 1n, 2n)).toBe('√5');
    expect(mod(2n, 1n, 3n)).toBe('∛2');
    expect(mod(5n, 1n, 5n)).toBe('⁵√5');
    expect(mod(7n, 1n, 4n)).toBe('⁴√7');
    expect(mod(11n, 1n, 10n)).toBe('¹⁰√11');
  });

  it('lifts a single-digit index out as a REAL digit', () => {
    expect(splitRadical('⁵√5')).toEqual([{ index: '5' }, { text: '√5' }]);
  });

  it('lifts a MULTI-digit index as one run — «¹⁰√11», not two indices', () => {
    expect(splitRadical('¹⁰√11')).toEqual([{ index: '10' }, { text: '√11' }]);
  });

  it('leaves √ and ∛ alone — they carry no superscript index', () => {
    expect(splitRadical('√74')).toEqual([{ text: '√74' }]);
    expect(splitRadical('∛100')).toEqual([{ text: '∛100' }]);
  });

  it('leaves an EXPONENT alone — a superscript not followed by √ is not an index', () => {
    expect(splitRadical('z²')).toEqual([{ text: 'z²' }]);
    expect(splitRadical('z₁² = 4')).toEqual([{ text: 'z₁² = 4' }]);
  });

  it('handles the operator’s actual reading, index and tail intact', () => {
    expect(splitRadical('⁵√5·cis10.63°')).toEqual([{ index: '5' }, { text: '√5·cis10.63°' }]);
  });

  it('handles two radicals in one label without losing either', () => {
    expect(splitRadical('⁵√5 + ⁴√7')).toEqual([
      { index: '5' },
      { text: '√5 + ' },
      { index: '4' },
      { text: '√7' },
    ]);
  });

  it('renders the index as a real digit at a readable size, and keeps the whole reading', () => {
    const html = renderToStaticMarkup(<RadicalText text="⁵√5·cis10.63°" />);
    expect(html, 'the index is raised markup, not a bare glyph').toContain('<sup');
    // a plain digit at 0.72em is ~25% larger than the ~0.58em Unicode superscript it replaces
    expect(html).toContain('0.72em');
    expect(text(html), 'the index is a REAL digit now').toContain('5√5');
    expect(text(html), 'nothing is dropped').toBe('5√5·cis10.63°');
  });

  it('the CANVAS renders the same index, as raised tspans (dy restored so labels do not climb)', () => {
    const html = renderToStaticMarkup(<RadicalTspans text="⁵√5 + ⁴√7" />);
    expect(html).toContain('<tspan');
    expect(html).toContain('0.72em');
    expect(text(html), 'both indices are real digits, nothing dropped').toBe('5√5 + 4√7');
    // every raised run is matched by an equal shift back down, or a second radical would climb
    const up = (html.match(/dy="-0\.45em"/g) ?? []).length;
    const down = (html.match(/dy="0\.45em"/g) ?? []).length;
    expect(down, 'each raise has its restoring shift').toBe(up);
  });

  it('a reading with no radical renders unwrapped — the common case pays nothing', () => {
    const html = renderToStaticMarkup(<RadicalText text="z₁ = 3+4i" />);
    expect(html).not.toContain('<sup');
    expect(text(html)).toBe('z₁ = 3+4i');
  });
});

/**
 * The regex-state trap this fix walked into, locked so it cannot come back: `RegExp.test` on a
 * GLOBAL regex advances `lastIndex`, and `String.matchAll` resumes from it — so a presence check and
 * a split sharing one global regex made the split skip the very match the check had just found. It
 * showed up as "the first radical on a label is left untreated, the second is fixed".
 */
describe('#727 — the splitter holds no cross-call state', () => {
  it('a presence check before a split does not consume the match', () => {
    expect(hasRadicalIndex('⁵√5')).toBe(true);
    expect(splitRadical('⁵√5')).toEqual([{ index: '5' }, { text: '√5' }]);
  });

  it('repeated calls are stable — the same input always splits the same way', () => {
    for (let i = 0; i < 5; i++) {
      expect(hasRadicalIndex('⁵√5 + ⁴√7')).toBe(true);
      expect(splitRadical('⁵√5 + ⁴√7')).toEqual([
        { index: '5' },
        { text: '√5 + ' },
        { index: '4' },
        { text: '√7' },
      ]);
    }
  });
});
