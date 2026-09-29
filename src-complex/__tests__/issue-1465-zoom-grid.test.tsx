/**
 * #1465 (ADR-W-094) — «when i press zoom out, the grid doesnt adapt and axis done either»: the grid was
 * sized to the content box, so zooming out left it in the middle of an empty canvas. It is now sized to
 * the VISIBLE window, with the step rule shared with analytic (`shell/ticks`).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { PolarPlane } from '../render/PolarPlane';
import { visibleGrid } from '../render/visibleGrid';
import { buildScene } from '../scene/scene';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };
const W = 900;
const H = 500;
const scene = buildScene(deriveLines(['z1 = 2cis22.5'], 0, 0));
const kAt = (zoom: number) => (Math.min(W, H) / 2 / scene.extent) * zoom;

describe('#1465 — the grid covers the visible window', () => {
  it.each([1, 0.5, 0.25])('zoom %s: gridlines reach within one step of every edge, ≤ 13 per axis', (zoom) => {
    const k = kAt(zoom);
    const g = visibleGrid(W, H, k);
    const xMax = W / 2 / k;
    const yMax = H / 2 / k;
    expect(Math.max(...g.xs)).toBeGreaterThan(xMax - g.step);
    expect(Math.min(...g.xs)).toBeLessThan(-xMax + g.step);
    expect(Math.max(...g.ys)).toBeGreaterThan(yMax - g.step);
    expect(Math.min(...g.ys)).toBeLessThan(-yMax + g.step);
    expect(g.xs.length).toBeLessThanOrEqual(13);
    // the rings reach the visible corner, so a ray and a ring meet at the canvas edge
    expect(Math.max(...g.rings)).toBeGreaterThan(g.reach - (g.rings[0] ?? 0));
  });

  it('the step grows as the view zooms out', () => {
    const steps = [1, 0.5, 0.25].map((z) => visibleGrid(W, H, kAt(z)).step);
    expect(steps[1]).toBeGreaterThan(steps[0]);
    expect(steps[2]).toBeGreaterThan(steps[1]);
  });

  it('the rendered cartesian canvas labels the edge of the zoomed-out window', () => {
    const g = visibleGrid(W, H, kAt(0.25));
    const svg = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" labels={LABELS} zoom={0.25} size={{ w: W, h: H }} />);
    const far = Math.max(...g.xs);
    expect(svg).toContain(`>${far}<`);
    expect(svg).toContain(`>${Math.max(...g.ys)}i<`);
  });

  it('the rendered polar canvas draws its rings out to the visible corner', () => {
    const g = visibleGrid(W, H, kAt(0.25));
    const svg = renderToStaticMarkup(<PolarPlane scene={scene} mode="polar" labels={LABELS} zoom={0.25} size={{ w: W, h: H }} />);
    const outer = Math.max(...g.rings);
    expect(svg).toContain(`r="${outer * kAt(0.25)}"`);
  });
});
