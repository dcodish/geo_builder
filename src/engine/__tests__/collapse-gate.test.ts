/**
 * #408 (ADR-413): a DECLARED polygon driven to ZERO AREA is never accepted as a solution. The solver
 * used to satisfy `D = mid(AB) ∧ D ∈ AC` by flattening triangle ABC — every residual at zero, all rows
 * ✓, no notice. The collapse check rides the ONE step-accept predicate (`stepAccepted`, beside the #7
 * vacuous gate), so every accept path — primary, M1, recruiter, settle, joint, scale — rejects a
 * flattened figure and the failure ladder ends in the honest ADR-276 refusal naming the student's
 * statement. Extent-relative threshold (1e-4 of the polygon's own span): a numeric collapse sits
 * orders below it, a legitimately thin triangle orders above.
 */
import { describe, expect, it } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';

function build(tag: string, steps: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `${tag}g${gi}.${facts.length}`, utterance: u, group: `${tag}g${gi}`, cmd, enabled: true });
  }
  return facts;
}

const P = (fig: ReturnType<typeof replay>, id: string) => {
  const p = fig.positions.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};
const area = (fig: ReturnType<typeof replay>) => {
  const [A, B, C] = ['A', 'B', 'C'].map((id) => P(fig, id));
  return Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
};

describe('#408/ADR-413 — the polygon collapse accept gate', () => {
  it('«D אמצע AB» then «D על AC»: the contradiction is REFUSED honestly, the triangle survives', () => {
    // The only non-degenerate-free solutions put B on line AC (collapse) or D on A (coincidence) —
    // both accept paths now reject, so the step must fail with the over-constrained shape, keep-prior.
    const fig = replay(build('a', ['משולש ABC', 'D אמצע AB', 'D על AC']), 0);
    expect(fig.lastError, 'the honest refusal (was: a silent all-collinear figure)').toMatch(/over-constrained|cannot hold|לא ניתן/);
    expect(area(fig), 'the prior triangle is kept intact').toBeGreaterThan(1);
    const [A, B, D] = ['A', 'B', 'D'].map((id) => P(fig, id));
    expect(Math.abs(Math.hypot(A.x - D.x, A.y - D.y) - Math.hypot(B.x - D.x, B.y - D.y)), 'D stays the midpoint of AB').toBeLessThan(1e-6);
  });

  it('a legitimately THIN triangle still builds (the gate is extent-relative, not a thinness police)', () => {
    const fig = replay(build('b', ['משולש ABC', 'זווית BAC = 3']), 0);
    expect(fig.lastError).toBeNull();
    expect(area(fig), 'thin but real').toBeGreaterThan(1e-3);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => P(fig, id));
    const v1 = { x: B.x - A.x, y: B.y - A.y };
    const v2 = { x: C.x - A.x, y: C.y - A.y };
    const deg = (Math.acos((v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))) * 180) / Math.PI;
    expect(deg, 'the stated 3° holds').toBeCloseTo(3, 3);
  });
});
