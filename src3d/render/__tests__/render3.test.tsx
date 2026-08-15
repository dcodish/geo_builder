/**
 * DOM-free static render of the Figure3 component (the 2-D tool's proven
 * technique — react-dom/server, no jsdom, no WebGL): the SVG must carry the
 * textbook look — solid + dashed edges, labelled vertices with real primes.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyCommand3 } from '../../engine/apply';
import { resolve3 } from '../../engine/evaluate';
import { emptyConstruction3, type Command3 } from '../../engine/types';
import Figure3 from '../Figure3';

describe('Figure3 (static, DOM-free)', () => {
  it('renders a cube as 12 SVG lines, 3 dashed, with primed labels', () => {
    const r = applyCommand3(emptyConstruction3(), {
      type: 'solid',
      kind: 'cube',
      ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"],
    });
    if (!r.ok) throw new Error('apply failed');
    const html = renderToStaticMarkup(
      <Figure3 construction={r.next} resolved={resolve3(r.next, 0)} resetLabel="reset" />,
    );
    expect(html.match(/<line /g)).toHaveLength(12);
    expect(html.match(/stroke-dasharray/g)).toHaveLength(3);
    expect(html.match(/<circle /g)).toHaveLength(8);
    expect(html).toContain('B′');
    expect(html).toContain('data-testid="figure3"');
  });

  it('a named vector renders in textbook notation: chevron + label with arrow above and underline (ADR-3D-003)', () => {
    let c = emptyConstruction3();
    const cmds: Command3[] = [
      { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] },
      { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
    ];
    for (const cmd of cmds) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error('apply failed');
      c = r.next;
    }
    const html = renderToStaticMarkup(
      <Figure3 construction={c} resolved={resolve3(c, 0)} resetLabel="reset" />,
    );
    expect(html).toContain('data-testid="vec-w"');
    const group = html.split('data-testid="vec-w"')[1].split('</g></g>')[0];
    expect(group).toContain('>w</text>'); // the italic name
    expect((group.match(/<line /g) ?? []).length).toBe(3); // the coloured shaft + the notation's arrow shaft + underline
    expect((group.match(/<path /g) ?? []).length).toBe(2); // the head arrowhead + the notation's arrowhead
    expect((group.match(/#0d9488/g) ?? []).length).toBeGreaterThanOrEqual(5); // everything in the vector colour
  });

  it('canvas MATH labels are bidi-ISOLATED so an RTL document cannot reorder them (ADR-3D-031 Am.)', () => {
    // operator report: B(0, 7, 6) rendered as (6 ,7 ,0) on the RTL canvas — the coordinate
    // string must be wrapped LRI…PDI (U+2066/U+2069); same for the line-equation echo.
    let c = emptyConstruction3();
    const cmds: Command3[] = [
      { type: 'solid', kind: 'cube', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] },
      {
        type: 'line3',
        name: 'ℓ',
        anchor: [{ k: 0, p: 0 }, { k: 7, p: 0 }, { k: 6, p: 0 }],
        dir: [{ k: 0, p: 0 }, { k: 2, p: 0 }, { k: 1, p: 0 }],
        src: 'x = (0,7,6) + t·(0,2,1)',
      },
    ];
    for (const cmd of cmds) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error('apply failed');
      c = r.next;
    }
    const html = renderToStaticMarkup(
      <Figure3
        construction={c}
        resolved={resolve3(c, 0)}
        resetLabel="reset"
        coordLabels={{ B: { text: '(0, 7, 6)', kind: 'fact' } }}
      />,
    );
    expect(html).toContain('⁦(0, 7, 6)⁩'); // the coordinate label, isolated
    expect(html).toContain('⁦ℓ: x ='); // the line-equation echo, isolated
  });

  it('renders an empty construction without crashing', () => {
    const empty = emptyConstruction3();
    const html = renderToStaticMarkup(
      <Figure3 construction={empty} resolved={resolve3(empty, 0)} resetLabel="reset" />,
    );
    expect(html).toContain('<svg');
  });
});

/**
 * #549 (ADR-3D-150) — the canvas's BASE DIRECTION.
 *
 * Operator, on a triangular-prism screenshot: *"note the C' is not written correctly"*. It rendered
 * `′C`, and so did `′A` and `′B` — EVERY primed label, because SVG `<text>` inherits the RTL shell's
 * CSS `direction` and U+2032 PRIME is bidi-neutral (class ET), so as a trailing character it took the
 * paragraph level and jumped in front of its letter.
 *
 * Locked at the ROOT, which is the whole point: the per-node `ltr()` isolates (#468/#482) require every
 * new text node to opt in, and the most common primed run on the canvas never did.
 */
describe('#549 — the SVG root forces LTR (mirror of 2-D mathSvg.test.tsx:47)', () => {
  const primedPrism = () => {
    const r = applyCommand3(emptyConstruction3(), {
      type: 'solid',
      kind: 'prism3',
      ids: ['A', 'B', 'C', "A'", "B'", "C'"],
    });
    if (!r.ok) throw new Error('apply failed');
    return r.next;
  };

  it('the root <svg> carries direction:ltr — one declaration covering every text node', () => {
    const c = primedPrism();
    const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolve3(c, 0)} resetLabel="reset" />);
    const rootTag = html.slice(html.indexOf('<svg'), html.indexOf('>', html.indexOf('<svg')) + 1);
    expect(rootTag).toMatch(/direction:\s*ltr/i);
  });

  it('the operator prism: every primed label carries its prime AFTER the letter', () => {
    const c = primedPrism();
    const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolve3(c, 0)} resetLabel="reset" />);
    for (const label of ['A′', 'B′', 'C′']) {
      expect(html).toContain(label);
      expect(html).not.toContain(`′${label[0]}`); // the reported rendering, in source order
    }
  });

  it('the base direction is NOT bidi-override — a strong-RTL run must still lay out RTL', () => {
    const c = primedPrism();
    const html = renderToStaticMarkup(<Figure3 construction={c} resolved={resolve3(c, 0)} resetLabel="reset" />);
    expect(html).not.toMatch(/bidi-override/i);
  });
});
