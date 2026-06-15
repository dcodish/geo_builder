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
      const O = positions.get('O')!; // the (shown) centre

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

describe('quarter circle (רבע מעגל / quarter circle)', () => {
  for (const u of ['quarter circle', 'רבע מעגל']) {
    it(`"${u}" → a 90° arc with two bounding radii, no full circle`, () => {
      const { construction, positions } = buildFrom(u);
      const O = positions.get('O')!;
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
