/**
 * #900 — a coordinate POWER must render as a power, and the two spellings the parser calls identical
 * must LOOK identical ([ADR-3D-216](docs/06b-decisions-3d.md#adr-3d-216)).
 *
 * The operator typed «C(p^2,1,0)» while playing #511 and got the caret back verbatim. The routing in
 * `App3.tsx` asked ONE question — "is this a vector fact?" — and used the answer for two different
 * jobs, so a coordinate row got neither the decoration (correctly) nor the structure (the defect).
 *
 * These locks are on the RENDERED OUTPUT rather than on the gate's return value, which is the gap
 * `vecmath.test.tsx` left: it asserted `isVectorFact3` and could not see what the row did with it.
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FactRowText3 } from '../FactRow3';
import { isolateLtrRuns3 } from '../../i18n/bidi';

const NO_VECS = new Set<string>();
const row = (utterance: string, cmds: { type: string; claim?: { type: string } }[] = [{ type: 'point3' }]) =>
  renderToStaticMarkup(React.createElement(FactRowText3, { f: { utterance, cmds }, vecNames: NO_VECS }));

describe('#900 — the power in a coordinate component renders', () => {
  it('«C(p^2,1,0)» renders a real superscript, not a literal caret', () => {
    const out = row('C(p^2,1,0)');
    expect(out).toContain('<msup><mi>p</mi><mn>2</mn></msup>');
    // the defect, stated as an absence: the caret must not survive into the row
    expect(out).not.toContain('p^2');
  });

  it('THE POINT OF THE ISSUE — the two spellings the parser calls byte-identical DISPLAY identically', () => {
    // «C(p^2,1,0)» and «C(p²,1,0)» produce the same commands (ADR-3D-215, measured on #511's branch).
    // A tool that renders them differently is telling the student they are different statements.
    expect(row('C(p^2,1,0)')).toBe(row('C(p²,1,0)'));
  });

  it('the SUPERSCRIPT spelling was never rendered either — it only LOOKED right as a literal character', () => {
    // Guards against "it already worked": before #900 this row was raw text with a ² character in it,
    // and no <math> anywhere. The lock is the structure, not the glyph.
    expect(row('C(p²,1,0)')).toContain('<math>');
  });

  it('#313 HOLDS — a non-vector row that carries math gains STRUCTURE and never a vector ARROW', () => {
    // The reason the old gate existed. Structure is content-gated now; decoration stays kind-gated.
    const out = row('C(p^2,1,0)');
    expect(out).toContain('<msup>');
    expect(out).not.toContain('<mover');
  });

  it('a VECTOR fact still routes to VecMath and keeps its arrow', () => {
    const out = row('AB = 2CD', [{ type: 'vec-rel' }]);
    expect(out).toContain('<mover accent="true">');
  });

  it('#482 HOLDS — a Hebrew row with an LTR math run keeps its bidi isolation through the math path', () => {
    const out = row('הנקודה C(p^2,1,0) על המישור');
    expect(out).toContain('\u2066'); // LRI — the isolate survives the MathML render
    expect(out).toContain('<msup>');
  });

  it('a row with NO math is byte-identical to the plain isolated text (the common case is untouched)', () => {
    const utterance = "M אמצע BB'";
    // compared as MARKUP on both sides: React escapes a text node's apostrophe to &#x27;, which is
    // true of the plain branch too, so comparing against the raw string would test the escaping.
    const plain = renderToStaticMarkup(React.createElement(React.Fragment, null, isolateLtrRuns3(utterance)));
    expect(row(utterance, [{ type: 'midpoint3' }])).toBe(plain);
  });
});
