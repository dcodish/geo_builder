/**
 * Two-circle intersection + drawn (visible) construction lines.
 * Engine: circle∩circle point (0/1/2 branches). Renderer: a visible tangent /
 * bisector / perpendicular / parallel line appears in the scene and renders as a
 * dashed <line>, while scaffolding lines stay invisible. Parser: standalone forms.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Command, Vec } from '@/engine/types';
import { applyStep, build, emptyConstruction, evaluate } from '@/engine';
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

describe('circle centre visibility — show if used or named', () => {
  const drawnIds = (cmds: Command[]) => {
    const { construction, positions } = build(cmds);
    return buildScene(construction, positions).points.map((p) => p.id);
  };
  it('a NAMED centre is drawn even when nothing uses it', () => {
    expect(drawnIds([{ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }])).toContain('O');
  });
  it('an AUTO centre is HIDDEN when nothing is drawn from it', () => {
    const ids = drawnIds([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, autoCenter: true },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
    ]);
    expect(ids).not.toContain('O');
    expect(ids).toContain('A');
  });
  it('an AUTO centre IS drawn once something uses it (a radius from it)', () => {
    const ids = drawnIds([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, autoCenter: true },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'segment', a: 'O', b: 'A' },
    ]);
    expect(ids).toContain('O'); // now referenced
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

  it('a drawn bisector renders as a regular (solid) <line>', () => {
    const { construction, positions } = build([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'bisector', id: 'bisB', vertex: 'B', p: 'A', q: 'C', visible: true },
    ]);
    expect(buildScene(construction, positions).lines).toHaveLength(1);
    const html = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);
    expect(html).toContain('<line'); // the visible line is drawn…
    expect(html).not.toContain('stroke-dasharray'); // …as a regular solid line, not dashed
  });

  it('a visible line with two named points on it is trimmed to the segment between them', () => {
    // the tangent at D + where it meets AB (E) ⇒ draw the segment D–E, not an infinite line
    const cmds = ['triangle ABD inscribed in circle O radius 5', 'tangent to circle O at D', 'E is the intersection of the tangent to circle O at D and AB'].flatMap(
      (u) => {
        const r = parse(u);
        if (!r.ok) throw new Error(u);
        return r.commands;
      },
    );
    const { construction, positions } = build(cmds as Command[]);
    const scene = buildScene(construction, positions);
    expect(scene.lines.find((l) => l.id === 'tan-D')).toBeUndefined(); // not an infinite line anymore
    const seg = scene.segments.find((s) => s.id === 'tan-D');
    expect(seg).toBeDefined(); // …it's a segment
    const ends = [seg!.a, seg!.b];
    const near = (p: Vec) => ends.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 1e-6);
    expect(near(positions.get('D')!) && near(positions.get('E')!)).toBe(true); // spanning D and E
  });

  it('creates the touch point on the circle when it does not exist yet', () => {
    // "tangent to circle O at A" with no A → A is created ON the circle + the line drawn
    const { construction, positions } = build([
      { type: 'free-point', id: 'O', x: 0, y: 0 },
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'tangent', id: 'tan-A', circle: 'circle-O', at: 'A', visible: true },
    ]);
    expect(dist(positions.get('O')!, positions.get('A')!)).toBeCloseTo(5, 6); // A auto-placed on the circle
    expect(buildScene(construction, positions).lines).toHaveLength(1);
  });

  it('the user flow (circle → tangent at A → A on circle O) has no conflict and draws', () => {
    const cmds = ['מעגל סביב O רדיוס 5', 'משיק למעגל O בנקודה A', 'A על מעגל O'].flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(`failed: ${u}`);
      return r.commands;
    });
    // applyStep each in order; none should fail (the later "A on circle O" reuses A)
    let cur = emptyConstruction();
    for (const cmd of cmds as Command[]) {
      const r = applyStep(cur, cmd);
      expect(r.ok, `step ${cmd.type}: ${r.ok ? '' : r.error}`).toBe(true);
      cur = r.construction;
    }
    const e = evaluate(cur);
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(dist(e.positions.get('O')!, e.positions.get('A')!)).toBeCloseTo(5, 6);
      expect(buildScene(cur, e.positions).lines).toHaveLength(1);
    }
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
