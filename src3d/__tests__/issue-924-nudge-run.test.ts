/**
 * #924 arm 2 (ADR-3D-226) — THE CONVENTION IS TAUGHT FOR A WHOLE SOLID, NOT JUST A SHORT RUN.
 *
 * Operator ruling, 2026-09-07, asked whether a lowercase solid name should be silently accepted or
 * taught: *"we should not accept this."* So the #353 ruling and the #498 lock both stand — a solid noun
 * is NOT an uplift anchor — and the gap is in the NUDGE, which could only lift 2–4-character runs. That
 * is exactly one vertex list too short: «תיבה abcda'b'c'd'» had its run lifted in the wrong half
 * («abcda'B'C'D'») and «פירמידה sabcd» was not lifted at all, so the candidate did not parse, the nudge
 * stayed silent, and a fully supported figure was escalated to the paid LLM lane.
 *
 * The guards below matter more than the new rows: every spelling that parses today must still parse as
 * typed, and the prod-log lowercase names (`l`, `ℓ`, `π1`, `u`, `k`, `t`) must keep their meaning.
 *
 * #2823 (ADR-3D-492): the operator's ruling ADR-W-203 (2026-11-10) replaced "we should not accept this" for a solid's
 * vertex run: a run after a solid noun can only be the solid's vertices, so it is ACCEPTED in capitals at the store's
 * seam, with the notice — the grammar itself still never reads it as typed. The nudge is every builder's ask now.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { classifyGuidance3, upperCasedLabelCandidate3 } from '../parser/scope3';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { labelCaseFold3 } from '../store/store3';

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

describe('#924 arm 2 → #2823 — a long or primed vertex run is accepted in capitals, never escalated', () => {
  it("«תיבה abcda'b'c'd'» — the operator's row — records as «תיבה ABCDA'B'C'D'»", () => {
    expect(parse3("תיבה abcda'b'c'd'").ok, 'the grammar never reads it as typed').toBe(false);
    expect(recorded("תיבה abcda'b'c'd'")).toEqual({ row: "תיבה ABCDA'B'C'D'", cased: true });
  });

  it('«פירמידה sabcd» — the 5-letter run the old cap could not lift at all', () => {
    expect(parse3('פירמידה sabcd').ok).toBe(false);
    expect(recorded('פירמידה sabcd')).toEqual({ row: 'פירמידה SABCD', cased: true });
  });

  it('«box abcd» — the English NOUN is prose and stays put; only the vertex run is written in capitals', () => {
    expect(upperCasedLabelCandidate3('box abcd')).toBe('box ABCD');
    expect(recorded('box abcd')).toEqual({ row: 'box ABCD', cased: true });
  });

  it('the solid noun is still NOT an uplift anchor — nothing is silently auto-lettered', () => {
    for (const u of ["תיבה abcda'b'c'd'", 'פירמידה sabcd', 'קובייה abcd', 'box abcd']) {
      expect(parse3(u).ok, `${u} must not build as typed`).toBe(false);
    }
  });
});

describe('#924 arm 2 — the standing locks are untouched', () => {
  it('#498 → #2823: «תיבה abcd» records in capitals — never auto-lettered, never a paid call', () => {
    expect(parse3('תיבה abcd').ok).toBe(false);
    expect(recorded('תיבה abcd')).toEqual({ row: 'תיבה ABCD', cased: true });
  });

  it('#353: the reported case «as=w» is unchanged — `w` stays the VECTOR', () => {
    expect(upperCasedLabelCandidate3('as=w')).toBe('AS=w');
    expect(nudges('as=w')).toBe(true);
  });

  it('a single lowercase letter is still left alone', () => {
    for (const u of ['AS=w', 'AB=5']) expect(upperCasedLabelCandidate3(u), u).toBeNull();
  });

  it('#339: a plane equation with symbolic coefficients is still excluded by construction', () => {
    for (const u of ['ax+by+cz+d=0', 'המישור ax+by+cz+d=0', '2x-3y+z=4']) {
      expect(upperCasedLabelCandidate3(u), u).toBeNull();
      expect(nudges(u), u).toBe(false);
    }
  });

  it('a genuine gap is still not masked as a case problem', () => {
    for (const u of ['the orthoscheme abcd']) expect(nudges(u), u).toBe(false);
  });

  it('the pattern-based guidance register is untouched', () => {
    expect(classifyGuidance3('מעויין')?.category).toBe('cross-app');
    expect(classifyGuidance3('פירמידה')?.category).toBe('bare-solid');
  });
});

describe('#924 arm 2 — the prod-log guards: lowercase names that MEAN something keep meaning it', () => {
  // Taken from the 3-D production log, not from imagination (#924's own instruction). Each of these
  // PARSES as typed, so the nudge — which runs only on a failed parse — is never even consulted.
  it('every one of them still parses exactly as typed', () => {
    for (const u of [
      'l ⊥ π',
      'ℓ ∥ π1',
      'ישר l x=(1,2,3)+t(m-2,m,m+2)',
      'u = (k-1,k,3)',
      'k = 2',
    ]) {
      expect(parse3(u).ok, u).toBe(true);
    }
    // #924 arm 1's coordinate head (ADR-3D-223) is read at the store's seam since #2823
    expect(labelCaseFold3('c(p²,0,1)', [])?.text).toBe('C(p²,0,1)');
  });
});
