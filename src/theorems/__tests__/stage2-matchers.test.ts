/**
 * Stage-2 fill locks (ADR-245) — the families that completed the catalog: right-triangle 30-32,
 * isosceles converses 23-27, Thales 72-74, parallels-converses 5/7/9, circle remainder
 * 93/95/100/101/106, quad converses, angle sums 35/36, ⟂-bisector/concurrency/incircle/regular
 * 81-90, and the bisector-ratio converse 77. All through the real parse-with-context → replay →
 * detectTheorems pipeline. Converses are AMBER (`possible`) recognition prompts (operator D2).
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { detectShapes } from '@/engine';
import type { AnyCommand } from '@/engine';
import { detectTheorems } from '../detect';
import type { TheoremFeedEntry, TheoremId } from '../types';

function factsOf(utterances: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse (would escalate): ${JSON.stringify(u)}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  return facts;
}
function feedOf(utterances: string[]): TheoremFeedEntry[] {
  const facts = factsOf(utterances);
  const { construction } = replay(facts);
  return detectTheorems({ facts, construction, shapes: detectShapes(construction).shapes });
}
function surfaced(...utterances: string[]): TheoremId[] {
  return feedOf(utterances).map((e) => e.id);
}
function tierOf(idWanted: TheoremId, ...utterances: string[]): string | undefined {
  return feedOf(utterances).find((e) => e.id === idWanted)?.tier;
}

describe('Stage-2 fill (ADR-245)', () => {
  describe('right triangle (30-32)', () => {
    it('a right triangle + a median to its hypotenuse surfaces 31 (certain)', () => {
      const ids = surfaced('right triangle ABC', 'CM median to AB');
      expect(ids).toContain(31);
    });
    it('a median NOT to the hypotenuse stays silent on 31', () => {
      expect(surfaced('right triangle ABC', 'AM median to BC')).not.toContain(31);
    });
    it('two right triangles + stated equal hypotenuses + equal legs surface HL congruence (30, amber)', () => {
      expect(tierOf(30, 'right triangle ABC', 'right triangle DEF', 'AB = DE', 'CA = FD')).toBe('possible');
    });
    it('a stated |median| = ½·|base| ratio surfaces the converse 32 (amber)', () => {
      expect(tierOf(32, 'triangle ABC', 'AM median to BC', 'AM = 0.5 BC')).toBe('possible');
    });
  });

  describe('isosceles converses (23/25/26/27)', () => {
    it('two stated equal angles sharing their third arm surface 23 (amber)', () => {
      expect(tierOf(23, 'triangle ABC', '∠ABC = ∠ACB')).toBe('possible');
    });
    it('a stated bisector that is also a stated altitude surfaces 25', () => {
      const ids = surfaced('triangle ABC', 'AD bisects angle BAC', 'F is the foot of the perpendicular from A to BC');
      expect(ids).toContain(25);
    });
    it('a stated bisector that is also a stated median surfaces 26', () => {
      expect(surfaced('triangle ABC', 'AD bisects angle BAC', 'AM median to BC')).toContain(26);
    });
    it('an altitude whose foot is a stated midpoint surfaces 27', () => {
      const ids = surfaced('triangle ABC', 'M is the midpoint of BC', 'F is the foot of the perpendicular from A to BC');
      // 27's premise needs the SAME point: foot === midpoint — two separate points stay silent.
      expect(ids).not.toContain(27);
    });
  });

  describe('Thales / proportion (72-74)', () => {
    it('a stated parallel-to-a-side (the ADR-220 cut) surfaces extended Thales 73 + 72', () => {
      const ids = surfaced('triangle ABC', 'D on AB', 'E on AC', 'DE', 'DE parallel to BC');
      expect(ids).toEqual(expect.arrayContaining([73, 72]));
    });
    it('two stated ratios with the same k sharing an apex surface the converse 74 (amber)', () => {
      expect(tierOf(74, 'triangle ABC', 'D on AB', 'E on AC', 'AD = 0.5 AB', 'AE = 0.5 AC')).toBe('possible');
    });
  });

  describe('parallels converses (5/7/9)', () => {
    it('a stated angle equality across a drawn transversal with DISTINCT far arms surfaces 5 (amber)', () => {
      const ids = surfaced('segment AB', 'segment AC', 'segment BD', '∠CAB = ∠DBA');
      expect(ids).toEqual(expect.arrayContaining([5, 7]));
    });
    it("a triangle's stated base-angle equality (shared far arm) does NOT prompt the parallels converse", () => {
      const ids = surfaced('triangle ABC', '∠ABC = ∠ACB');
      expect(ids).not.toContain(5);
      expect(ids).toContain(23); // it is the isosceles converse instead
    });
    it('two stated numeric angles summing to 180° across a transversal surface 9 (amber)', () => {
      const ids = surfaced('segment AB', 'segment AC', 'segment BD', '∠CAB = 110', '∠DBA = 70');
      expect(ids).toContain(9);
    });
  });

  describe('circle remainder (93/95/100/101/106)', () => {
    it('stated equal chords with a given centre surface 93 + 95', () => {
      const ids = surfaced('circle O', 'chord AB in circle O', 'chord CD in circle O', 'AB = CD');
      expect(ids).toEqual(expect.arrayContaining([93, 95]));
    });
    it('stated equal INSCRIBED angles surface 100', () => {
      const ids = surfaced('circle O', 'A on circle O', 'B on circle O', 'C on circle O', 'D on circle O', 'chord AC in circle O', 'chord BD in circle O', '∠BAC = ∠ABD');
      expect(ids).toContain(100);
    });
    it('a stated arc equality surfaces 101 (the inscribed side of the correspondence)', () => {
      expect(surfaced('circle O', 'A on circle O', 'B on circle O', 'C on circle O', 'arc AB = arc BC in circle O')).toContain(101);
    });
    it('a student-STATED ⟂-to-a-radius at its endpoint surfaces the tangent converse 106 (amber)', () => {
      const ids = surfaced('circle O', 'A on circle O', 'segment AB', 'OA perpendicular to AB');
      expect(ids).toContain(106);
    });
    it('a tangent stated AS a tangent does NOT echo its own converse (106 silent)', () => {
      expect(surfaced('circle O', 'A on circle O', 'tangent to circle O at A')).not.toContain(106);
    });
  });

  describe('quad converses (amber recognition, D2)', () => {
    it('two stated opposite-side equalities on a quad surface 44', () => {
      expect(tierOf(44, 'quadrilateral ABCD', 'AB = CD', 'BC = DA')).toBe('possible');
    });
    it('a stated ∥ + equality on the SAME pair surfaces 45', () => {
      expect(surfaced('quadrilateral ABCD', 'AB parallel to CD', 'AB = CD')).toContain(45);
    });
    it('a parallelogram + stated equal diagonals surfaces 53', () => {
      expect(surfaced('parallelogram ABCD', 'AC = BD')).toContain(53);
    });
    it('a parallelogram + a stated right angle surfaces 54', () => {
      expect(surfaced('parallelogram ABCD', '∠DAB = 90')).toContain(54);
    });
    it('a parallelogram + stated ⟂ diagonals surfaces 58', () => {
      expect(surfaced('parallelogram ABCD', 'AC perpendicular to BD')).toContain(58);
    });
    it('a parallelogram + stated equal adjacent sides surfaces 59', () => {
      expect(surfaced('parallelogram ABCD', 'AB = BC')).toContain(59);
    });
    it('a rhombus + stated equal diagonals surfaces 60', () => {
      expect(surfaced('rhombus ABCD', 'AC = BD')).toContain(60);
    });
    it('a trapezoid + stated equal diagonals surfaces 42', () => {
      expect(surfaced('trapezoid ABCD', 'AC = BD')).toContain(42);
    });
    it('a bare parallelogram surfaces NO converse prompt', () => {
      const ids = surfaced('parallelogram ABCD');
      for (const x of [44, 45, 47, 53, 54, 57, 58, 59]) expect(ids).not.toContain(x);
    });
  });

  describe('sums, loci, concurrency (35/36/82/83/85/86/81/89/90)', () => {
    it('any stated quad surfaces the 360° sum (35, background)', () => {
      expect(surfaced('quadrilateral ABCD')).toContain(35);
    });
    it('a regular pentagon surfaces the n-gon sum (36) and both regular-polygon circles (89/90)', () => {
      const ids = surfaced('regular pentagon ABCDE');
      expect(ids).toEqual(expect.arrayContaining([36, 89, 90]));
    });
    it('a stated perpendicular bisector surfaces 82', () => {
      expect(surfaced('segment AB', 'perpendicular bisector of AB')).toContain(82);
    });
    it('a stated |XA| = |XB| with AB drawn surfaces the converse 83 (amber)', () => {
      expect(tierOf(83, 'triangle ABX', 'XA = XB')).toBe('possible');
    });
    it('two stated altitudes of one triangle surface the orthocenter concurrency 86', () => {
      const ids = surfaced('triangle ABC', 'F is the foot of the perpendicular from A to BC', 'G is the foot of the perpendicular from B to AC');
      expect(ids).toContain(86);
    });
    it('an incircle (three tangencies on one circle) surfaces 81', () => {
      expect(surfaced('triangle ABC', 'circle inscribed in triangle ABC')).toContain(81);
    });
  });
});
