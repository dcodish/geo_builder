/**
 * #703 — the CARTESIAN view is real again (operator: "we don't have the cartesian view, only
 * polar works"; the capability died with the prototype's GaussPlane at the cutover, ADR-CX-027).
 * The locks pin the issue's settled scope: an x/y grid in cart mode, readings that FOLLOW the
 * view — composed at the ONE stage-5d chokepoint so canvas and panel cannot disagree — and the
 * no-guess rule binding identically in both lenses.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { v2Labels } from '../replay/scene2';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };

describe('the cartesian reading (stage 5d, second view)', () => {
  it('an a+bi definition reads back EXACTLY: z₁ = 3+4i', () => {
    const d = deriveLines(['z1 = 3+4i'], 0, 0);
    expect(d.points[0].readingCart).toBe('z₁ = 3+4i');
  });

  it('a polar definition reads its cartesian form at display precision: 2cis120 ≈ -1+1.73i', () => {
    const d = deriveLines(['z1 = 2cis120'], 0, 0);
    expect(d.points[0].readingCart).toBe('z₁ ≈ -1+1.73i');
  });

  it('the NO-GUESS rule binds in the cartesian lens too — undetermined reads as the bare name', () => {
    const d = deriveLines(['z1 = 3+4i', 'w = z1*z2'], 0, 0); // z2 implicit free
    const z2 = d.points.find((p) => p.name === 'z2')!;
    expect(z2.readingCart).toBe('z₂');
  });
});

describe('the cartesian canvas mode', () => {
  const d = deriveLines(['z1 = 3+4i'], 0, 0);
  const scene = buildScene(d);

  it('cart mode draws the x/y grid and drops the polar rays', () => {
    const cart = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" labels={LABELS} />);
    expect(cart).toContain('data-testid="cart-grid"');
    expect(cart).not.toContain('ray30'); // the polar rays' keys are absent
    const polarView = renderToStaticMarkup(<PolarPlane scene={scene} mode="polar" labels={LABELS} />);
    expect(polarView).not.toContain('data-testid="cart-grid"');
  });

  it('the canvas label follows the view: a+bi in cart, cis in polar', () => {
    const cart = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" labels={LABELS} />);
    expect(cart).toContain('z₁ = 3+4i');
    expect(cart).not.toContain('cis53.13');
    const polarView = renderToStaticMarkup(<PolarPlane scene={scene} mode="polar" labels={LABELS} />);
    expect(polarView).toContain('cis53.13');
  });
});

describe('reading parity — one source, two surfaces, per view', () => {
  it('the panel rows equal the scene readings in BOTH views', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 2cis120'], 0, 0);
    const s = buildScene(d);
    expect(v2Labels(d, 'polar')).toEqual(s.points.map((p) => p.reading));
    expect(v2Labels(d, 'cart')).toEqual(s.points.map((p) => p.readingCart));
  });
});
