/**
 * Issue #119 / ADR-313 — a stable WITHIN-SEGMENT selection for `line-circle-intersection`.
 *
 * "circle cuts segment BO at K" (O the centre, B external) should place K on segment BO and KEEP it there
 * when a later size given rescales the figure. The old path dropped to the infinite-line `avoid` branch and
 * let K flip to the far root (beyond O) on `CK=√63`. A driving `order:[B,K,O]` fixes the placement but
 * over-constrains a sibling figure (the tangent/secant, which has a second co-linear crossing D) — issue #3.
 * The fix is a stable SELECTION (`onSegment:[B,O]`): pick the root with parameter in (0,1) — no constraint,
 * so it neither flips nor contends. Operator dev session `disb4ebn` (bagrut Q5).
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import { evaluate, applySeed } from '@/engine';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Id } from '@/engine';

function build(us: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of us) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `${g}.${facts.length}`, utterance: u, group: `g${g}`, cmd, enabled: true });
    g++;
  }
  return facts;
}
const ctxAfter = (us: string[]) => {
  const { construction, positions } = replay(build(us));
  return buildParseCtx(construction, positions);
};
const lci = (cmds: AnyCommand[]) => cmds.find((c) => c.type === 'line-circle-intersection') as { onSegment?: Id[]; order?: Id[] } | undefined;
const param = (a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) => {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
};

describe('#119 — line∩circle within-segment SELECTION', () => {
  const incircleBase = ['משולש שווה שוקיים ABC', 'AB=AC', 'במשולש חסום מעגל', 'OA', 'OB', 'OC'];

  it('a centre-endpoint segment (external other end) lowers to onSegment, NOT the driving order', () => {
    const r = parse('המעגל חותך את BO בנקודה K', ctxAfter(incircleBase));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(lci(r.commands)?.onSegment, 'K selected within B→O').toEqual(['B', 'O']);
    expect(lci(r.commands)?.order, 'no driving collinear-order').toBeUndefined();
  });

  it('K stays on segment BO before AND after a later size given (no flip)', () => {
    for (const [label, extra] of [['before', [] as string[]], ['after', ['CK', 'CK=√(63)']]] as const) {
      const der = replay(build([...incircleBase, 'AC=√3 CO', 'המעגל חותך את BO בנקודה K', ...extra]));
      const t = param(der.positions.get('B')!, der.positions.get('O')!, der.positions.get('K')!);
      expect(t, `${label}: K within segment BO`).toBeGreaterThan(0.02);
      expect(t, `${label}: K not beyond O`).toBeLessThan(0.98);
      expect(der.lastError, `${label}: no error`).toBeNull();
    }
  });

  it('the tangent/secant figure solves for EVERY seed (no over-constraint) with C near, D far', () => {
    const c = replay(build([
      'נתון מעגל שרדיוסו R ומרכזו O',
      'מנקודה A יוצא משיק למעגל בנקודה B',
      'המשך AO חותך את המעגל בנקודה D',
      'AO חותך את המעגל בנקודה C',
      'G נמצאת על המשך DB', 'AG אנך ל AD', 'BC',
    ])).construction;
    for (let s = 0; s < 8; s++) {
      const r = evaluate(applySeed(c, s));
      expect(r.ok, `seed ${s} solves`).toBe(true);
      if (!r.ok) continue;
      const A = r.positions.get('A')!, O = r.positions.get('O')!, C = r.positions.get('C')!, D = r.positions.get('D')!;
      expect(param(A, O, C), `seed ${s}: C within A→O`).toBeLessThan(1);
      expect(param(A, O, D), `seed ${s}: D beyond O`).toBeGreaterThan(1);
    }
  });

  it('a true radius (on-circle point → centre) stays the infinite-line antipode (no onSegment, no order)', () => {
    const r = parse('AO חותך את המעגל בנקודה D', ctxAfter(['מעגל שמרכזו O', 'A על המעגל']));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(lci(r.commands)?.onSegment, 'radius → no within selection').toBeUndefined();
    expect(lci(r.commands)?.order, 'radius → no order').toBeUndefined();
  });
});
