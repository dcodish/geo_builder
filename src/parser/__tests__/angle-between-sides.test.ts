/**
 * #967 — an angle addressed by its two SIDES: «הזווית בין BD ל-BA היא 30».
 *
 * 2-D's angle-constraint family is rich (value, Greek symbol, word-numbers, right-angle word, acuteness,
 * bound, range) but every member was reachable through exactly ONE spelling — the three-letter vertex
 * triple. Naming the angle by the two segments that form it, which is how a textbook says it, was
 * not-handled in every spelling. Found in prod (log-triage 2026-09-10, 2 distinct users / 3 submits); one
 * of the two occurrences logged `not-understood`, i.e. the paid LLM fallback failed too.
 *
 * The fix is an ADDRESSING MODE, not a phrasing rule: `angleBetweenSides` resolves the pair to the vertex
 * the two segments share and hands back the ordinary `{ray1, vertex, ray2}` triple, so everything
 * downstream — constraint, arc, value chip, verifier — is untouched.
 *
 * The two guards that matter most here, and why:
 *  - UPPERCASE-only labels. The English spelling puts lowercase words between the operands ("between BD
 *    **and** BA **is** 30"); a case-insensitive read would take "and" for the labels A,N,D — #497's exact
 *    defect ("draw a square ABCD" building square D,R,A,W).
 *  - CONTIGUOUS pairs. `\b([A-Z])([A-Z])\b` cannot match inside «ABC», so the triple spelling can never be
 *    re-read as a segment pair.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../index';

const cmds = (u: string, ctx = {}) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands;
};
const kinds = (u: string, ctx = {}) => cmds(u, ctx).map((c) => c.type);
/** The angle command a spelling lowers to, whatever its value kind. */
const angleCmd = (u: string, ctx = {}) => cmds(u, ctx).find((c) => c.type.includes('angle')) as never;

