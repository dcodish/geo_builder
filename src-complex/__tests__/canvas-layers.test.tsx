/**
 * #722 — the enrichment layers are OPT-IN (operator: "I don't need all the values... all the
 * dashed lines... make it much simpler"): the DEFAULT canvas draws points, radius arrows, stated
 * regions and the grid; every S5 layer renders only when its chip is on.
 * #701 — the label PLACER: labels never leave the viewport and clustered points' labels are
 * nudged apart (w's reading used to run off-screen; a cluster stacked its labels on one spot).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };

describe('#722 — opt-in layers', () => {
  const d = deriveLines(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2'], 0, 0);
  const scene = buildScene(d);

  it('the figure HAS the layers to show (fixture sanity)', () => {
    expect(scene.rotations.length).toBeGreaterThan(0);
    expect(scene.arcs.length).toBeGreaterThan(0);
  });

  it('the DEFAULT canvas draws none of them', () => {
    const html = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" labels={LABELS} />);
    expect(html).not.toContain('×'); // the rotation sweep's «turn × stretch» label
    for (const a of scene.arcs) expect(html).not.toContain(a.label); // no angle-arc labels
  });

  it('a layer chip turns exactly its layer on', () => {
    const rot = renderToStaticMarkup(
      <PolarPlane scene={scene} mode="cart" layers={{ rotations: true }} labels={LABELS} />,
    );
    expect(rot).toContain('×');
    // angles still off — probed by z1's arc label, which shares no text with the rotation sweep
    // (the sweep's own label carries the FACTOR's 150°, so that string is not a valid probe)
    expect(rot).not.toContain('53.13°');
    const ang = renderToStaticMarkup(
      <PolarPlane scene={scene} mode="cart" layers={{ angles: true }} labels={LABELS} />,
    );
    expect(ang).toContain('53.13°');
    expect(ang).not.toContain('×'); // rotations still off
  });
});

describe('#701 — the label placer', () => {
  it('every label stays inside the viewport', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2'], 0, 0);
    const html = renderToStaticMarkup(<PolarPlane scene={buildScene(d)} mode="cart" labels={LABELS} />);
    const xs = [...html.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="13"/g)];
    expect(xs.length).toBeGreaterThan(0);
    for (const m of xs) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(8);
      expect(Number(m[1])).toBeLessThanOrEqual(672); // W - 8
      expect(Number(m[2])).toBeGreaterThanOrEqual(14);
      expect(Number(m[2])).toBeLessThanOrEqual(612); // H - 8
    }
  });

  it('two points at the SAME spot get separated labels (the cluster case)', () => {
    const d = deriveLines(['z1 = 3+4i', 'w = z1*1'], 0, 0); // w lands exactly on z1
    const html = renderToStaticMarkup(<PolarPlane scene={buildScene(d)} mode="cart" labels={LABELS} />);
    const ys = [...html.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="13"/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(2);
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(15);
  });
});
