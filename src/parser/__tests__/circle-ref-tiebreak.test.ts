/**
 * #546 ([ADR-443](../../../docs/06-decisions.md#adr-443)) — the anonymous circle reference beside TWO OR
 * MORE circles: the membership TIE-BREAK at `existingCircleRef` (the utterance's named points vote by
 * intersection of their on-circle memberships; a unique host binds — the #221 `commonHostCentre` idea
 * generalised to the ADR-029 seam), and the `ambiguous-circle-ref` ASK when even that says nothing —
 * never `not-handled` (a paid LLM call on a construct the grammar owns), never a silent pick (ADR-052).
 *
 * Prod evidence (session `fmpqvpwr`): on a triangle + circumcircle + incircle figure, «משיק למעגל
 * בנקודה B» and «קשת AD = קשת BC» were not-handled — the seam ended `circles.length === 1 ? … : null`,
 * so the moment a SECOND circle existed the whole routed rule family escalated.
 */
import { describe, it, expect } from 'vitest';
import { parse, type ParseContext } from '../parse';

/** Two separate circles: O hosting A,B,C and P hosting K — the reduced #546 figure. */
const twoCircles = (): ParseContext => ({
  circles: ['O', 'P'],
  points: ['O', 'P', 'A', 'B', 'C', 'K'],
  circleMembers: [
    { id: 'circle-O', center: 'O', points: ['A', 'B', 'C'] },
    { id: 'circle-P', center: 'P', points: ['K'] },
  ],
});

const oneCircle = (): ParseContext => ({
  circles: ['O'],
  points: ['O', 'A', 'B'],
  circleMembers: [{ id: 'circle-O', center: 'O', points: ['A', 'B'] }],
});

const okCommands = (input: string, ctx: ParseContext) => {
  const r = parse(input, ctx);
  expect(r.ok, `"${input}" should parse: ${JSON.stringify(r)}`).toBe(true);
  return r.ok ? r.commands : [];
};

describe('#546 — the membership tie-break binds the anonymous reference', () => {
  it.each(['משיק למעגל בנקודה B', 'a tangent to the circle at B'])('tangent at a MEMBER point binds its host: %s', (u) => {
    const c = okCommands(u, twoCircles());
    const txt = JSON.stringify(c);
    expect(txt, 'bound to circle-O (B lives there)').toContain('circle-O');
    expect(txt, 'the other circle is untouched').not.toContain('circle-P');
  });

  it('the arc family inherits the same bind (the prod «קשת… = קשת…» row)', () => {
    // Arc equality lowers to equal CENTRAL angles — the bind shows as the centre chosen for the vertex.
    const c = okCommands('קשת AB = קשת BC', twoCircles());
    const ratio = c.find((x) => x.type === 'set-angle-ratio') as { v1?: string; v2?: string } | undefined;
    expect(ratio, JSON.stringify(c)).toBeTruthy();
    expect(ratio?.v1, 'central angle at the circle the members determine').toBe('O');
    expect(ratio?.v2).toBe('O');
  });

  it('the vote is per-utterance, not per-figure: a member of the OTHER circle binds THAT one', () => {
    const c = okCommands('משיק למעגל בנקודה K', twoCircles());
    const txt = JSON.stringify(c);
    expect(txt).toContain('circle-P');
    expect(txt).not.toContain('"circle-O"');
  });

  it('the chord rule keeps its #221 behaviour beside the generalised seam', () => {
    const c = okCommands('מיתר AB', twoCircles());
    expect(JSON.stringify(c)).toContain('circle-O');
  });

  it('a NAMED circle is untouched by the tie-break', () => {
    const c = okCommands('משיק למעגל P בנקודה K', twoCircles());
    expect(JSON.stringify(c)).toContain('circle-P');
  });
});

describe('#546 — the ambiguous-circle-ref ASK (never not-handled, never a guess)', () => {
  it('a FRESH touch point beside two circles asks WHICH circle, naming the candidates', () => {
    const r = parse('משיק למעגל בנקודה T', twoCircles());
    expect(r).toEqual({ ok: false, reason: 'ambiguous-circle-ref', centers: ['O', 'P'] });
  });

  it('an EMPTY membership intersection (points on different circles) asks too', () => {
    const r = parse('קשת AK', twoCircles());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('ambiguous-circle-ref');
  });

  it('with ONE circle the ADR-029 principle is untouched — no ask, the reference binds', () => {
    const r = parse('משיק למעגל בנקודה T', oneCircle());
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it('a bare circle MENTION (area/radius talk) keeps its fallback path — the ask is construct-gated', () => {
    const r = parse('שטח המעגל שווה 25', twoCircles());
    if (!r.ok) expect(r.reason).not.toBe('ambiguous-circle-ref');
  });

  it('a QUALIFIER (size/side/circum/contained) keeps its own resolver channel — no ask over it', () => {
    for (const u of ['משיק למעגל הגדול בנקודה T', 'a tangent to the larger circle at T']) {
      const r = parse(u, twoCircles());
      if (!r.ok) expect(r.reason, u).not.toBe('ambiguous-circle-ref');
    }
  });
});
