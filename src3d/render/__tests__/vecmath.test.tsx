/**
 * #313 — MathML vector notation (DOM-free render locks, the repo's react-dom/server pattern).
 * The arrow spans the WHOLE pair name via a stretchy <mover>; u/6 is a real <mfrac>; a declared name
 * gets the UNDERLINE ONLY (#849, ADR-3D-195 — the arrow means "from A to B" and belongs to a pair);
 * prose-only rows stay plain text.
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VecMath, tokenizeRow } from '../VecMath';
import { isVectorFact3 } from '../notation';

const UV = new Set(['u', 'v']);
const html = (text: string) => renderToStaticMarkup(React.createElement(VecMath, { text, vecNames: UV }));

describe('VecMath', () => {
  it('a pair name gets ONE stretchy mover spanning the whole run (SD, not just D)', () => {
    const out = html('SD = (2/3)SB');
    expect(out).toContain('<mover accent="true"><mi mathvariant="normal">SD</mi>');
    expect(out).toContain('<mover accent="true"><mi mathvariant="normal">SB</mi>');
  });

  it('u/6 renders as a real fraction with the vector atom as numerator', () => {
    const out = html('FE = u/6 - v/6');
    expect(out).toContain('<mfrac>');
    expect(out).toMatch(/<mfrac><munder[^>]*><mi>u<\/mi>/);
  });

  it('#849 — a DECLARED name carries the underline ONLY, never an arrow', () => {
    const out = html('SB = u');
    expect(out).toMatch(/<munder accentunder="true"><mi>u<\/mi>/);
    // the real lock is the ABSENCE: this row rendered arrow+underline from #313 until #849, which
    // contradicted the row rule the operator set on 2026-07-07 and re-stated on 2026-07-25.
    expect(out).not.toMatch(/<mover[^>]*><munder/);
  });

  it('#849 — and the PAIR in the same row still carries the arrow, and no underline', () => {
    // The distinction is the whole point: `SB` is a pair (arrow = from S to B), `u` is a name.
    const out = html('SB = u');
    expect(out).toContain('<mover accent="true"><mi mathvariant="normal">SB</mi>');
    expect(out).not.toMatch(/<munder[^>]*><mi mathvariant="normal">SB<\/mi>/);
  });

  it('a numeric fraction is an mfrac; a decimal stays mn', () => {
    expect(html('DE = 1/3·v')).toContain('<mfrac><mn>1</mn><mn>3</mn></mfrac>');
    expect(html('AS = 0.5v')).toContain('<mn>0.5</mn>');
  });

  it('the wiring contract: VecMath applies only to VECTOR rows (isVectorFact3 routes) — a prose row with a segment name must never gain an arrow', () => {
    // classification lives in notation.ts. What the ROW does with it is FactRow3's, and is locked in
    // issue-900-power-rendering.test.tsx: this gate decides the vector DECORATION only — since #900 a
    // non-vector row still gets math STRUCTURE when its text carries any, which is what this file
    // asserting only the gate's return value could never have caught.
    expect(isVectorFact3({ cmds: [{ type: 'midpoint3' }] })).toBe(false);
    expect(isVectorFact3({ cmds: [{ type: 'vec-rel' }] })).toBe(true);
    expect(isVectorFact3({ cmds: [{ type: 'claim', claim: { type: 'vec-eq' } }] })).toBe(true);
  });

  it('tokenizer: the combining arrow/underline from the legacy formatter are absorbed AND the atom stays a VECTOR token (the operator’s «u and v have no underlines» — the guard rejected u̲)', () => {
    const toks = tokenizeRow('SD⃗ = u̲/6 - v̲/6', UV);
    expect(JSON.stringify(toks)).not.toContain('⃗');
    expect(JSON.stringify(toks)).not.toContain('̲');
    // u̲/6 must be a FRACTION with a vec numerator; v̲ likewise — never demoted to plain text
    const fracs = toks.filter((t) => t.k === 'frac');
    expect(fracs.length).toBe(2);
    expect(JSON.stringify(fracs)).toContain('"k":"vec"');
    const out = html('FE⃗ = u̲/6 - v̲/6'); // the EXACT factDisplay3 output shape the step rows pass in
    expect(out).toMatch(/<mfrac><munder[^>]*><mi>u<\/mi>/);
    expect(out).toMatch(/<mfrac><munder[^>]*><mi>v<\/mi>/);
  });
});

describe('#398 (ADR-3D-108) — a ≥3-label run is a POINT-RUN, never pair + leftovers', () => {
  it('«המרחק בין D למישור ABC» carries NO pair token — the plane name stays prose', () => {
    const toks = tokenizeRow('המרחק בין D למישור ABC', UV);
    expect(toks.filter((t) => t.k === 'pair')).toEqual([]);
    expect(JSON.stringify(toks)).toContain('ABC');
  });
  it("a 4-label run (ABCD) and a primed run (A'B'C') stay text; a genuine pair still dresses", () => {
    expect(tokenizeRow('מישור ABCD', UV).filter((t) => t.k === 'pair')).toEqual([]);
    expect(tokenizeRow("המישור A'B'C'", UV).filter((t) => t.k === 'pair')).toEqual([]);
    expect(tokenizeRow('AB = u', UV).filter((t) => t.k === 'pair').length).toBe(1);
  });
});
