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
import { collapsedToPoint, polygonDefects, straightCorner } from '@/engine';

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

/**
 * #2064 / #2085 item 2 ([ADR-643](../../../docs/06-decisions.md#adr-643)) — the gate's two missing members. B1: a ring
 * squashed to ONE POINT read as healthy (the scale-free flatness ruler measured its 1e-8 noise at 0.5). B2: a 4+-gon
 * with a straight corner passed (nothing in the accept path asked). Operator rulings of 2026-10-14 on #2064 (items 3,
 * 4) and #2085 (item 2).
 */

describe('#2064 B1/B2 — the rulers', () => {
  it('collapsedToPoint: every vertex within LEN_EPS; a tiny but real ring is not a point', () => {
    expect(collapsedToPoint([{ x: 0, y: 0 }, { x: 1e-8, y: 0 }, { x: 0, y: 1e-8 }, { x: 1e-8, y: 1e-8 }])).toBe(true);
    expect(collapsedToPoint([{ x: 0, y: 0 }, { x: 1e-3, y: 0 }, { x: 1e-3, y: 1e-3 }, { x: 0, y: 1e-3 }])).toBe(false);
  });
  it('straightCorner: the first corner whose sides lie on one line, 180° and 0° alike; a triangle never', () => {
    expect(straightCorner([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 5 }, { x: 4, y: 10 }])).toBe(2);
    expect(straightCorner([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 5 }, { x: 5.5, y: 2.5 }])).toBe(2); // a 0° spike at C
    expect(straightCorner([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 5 }, { x: 1, y: 4 }])).toBeNull();
    expect(straightCorner([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBeNull();
    // a thin but real corner (179°) is a corner
    const t = (179 * Math.PI) / 180;
    expect(straightCorner([{ x: -1, y: -3 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5 + 5 * Math.cos(Math.PI - t), y: 5 * Math.sin(Math.PI - t) }])).toBeNull();
  });
});

describe('#2064 B1/B2 — the accept gate refuses, the figure is kept', () => {
  const side = (fig: ReturnType<typeof replay>, a: string, b: string) => Math.hypot(P(fig, a).x - P(fig, b).x, P(fig, a).y - P(fig, b).y);

  it.each([['B אמצע CD'], ['B היא אמצע CD'], ['AB תיכון']])('«ריבוע ABCD» · «%s»: squashed to a point → B is already defined, the square kept', (line) => {
    const fig = replay(build('p', ['ריבוע ABCD', line]), 0);
    expect(fig.lastError).toBe("'B' is already defined — it can't be redefined as something different");
    expect(side(fig, 'A', 'B')).toBeCloseTo(side(fig, 'B', 'C'), 6);
    expect(side(fig, 'A', 'B')).toBeGreaterThan(1);
    expect(polygonDefects(fig.construction, fig.positions)).toEqual([]);
  });

  it.each([
    [['מרובע ABCD', 'זווית BCD = 180'], 'B, C, D'],
    [['מרובע ABCD', 'זווית BCD = 0'], 'B, C, D'],
    [['מרובע ABCD', 'C על BD'], 'B, C, D'],
    [['מחומש ABCDE', 'זווית BCD = 180'], 'B, C, D'],
    [['מחומש ABCDE', 'זווית EAB = 180'], 'E, A, B'],
    [['מחומש ABCDE', 'C על BD'], 'B, C, D'],
    [['משושה ABCDEF', 'זווית BCD = 180'], 'B, C, D'],
  ])('%j → a straight corner at %s is refused, the polygon kept', (steps, triple) => {
    const fig = replay(build('c', steps), 0);
    expect(fig.lastError).toMatch(new RegExp(`^collapsed: polygon .+ would be flat at ${triple}`));
    expect(polygonDefects(fig.construction, fig.positions)).toEqual([]);
  });

  it('a legitimately thin corner still builds: «זווית BCD = 178» on a quadrilateral and a pentagon', () => {
    for (const steps of [['מרובע ABCD', 'זווית BCD = 178'], ['מחומש ABCDE', 'זווית BCD = 178']]) {
      const fig = replay(build('t', steps), 0);
      expect(fig.lastError, steps.join(' · ')).toBeNull();
    }
  });
});
