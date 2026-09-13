/**
 * #713 ([ADR-W-051](../../docs/06w-decisions-workspace.md#adr-w-051)) — the complex clean-export lock: a
 * downloaded image never contains on-screen chrome.
 *
 * Measured before this lock: the complex plane paints NO interaction-only element — its renderer takes no
 * hover/selection/offer prop and attaches no pointer affordance inside the SVG — so there was nothing to
 * tag, and the ruling's "neither product tags a single element" was, for this product, the absence of
 * chrome rather than an untagged one. The lock records that measurement so it cannot drift silently: the
 * render with every layer ON, stripped the way the rasteriser (`shell/export/svgToPng`) strips, is its
 * own ink, and no affordance marker appears. A chrome affordance added later must be tagged AND switched
 * on here, or this lock is the first thing it breaks. (Pattern copied from the 2-D lock, never imported.)
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { deriveLines } from '../app/deriveLines';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';
import { normalizeForExport, stripNoExport } from '../../shell/export/exportMarkup';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };

describe('#713 — complex: the export is the render, because the plane paints no chrome', () => {
  const d = deriveLines(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2'], 0, 0);
  const scene = buildScene(d);
  const html = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" layers={{ rotations: true, angles: true }} labels={LABELS} />);

  it('the figure has content (the fixture is not vacuous)', () => {
    expect(html).toContain('<svg');
    expect(scene.rotations.length).toBeGreaterThan(0);
  });

  it('the strip is the identity, and no affordance marker is painted', () => {
    expect(stripNoExport(html)).toBe(html);
    expect(normalizeForExport(html)).toBe(normalizeForExport(html));
    for (const marker of ['cursor-pointer', 'fill="transparent"', 'data-crossing', 'data-promotable']) expect(html, marker).not.toContain(marker);
  });
});
