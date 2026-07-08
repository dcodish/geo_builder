/**
 * ADR-254 — "M מחוץ למעגל / בתוך המעגל" (a point's SIDE of a circle) is a first-class statement.
 *
 * Class: a REGION statement about a point (inside/outside a circle) was unrepresentable — the parser
 * had only membership ("על המעגל"), so the operator's `M מחוץ למעגל` escalated to the LLM and came
 * back not-understood; M then entered the figure as an unconstrained endpoint of "AM" with no record
 * that it belongs outside. A NEW id now becomes a free point (2 DOF, ADR-052) seeded on the stated
 * side; an EXISTING id gets the side as a statement about that point (M1). The side is a REQUIREMENT
 * (the ADR-244 radius-order shape): the givens verifier flags a wrong-side config
 * (figure.v.outsideCircle / insideCircle), so meetsRequirements — the sampler / "show another
 * configuration" gate — skips such configs, and a genuinely contradicted side reads amber.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, meetsRequirements } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { checkGivens } from '@/engine';
import type { AnyCommand } from '@/engine';

/** A one-circle figure (centre O, free radius) — the context the implicit forms parse against. */
function circleCtx() {
  const facts: Fact[] = [
    { id: 'f0', utterance: 'מעגל O', cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand, enabled: true },
  ];
  const fig = replay(facts);
  return { facts, ctx: buildParseCtx(fig.construction, fig.positions) };
}

const sideCmds = (cmds: AnyCommand[]) => cmds.filter((c): c is Extract<AnyCommand, { type: 'point-circle-side' }> => c.type === 'point-circle-side');

describe('parse — point vs circle side (He/En, named/implicit, multi-subject)', () => {
  it.each([
    ['M מחוץ למעגל', [{ id: 'M', side: 'outside' }]], // the operator's exact utterance (session ad66x493)
    ['הנקודה M נמצאת מחוץ למעגל O', [{ id: 'M', side: 'outside' }]], // the bagrut wording
    ['M בתוך המעגל', [{ id: 'M', side: 'inside' }]],
    ['M נמצאת בתוך מעגל O', [{ id: 'M', side: 'inside' }]],
    ['M ו-N מחוץ למעגל', [{ id: 'M', side: 'outside' }, { id: 'N', side: 'outside' }]], // subject list (ADR-076/240)
    ['M is outside the circle', [{ id: 'M', side: 'outside' }]],
    ['M is outside circle O', [{ id: 'M', side: 'outside' }]],
    ['point M lies inside the circle', [{ id: 'M', side: 'inside' }]],
    ['M and N are outside circle O', [{ id: 'M', side: 'outside' }, { id: 'N', side: 'outside' }]],
  ])('"%s"', (utterance, expected) => {
    const { ctx } = circleCtx();
    const r = parse(utterance, ctx);
    expect(r.ok, `did not parse: ${utterance}`).toBe(true);
    if (!r.ok) return;
    expect(sideCmds(r.commands).map((c) => ({ id: c.id, side: c.side }))).toEqual(expected);
    for (const c of sideCmds(r.commands)) expect(c.circle).toBe('circle-O');
  });

  it('with NO circle and an unnamed reference it defers (ambiguous → escalate), never guesses', () => {
    const r = parse('M מחוץ למעגל', buildParseCtx(replay([]).construction, replay([]).positions));
    expect(r.ok).toBe(false);
  });

  it('a NAMED circle that does not exist yet is auto-materialised (the implicit-circle post-pass)', () => {
    const r = parse('M מחוץ למעגל O', buildParseCtx(replay([]).construction, replay([]).positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'circle' && c.id === 'circle-O')).toBe(true);
  });

  it('the external-point COMPOUNDS still go to their own rules (tight full-match does not claim them)', () => {
    const { ctx } = circleCtx();
    const r = parse('מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sideCmds(r.commands)).toEqual([]); // the tangents rule owns it, not the side rule
  });
});

describe('engine + verifier — the side is honoured, sampled, and checked', () => {
  const factsFor = (utterances: string[]): Fact[] => {
    const facts: Fact[] = [];
    let g = 0;
    for (const u of utterances) {
      const fig = replay(facts);
      const r = parse(u, buildParseCtx(fig.construction, fig.positions));
      expect(r.ok, `did not parse: ${u}`).toBe(true);
      if (!r.ok) continue;
      const group = `g${g++}`;
      for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    }
    return facts;
  };

  it('a NEW point is created OUTSIDE (strictly), as a real free DOF, and the figure meets requirements', () => {
    const facts = factsFor(['מעגל O רדיוס 5', 'M מחוץ למעגל']);
    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    const c = fig.circles.get('circle-O')!;
    const M = fig.positions.get('M')!;
    expect(Math.hypot(M.x - c.center.x, M.y - c.center.y)).toBeGreaterThan(c.r);
    expect(fig.violations).toEqual([]);
    expect(meetsRequirements(facts)).toBe(true);
  });

  it('inside works too', () => {
    const facts = factsFor(['מעגל O רדיוס 5', 'M בתוך המעגל']);
    const fig = replay(facts);
    const c = fig.circles.get('circle-O')!;
    const M = fig.positions.get('M')!;
    expect(Math.hypot(M.x - c.center.x, M.y - c.center.y)).toBeLessThan(c.r);
    expect(fig.violations).toEqual([]);
  });

  it('an EXISTING free point on the WRONG side is re-seated (M1: a statement, never a re-creation/conflict)', () => {
    // AM first: M enters as a free endpoint (inside-ish or wherever the default put it) — then the side
    // statement. It must apply cleanly (no "already defined") and end with M strictly outside.
    const facts = factsFor(['מעגל O רדיוס 5', 'AM', 'M מחוץ למעגל']);
    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    const bad = Object.entries(fig.status).filter(([, s]) => s !== 'ok' && s !== 'disabled');
    expect(bad).toEqual([]);
    const c = fig.circles.get('circle-O')!;
    const M = fig.positions.get('M')!;
    expect(Math.hypot(M.x - c.center.x, M.y - c.center.y)).toBeGreaterThan(c.r);
    expect(fig.violations).toEqual([]);
  });

  it('a contradicted side is flagged amber by the verifier (figure.v.outsideCircle), not silently dropped', () => {
    // D is a determined on-circle point — stating it is OUTSIDE cannot be honoured; the verifier reports.
    const facts = factsFor(['מעגל O רדיוס 5', 'D על המעגל', 'D מחוץ למעגל']);
    const fig = replay(facts);
    const v = checkGivens(
      facts.map((f) => f.cmd) as Parameters<typeof checkGivens>[0],
      fig.positions,
      fig.circles,
    );
    expect(v.some((x) => x.relation === 'circle-side' && x.messageKey === 'figure.v.outsideCircle')).toBe(true);
  });
});
