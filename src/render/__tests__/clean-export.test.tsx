/**
 * #713 ([ADR-W-051](../../../docs/06w-decisions-workspace.md#adr-w-051)) — the 2-D clean-export lock: a
 * downloaded image never contains on-screen chrome.
 *
 * The shared rasteriser (`shell/export/svgToPng`) strips every `[data-noexport]` subtree; the opt-in is
 * this renderer's tagging. The lock renders the same figure with EVERY chrome affordance the renderer takes
 * as a prop switched ON — crossing offers, highlight overlays, promotable anonymous points, the stated-
 * equality marks of the relations layer — strips the markup the way the rasteriser does, and asserts the
 * ink is the chrome-free render. (Hover marks are internal state and cannot be switched on statically;
 * their group carries the tag — asserted by source below.) A new chrome affordance must be added HERE
 * with its prop ON, or it ships in the download untested.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Figure } from '../Figure';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import { normalizeForExport, stripNoExport } from '../../../shell/export/exportMarkup';

describe('#713 — 2-D: the export is the chrome-free render', () => {
  const facts = factsOf(['מקבילית ABCD', 'AC', 'BD']);
  const fig = replay(facts, 0);
  const base = { construction: fig.construction, positions: fig.positions, circles: fig.circles };

  const plain = renderToStaticMarkup(<Figure {...base} />);
  const withChrome = renderToStaticMarkup(
    <Figure
      {...base}
      onPickIntersection={() => {}}
      forcedCrossings={new Set(['s:A-C|s:B-D'])}
      intersectionLabel="name this crossing"
      highlight={new Set(['seg-AC'])}
      highlightEdges={[['A', 'C']]}
      onPromotePoint={() => {}}
      promoteLabel="name this point"
    />,
  );

  it('the chrome is really on (the fixture is not vacuous)', () => {
    expect(withChrome).not.toBe(plain);
    expect(withChrome).toContain('data-noexport');
    expect(withChrome).toContain('data-crossing');
  });

  it('after the strip, the ink equals the chrome-free render', () => {
    expect(normalizeForExport(withChrome)).toBe(normalizeForExport(plain));
  });

  it('nothing tagged survives, and every crossing offer / highlight overlay was tagged', () => {
    const stripped = stripNoExport(withChrome);
    expect(stripped).not.toContain('data-noexport');
    expect(stripped).not.toContain('data-crossing');
    expect(stripped).not.toContain('data-promotable');
  });

  it('the hover-driven relation marks (internal state) carry the tag at their source', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/render/Figure.tsx'), 'utf8');
    expect(src).toMatch(/\{relMarks && \(\s*<g data-noexport="1"/);
  });
});
