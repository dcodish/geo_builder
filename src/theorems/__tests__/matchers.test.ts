/**
 * Per-matcher unit tests. Each drives the REAL pipeline — parse-with-context → fact list → `replay`
 * → `detectShapes` → `detectTheorems` — exactly as the app will, and asserts which theorem ids the
 * given utterances surface (and, for the gated ones, which they must NOT surface yet).
 *
 * The parser is deterministic here (no LLM); a step that fails to parse fails the test.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { detectShapes } from '@/engine';
import type { AnyCommand } from '@/engine';
import { detectTheorems } from '../detect';

function ctxOf(facts: Fact[]) {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

/** Fold utterances into a fact list through the real parser (one group per utterance). */
function factsOf(utterances: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const group = `g${g++}`;
    const r = parse(u, ctxOf(facts));
    if (!r.ok) throw new Error(`did not parse (would escalate): ${JSON.stringify(u)} → ${JSON.stringify(r)}`);
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  return facts;
}

/** The surfaced theorem-id set for a sequence of utterances (full real pipeline). */
function surfaced(...utterances: string[]): number[] {
  const facts = factsOf(utterances);
  const { construction } = replay(facts);
  const shapes = detectShapes(construction).shapes;
  return detectTheorems({ facts, construction, shapes }).map((e) => e.id);
}

describe('theorem matchers (real pipeline)', () => {
  it('an empty figure surfaces nothing', () => {
    expect(detectTheorems({ facts: [], construction: { objects: [], constraints: [] } })).toEqual([]);
  });

  describe('triangle basics + isosceles', () => {
    it('a plain triangle surfaces the background triangle facts (10,11,12,13,14) but not isosceles (22)', () => {
      const ids = surfaced('triangle ABC');
      expect(ids).toEqual(expect.arrayContaining([10, 11, 12, 13, 14]));
      expect(ids).not.toContain(22);
    });

    it('an isosceles triangle surfaces base-angles-equal (22)', () => {
      expect(surfaced('isosceles triangle ABC')).toContain(22);
    });

    it('equal legs stated on a triangle surface 22', () => {
      expect(surfaced('triangle ABC', 'AB = AC')).toContain(22);
    });

    it('a right triangle surfaces Pythagoras (28)', () => {
      expect(surfaced('right triangle ABC')).toContain(28);
    });
  });

  describe('circle — points/arcs/inscribed', () => {
    it('a triangle inscribed in a circle surfaces circumscribed/one-circle background (84,91) and inscribed-angle (99)', () => {
      const ids = surfaced('triangle ABC inscribed in circle O');
      expect(ids).toEqual(expect.arrayContaining([84, 91, 99]));
    });

    it('an arc midpoint surfaces the equal-arcs ⟺ equal-central-angles / equal-chords theorems (92,94)', () => {
      const ids = surfaced('circle O', 'A on circle O', 'B on circle O', 'D is the midpoint of arc AB');
      expect(ids).toEqual(expect.arrayContaining([92, 94]));
    });
  });

  describe('circle — diameter / Thales (103 gated on a STATED diameter)', () => {
    it('an inscribed triangle WITHOUT a stated diameter surfaces neither 103 nor 104', () => {
      const ids = surfaced('triangle ABC inscribed in circle O');
      expect(ids).not.toContain(103);
      expect(ids).not.toContain(104);
    });

    it('a stated diameter surfaces BOTH 103 and its converse 104 (same footing)', () => {
      const ids = surfaced('circle O', 'AB diameter of circle O', 'C on circle O');
      expect(ids).toEqual(expect.arrayContaining([103, 104]));
    });
  });

  describe('circle — tangent family (105/107/108/109)', () => {
    it('a single tangent surfaces tangent⟂radius (105) but not the two-tangent theorems (108,109)', () => {
      const ids = surfaced('circle O radius 5', 'tangent from P to circle O');
      expect(ids).toContain(105);
      expect(ids).not.toContain(108);
      expect(ids).not.toContain(109);
    });
  });
});
