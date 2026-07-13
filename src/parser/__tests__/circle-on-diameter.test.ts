import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';

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
    ]) {
      expect(types(u), u).toEqual(['segment', 'midpoint', 'circle-through']);
    }
    // a circle being DEFINED by centre+radius (ADR-091): "במעגל" but "שמרכזו…ורדיוסו" = define. The stated
    // radius SYMBOL R also binds to the circle since #54 (ADR-304) — the binding post-pass appends the data command.
    expect(types('AB קוטר במעגל שמרכזו O ורדיוסו R')).toEqual(['segment', 'midpoint', 'circle-through', 'radius-symbol']);
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

/**
 * ADR-137 — "AB is a diameter" of an EXISTING circle whose endpoints A,B ALREADY EXIST is a CONSTRAINT on the
 * existing chord (the centre lies on AB ⇒ AB passes through the centre ⇒ a diameter), never a re-creation of
 * A,B (which errors "'B' is already defined"). Locks the operator's literal representation: a CIRCUMCIRCLE
 * named P (centre = derived circumcentre). The string-pipeline case (named on-circle) is the
 * `diameter-on-existing-chord-is-a-constraint` scenario.
 */
describe('diameter on an existing chord is a constraint (ADR-137)', () => {
  const ang = (a: Vec, b: Vec, c: Vec) => {
    const u = { x: a.x - b.x, y: a.y - b.y }, w = { x: c.x - b.x, y: c.y - b.y };
    return (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))))) * 180) / Math.PI;
  };

  it('"AB קוטר במעגל P" on a CIRCUMCIRCLE (derived centre) emits set-collinear and makes AB a diameter (∠ACB→90°)', () => {
    // The operator's representation: a circumcircle through A,B,C, centre P a derived circumcentre.
    // The ctx carries the MEMBERSHIP hint the app's buildParseCtx always supplies (A,B,C are on circle-P)
    // — ADR-241 gates the bare-collinearity lowering on membership, not existence; an endpoint the hint
    // doesn't cover would (correctly) get an extra idempotent `point-on-circle`.
    const setup: AnyCommand[] = [{ type: 'circumcircle', id: 'circle-P', center: 'P', a: 'A', b: 'B', c: 'C' } as AnyCommand];
    const ctx = { circles: ['P'], points: ['A', 'B', 'C', 'P'], circleMembers: [{ center: 'P', points: ['A', 'B', 'C'] }] };
    const r = parse('AB קוטר במעגל P', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // a constraint, NOT a re-creating `diameter`/`circle-through`
    expect(r.commands).toEqual([{ type: 'set-collinear', a: 'A', b: 'P', c: 'B' }]);
    // and it builds a genuine diameter without the "'B' is already defined" error
    const facts: Fact[] = [...setup, ...r.commands].map((cmd, i) => ({ id: `f${i}`, group: 'g', utterance: 'u', cmd, enabled: true }));
    const fig = replay(facts, 0);
    expect(fig.lastError).toBeNull();
    const A = fig.positions.get('A')!, B = fig.positions.get('B')!, C = fig.positions.get('C')!, P = fig.positions.get('P')!;
    expect(ang(A, C, B), '∠ACB = 90 (Thales — AB is a diameter)').toBeCloseTo(90, 0);
    const ab = { x: B.x - A.x, y: B.y - A.y };
    const off = Math.abs((P.x - A.x) * ab.y - (P.y - A.y) * ab.x) / Math.hypot(ab.x, ab.y);
    expect(off, 'centre P lies on AB').toBeLessThan(1e-3);
  });
});
