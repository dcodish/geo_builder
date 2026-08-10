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
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { classifyGuidance3, upperCasedLabelCandidate3 } from '../parser/scope3';

/** The App3 decision, verbatim: nudge iff a candidate exists AND it parses (App3.tsx, the pre-LLM seam). */
const nudges = (u: string): boolean => {
  const c = upperCasedLabelCandidate3(u);
  return !!c && parse3(c).ok;
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

describe('#353 — a single lowercase letter is left alone (it is a vector / parameter / coordinate)', () => {
  it('only runs of 2+ characters are lifted', () => {
    expect(upperCasedLabelCandidate3('AS=w')).toBeNull(); // `w` is one letter — nothing liftable
    expect(upperCasedLabelCandidate3('AB=5')).toBeNull();
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
    for (const u of ['נתון מעגל שמרכזו o', 'the orthoscheme abcd']) {
      expect(nudges(u), u).toBe(false);
    }
  });

  it('#181 uplift still wins where it applies — those inputs PARSE, so no nudge is ever shown', () => {
    for (const u of ['∠sdb', 'זווית sdb', 'זוית abc = 90']) {
      expect(parse3(u).ok, u).toBe(true);
    }
  });

  // #498: «תיבה abcd» was in the list above on a false premise — «תיבה» is not an uplift ANCHOR, so
  // nothing ever lifted `abcd`. It "parsed" because `cubeOrBox` found no uppercase run, took the
  // label-less branch and auto-lettered A,B,C,D — silently discarding what the student wrote (harmless
  // here only because abcd ≡ ABCD; «תיבה klmn» would have drawn ABCD). The fail-closed declaration
  // gate now declines it, which routes it to precisely the mechanism #353 built for this: the nudge
  // fires with the corrected spelling, free and instant, instead of a paid LLM call or a wrong figure.
  it('a lowercase run with NO uplift anchor gets the nudge, not a silently auto-lettered solid', () => {
    expect(parse3('תיבה abcd').ok).toBe(false);
    expect(upperCasedLabelCandidate3('תיבה abcd')).toBe('תיבה ABCD');
    expect(nudges('תיבה abcd')).toBe(true);
  });

  it('the pattern-based guidance register is untouched by this addition', () => {
    expect(classifyGuidance3('מעויין')?.category).toBe('cross-app');
    expect(classifyGuidance3('פירמידה')?.category).toBe('bare-solid');
  });
});
