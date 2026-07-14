/**
 * A semicircle erected on a polygon SIDE can be oriented "outside" (default, bulging away from the shape)
 * or "inside" it: «חצי מעגל על צלע AB מחוץ למשולש» / «... בתוך המשולש». The parser resolves the reference
 * vertex (a vertex not on the side) and the RENDERER flips the arc so its apex lands on the correct side
 * of the diameter — the side needs coordinates, so it can only be decided at render time.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import { buildScene } from '@/render/scene';
import type { Fact } from '@/store/geoStore';
import type { Vec } from '@/engine/types';

function build(steps: string[]) {
  const facts: Fact[] = [];
  for (const u of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`parse failed: ${u} (${(r as { reason: string }).reason})`);
    for (const cmd of r.commands) facts.push({ id: `f${facts.length}`, enabled: true, cmd, utterance: u } as Fact);
  }
  return replay(facts);
}
const side = (p: Vec, a: Vec, b: Vec) => Math.sign((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x));

describe('semicircle bulge — outside/inside a polygon', () => {
  it('«חצי מעגל על צלע AB מחוץ למשולש» builds and the arc apex is on the FAR side of AB from C', () => {
    const fig = build(['משולש ABC', 'חצי מעגל על צלע AB מחוץ למשולש']);
    const scene = buildScene(fig.construction, fig.positions);
    expect(scene.arcs).toHaveLength(1);
    const arc = scene.arcs[0];
    // apex of the rendered CCW arc from `from`: 90° CCW around the centre
    const u = { x: arc.from.x - arc.center.x, y: arc.from.y - arc.center.y };
    const apex = { x: arc.center.x - u.y, y: arc.center.y + u.x };
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!, C = fig.positions.get('C')!;
    expect(side(apex, A, B)).toBe(-side(C, A, B)); // OUTSIDE = opposite side from C
  });

  it('«... בתוך המשולש» puts the apex on the SAME side as C (inside)', () => {
    const fig = build(['משולש ABC', 'חצי מעגל על צלע AB בתוך המשולש']);
    const scene = buildScene(fig.construction, fig.positions);
    const arc = scene.arcs[0];
    const u = { x: arc.from.x - arc.center.x, y: arc.from.y - arc.center.y };
    const apex = { x: arc.center.x - u.y, y: arc.center.y + u.x };
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!, C = fig.positions.get('C')!;
    expect(side(apex, A, B)).toBe(side(C, A, B)); // INSIDE = same side as C
  });

  it('English mirror «semicircle on side AB outside triangle ABC» also orients outward', () => {
    const fig = build(['triangle ABC', 'semicircle on side AB outside triangle ABC']);
    const scene = buildScene(fig.construction, fig.positions);
    const arc = scene.arcs[0];
    const u = { x: arc.from.x - arc.center.x, y: arc.from.y - arc.center.y };
    const apex = { x: arc.center.x - u.y, y: arc.center.y + u.x };
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!, C = fig.positions.get('C')!;
    expect(side(apex, A, B)).toBe(-side(C, A, B));
  });

  it('a plain semicircle (no qualifier) still builds, unoriented', () => {
    const fig = build(['משולש ABC', 'חצי מעגל על צלע AB']);
    expect(buildScene(fig.construction, fig.positions).arcs).toHaveLength(1);
  });
});
