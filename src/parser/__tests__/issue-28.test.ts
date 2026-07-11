/**
 * Issue #28 / ADR-284 — a semicircle/quarter-circle on EXISTING endpoints is a STATEMENT about them
 * (M1), never a re-creation with pinned θ; an unstated size is a FREE DOF (ADR-051/052).
 *
 * Operator prod reports (`p3du4l9p`, `z57b5nd0`, `fxp24nna`): after «ריבוע», the semicircle forms
 * «על צלע CD יש חצי מעגל» / «חצי מעגל שהקוטר שלו CD» re-declared the square's C,D as NEW on-circle
 * points with PINNED θ on a hidden radius-5 circle that never reached the side — every row ✓ but the
 * figure verifier-amber (`C should lie on circle P … but is 8.81 from its centre`), and the follow-up
 * «CD קוטר» couldn't resolve the circle implicitly (zero satisfied members).
 *
 * Fix: with BOTH endpoints existing the semicircle is CLOSED-FORM — centre = midpoint of the stated
 * diameter, radius `through` an endpoint (zero solve, the prior figure cannot move); mixed/new cases
 * keep the free-centre circle where an EXISTING endpoint is an idempotent membership + the through-
 * centre collinearity (the `diameter` rule's ADR-137 lowering) and only NEW endpoints get gauge θs.
 * Both rules also migrate to `freeRadius` (unless a number was stated) + `autoCenter` (unless named).
 * Engine siblings (apply.ts (c3)/(c4)): a DETERMINED point declared on a free-radius circle makes the
 * radius `through` it (first membership) so a second membership drives the free centre via (c); a
 * numeric-radius circle pushes the |centre·P| distance instead.
 *
 * The exact prod sequences are locked by scenarios `semicircle-on-existing-square-side` +
 * `semicircle-diameter-phrasing-on-existing-side`.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function buildFacts(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(step, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
}
const parseWith = (u: string, prefix: string[]) => {
  const { construction, positions } = replay(buildFacts(prefix));
  const r = parse(u, buildParseCtx(construction, positions));
  if (!r.ok) throw new Error(`did not parse: ${u} (${(r as { reason?: string }).reason})`);
  return r.commands as AnyCommand[];
};

describe('issue #28 — semicircle on EXISTING endpoints lowers closed-form (midpoint centre + through-radius)', () => {
  it('both endpoints exist → midpoint + circle-through + the tautological membership; NO pinned θ', () => {
    for (const u of ['על צלע CD יש חצי מעגל', 'חצי מעגל שהקוטר שלו CD', 'semicircle with diameter CD']) {
      const cmds = parseWith(u, ['ריבוע']);
      expect(cmds.map((c) => c.type), u).toEqual(['midpoint', 'circle-through', 'point-on-circle', 'arc', 'segment']);
      const mid = cmds[0] as Extract<AnyCommand, { type: 'midpoint' }>;
      expect([mid.a, mid.b].sort()).toEqual(['C', 'D']);
      const circ = cmds[1] as Extract<AnyCommand, { type: 'circle-through' }>;
      expect(circ.center).toBe(mid.id);
      expect(circ.hidden).toBe(true);
      expect(circ.autoCenter).toBe(true); // unnamed centre stays auto-hidden (FR-RN-8)
      const mem = cmds[2] as Extract<AnyCommand, { type: 'point-on-circle' }>;
      expect('theta' in mem && mem.theta !== undefined, 'membership carries NO pinned θ').toBe(false);
    }
  });

  it('a NAMED centre is honoured (no autoCenter)', () => {
    const cmds = parseWith('חצי מעגל P שהקוטר של CD', ['ריבוע']);
    const mid = cmds[0] as Extract<AnyCommand, { type: 'midpoint' }>;
    expect(mid.id).toBe('P');
    const circ = cmds[1] as Extract<AnyCommand, { type: 'circle-through' }>;
    expect(circ.center).toBe('P');
    expect(circ.autoCenter).toBeUndefined();
  });

  it('the built figure is EXACT and the prior square never moves', () => {
    const before = replay(buildFacts(['ריבוע']));
    const fig = replay(buildFacts(['ריבוע', 'על צלע CD יש חצי מעגל']));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.violations ?? []).toEqual([]);
    // Stability: the square's vertices are bit-identical to the pre-semicircle figure.
    for (const id of ['A', 'B', 'C', 'D']) expect(fig.positions.get(id), `vertex ${id} unmoved`).toEqual(before.positions.get(id));
    // Exactness: centre = midpoint of CD, both endpoints at the radius.
    const C = fig.positions.get('C')!, D = fig.positions.get('D')!;
    const circ = fig.construction.objects.find((o) => o.kind === 'circle') as { center: string };
    const O = fig.positions.get(circ.center)!;
    expect(O.x).toBeCloseTo((C.x + D.x) / 2, 9);
    expect(O.y).toBeCloseTo((C.y + D.y) / 2, 9);
    const r = Math.hypot(C.x - O.x, C.y - O.y);
    expect(Math.hypot(D.x - O.x, D.y - O.y)).toBeCloseTo(r, 9);
    expect(r).toBeCloseTo(Math.hypot(C.x - D.x, C.y - D.y) / 2, 9);
  });

  it('the MIXED case (one endpoint exists) builds green via membership + collinearity, square unmoved', () => {
    const fig = replay(buildFacts(['ריבוע', 'חצי מעגל שקוטרו CE']));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.violations ?? []).toEqual([]);
    const before = replay(buildFacts(['ריבוע']));
    for (const id of ['A', 'B', 'C', 'D']) expect(fig.positions.get(id), `vertex ${id} unmoved`).toEqual(before.positions.get(id));
    const circ = fig.construction.objects.find((o) => o.kind === 'circle') as { center: string };
    const C = fig.positions.get('C')!, E = fig.positions.get('E')!, O = fig.positions.get(circ.center)!;
    expect(Math.hypot(C.x - O.x, C.y - O.y)).toBeCloseTo(Math.hypot(E.x - O.x, E.y - O.y), 6);
    // C, O, E collinear — CE is a genuine diameter.
    expect(Math.abs((E.x - C.x) * (O.y - C.y) - (E.y - C.y) * (O.x - C.x))).toBeLessThan(1e-6);
  });

  it('fresh semicircle/quarter-circle: unstated radius is a FREE DOF, a stated one stays fixed', () => {
    const fresh = parseWith('חצי מעגל שקוטרו AB', []);
    const c1 = fresh[0] as Extract<AnyCommand, { type: 'circle' }>;
    expect(c1.freeRadius).toBe(true);
    expect(c1.autoCenter).toBe(true);
    const sized = parseWith('חצי מעגל שקוטרו AB ורדיוסו 3', []);
    const c2 = sized[0] as Extract<AnyCommand, { type: 'circle' }>;
    expect(c2.freeRadius).toBeUndefined();
    expect(c2.radius).toBe(3);
    const q = parseWith('רבע מעגל', []);
    const c3 = q[0] as Extract<AnyCommand, { type: 'circle' }>;
    expect(c3.freeRadius).toBe(true);
  });

  it('the follow-up «CD קוטר» resolves the semicircle implicitly and passes as a check', () => {
    const fig = replay(buildFacts(['ריבוע', 'על צלע CD יש חצי מעגל', 'CD קוטר']));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.violations ?? []).toEqual([]);
  });
});
