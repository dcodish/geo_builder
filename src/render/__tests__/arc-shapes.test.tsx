/**
 * Semicircle and quarter circle — a drawn `Arc` (no full circle). A semicircle is
 * a 180° arc on a diameter AB (the diameter is drawn, the centre shown); a quarter
 * circle is a 90° arc with its two bounding radii. The circle that carries the arc's
 * endpoints is hidden, so only the arc (+ its straight edges) is drawn.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from '@/parser';
import { build } from '@/engine';
import { buildScene } from '@/render/scene';
import { Figure } from '@/render/Figure';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const buildFrom = (u: string) => {
  const r = parse(u);
  if (!r.ok) throw new Error(`not handled: ${u}`);
  return { commands: r.commands, ...build(r.commands) };
};

describe('semicircle (חצי מעגל / semicircle)', () => {
  for (const u of ['semicircle with diameter AB', 'חצי מעגל שקוטרו AB', 'half circle on AB']) {
    it(`"${u}" → a 180° arc on diameter AB, no full circle drawn`, () => {
      const { construction, positions } = buildFrom(u);
      const A = positions.get('A')!;
      const B = positions.get('B')!;
      const O = (positions.get('O') ?? positions.get('@ctr-O'))!; // the (shown) centre

      // O is the midpoint of AB; A,B are antipodal on the (hidden) circle of radius |OA|.
      expect(O.x).toBeCloseTo((A.x + B.x) / 2, 6);
      expect(O.y).toBeCloseTo((A.y + B.y) / 2, 6);
      expect(dist(O, A)).toBeCloseTo(dist(O, B), 6);

      const scene = buildScene(construction, positions);
      expect(scene.circles).toHaveLength(0); // the carrier circle is hidden
      expect(scene.arcs).toHaveLength(1);
      expect(scene.arcs[0].largeArc).toBe(0); // a 180° arc
      expect(scene.segments).toHaveLength(1); // the diameter AB
    });
  }

  it('renders the arc as an SVG <path>', () => {
    const { construction, positions } = buildFrom('semicircle with diameter AB');
    const html = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);
    expect(html).toContain('<path');
    expect(html).toMatch(/d="M [-\d.]+ [-\d.]+ A /); // an elliptical-arc path command
  });
});

describe('ADR-356 (#170) — an arc\'s identity survives a MIRRORED frame', () => {
  const mirrorX = (positions: Map<string, { x: number; y: number }>) =>
    new Map([...positions].map(([id, p]) => [id, { x: -p.x, y: p.y }]));
  const arcSpanDeg = (a: { sweepAng: number }) => (Math.abs(a.sweepAng) * 180) / Math.PI;

  it('quarter: a mirrored VIEW frame still draws the 90° arc (never the 270° complement)', () => {
    const { construction, positions } = buildFrom('רבע מעגל');
    // The Figure pre-orients world positions; one flip reverses handedness. Simulate exactly that:
    // mirrored positions + the parity flag the Figure now passes.
    const scene = buildScene(construction, mirrorX(positions), undefined, undefined, { mirrored: true });
    expect(scene.arcs).toHaveLength(1);
    expect(scene.arcs[0].largeArc).toBe(0);
    expect(arcSpanDeg(scene.arcs[0])).toBeCloseTo(90, 4);
  });

  it('quarter: a mirrored SOLVE (world-mirrored config, identity view) still draws the 90° arc — spanDeg is the identity', () => {
    const { construction, positions } = buildFrom('רבע מעגל');
    // No parity flag here — the WORLD positions themselves are the mirror configuration (the unsigned
    // central-angle constraint's other branch). The stated 90° span must still win.
    const scene = buildScene(construction, mirrorX(positions));
    expect(scene.arcs).toHaveLength(1);
    expect(scene.arcs[0].largeArc).toBe(0);
    expect(arcSpanDeg(scene.arcs[0])).toBeCloseTo(90, 4);
  });

  it('semicircle: mirrored view still draws the 180° arc and keeps its bulge orientation machinery', () => {
    const { construction, positions } = buildFrom('semicircle with diameter AB');
    const scene = buildScene(construction, mirrorX(positions), undefined, undefined, { mirrored: true });
    expect(scene.arcs).toHaveLength(1);
    expect(arcSpanDeg(scene.arcs[0])).toBeCloseTo(180, 4);
  });

  it('identity frame stays byte-stable: unmirrored quarter/semicircle flags unchanged', () => {
    for (const [u, span] of [['רבע מעגל', 90], ['semicircle with diameter AB', 180]] as const) {
      const { construction, positions } = buildFrom(u);
      const scene = buildScene(construction, positions);
      expect(scene.arcs[0].largeArc, u).toBe(0);
      expect(scene.arcs[0].sweep, u).toBe(0);
      expect(arcSpanDeg(scene.arcs[0])).toBeCloseTo(span, 4);
    }
  });
});

describe('quarter circle (רבע מעגל / quarter circle)', () => {
  for (const u of ['quarter circle', 'רבע מעגל']) {
    it(`"${u}" → a 90° arc with two bounding radii, no full circle`, () => {
      const { construction, positions } = buildFrom(u);
      const O = (positions.get('O') ?? positions.get('@ctr-O'))!;
      const A = positions.get('A')!;
      const B = positions.get('B')!;

      // A,B equidistant from O and 90° apart (the right angle of the quarter).
      expect(dist(O, A)).toBeCloseTo(dist(O, B), 6);
      const u1 = { x: A.x - O.x, y: A.y - O.y };
      const u2 = { x: B.x - O.x, y: B.y - O.y };
      const cos = (u1.x * u2.x + u1.y * u2.y) / (dist(O, A) * dist(O, B));
      expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(90, 4);

      const scene = buildScene(construction, positions);
      expect(scene.circles).toHaveLength(0); // hidden carrier circle
      expect(scene.arcs).toHaveLength(1);
      expect(scene.arcs[0].largeArc).toBe(0); // a 90° (minor) arc
      expect(scene.segments).toHaveLength(2); // the two bounding radii O–A and O–B
    });
  }
});
