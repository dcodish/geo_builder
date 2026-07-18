/**
 * ADR-357 (issue #171) — the circular SECTOR «גזרה» / "sector": an arc + two bounding radii whose
 * central angle is a FREE sampled DOF unless stated (ADR-052); reflex stated angles draw the major
 * arc (via the ADR-356 span-aware arc); naming is centre-first («גזרה OAB») with the angle-style
 * reading (∠DCE — centre in the middle) when the letters bind that way in the existing figure.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { freeDofs, type AnyCommand } from '@/engine';
import { buildScene } from '@/render/scene';

function buildFacts(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(step, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`step did not parse: ${step} (${(r as { reason?: string }).reason})`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
}
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('ADR-357 — sector', () => {
  for (const u of ['גזרה', 'נתונה גזרה', 'sector']) {
    it(`bare «${u}» builds an arc + two radii with the central angle a FREE sampled DOF`, () => {
      const facts = buildFacts([u]);
      const fig = replay(facts);
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      const arcs = fig.construction.objects.filter((o) => o.kind === 'arc');
      expect(arcs).toHaveLength(1);
      const segs = fig.construction.objects.filter((o) => o.kind === 'segment');
      expect(segs).toHaveLength(2); // the two bounding radii
      // The free end's θ is a samplable DOF (the unstated central angle, ADR-052).
      const dofs = freeDofs(fig.construction);
      expect(dofs.length, 'the central angle (+ the free radius) are sampled DOFs').toBeGreaterThanOrEqual(2);
      // A different seed changes the wedge (the angle genuinely varies).
      const fig2 = replay(facts, 3);
      const [c1, a1, b1] = ['O', 'A', 'B'].map((id) => fig.positions.get(id) ?? fig.positions.get('@ctr-O')!);
      const [c2, a2, b2] = ['O', 'A', 'B'].map((id) => fig2.positions.get(id) ?? fig2.positions.get('@ctr-O')!);
      const wedge = (c: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.acos(((p.x - c.x) * (q.x - c.x) + (p.y - c.y) * (q.y - c.y)) / (d(c, p) * d(c, q)));
      expect(Math.abs(wedge(c1, a1, b1) - wedge(c2, a2, b2))).toBeGreaterThan(0.05);
    });
  }

  for (const u of ['גזרה OAB בזווית 80', 'sector OAB with angle 80']) {
    it(`«${u}» pins the central angle at 80°`, () => {
      const fig = replay(buildFacts([u]));
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
      const O = fig.positions.get('O')!, A = fig.positions.get('A')!, B = fig.positions.get('B')!;
      const cos = ((A.x - O.x) * (B.x - O.x) + (A.y - O.y) * (B.y - O.y)) / (d(O, A) * d(O, B));
      expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(80, 3);
      expect(d(O, A)).toBeCloseTo(d(O, B), 4);
    });
  }

  it('a REFLEX stated angle (200°) draws the MAJOR arc — the wedge is 160°, the arc spans 200°', () => {
    const fig = replay(buildFacts(['גזרה OAB בזווית 200']));
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    const O = fig.positions.get('O')!, A = fig.positions.get('A')!, B = fig.positions.get('B')!;
    const cos = ((A.x - O.x) * (B.x - O.x) + (A.y - O.y) * (B.y - O.y)) / (d(O, A) * d(O, B));
    expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(160, 3); // the ray wedge (360−200)
    const scene = buildScene(fig.construction, fig.positions);
    expect(scene.arcs).toHaveLength(1);
    expect((Math.abs(scene.arcs[0].sweepAng) * 180) / Math.PI).toBeCloseTo(200, 3); // the drawn MAJOR arc
    expect(scene.arcs[0].largeArc).toBe(1);
  });

  it('angle-style «גזרה DCE» on existing connected points reads the MIDDLE letter as the centre', () => {
    const facts = buildFacts(['משולש ABC ישר זוית', 'D על BC', 'E על AC', 'גזרה DCE']);
    const fig = replay(facts);
    expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    // Centre C: both radii drawn from C, |CD| = |CE| (memberships size the hidden circle).
    const C = fig.positions.get('C')!, D = fig.positions.get('D')!, E = fig.positions.get('E')!;
    expect(d(C, D)).toBeCloseTo(d(C, E), 3);
    const segs = fig.construction.objects.filter(
      (o) => o.kind === 'segment' && [o.a, o.b].includes('C') && (['D', 'E'] as string[]).some((x) => [o.a, o.b].includes(x)),
    );
    expect(segs.length).toBeGreaterThanOrEqual(2);
  });

  it('the naming convention (ADR-357 Am.): middle-centre by default, an O-family letter wins wherever it sits', () => {
    // Every observed operator keystroke is the ANGLE notation (centre in the middle); the O-family
    // override keeps the #171 table's centre-first «גזרה OAB» working too.
    for (const [u, want] of [
      ['גזרה OAB', 'O'], // O-family first → centre O (the #171 table form)
      ['גזרה AOB', 'O'], // O-family middle → centre O (the operator's keystroke, session 9blvgg2o)
      ['גזרה DCE', 'C'], // no O-family → middle-centre (the angle notation)
    ] as const) {
      const r = parse(u, {});
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      const circle = r.commands.find((c): c is Extract<AnyCommand, { type: 'circle' }> => c.type === 'circle')!;
      expect(circle.center, u).toBe(want);
    }
  });

  for (const [u, deg] of [
    ['גזרה AOB שווה 80', 80],
    ['גזרה AOB = 80', 80],
    ['גזרה AOB =80', 80],
    ['sector AOB equals 80', 80],
    ['גזרה AOB 60°', 60],
    ['גזרה AOB 60 מעלות', 60],
  ] as const) {
    it(`value form «${u}» pins the central angle (the session-9blvgg2o family)`, () => {
      const r = parse(u, {});
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const angle = r.commands.find((c): c is Extract<AnyCommand, { type: 'set-angle' }> => c.type === 'set-angle')!;
      expect(angle.vertex, u).toBe('O'); // middle-centre / O-family
      expect(angle.value, u).toBe(deg);
      const arc = r.commands.find((c): c is Extract<AnyCommand, { type: 'arc' }> => c.type === 'arc')!;
      expect(arc.spanDeg, u).toBe(deg);
    });
  }

  it('«זוית מרכזית ODC = 90» — the central-angle word resolves the vertex to the CENTRE letter', () => {
    const facts = buildFacts(['משולש ABC ישר זוית', 'O על AC', 'D על AB']);
    const { construction, positions } = replay(facts);
    const r = parse('זוית מרכזית ODC = 90', buildParseCtx(construction, positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const angle = r.commands.find((c): c is Extract<AnyCommand, { type: 'set-angle' }> => c.type === 'set-angle')!;
    expect(angle.vertex).toBe('O'); // the centre, not the middle letter D
    expect([angle.ray1, angle.ray2].sort()).toEqual(['C', 'D']);
  });

  it('plain «זוית ODC = 90» (no central word) keeps the middle-vertex convention', () => {
    const r = parse('זוית ODC = 90', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const angle = r.commands.find((c): c is Extract<AnyCommand, { type: 'set-angle' }> => c.type === 'set-angle')!;
    expect(angle.vertex).toBe('D');
  });

  it('fresh-label defaults beside a triangle (ADR-355 discipline): no hijack of A,B,C', () => {
    const facts = buildFacts(['משולש ABC']);
    const { construction, positions } = replay(facts);
    const r = parse('גזרה', buildParseCtx(construction, positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const used: string[] = JSON.stringify(r.commands).match(/"[A-Z]\d*"/g) ?? [];
    for (const taken of ['"A"', '"B"', '"C"']) expect(used.includes(taken), `${taken} not hijacked`).toBe(false);
  });

  it('a compound the rule cannot express escalates whole (SHAPE_LEFTOVER stop)', () => {
    const r = parse('גזרה החסומה במשולש', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-handled');
  });
});
