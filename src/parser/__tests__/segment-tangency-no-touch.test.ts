/**
 * Issue #203 (feature, ADR-369) — tangency of an EXISTING segment to a circle with NO touch point
 * named: «AB משיק למעגל C» / "AB tangent to circle C" where both A and B exist off-circle.
 *
 * Prod session cm4ak2yo (2026-07-17): both phrasings fell through every tangent rule to the LLM →
 * not-understood. The existing family covered a tangent AT a named touch, THROUGH an on-circle
 * point, corner tangents, and from-external with a named apex/touch — the single-segment /
 * both-endpoints-existing / unnamed-touch member was missing. It blocks the classic
 * quarter-circle-in-a-right-triangle bagrut figure (arc centred at the right-angle vertex, the
 * hypotenuse tangent to it).
 *
 * Lowering (the ADR-115 constraint discipline — never a rebuilt circle): the touch is the FOOT of
 * the perpendicular from the centre onto line AB (an ADR-297 anonymous dot) + its MEMBERSHIP
 * (⟺ dist(centre, AB) = r, driving the free radius/centre); a bare pair keeps the touch WITHIN AB
 * (ADR-077), «הישר»/line opts out.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function factsFrom(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const PREFIX = ['משולש ABC ישר זוית', 'D על BC', 'E על AC', 'מעגל C'];

describe('#203 — segment tangency with no touch named', () => {
  it.each([['He', 'AB משיק למעגל C'], ['En', 'AB tangent to circle C'], ['He implicit circle', 'AB משיק למעגל']])(
    '%s lowers to a CONSTRAINT on the existing circle (foot + membership), never a rebuilt circle',
    (_t, u) => {
      const base = factsFrom(PREFIX);
      const r = parse(u, ctxOf(base));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      expect(r.commands.some((c) => c.type === 'circle' || c.type === 'circle-through'), 'never a new circle').toBe(false);
      expect(r.commands.some((c) => c.type === 'foot'), 'the touch = ⟂ foot from the centre').toBe(true);
      expect(r.commands.some((c) => c.type === 'point-on-circle'), 'the foot membership = the tangency').toBe(true);
      expect(r.commands.some((c) => c.type === 'set-line'), 'bare pair ⇒ touch WITHIN the segment').toBe(true);
    },
  );

  it('«הישר AB משיק למעגל C» keeps the infinite-line reading — no within-segment order', () => {
    const base = factsFrom(PREFIX);
    const r = parse('הישר AB משיק למעגל C', ctxOf(base));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
  });

  it('the operator\'s full figure builds: hypotenuse tangent to the quarter-circle at the right angle', () => {
    const facts = factsFrom([...PREFIX, 'DC רדיוס', 'CD=CE', 'AB משיק למעגל C']);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
    // the tangency actually holds: dist(C, line AB) = r = |CD|
    const A = fig.positions.get('A')!;
    const B = fig.positions.get('B')!;
    const C = fig.positions.get('C')!;
    const D = fig.positions.get('D')!;
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const distC = Math.abs((B.x - A.x) * (A.y - C.y) - (A.x - C.x) * (B.y - A.y)) / len;
    const r = Math.hypot(D.x - C.x, D.y - C.y);
    expect(distC).toBeCloseTo(r, 2);
  });

  it('no-theft: richer tangency phrasings keep their owners', () => {
    const base = factsFrom(PREFIX);
    // a named touch → the existing at-form (ADR-081 family): emits ⟂ against the named touch, no foot
    const at = parse('AB משיק למעגל C בנקודה F', ctxOf(base));
    if (at.ok) expect(at.commands.some((c) => c.type === 'foot' && String((c as { id: string }).id).startsWith('@tang')), 'the named-touch form never mints the anonymous foot').toBe(false);
    // an on-circle endpoint → tangent AT that endpoint (ADR-082), not the no-touch member
    const withMember = factsFrom(['מעגל O', 'K על המעגל', 'B מחוץ למעגל']);
    const kb = parse('KB משיק למעגל', ctxOf(withMember));
    expect(kb.ok).toBe(true);
    if (kb.ok) expect(kb.commands.some((c) => c.type === 'foot'), 'the on-circle-endpoint form keeps the ADR-082 lowering').toBe(false);
    // one endpoint NEW → tangentFromExternal's apex reading is unchanged
    const one = factsFrom(['מעגל O', 'E מחוץ למעגל']);
    const ed = parse('ED משיק למעגל', ctxOf(one));
    expect(ed.ok).toBe(true);
    if (ed.ok) expect(ed.commands.some((c) => c.type === 'circle-circle-intersection'), 'the Thales external-tangent owner').toBe(true);
  });
});
