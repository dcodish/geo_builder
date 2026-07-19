/**
 * Issue #215 (P1) — a DEFINITE plural reference to existing circles must BIND them, never be satisfied
 * by inventing default names (the ADR-029/ADR-245 definite-reference class, plural edition, closed at
 * the shared `resolveCirclePair` chokepoint).
 *
 * Operator repro (2026-07-19): with «מעגל O» + «מעגל P» drawn, «המעגלים משיקים זה לזה» emitted an
 * INVENTED third circle Q + `circles-tangent O ↔ Q` — circle P silently dropped, three circles drawn,
 * all rows green. Root cause: `circlesTangent` bound c1 by the hard-coded default 'O' (a lucky name
 * match) and invented c2 via freeLabel; the definite-reference pattern its siblings had (issue #111)
 * was never applied to it. Compounding it, «מנקודה» (a FROM-marker) sat in the touch-point
 * alternation, so «מנקודה A יוצא משיק לשני המעגלים» consumed the student's external point A as a
 * mutual-tangency TOUCH.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: string[]) {
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
const circleIds = (facts: Fact[]) =>
  replay(facts)
    .construction.objects.filter((o) => o.kind === 'circle')
    .map((o) => o.id)
    .sort();
const TWO = ['מעגל O', 'מעגל P'];
type CT = Extract<AnyCommand, { type: 'circles-tangent' }>;

describe('#215 — definite plural tangency binds THE existing pair', () => {
  it.each([
    ['He «המעגלים»', [...TWO, 'המעגלים משיקים זה לזה']],
    ['He «שני המעגלים»', [...TWO, 'שני המעגלים משיקים זה לזה']],
    ['En "the circles"', ['circle O', 'circle P', 'the circles are tangent to each other']],
  ])('%s → circles-tangent between circle-O and circle-P, NO third circle', (_t, lines) => {
    const facts = runLines(lines);
    expect(circleIds(facts), 'exactly the two circles that were drawn').toEqual(['circle-O', 'circle-P']);
    const ct = facts.find((f) => f.cmd.type === 'circles-tangent')!.cmd as CT;
    expect([ct.circle1, ct.circle2].sort()).toEqual(['circle-O', 'circle-P']);
  });

  it('the INDEFINITE «שני מעגלים משיקים זה לזה» with two circles ALREADY drawn re-binds them (idempotent — never a third circle)', () => {
    const facts = runLines([...TWO, 'שני מעגלים משיקים זה לזה']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
  });

  it('no-theft: the indefinite OPENER on an empty figure still creates both circles + the tangency', () => {
    const facts = runLines(['שני מעגלים משיקים זה לזה']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
    expect(facts.some((f) => f.cmd.type === 'circles-tangent')).toBe(true);
  });

  it('a plural reference with ONE existing circle COMPLETES the pair — the drawn circle binds regardless of its letter', () => {
    // The old code bound the existing circle only when its letter happened to be the default 'O';
    // a circle Q was silently ignored and a fresh O+partner invented beside it.
    const one = runLines(['מעגל Q']);
    const r = parse('המעגלים משיקים זה לזה', ctxOf(one));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ct = r.commands.find((c) => c.type === 'circles-tangent') as CT;
      expect([ct.circle1, ct.circle2], 'the EXISTING circle is one of the pair').toContain('circle-Q');
    }
  });

  it('a definite reference that cannot bind — THREE existing circles — defers (never pairs two arbitrarily)', () => {
    const three = runLines(['מעגל O', 'מעגל P', 'מעגל Q']);
    expect(parse('שני המעגלים משיקים זה לזה', ctxOf(three)).ok).toBe(false);
    expect(parse('the two circles are tangent to each other', ctxOf(three)).ok).toBe(false);
  });

  it('a FROM-marker is never a touch marker: «מנקודה A …» defers to the #214 owner family', () => {
    const facts = runLines(TWO);
    for (const u of [
      'מנקודה A יוצא משיק לשני המעגלים',
      'מנקודה A יוצאים שני משיקים לשני המעגלים',
      'from point A a tangent to both circles',
    ]) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, `${u} must not be claimed (apex ≠ touch)`).toBe(false);
    }
  });

  it('a named touch still lands on the bound pair: «המעגלים משיקים זה לזה בנקודה M»', () => {
    const facts = runLines([...TWO, 'המעגלים משיקים זה לזה בנקודה M']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
    const ct = facts.find((f) => f.cmd.type === 'circles-tangent')!.cmd as CT;
    expect(ct.at).toBe('M');
  });

  it('no-theft: two NAMED circles «מעגל O1 ומעגל O2 משיקים זה לזה» are unchanged', () => {
    const facts = runLines(['מעגל O1 ומעגל O2 משיקים זה לזה']);
    expect(circleIds(facts)).toEqual(['circle-O1', 'circle-O2']);
  });

  it('sibling (twoCirclesPosition): «המעגלים זרים» binds the pair; at three circles it defers', () => {
    const facts = runLines([...TWO, 'המעגלים זרים']);
    expect(circleIds(facts)).toEqual(['circle-O', 'circle-P']);
    const pos = facts.find((f) => f.cmd.type === 'set-circle-position')!.cmd as Extract<AnyCommand, { type: 'set-circle-position' }>;
    expect([pos.a, pos.b].sort()).toEqual(['circle-O', 'circle-P']);
    const three = runLines(['מעגל O', 'מעגל P', 'מעגל Q']);
    expect(parse('המעגלים זרים', ctxOf(three)).ok).toBe(false);
  });

  it('sibling (twoCirclesMeet): the plural-list «מעגלים O1 ו-O2 נחתכים בנקודות A ו-B» keeps the STATED names', () => {
    const facts = runLines(['מעגלים O1 ו-O2 נחתכים בנקודות A ו-B']);
    expect(circleIds(facts)).toEqual(['circle-O1', 'circle-O2']);
    const ccis = facts.filter((f) => f.cmd.type === 'circle-circle-intersection').map((f) => f.cmd) as Extract<
      AnyCommand,
      { type: 'circle-circle-intersection' }
    >[];
    expect(ccis.map((c) => c.id).sort()).toEqual(['A', 'B']);
  });
});
