/**
 * #1404 (ADR-CX-046) — «when converting to cartesian, i would prefer to see the sqrt and if we need
 * n-sqrt and not a decimal» (operator, 2026-09-24, playing `z1 = 2cis120 · z^3 = 8`).
 *
 * Every line here goes through the REAL submit gate (`submitLine`), then the real derive → stage-5d
 * reading, and the reading is read back off BOTH surfaces — the canvas label and the panel row — so
 * the one-source rule (#653/#675) is part of the lock, not an assumption of it.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { v2Labels } from '../replay/scene2';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';
import { useComplexStore } from '../store/useComplexStore';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };
const store = () => useComplexStore.getState();

beforeEach(() => {
  store().resetSession();
});

/** Submit through the gate (every line must be accepted), then derive what the student sees. */
function play(lines: string[]) {
  for (const l of lines) expect(submitLine(l), `the gate refused «${l}»`).toBe(true);
  const d = deriveLines(store().lines, store().seed, store().seed, store().queries);
  const cart = new Map(d.points.map((p) => [p.name, p.readingCart]));
  const polar = new Map(d.points.map((p) => [p.name, p.reading]));
  return { d, cart, polar };
}

describe('#1404 — the cartesian view shows radicals, not decimals', () => {
  it("the operator's exact sequence: z₁ = -1+√3i, z₂ = 2, z₃ = -1-√3i", () => {
    const { cart, polar } = play(['z1 = 2cis120', 'z^3 = 8']);
    expect(cart.get('z1')).toBe('z₁ = -1+√3i');
    expect(cart.get('z2')).toBe('z₂ = 2');
    expect(cart.get('z3')).toBe('z₃ = -1-√3i');
    // polar is untouched
    expect(polar.get('z1')).toBe('z₁ = 2·cis120°');
  });

  it('2cis45 reads √2+√2i', () => {
    expect(play(['z1 = 2cis45']).cart.get('z1')).toBe('z₁ = √2+√2i');
  });

  it('a nested root is shown (the round decision in ADR-CX-046): 2cis22.5 and 2cis18', () => {
    expect(play(['z1 = 2cis22.5']).cart.get('z1')).toBe('z₁ = √(2+√2)+√(2-√2)i');
    store().resetSession();
    expect(play(['z1 = 2cis18']).cart.get('z1')).toBe('z₁ = √(10+2√5)/2+((√5-1)/2)i');
  });

  it('an n-th-root modulus multiplies the radicals: z^5 = 100', () => {
    const { cart } = play(['z^5 = 100']);
    expect(cart.get('z1')).toBe('z₁ = ⁵√100');
    expect(cart.get('z2')).toBe('z₂ = ⁵√100·(√5-1)/4+(⁵√100·√(10+2√5)/4)i');
  });

  it('cos 20° has no radical form, so 2cis20 KEEPS ≈ — the display never invents an exact value', () => {
    expect(play(['z1 = 2cis20']).cart.get('z1')).toBe('z₁ ≈ 1.88+0.68i');
  });

  it('a SAMPLED point stays the bare name (the no-guess rule)', () => {
    const { cart } = play(['z1 = 3+4i', 'w = z1*z2']);
    expect(cart.get('z2')).toBe('z₂');
    expect(cart.get('z1')).toBe('z₁ = 3+4i');
  });
});

describe('#1404 — a zero part is dropped, on every path', () => {
  it('z1 = -2 reads «-2», not «-2+0i»', () => {
    expect(play(['z1 = -2']).cart.get('z1')).toBe('z₁ = -2');
  });

  it('z1 = 2i reads «2i», not «0+2i»', () => {
    expect(play(['z1 = 2i']).cart.get('z1')).toBe('z₁ = 2i');
  });

  it('a negative real parameter (ADR-CX-045): u^5 = -32 · z1 = u reads «-2»', () => {
    expect(play(['u^5 = -32', 'z1 = u']).cart.get('z1')).toBe('z₁ = -2');
  });
});

describe('#1404 — one source, two surfaces', () => {
  it('the canvas label and the panel row carry the same radical reading', () => {
    const { d } = play(['z1 = 2cis120', 'z^3 = 8']);
    const scene = buildScene(d);
    expect(v2Labels(d, 'cart')).toEqual(scene.points.map((p) => p.readingCart));
    const svg = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" labels={LABELS} />);
    expect(svg).toContain('z₁ = -1+√3i');
    expect(svg).not.toContain('1.73');
  });
});
