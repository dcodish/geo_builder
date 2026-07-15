/**
 * Secant «AD חותך למעגל» — apex A external + FAR crossing D only, near unnamed
 * ([ADR-332](../../../docs/06-decisions.md#adr-332), issue #136).
 *
 * A is the external apex, D the far-side crossing (a NEW point on the circle), the near crossing is an
 * anonymous promotable `@`-dot (bare) or a named point (בנקודה B). The rule runs before `lineMeetsCircle`
 * — which used to grab the `בנקודה B` form and build nothing (a `line-through` to a never-created D). Under
 * -specified ⇒ the secant's rotation about A is a free DOF; «דרך P» pins the direction.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import { isGeoPoint } from '@/engine';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const F = (id: string, cmd: AnyCommand): Fact => ({ id, cmd, enabled: true });

/** A parse context holding a circle O, plus any extra facts (e.g. an existing external A). */
function ctxWith(extra: Fact[] = []) {
  const facts: Fact[] = [F('c', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand), ...extra];
  const d = replay(facts, 0);
  return { ctx: buildParseCtx(d.construction, d.positions), facts };
}
const types = (cmds: AnyCommand[]) => cmds.map((c) => c.type);
const externalA: Fact = F('a', { type: 'point-circle-side', id: 'A', circle: 'circle-O', side: 'outside' } as AnyCommand);

