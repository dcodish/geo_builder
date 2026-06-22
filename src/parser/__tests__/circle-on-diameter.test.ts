import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

/**
 * ADR-090 — a circle DEFINED BY its diameter AB (centre = midpoint of AB). The inverse of `diameter`
 * (which adds a diameter to an EXISTING circle). Define phrasings → segment + midpoint(centre) +
 * circle-through; the "diameter X IN circle O" add-phrasing is left to `diameter`.
 */
const types = (u: string, ctx = { points: [] as string[], circles: [] as string[], circleMembers: [] as { center: string; points: string[] }[] }) => {
  const r = parse(u, ctx);
  return r.ok ? (r.commands as AnyCommand[]).map((c) => c.type) : null;
};

describe('circle on diameter AB (ADR-090)', () => {
  it('DEFINE phrasings build a circle centred at the midpoint of AB (He + En)', () => {
    for (const u of [
      'AB קוטר של מעגל O',
      'מעגל שקוטרו AB',
      'מעגל שבו AB קוטר',
      'circle with diameter AB',
      'AB is the diameter of circle O',
      'AB קוטר במעגל שמרכזו O ורדיוסו R', // a circle being DEFINED by centre+radius (ADR-091): "במעגל" but "שמרכזו…ורדיוסו" = define
    ]) {
      expect(types(u), u).toEqual(['segment', 'midpoint', 'circle-through']);
    }
  });

  it('a GIVEN diameter (A,B already exist, no circle yet) defines the circle even without a define-marker', () => {
    const ctx = { points: ['A', 'B'], circles: [] as string[], circleMembers: [] as { center: string; points: string[] }[] };
    // "AB קוטר במעגל O" / bare "AB קוטר": A,B are given points, no circle to attach to → define a circle on AB
    expect((parse('AB קוטר במעגל O', ctx).ok ? (parse('AB קוטר במעגל O', ctx) as { commands: AnyCommand[] }).commands.map((c) => c.type) : null)).toEqual(['segment', 'midpoint', 'circle-through']);
    expect((parse('AB קוטר', ctx).ok ? (parse('AB קוטר', ctx) as { commands: AnyCommand[] }).commands.map((c) => c.type) : null)).toEqual(['segment', 'midpoint', 'circle-through']);
    // but with A,B NEW (no given diameter) and no define-marker, "diameter AB in circle O" stays an add
    const t = parse('diameter AB in circle O', { points: [], circles: [], circleMembers: [] });
    expect(t.ok && (t as { commands: AnyCommand[] }).commands.map((c) => c.type)).not.toContain('midpoint');
  });

  it('the ADD phrasing "diameter DE in circle O" still routes to `diameter` (not circleOnDiameter)', () => {
    // routes to `diameter` (possibly with an implicit-circle prepend, ADR-079) — NOT the circleOnDiameter
    // signature (segment + midpoint + circle-through).
    for (const u of ['diameter DE in circle O', 'קוטר DE במעגל O']) {
      const t = types(u);
      expect(t, u).toContain('diameter');
      expect(t, u).not.toContain('midpoint');
      expect(t, u).not.toContain('circle-through');
    }
    // (the cyclic-quad add case "AD קוטר במעגל ABCD" needs the circle in context — covered by the bagrut-4d scenario)
  });
});
