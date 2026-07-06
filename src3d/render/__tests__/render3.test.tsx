/**
 * DOM-free static render of the Figure3 component (the 2-D tool's proven
 * technique — react-dom/server, no jsdom, no WebGL): the SVG must carry the
 * textbook look — solid + dashed edges, labelled vertices with real primes.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyCommand3 } from '../../engine/apply';
import { evaluate3 } from '../../engine/evaluate';
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
      <Figure3 construction={r.next} positions={evaluate3(r.next, 0)} resetLabel="reset" />,
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
      <Figure3 construction={c} positions={evaluate3(c, 0)} resetLabel="reset" />,
    );
    expect(html).toContain('data-testid="vec-w"');
    const group = html.split('data-testid="vec-w"')[1].split('</g></g>')[0];
    expect(group).toContain('>w</text>'); // the italic name
    expect((group.match(/<line /g) ?? []).length).toBe(3); // the coloured shaft + the notation's arrow shaft + underline
    expect((group.match(/<path /g) ?? []).length).toBe(2); // the head arrowhead + the notation's arrowhead
    expect((group.match(/#0d9488/g) ?? []).length).toBeGreaterThanOrEqual(5); // everything in the vector colour
  });

  it('renders an empty construction without crashing', () => {
    const html = renderToStaticMarkup(
      <Figure3 construction={emptyConstruction3()} positions={new Map()} resetLabel="reset" />,
    );
    expect(html).toContain('<svg');
  });
});
