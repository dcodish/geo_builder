/**
 * #313 — MathML vector notation (DOM-free render locks, the repo's react-dom/server pattern).
 * The arrow spans the WHOLE pair name via a stretchy <mover>; u/6 is a real <mfrac>; named vectors
 * get arrow + underline (the ADR-3D-003 canvas convention); prose-only rows stay plain text.
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
    expect(out).toMatch(/<mfrac><mover[^>]*><munder[^>]*><mi>u<\/mi>/);
  });

  it('a named vector carries arrow + underline (the canvas convention)', () => {
    const out = html('SB = u');
    expect(out).toMatch(/<mover accent="true"><munder accentunder="true"><mi>u<\/mi>/);
  });

  it('a numeric fraction is an mfrac; a decimal stays mn', () => {
    expect(html('DE = 1/3·v')).toContain('<mfrac><mn>1</mn><mn>3</mn></mfrac>');
    expect(html('AS = 0.5v')).toContain('<mn>0.5</mn>');
  });

  it('the wiring contract: VecMath applies only to VECTOR rows (isVectorFact3 routes) — a prose row with a segment name must never gain an arrow', () => {
    // classification lives in notation.ts; App3 renders non-vector facts as plain utterance text.
    expect(isVectorFact3({ cmds: [{ type: 'midpoint3' }] })).toBe(false);
    expect(isVectorFact3({ cmds: [{ type: 'vec-rel' }] })).toBe(true);
    expect(isVectorFact3({ cmds: [{ type: 'claim', claim: { type: 'vec-eq' } }] })).toBe(true);
  });

  it('tokenizer: the combining arrow/underline from the legacy formatter are absorbed, never doubled', () => {
    const toks = tokenizeRow('SD⃗ = u̲/6', UV);
    expect(JSON.stringify(toks)).not.toContain('⃗');
    expect(JSON.stringify(toks)).not.toContain('̲');
  });
});
