/**
 * #849 (ADR-3D-195) — ONE vector-notation convention, on every surface.
 *
 * A **declared name** (`u`, `v`, `w`) takes the **underline** only. A **point pair** (`AB`, `AA'`)
 * takes the **arrow** only — the arrow means *from A to B*, which a name has no endpoints for.
 *
 * This is not a new rule. The operator set it for the step rows on 2026-07-07 (*"point pairs get the
 * combining arrow, declared vector names get the textbook underline"*) and re-stated it on
 * 2026-07-25. It was overridden by #313, which added `VecMath` and gave named vectors arrow+underline
 * citing ADR-3D-003 — an ADR about the CANVAS label, not the row. `notation.ts` kept implementing the
 * correct rule and simply became unreachable for vector facts.
 *
 * The defect was therefore never "one renderer is wrong"; it was **two renderers free to disagree**.
 * So the file this test most needs to be is the one that drives BOTH paths for the same fact.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VecMath } from '../VecMath';
import { factDisplay3 } from '../notation';
import Figure3 from '../Figure3';
import { applyCommand3 } from '../../engine/apply';
import { resolve3 } from '../../engine/evaluate';
import { emptyConstruction3, type Command3 } from '../../engine/types';

const NAMES = new Set(['u', 'v', 'w']);
const math = (text: string) => renderToStaticMarkup(<VecMath text={text} vecNames={NAMES} />);

/** The canvas, built through the real apply/resolve path. */
function figureHtml(name: string, from: string, to: string) {
  let c = emptyConstruction3();
  const cmds: Command3[] = [
    { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] },
    { type: 'name-vector', name, from, to } as Command3,
  ];
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(cmd)}`);
    c = r.next;
  }
  const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolve3(c, 0)} resetLabel="reset" />);
  return html.split(`data-testid="vec-${name}"`)[1].split('</g></g>')[0];
}

describe('#849 — the MathML row', () => {
  it('a declared name is underlined and NOT arrowed', () => {
    const out = math('SB = u');
    expect(out).toMatch(/<munder accentunder="true"><mi>u<\/mi>/);
    expect(out, 'the arrow+underline stack from #313 must be gone').not.toMatch(/<mover[^>]*><munder/);
  });

  it('a point pair is arrowed and NOT underlined', () => {
    const out = math('SB = u');
    expect(out).toContain('<mover accent="true"><mi mathvariant="normal">SB</mi>');
    expect(out).not.toMatch(/<munder[^>]*><mi mathvariant="normal">SB<\/mi>/);
  });

  it('both conventions coexist in ONE row, which is the point of distinguishing them', () => {
    // «SB = u» shows the pair and the name side by side; a student can see which is which.
    const out = math('SB = u');
    expect((out.match(/<mover /g) ?? []).length).toBe(1); // the pair only
    expect((out.match(/<munder /g) ?? []).length).toBe(1); // the name only
  });

  it('a name keeps its underline under any coefficient syntax (the ADR-3D-073 boundary class)', () => {
    for (const text of ['FE = u/6 - v/6', 'DE = 2v', 'AS = 0.5v']) {
      expect(math(text), text).toMatch(/<munder[^>]*><mi>[uv]<\/mi>/);
      expect(math(text), text).not.toMatch(/<mover[^>]*><munder/);
    }
  });
});

describe('#849 — the canvas label', () => {
  it('a named vector label carries the underline and NO arrow of its own', () => {
    const g = figureHtml('w', 'A', "A'");
    expect(g).toContain('>w</text>');
    // shaft + underline; the removed pair was the label's own arrow shaft and its arrowhead
    expect((g.match(/<line /g) ?? []).length).toBe(2);
    expect((g.match(/<path /g) ?? []).length).toBe(1); // the vector's arrowhead at the head point
  });

  it('the underline is NOT dropped — a bare letter beside the shaft would read as a point label', () => {
    // The direction that must not be "simplified" away later: underline only, never no mark.
    const g = figureHtml('w', 'A', "A'");
    const lines = [...g.matchAll(/<line [^>]*>/g)].map((m) => m[0]);
    expect(lines.some((l) => /y1="9"/.test(l) && /y2="9"/.test(l)), 'the label underline').toBe(true);
  });
});

describe('#849 — the two surfaces cannot drift apart again', () => {
  it('the plain-text formatter agrees with the MathML renderer about which mark each kind gets', () => {
    // `notation.ts` had the rule right all along and was simply unreachable. Driving both here means
    // a future change to either one fails this file rather than shipping a disagreement.
    const plain = factDisplay3(
      { utterance: 'נסמן: AB = u', cmds: [{ type: 'name-vector' }] } as never,
      NAMES,
    );
    expect(plain, 'plain: the pair takes the arrow').toMatch(/AB⃗/);
    expect(plain, 'plain: the name takes the underline').toMatch(/u̲/);
    expect(plain, 'plain: the name takes NO arrow').not.toMatch(/u̲?⃗|u⃗/);

    const rich = math('AB = u');
    expect(rich).toContain('<mover accent="true"><mi mathvariant="normal">AB</mi>');
    expect(rich).toMatch(/<munder accentunder="true"><mi>u<\/mi>/);
    expect(rich).not.toMatch(/<mover[^>]*><munder/);
  });
});