describe('secantFarPoint (#136) — apex + far point only', () => {
  it('bare «AD חותך למעגל»: D far on circle, near = anonymous @-dot, A created external', () => {
    const { ctx } = ctxWith();
    const r = parse('AD חותך למעגל', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(types(r.commands)).toEqual(['point-circle-side', 'point-on-circle', 'line-through', 'line-circle-intersection', 'segment']);
    const near = r.commands.find((c) => c.type === 'line-circle-intersection') as any;
    expect(near.id).toBe('@near-A-D'); // anonymous promotable dot
    expect(near.order).toEqual(['A', '@near-A-D', 'D']); // D far
    const onCirc = r.commands.find((c) => c.type === 'point-on-circle') as any;
    expect(onCirc.id).toBe('D');
  });

  it('«AD חותך את המעגל» (cuts THE circle) parses the same', () => {
    const { ctx } = ctxWith();
    const r = parse('AD חותך את המעגל', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(types(r.commands)).toContain('point-on-circle');
    expect((r.commands.find((c) => c.type === 'line-circle-intersection') as any).id).toBe('@near-A-D');
  });

  it('existing external A is reused (no point-circle-side)', () => {
    const { ctx } = ctxWith([externalA]);
    const r = parse('AD חותך למעגל', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(types(r.commands)).toEqual(['point-on-circle', 'line-through', 'line-circle-intersection', 'segment']);
  });

  it('«בנקודה B» names the NEAR crossing (not the anonymous dot)', () => {
    const { ctx } = ctxWith([externalA]);
    const r = parse('AD חותך למעגל בנקודה B', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const near = r.commands.find((c) => c.type === 'line-circle-intersection') as any;
    expect(near.id).toBe('B');
    expect(near.order).toEqual(['A', 'B', 'D']);
  });

  it('«ועובר דרך P» adds the A–P–D collinearity (P created free when new)', () => {
    const { ctx } = ctxWith([externalA]);
    const r = parse('AD חותך למעגל ועובר דרך P', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const setLine = r.commands.find((c) => c.type === 'set-line') as any;
    expect(setLine.points).toEqual(['A', 'P', 'D']);
    expect(r.commands.some((c) => c.type === 'free-point' && (c as any).id === 'P')).toBe(true);
  });

  it('English «AD cuts the circle» / «at B» / «through P»', () => {
    const { ctx } = ctxWith([externalA]);
    const bare = parse('AD cuts the circle', ctx);
    expect(bare.ok).toBe(true);
    if (bare.ok) expect((bare.commands.find((c) => c.type === 'line-circle-intersection') as any).id).toBe('@near-A-D');

    const atB = parse('AD cuts the circle at B', ctx);
    expect(atB.ok).toBe(true);
    if (atB.ok) expect((atB.commands.find((c) => c.type === 'line-circle-intersection') as any).id).toBe('B');

    const thruP = parse('AD secant to the circle through P', ctx);
    expect(thruP.ok).toBe(true);
    if (thruP.ok) expect((thruP.commands.find((c) => c.type === 'set-line') as any).points).toEqual(['A', 'P', 'D']);
  });

  it('DEFERS when the far label already exists (a real chord/line → lineMeetsCircle)', () => {
    // D exists AND is on the circle: "AD cuts the circle at E" is lineMeetsCircle (line through two existing
    // points), not this apex+far rule — so no point-on-circle D is (re)created here.
    const withAD = ctxWith([
      externalA,
      F('d', { type: 'point-on-circle', id: 'D', circle: 'circle-O' } as AnyCommand),
    ]);
    const r = parse('AD חותך את המעגל בנקודה E', withAD.ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // lineMeetsCircle emits a chord-* line-through + the single new crossing E; it never re-declares D on circle.
    expect(r.commands.some((c) => c.type === 'point-on-circle' && (c as any).id === 'D')).toBe(false);
    expect((r.commands.find((c) => c.type === 'line-circle-intersection') as any).id).toBe('E');
  });

  it('DEFERS on a from-point secant / a tangent / an extension', () => {
    const { ctx } = ctxWith([externalA]);
    // from-point → secantFromExternal (two crossings named)
    const from = parse('מנקודה A מחוץ למעגל יוצא ישר החותך את המעגל בנקודות C ו-D', ctx);
    if (from.ok) expect(from.commands.some((c) => c.type === 'point-circle-side')).toBe(false); // not our external-apex emission
    // tangent keyword → not this rule (would be null here; ensure no @near dot / point-circle-side apex)
    const tan = parse('AD משיק למעגל', ctx);
    if (tan.ok) expect(tan.commands.some((c) => c.type === 'line-circle-intersection' && (c as any).id === '@near-A-D')).toBe(false);
  });

  it('END-TO-END: «בנקודה B» now BUILDS (the old chord-AD build-nothing is gone)', () => {
    // The #136 latent bug: this parsed via lineMeetsCircle then built nothing (line-through to an undefined D).
    const base: Fact[] = [
      F('c', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand),
      externalA,
    ];
    const d0 = replay(base, 0);
    const ctx = buildParseCtx(d0.construction, d0.positions);
    const r = parse('AD חותך למעגל בנקודה B', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const facts = [...base, ...r.commands.map((c, i) => F(`s${i}`, c))];
    // The store searches for a valid far-side config; assert one exists among the first seeds.
    let built = null as ReturnType<typeof replay> | null;
    for (let seed = 0; seed < 8 && !built; seed++) {
      const dd = replay(facts, seed);
      if (!dd.lastError && dd.construction.objects.some((o) => o.id === 'D') && dd.construction.objects.some((o) => o.id === 'B')) built = dd;
    }
    expect(built, 'a valid config exists').not.toBeNull();
    if (!built) return;
    const P = built.positions;
    const dist = (u: any, v: any) => Math.hypot(u.x - v.x, u.y - v.y);
    const O = P.get('O')!, A = P.get('A')!, D = P.get('D')!, B = P.get('B')!;
    const rr = dist(O, D);
    expect(Math.abs(dist(O, B) - rr)).toBeLessThan(1e-3); // B on circle (near crossing)
    expect(dist(A, O)).toBeGreaterThan(rr); // A external
    expect(dist(A, B)).toBeLessThan(dist(A, D)); // B near, D far
    expect(built.violations.length).toBe(0); // verifier clean
  });

  it('the near crossing renders as an anonymous @ point (bare form)', () => {
    const base: Fact[] = [F('c', { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand)];
    const d0 = replay(base, 0);
    const r = parse('AD חותך למעגל', buildParseCtx(d0.construction, d0.positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const facts = [...base, ...r.commands.map((c, i) => F(`s${i}`, c))];
    let built = null as ReturnType<typeof replay> | null;
    for (let seed = 0; seed < 8 && !built; seed++) {
      const dd = replay(facts, seed);
      if (!dd.lastError && dd.construction.objects.some((o) => o.id === '@near-A-D')) built = dd;
    }
    expect(built).not.toBeNull();
    if (built) expect(built.construction.objects.some((o) => isGeoPoint(o) && o.id.startsWith('@'))).toBe(true);
  });
});
