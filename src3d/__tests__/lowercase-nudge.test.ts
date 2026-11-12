/**
 * #353 (ADR-3D-092): lowercase NODE labels that DON'T parse get the CONVENTION nudge, not a paid LLM call.
 *
 * Prod evidence (log-triage 2026-07-26): `as=w` — the pair A,S written lowercase — escalated to the LLM.
 * Operator ruling: "we can insist on uppercase and give a message asking the nodes to be upper case and
 * parameters as lowercase… except for the plane equation we have open where aX+bY+cZ+D=0 are not nodes";
 * and separately, angle measures are GREEK (a latin `a` is not an acceptable angle label).
 *
 * Relationship to #181 / ADR-3D-039 (`normalize3`'s anchored uplift): that mechanism already ACCEPTS
 * lowercase where an anchor proves the run is a label (`∠sdb`, `הקודקוד c`). 3-D cannot take a blanket `/i`
 * — x/y/z, k/m/t, u/v/w and R-vs-r are case-significant — so anything without an anchor still fails, and
 * `as=w` (a vec-rel whose LHS is a point pair) is exactly such a case. This nudge covers the un-anchored
 * remainder: where uplift applies the input PARSES and no message is ever shown.
 *
 * The nudge is PROOF-BASED: it fires only when upper-casing the lowercase runs actually makes the utterance
 * parse, so a genuine gap fails either way and is never masked as a style complaint.
 *
 * #2823 (ADR-3D-492, ADR-W-203 / ADR-W-208) re-based this lock: a lowercase run in a CERTAIN slot (a point or angle
 * noun, a polygon or SOLID noun's vertex run, a midpoint's subject, a coordinate head) is accepted in capitals at the
 * store's seam, with the notice; the nudge is every builder's ask now, and lifts a single letter too — except the ones
 * #353's convention reserves (u, v, w, t, k, m, x, y, z).
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { classifyGuidance3, upperCasedLabelCandidate3 } from '../parser/scope3';
import { decideDeterministic3 } from '../app/decideDeterministic3';

/** The App3 decision itself (#1692): `decideDeterministic3` is what App3 dispatches — nudge iff a candidate
 *  exists AND it parses, after the store's own decision said not-understood. Called, never re-implemented. */
const nudges = (u: string): boolean => {
  const v = decideDeterministic3({ facts: [], seed: 0 }, u);
  return v.kind === 'guided' && v.register === 'lowercase-labels';
};
/** #2823: the row a line records, and whether it was read in capitals. */
const recorded = (u: string): { row: string; cased: boolean } | null => {
  const v = decideDeterministic3({ facts: [], seed: 0 }, u);
  return v.kind === 'record' ? { row: v.fact.utterance, cased: v.cased === true } : null;
};

describe('#353 — the reported case', () => {
  it('«as=w» fails as typed, parses upper-cased, so the nudge fires with the corrected spelling', () => {
    expect(parse3('as=w').ok).toBe(false);
    expect(upperCasedLabelCandidate3('as=w')).toBe('AS=w'); // `w` stays lowercase — it is the VECTOR
    expect(parse3('AS=w').ok).toBe(true);
    expect(nudges('as=w')).toBe(true);
  });

  for (const u of ['am=u+v', 'ab=5']) {
    it(`«${u}» also gets the nudge`, () => expect(nudges(u), u).toBe(true));
  }
});

describe('#353 → #2823 — a reserved single letter is left alone (a vector / parameter / coordinate); any other is asked', () => {
  it('the reserved letters stay; another single letter is lifted', () => {
    expect(upperCasedLabelCandidate3('AS=w')).toBeNull(); // `w` is reserved — nothing liftable
    expect(upperCasedLabelCandidate3('AB=5')).toBeNull();
    expect(upperCasedLabelCandidate3('d על AB')).toBe('D על AB'); // #2823: singles are asked too
  });
});

describe('#353 — the boundaries', () => {
  it('a plane equation with SYMBOLIC coefficients is excluded (#339 — those letters are NOT nodes)', () => {
    for (const u of ['ax+by+cz+d=0', 'המישור ax+by+cz+d=0', '2x-3y+z=4']) {
      expect(upperCasedLabelCandidate3(u), u).toBeNull();
      expect(nudges(u), u).toBe(false);
    }
  });

  it('a genuine gap is NOT masked as a case problem (it fails in either case)', () => {
    for (const u of ['the orthoscheme abcd']) {
      expect(nudges(u), u).toBe(false);
    }
  });

  it('#2823: a certain slot is read in capitals at the store — the line records, so no nudge is ever shown', () => {
    for (const [u, row] of [['∠sdb', '∠SDB'], ['זווית sdb', 'זווית SDB'], ['זוית abc = 90', 'זוית ABC = 90']]) {
      expect(recorded(u), u).toEqual({ row, cased: true });
      expect(nudges(u), u).toBe(false);
    }
  });

  // #498: «תיבה abcd» was in the list above on a false premise — «תיבה» is not an uplift ANCHOR, so
  // nothing ever lifted `abcd`. It "parsed" because `cubeOrBox` found no uppercase run, took the
  // label-less branch and auto-lettered A,B,C,D — silently discarding what the student wrote (harmless
  // here only because abcd ≡ ABCD; «תיבה klmn» would have drawn ABCD). The fail-closed declaration
  // gate now declines it, which routes it to precisely the mechanism #353 built for this: the nudge
  // fires with the corrected spelling, free and instant, instead of a paid LLM call or a wrong figure.
  it('a lowercase run is never a silently auto-lettered solid — #2823: a solid noun’s run is accepted in capitals', () => {
    expect(parse3('תיבה abcd').ok).toBe(false); // the grammar still declines it as typed
    expect(recorded('תיבה abcd')).toEqual({ row: 'תיבה ABCD', cased: true });
    expect(recorded('תיבה klmn')).toEqual({ row: 'תיבה KLMN', cased: true }); // its own letters, never A, B, C, D
  });

  it('the pattern-based guidance register is untouched by this addition', () => {
    expect(classifyGuidance3('מעויין')?.category).toBe('cross-app');
    expect(classifyGuidance3('פירמידה')?.category).toBe('bare-solid');
  });
});
