/**
 * Issue #100 — the 2025-bagrut two-clause tangent form (two intersecting circles):
 *
 *   "דרך הנקודה A העבירו משיק למעגל O"   (through point A a tangent is drawn to circle O)
 *   "המשיק חותך את מעגל P בנקודה K"      (the tangent cuts circle P at K)
 *
 * Class (two coupled members):
 * 1. A tangent constructed THROUGH a named on-circle point — no segment naming the line, no "at"
 *    clause — had no touch-inference lane: `tangentLine` read the touch only from an explicit
 *    at-clause or a named segment's on-circle endpoint. The through-point clause now names the touch
 *    when the point is a circle MEMBER (ADR-233: role by membership, never phrasing luck);
 *    `tangentFromExternal` already deferred exactly this case (its on-circle-apex guard).
 * 2. A DEFINITE back-reference to the drawn tangent ("המשיק"/"the tangent") intersected with another
 *    circle in a SEPARATE statement had no rule (`tangentMeetsOtherCircle` handles only the
 *    single-utterance two-pair form) — `theTangentMeetsCircle` resolves THE unique tan-* line from
 *    context (0 or 2+ → defer, never guess) and lowers to a line∩circle avoiding the touch when the
 *    touch is a member of the target circle.
 *
 * Ride-alongs (same session): `circleCenter` reads "שמרכזו בנקודה O" (the stated centre was silently
 * dropped and an auto-named sibling minted); the articles "a"/"an" join FILLER lowercase-only (the En
 * mirror read the article as a point label A, degenerating the pair).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}

/** Parse each line with live context and accumulate facts (the app's submit path shape). */
function runLines(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (got ${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** The exam prefix: two intersecting circles, O on the big one, A a circle∩circle crossing. */
const PREFIX_HE = ['מעגל O', 'מעגל P', 'O נמצאת על מעגל P', 'A היא אחת מנקודות החיתוך של מעגל O ומעגל P'];
const PREFIX_EN = ['circle O', 'circle P', 'O is on circle P', 'A is an intersection point of circle O and circle P'];

describe('issue #100 — tangent through an on-circle point + המשיק back-reference', () => {
  it.each([
    ['He', PREFIX_HE, 'דרך הנקודה A העבירו משיק למעגל O', 'המשיק חותך את מעגל P בנקודה K'],
    ['En', PREFIX_EN, 'through point A a tangent is drawn to circle O', 'the tangent cuts circle P at K'],
  ])('%s: both clauses parse and the figure verifies (K on the big circle, OA ⟂ AK)', (_loc, prefix, clause1, clause2) => {
    const facts = runLines([...prefix, clause1, clause2]);
    // clause 1 lowered to a drawn tangent AT A (the on-circle through-point IS the touch)
    const tan = facts.find((f) => f.cmd.type === 'tangent') as Fact & { cmd: Extract<AnyCommand, { type: 'tangent' }> };
    expect(tan).toBeDefined();
    expect(tan.cmd.at).toBe('A');
    expect(tan.cmd.circle).toBe('circle-O');
    // clause 2 lowered to a line∩circle on THE tangent, avoiding the shared point A
    const lcc = facts.find((f) => f.cmd.type === 'line-circle-intersection') as Fact & { cmd: Extract<AnyCommand, { type: 'line-circle-intersection' }> };
    expect(lcc).toBeDefined();
    expect(lcc.cmd.id).toBe('K');
    expect(lcc.cmd.line).toBe('tan-A');
    expect(lcc.cmd.circle).toBe('circle-P');
    expect(lcc.cmd.avoid).toBe('A');
    // builds green + verifier clean
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    // geometry: K on the big circle (radius |P·O| since O rides it), and OA ⟂ AK (tangency)
    const P = (id: string) => fig.positions.get(id)!;
    expect(Math.abs(dist(P('P'), P('K')) - dist(P('P'), P('O')))).toBeLessThan(1e-6);
    const dot = (P('O').x - P('A').x) * (P('K').x - P('A').x) + (P('O').y - P('A').y) * (P('K').y - P('A').y);
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });

  it('defers the back-reference when NO tangent line exists (never guesses)', () => {
    const facts = runLines(PREFIX_HE);
    const r = parse('המשיק חותך את מעגל P בנקודה K', ctxOf(facts));
    expect(r.ok).toBe(false);
  });

  it('defers the back-reference when TWO tangent lines exist (ambiguous)', () => {
    const facts = runLines(['מעגל O', 'המשיק בנקודה A והמשיק בנקודה B נפגשים בנקודה E', 'מעגל P']);
    const r = parse('המשיק חותך את מעגל P בנקודה K', ctxOf(facts));
    expect(r.ok).toBe(false);
  });

  it('defers the back-reference when the crossing label already EXISTS (an M1 statement, not a creation)', () => {
    const facts = runLines([...PREFIX_HE, 'דרך הנקודה A העבירו משיק למעגל O', 'K על מעגל P']);
    const r = parse('המשיק חותך את מעגל P בנקודה K', ctxOf(facts));
    expect(r.ok).toBe(false);
  });

  it('no-theft: the single-utterance tangentMeetsOtherCircle form is untouched', () => {
    const facts = runLines(PREFIX_HE);
    const r = parse('המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['tangent', 'line-circle-intersection', 'segment']);
  });

  it('no-theft: a two-tangent meet still parses via twoTangentsMeet', () => {
    const facts = runLines(['מעגל O']);
    const r = parse('המשיק בנקודה A והמשיק בנקודה B נפגשים בנקודה E', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.filter((c) => c.type === 'tangent')).toHaveLength(2);
  });

  it('ride-along: "מעגל שמרכזו בנקודה O" reads the stated centre O (was silently dropped)', () => {
    const r = parse('מעגל קטן שמרכזו בנקודה O ורדיוסו 4', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const circ = r.commands.find((c) => c.type === 'circle') as Extract<AnyCommand, { type: 'circle' }>;
    expect(circ.center).toBe('O');
    expect((circ as { autoCenter?: boolean }).autoCenter).toBeUndefined();
  });

  it('ride-along: a through-point OFF the circle still routes to tangentFromExternal (membership gate)', () => {
    // E is a free point off the circle — "דרך הנקודה E" must NOT read E as the touch.
    const facts = runLines(['מעגל O', 'E מחוץ למעגל O']);
    const r = parse('דרך הנקודה E העבירו משיק למעגל O', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The Thales construction (tangent FROM the external E): no `tangent` command with at:E.
    const tan = r.commands.find((c) => c.type === 'tangent') as Extract<AnyCommand, { type: 'tangent' }> | undefined;
    expect(tan?.at).not.toBe('E');
  });
});
