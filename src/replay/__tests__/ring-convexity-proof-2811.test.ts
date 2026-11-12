/**
 * #2811 (ADR-826) — ONE STRUCTURAL READER OF "THESE LETTERS ARE IN CONVEX POSITION", and the refusal it backs.
 *
 * `ringConvexityProofs` names the facts that prove a declared ring convex — a stated «קמור», or one circle through every
 * letter — and `ringOrderContradiction` refuses, on the line that completes it, another declared order of a proved ring's
 * letters. Measured at caf619a5: «מרובע ABCD · מרובע ABDC · מעגל חוסם את ABDC» committed the circle with ABDC crossed.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { ringConvexityProofs, ringOrderContradiction } from '../../store/geoStore';

const proofs = (lines: string[]) => ringConvexityProofs(factsOf(lines)).map((p) => `${p.ring.join('')}:${p.reason}:${p.facts.map((f) => f.utterance).join('|')}`);
/** Would `line`, after `before`, complete a contradiction? */
const hit = (before: string[], line: string) => {
  const prior = factsOf(before);
  return ringOrderContradiction(prior, factsOf([...before, line]).slice(prior.length).map((f) => f.cmd));
};

describe('ringConvexityProofs (#2811)', () => {
  it('names the circle fact for an inscribed ring, in either spelling', () => {
    expect(proofs(['מרובע ABCD', 'מעגל חוסם את ABCD'])).toEqual(['ABCD:circle:מעגל חוסם את ABCD']);
    expect(proofs(['מרובע ABCD', 'המרובע ABCD חסום במעגל'])[0]).toMatch(/^ABCD:circle:/);
  });
  it('names a circle whose riders cover the letters', () => {
    expect(proofs(['משולש ABC', 'מעגל חוסם את ABC', 'D על המעגל', 'מרובע ABCD'])).toEqual(['ABCD:circle:מעגל חוסם את ABC|D על המעגל']);
  });
  it('names a stated «קמור»', () => {
    expect(proofs(['מרובע ABCD', 'המרובע ABCD קמור'])[0]).toMatch(/^ABCD:stated-convex:/);
  });
  it('a circle through three of the four letters proves nothing', () => {
    expect(proofs(['משולש ABC', 'מעגל חוסם את ABC', 'נקודה D', 'מרובע ABCD'])).toEqual([]);
  });
});

describe('ringOrderContradiction (#2811) blames the latest line, in all three orders', () => {
  it('ring, ring, circle: the circle line', () => {
    expect(hit(['מרובע ABCD', 'מרובע ABDC'], 'מעגל חוסם את ABDC')).toMatchObject({ other: expect.any(Array) });
    expect(hit(['מרובע ABCD', 'מרובע ABDC'], 'מעגל חוסם את ABCD')).not.toBeNull();
  });
  it('ring, circle, ring: the second ring', () => {
    expect(hit(['מרובע ABCD', 'מעגל חוסם את ABCD'], 'מרובע ABDC')).toMatchObject({ ring: ['A', 'B', 'C', 'D'], other: ['A', 'B', 'D', 'C'] });
  });
  it('the rider completing the circle, then two orders: the second ring', () => {
    expect(hit(['משולש ABC', 'מעגל חוסם את ABC', 'D על המעגל', 'מרובע ABCD'], 'מרובע ABDC')).not.toBeNull();
  });
  it('a saved contradiction is never blamed on an unrelated line; no proof, no refusal', () => {
    expect(hit(['מרובע ABCD', 'מרובע ABDC', 'מעגל חוסם את ABCD'], 'AB = 5')).toBeNull();
    expect(hit(['מרובע ABCD'], 'מרובע ABDC'), 'two orders of free points: a concave quadrilateral (ADR-622)').toBeNull();
  });
});
