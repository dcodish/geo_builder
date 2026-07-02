/**
 * Givens verifier — checkGivens re-derives the relations the INPUT asserts and checks them against
 * the final coordinates, so a figure that applied cleanly but doesn't match its givens is caught
 * (the "green ≠ correct" net). See src/engine/verify.ts.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate, checkGivens } from '@/engine';
import type { Command, Id } from '@/engine';

const cmdsOf = (u: string): Command[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`parse failed: ${u}`);
  return r.commands as Command[];
};

describe('checkGivens — does the figure satisfy its stated givens?', () => {
  it('a valid two-circle figure reports NO violations', () => {
    const cmds = cmdsOf('two circles intersect at A and B');
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    expect(checkGivens(cmds, ev.positions, ev.circles)).toEqual([]);
  });

  it('CATCHES a point that drifted off its circle, even though every step applied (green ≠ correct)', () => {
    const cmds = cmdsOf('two circles intersect at A and B');
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    // Simulate the failure class: a point that should be on both circles ends up nowhere near them
    // (a silently-dropped on-circle fact, or a solver that drifted). The verifier must flag it.
    const tampered = new Map(ev.positions);
    const A = tampered.get('A')!;
    tampered.set('A', { x: A.x + 100, y: A.y + 100 });
    const v = checkGivens(cmds, tampered, ev.circles);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.relation === 'on-circle' && x.ids.includes('A'))).toBe(true);
  });

  it('a point exactly on its circle is NOT flagged (no false positives)', () => {
    const cmds = cmdsOf('two circles intersect at A and B');
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    // B is constructed exactly on both circles — must pass clean.
    expect(checkGivens(cmds, ev.positions, ev.circles).some((x) => x.ids.includes('B'))).toBe(false);
  });
});

// Comprehensive metric / incidence verification (ADR-053 extended): re-derive each asserted relation
// and check it against the final coordinates. A built figure passes clean; a tampered point is flagged
// with the right relation type — proving the new checks actually fire (not silently skip).
describe('checkGivens — metric & incidence relations', () => {
  /** Build a figure, assert it verifies clean, then tamper `move` and assert the relation is flagged. */
  const probe = (cmds: Command[], move: Id, rel: string) => {
    const { construction } = build(cmds);
    const ev = evaluate(construction);
    expect(ev.ok, 'figure builds').toBe(true);
    if (!ev.ok) return;
    expect(checkGivens(cmds, ev.positions, ev.circles), 'the built figure satisfies its givens').toEqual([]);
    const tampered = new Map(ev.positions);
    const p = tampered.get(move)!;
    tampered.set(move, { x: p.x + 7, y: p.y + 9 }); // shove it well past any tolerance
    const v = checkGivens(cmds, tampered, ev.circles);
    expect(v.some((x) => x.relation === rel), `a broken ${rel} relation is flagged`).toBe(true);
  };

  it('flags a violated DISTANCE given (and passes a satisfied one)', () => {
    probe([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'set-distance', a: 'A', b: 'B', value: 6 }], 'B', 'distance');
  });
  it('flags a violated ANGLE given', () => {
    probe([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 50 }], 'A', 'angle');
  });
  it('flags a violated PERPENDICULAR given', () => {
    probe([{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' }], 'B', 'perpendicular');
  });
  it('flags a violated PARALLEL given', () => {
    probe([{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-parallel', a: 'A', b: 'B', c: 'D', d: 'C' }], 'B', 'parallel');
  });
  it('flags a violated EQUAL-segments given', () => {
    probe([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' }], 'B', 'equal');
  });
});

// ON-SEGMENT MEMBERSHIP backstop (ADR-194/ADR-195): a point declared "on segment AB" must lie WITHIN
// the segment (t∈[0,1]); an "on the extension" point (t>1) must lie BEYOND the second endpoint. This is
// the general net for the "a driven DOF slid off its object" class — the gap that let ADR-194 through.
describe('checkGivens — on-segment membership', () => {
  // Square ABCD with E a plain point on AB (t≈0.5) and G on the extension of AB (t>1).
  const cmds = (): Command[] => [
    { type: 'square', ids: ['A', 'B', 'C', 'D'] },
    { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' },
    { type: 'point-on-segment', id: 'G', a: 'A', b: 'B', t: 1.3, extension: true },
  ];
  const built = () => {
    const { construction } = build(cmds());
    const ev = evaluate(construction);
    if (!ev.ok) throw new Error('figure did not build');
    return ev;
  };

  it('a valid in-segment E and a valid beyond-b G report NO violation', () => {
    const ev = built();
    expect(checkGivens(cmds(), ev.positions, ev.circles)).toEqual([]);
  });

  it('CATCHES a plain on-segment point dragged onto the EXTENSION (t>1) — the ADR-194 class', () => {
    const ev = built();
    const t = new Map(ev.positions);
    const A = t.get('A')!, B = t.get('B')!;
    t.set('E', { x: A.x + 1.4 * (B.x - A.x), y: A.y + 1.4 * (B.y - A.y) }); // t=1.4, off the far end
    const v = checkGivens(cmds(), t, ev.circles);
    expect(v.some((x) => x.messageKey === 'figure.v.onSegment' && x.ids.includes('E'))).toBe(true);
  });

  it('CATCHES a plain on-segment point behind the near end (t<0)', () => {
    const ev = built();
    const t = new Map(ev.positions);
    const A = t.get('A')!, B = t.get('B')!;
    t.set('E', { x: A.x - 0.3 * (B.x - A.x), y: A.y - 0.3 * (B.y - A.y) }); // t=-0.3
    expect(checkGivens(cmds(), t, ev.circles).some((x) => x.messageKey === 'figure.v.onSegment')).toBe(true);
  });

  it('CATCHES an EXTENSION point that fell BETWEEN the endpoints (should be beyond b)', () => {
    const ev = built();
    const t = new Map(ev.positions);
    const A = t.get('A')!, B = t.get('B')!;
    t.set('G', { x: A.x + 0.5 * (B.x - A.x), y: A.y + 0.5 * (B.y - A.y) }); // t=0.5, between A and B
    expect(checkGivens(cmds(), t, ev.circles).some((x) => x.messageKey === 'figure.v.orderBeyond' && x.ids.includes('G'))).toBe(true);
  });

  it('does NOT check a point-on-segment SUPERSEDED by a later definition (the redefine-onto-circle case)', () => {
    // E declared on the extension of AB, then REDEFINED by a later command that OUTPUTS E (here an
    // on-circle redefinition — the operator's "E על המשך AC" then "E על מעגל P"). The stale extension
    // membership must NOT be flagged even though E sits between A and B; its real definition (on-circle)
    // is what's verified. Tested at the checkGivens boundary so the guard is exercised directly.
    const redefined: Command[] = [
      { type: 'point-on-segment', id: 'E', a: 'A', b: 'B', t: 1.3, extension: true },
      { type: 'point-on-circle', id: 'E', circle: 'circle-P' }, // later definition of E supersedes the extension
    ];
    const positions = new Map<Id, { x: number; y: number }>([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 10, y: 0 }],
      ['E', { x: 5, y: 0 }], // between A and B (t=0.5) — WOULD trip the extension check if not superseded
    ]);
    // No resolved circle-P supplied, so the on-circle check skips; the only possible flag is the stale
    // extension one, which the lastDef guard must suppress.
    expect(checkGivens(redefined, positions, new Map()).some((x) => x.ids.includes('E'))).toBe(false);
  });
});