describe('#967 — an angle named by its two sides', () => {
  // The operator's exact prod utterance is the first case on purpose: defective «זוית», no space in
  // «לBA», and the ° glyph were each a separately plausible point of failure.
  it('takes the prod utterance verbatim — «זוית בין BD לBA היא 30°»', () => {
    expect(angleCmd('זוית בין BD לBA היא 30°')).toMatchObject({ type: 'set-angle', vertex: 'B', ray1: 'D', ray2: 'A', value: 30 });
  });

  it.each([
    ['full spelling + maqaf', 'הזווית בין BD ל-BA היא 30'],
    ['defective spelling', 'זוית בין BD ל-BA היא 30'],
    ['spaced ל', 'זווית בין BD ל BA היא 30'],
    ['לבין', 'הזווית בין BD לבין BA היא 30'],
    ['with מעלות', 'הזווית בין BD ל-BA היא 30 מעלות'],
    ['with =', 'הזווית בין BD ל-BA = 30'],
    ['English', 'angle between BD and BA is 30'],
    ['English + the', 'the angle between BD and BA is 30'],
  ])('resolves the pair to ∠DBA — %s', (_label, u) => {
    expect(angleCmd(u)).toMatchObject({ type: 'set-angle', vertex: 'B', ray1: 'D', ray2: 'A', value: 30 });
  });

  it('draws both arms, so the angle is visible without naming the segments separately', () => {
    expect(kinds('הזווית בין BD ל-BA היא 30')).toEqual(['segment', 'segment', 'set-angle']);
  });

  // The addressing mode lives in the ONE place that answers "which angle is named" (#831/ADR-468), so the
  // value kinds that share that reader inherit it rather than each growing a copied lane.
  it('carries a Greek symbol, not only a number', () => {
    expect(angleCmd('הזווית בין BD ל-BA = α')).toMatchObject({ type: 'measure-angle', vertex: 'B', ray1: 'D', ray2: 'A' });
  });

  it('carries a word-number and the right-angle word', () => {
    expect(angleCmd('הזווית בין BD ל-BA שווה לשלושים מעלות')).toMatchObject({ type: 'set-angle', vertex: 'B', value: 30 });
    expect(angleCmd('הזווית בין BD ל-BA ישרה')).toMatchObject({ type: 'set-angle', vertex: 'B', value: 90 });
  });

  // `angleAcuteness` and `boundOperand` keep their own copies of the triple/single-vertex lanes (the #831
  // remainder), so the mode was added to them explicitly — additively, leaving those lanes untouched.
  it('carries acuteness, a bound and a range', () => {
    expect(angleCmd('הזווית בין BD ל-BA קהה')).toMatchObject({ type: 'set-angle-acuteness', vertex: 'B', obtuse: true });
    expect(angleCmd('the angle between BD and BA is acute')).toMatchObject({ type: 'set-angle-acuteness', vertex: 'B', obtuse: false });
    expect(angleCmd('הזווית בין BD ל-BA גדולה מ-40')).toMatchObject({ type: 'set-angle-bound', vertex: 'B', min: 40 });
    expect(angleCmd('40 < הזווית בין BD ל-BA < 60')).toMatchObject({ type: 'set-angle-bound', vertex: 'B', min: 40, max: 60 });
  });

  describe('segments that do not form an angle are refused BY NAME, never guessed', () => {
    // Inventing a vertex for a disjoint pair would assert a given the student never stated (ADR-052), and
    // escalating hands the LLM the same invention to make. 2-D has no line-line angle constraint — every
    // angle constraint is vertex-anchored — so this is a genuine "cannot", and it says so.
    it.each([
      ['no shared endpoint', 'הזווית בין AB ל-CD היא 30', 'AB', 'CD'],
      ['no shared endpoint, English', 'angle between AB and CD is 30', 'AB', 'CD'],
      ['the same segment twice', 'הזווית בין AB ל-BA היא 30', 'AB', 'BA'],
    ])('%s', (_label, u, s1, s2) => {
      const r = parse(u, {});
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ reason: 'angle-sides-disjoint', s1, s2 });
    });

    it('refuses in the acuteness lane too, rather than falling through to an escalation', () => {
      expect(parse('הזווית בין AB ל-CD קהה', {})).toMatchObject({ ok: false, reason: 'angle-sides-disjoint' });
    });
  });

  describe('no regression — the triple and single-vertex spellings are untouched', () => {
    it.each([
      ['זווית ABC = 40', 'set-angle'],
      ['זווית ABC = 2α', 'measure-angle'],
      ['זווית ABC קהה', 'set-angle-acuteness'],
      ['זווית ABC גדולה מ-40', 'set-angle-bound'],
      ['40 < זווית ABC < 60', 'set-angle-bound'],
    ])('%s still lowers to %s', (u, type) => {
      expect(angleCmd(u)).toMatchObject({ type, vertex: 'B' });
    });

    it('a single-vertex angle still resolves from the figure', () => {
      expect(angleCmd('זווית C חדה', { neighbors: { C: ['A', 'B'] } })).toMatchObject({ type: 'set-angle-acuteness', vertex: 'C' });
    });

    // «בין» is not owned by the angle family: the point-between form (#95) must be unaffected, and it is,
    // because this lane only ever runs from a rule that has already matched an angle keyword.
    it('«E בין A ל-B» still builds a point on a segment', () => {
      expect(kinds('E בין A ל-B')).toEqual(['segment', 'point-on-segment']);
    });

    // The segment-pair precedent this generalises must keep its own reading.
    it('«AB מאונך ל-CD» is still a perpendicularity, not an angle', () => {
      expect(kinds('AB מאונך ל-CD')).toEqual(['segment', 'segment', 'set-perpendicular']);
    });

    it('a length bound is untouched by the angle operand change', () => {
      expect(kinds('5 < AB < 9')).toEqual(['segment', 'set-length-bound']);
    });
  });
});
