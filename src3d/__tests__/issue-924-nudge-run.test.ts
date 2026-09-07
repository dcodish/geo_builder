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
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { classifyGuidance3, upperCasedLabelCandidate3 } from '../parser/scope3';

/** The App3 decision, verbatim: nudge iff a candidate exists AND it parses (App3.tsx, the pre-LLM seam). */
const nudges = (u: string): boolean => {
  const c = upperCasedLabelCandidate3(u);
  return !!c && parse3(c).ok;
};

describe('#924 arm 2 — a long or primed vertex run is taught, not escalated', () => {
  it("«תיבה abcda'b'c'd'» — the operator's row — is taught with the corrected spelling", () => {
    expect(parse3("תיבה abcda'b'c'd'").ok, 'still not accepted as typed — the #353 ruling stands').toBe(false);
    expect(upperCasedLabelCandidate3("תיבה abcda'b'c'd'")).toBe("תיבה ABCDA'B'C'D'");
    expect(nudges("תיבה abcda'b'c'd'"), 'taught for free, never a paid LLM call').toBe(true);
  });

  it('«פירמידה sabcd» — the 5-letter run the old cap could not lift at all', () => {
    expect(parse3('פירמידה sabcd').ok).toBe(false);
    expect(upperCasedLabelCandidate3('פירמידה sabcd')).toBe('פירמידה SABCD');
    expect(nudges('פירמידה sabcd')).toBe(true);
  });

  it('«box abcd» — the English NOUN is prose and stays put; only the vertex run is corrected', () => {
    expect(upperCasedLabelCandidate3('box abcd')).toBe('box ABCD');
    expect(nudges('box abcd')).toBe(true);
  });

  it('the solid noun is still NOT an uplift anchor — nothing is silently auto-lettered', () => {
    for (const u of ["תיבה abcda'b'c'd'", 'פירמידה sabcd', 'קובייה abcd', 'box abcd']) {
      expect(parse3(u).ok, `${u} must not build as typed`).toBe(false);
    }
  });
});

describe('#924 arm 2 — the standing locks are untouched', () => {
  it('#498: «תיבה abcd» still gets the nudge, with the same candidate', () => {
    expect(parse3('תיבה abcd').ok).toBe(false);
    expect(upperCasedLabelCandidate3('תיבה abcd')).toBe('תיבה ABCD');
    expect(nudges('תיבה abcd')).toBe(true);
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
    for (const u of ['נתון מעגל שמרכזו o', 'the orthoscheme abcd']) expect(nudges(u), u).toBe(false);
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
      'c(p²,0,1)', // #924 arm 1's uplift (ADR-3D-223) — untouched by this change
    ]) {
      expect(parse3(u).ok, u).toBe(true);
    }
  });
});
