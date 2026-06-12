/**
 * Two-circle intersection + drawn (visible) construction lines.
 * Engine: circle∩circle point (0/1/2 branches). Renderer: a visible tangent /
 * bisector / perpendicular / parallel line appears in the scene and renders as a
 * dashed <line>, while scaffolding lines stay invisible. Parser: standalone forms.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Command, Vec } from '@/engine/types';
import { build, evaluate } from '@/engine';
import { dist, sub } from '@/engine/geometry';
import { buildScene } from '../scene';
import { Figure } from '../Figure';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;

describe('circle ∩ circle', () => {
  it('a point on both circles; the two branches are distinct', () => {
    const base: Command[] = [
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'free-point', id: 'P', x: 6, y: 0 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 5 },
    ];
    const g0 = build([...base, { type: 'circle-circle-intersection', id: 'G', circle1: 'circle-O', circle2: 'circle-P', branch: 0 }]);
    const g1 = build([...base, { type: 'circle-circle-intersection', id: 'G', circle1: 'circle-O', circle2: 'circle-P', branch: 1 }]);
    const G0 = g0.positions.get('G')!, G1 = g1.positions.get('G')!;
    expect(dist(g0.positions.get('O')!, G0)).toBeCloseTo(5, 6); // on circle O
    expect(dist(g0.positions.get('P')!, G0)).toBeCloseTo(5, 6); // on circle P
    expect(dist(G0, G1)).toBeGreaterThan(1e-3); // the two intersections differ
  });

  it('non-meeting circles are rejected', () => {
    const cmds: Command[] = [
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 2 },
      { type: 'free-point', id: 'P', x: 100, y: 0 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 2 },
      { type: 'circle-circle-intersection', id: 'G', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
    ];
    expect(() => build(cmds)).toThrow(/do not meet/i);
  });

  it('parses "G is the intersection of circle O and circle P" (He + En)', () => {
    for (const u of ['G is the intersection of circle O and circle P', 'G חיתוך מעגל O ומעגל P']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands[0]).toEqual({ type: 'circle-circle-intersection', id: 'G', circle1: 'circle-O', circle2: 'circle-P', branch: 0 });
    }
  });
});

describe('visible construction lines', () => {
  it('a drawn tangent is ⟂ the radius and appears in the scene', () => {
    const { construction, positions } = build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'tangent', id: 'tanA', circle: 'circle-O', at: 'A', visible: true },
    ]);
    const scene = buildScene(construction, positions);
    expect(scene.lines).toHaveLength(1);
    const OA = sub(positions.get('A')!, positions.get('O')!);
    expect(Math.abs(dot(scene.lines[0].dir, OA))).toBeLessThan(1e-6); // tangent ⟂ radius
  });

  it('a scaffolding (non-visible) line is NOT drawn', () => {
    const { construction, positions } = build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'tangent', id: 'tanA', circle: 'circle-O', at: 'A' }, // no visible flag
    ]);
    expect(buildScene(construction, positions).lines).toHaveLength(0);
  });

  it('a drawn bisector renders as a dashed <line>', () => {
    const { construction, positions } = build([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'bisector', id: 'bisB', vertex: 'B', p: 'A', q: 'C', visible: true },
    ]);
    expect(buildScene(construction, positions).lines).toHaveLength(1);
    const html = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);
    expect(html).toContain('stroke-dasharray'); // construction lines are dashed
  });

  it('end-to-end: a parsed standalone tangent becomes a visible line', () => {
    const cmds = ['circle centered at O radius 5', 'A is on circle O', 'tangent to circle O at A'].flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(`failed: ${u}`);
      return r.commands;
    });
    const { construction, positions } = build(cmds as Command[]);
    expect(buildScene(construction, positions).lines).toHaveLength(1);
    expect(evaluate(construction).ok).toBe(true);
  });
});
