/**
 * #773 (ADR-3D-170) — a HEBREW↔LATIN script transition is a token boundary, at the tokeniser.
 *
 * Found by `/log-triage` on the prod window 2026-08-19…24. What prod saw:
 *
 *   [parser/ok]                 קובייה ABCD
 *   [llm/ok]                    Eעל bb'          ← only the PAID LLM got it
 *
 * Hebrew and Latin runs carry no separator of their own, so a missing space between them is invisible
 * to the student: «Eעל BB'» renders identically to «E על BB'» in an RTL box, and only the second one
 * parsed. #530 (a P1) fixed exactly this — for ONE rule, by making that rule's own marker separator
 * optional — so every other He/Latin boundary in the grammar stayed broken. #494 fixed the mirror
 * direction (a detached clitic) at the NORMALISER, which is the shape that generalises. This is that
 * fix's other half.
 */
import { describe, expect, it } from 'vitest';
import { normalize3, parse3 } from '../parse3';
import { COMMAND_CATALOG_3D } from '../catalog3';

describe('#773 — the reported case, and its direction', () => {
  it("«Eעל BB'» builds the same command as «E על BB'»", () => {
    const glued = parse3("Eעל BB'");
    const spaced = parse3("E על BB'");
    expect(spaced.ok).toBe(true);
    expect(glued.ok, 'the glued form was not-handled before #773').toBe(true);
    if (!glued.ok || !spaced.ok) return;
    expect(glued.commands).toEqual(spaced.commands);
  });

  it('#530’s own case is now covered by the general rule, not by its rule-local tolerance', () => {
    expect(normalize3("אלכסוני A'B'C'D' נחתכים בנקודהS")).toBe("אלכסוני A'B'C'D' נחתכים בנקודה S");
  });

  it('both directions split', () => {
    expect(normalize3("Eעל BB'")).toBe("E על BB'"); // Latin → Hebrew
    expect(normalize3('מנקודהA')).toBe('מנקודה A'); // Hebrew → Latin
  });
});

describe('#773 — what must NOT split (the #494 fold is directly above it)', () => {
  it('a glued CLITIC stays glued — splitting it would undo #494 one line up', () => {
    // #494 deliberately GLUES a detached clitic: «מקביל ל AB» → «מקביל לAB». A blanket
    // Hebrew↔Latin split would immediately tear it back apart, and the two folds would fight.
    expect(normalize3('מקביל ל AB')).toBe('מקביל לAB');
    expect(normalize3('מקביל לAB')).toBe('מקביל לAB');
  });

  it('a run of clitic letters is left alone; a WORD is not', () => {
    expect(normalize3('בAB')).toBe('בAB');
    expect(normalize3('נקודהAB')).toBe('נקודה AB'); // a word, even though it ends in ה
  });

  it('a DIGIT beside Hebrew is untouched — «5 ס"מ» is not a label boundary', () => {
    expect(normalize3('אורך 5ס"מ')).toBe('אורך 5ס"מ');
  });

  it('primes and label runs survive intact', () => {
    expect(normalize3("קובייה ABCDA'B'C'D'")).toBe("קובייה ABCDA'B'C'D'");
  });
});

describe('#773 — the corpus-wide property: despacing a boundary changes nothing', () => {
  // The generalisation that makes this a rule rather than a spelling: for EVERY catalog line, removing
  // the space at a Hebrew↔Latin transition must parse to the identical commands. A rule that grows its
  // own separator tolerance passes its own test and leaves the class open; this one cannot.
  const despace = (s: string) =>
    s.replace(/([A-Za-z][A-Za-z0-9']*) (?=[א-ת])/g, '$1').replace(/([א-ת]{2,}) (?=[A-Za-z])/g, '$1');

  const HE_LINES = COMMAND_CATALOG_3D.map((c) => c.he).filter((he) => /[א-ת]/.test(he) && /[A-Za-z]/.test(he));

  it('the corpus actually exercises this (non-vacuous)', () => {
    const changed = HE_LINES.filter((he) => despace(he) !== he);
    expect(changed.length).toBeGreaterThan(20);
  });

  it.each(HE_LINES.filter((he) => despace(he) !== he))('«%s» parses identically when despaced', (he) => {
    const spaced = parse3(he);
    if (!spaced.ok) return; // a catalog line the grammar declines is another test's business
    const glued = parse3(despace(he));
    expect(glued.ok, `despaced «${he}» → «${despace(he)}» must still parse`).toBe(true);
    if (!glued.ok) return;
    expect(glued.commands).toEqual(spaced.commands);
  });
});
