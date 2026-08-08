/**
 * #73 (ADR-3D-040): the 3-D guidance register — verbatim prod utterances per family + the
 * NO-THEFT invariant (every supported catalog3 example, both locales, classifies null).
 */
import { describe, expect, it } from 'vitest';
import { classifyGuidance3 } from '../parser/scope3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

describe('#73 — valueless-query (the reproduce-verify charter, student-facing)', () => {
  // NB: bare `∠DEF` (and `∠DEF = α`) now BUILD a pedagogical marker (#94) — they are NOT valueless queries.
  // Only the genuine QUESTION forms (`∠DEF=`, `∠DEF?`, `∠DEF=?`, `מצא…`, `the angle between …`) stay guidance.
  for (const u of ["הזווית בין הישר AC' לבין המישור ABCD", 'הזווית בין המישורים', "מצא את הזווית D'FD", '∠DEF=', '∠DEF?', '∠DEF=?']) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('valueless-query'));
  }
  it('a VALUED angle stays null (it parses; and must never be brushed off)', () => {
    expect(classifyGuidance3('הזווית בין המישורים π1 ו-π2 היא 45')).toBeNull();
    expect(classifyGuidance3("הזווית בין הישר AC' לבין המישור ABCD היא 30")).toBeNull();
  });
});

describe('#73 — cross-app (bare 2-D nouns → the 2-D tool)', () => {
  // #247: prod piyrx56a spellings/prefix — «נתון מעויין», bare «מעויין» (double yod), «נתון»-prefixed nouns.
  for (const u of ['מעגל', 'מלבן', 'מעוין', 'מעויין', 'נתון מעויין', 'נתון מעוין', 'נתונה מקבילית', 'given a rhombus']) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('cross-app'));
  }
  // #442 RETIRED the inscription form from this category — the 3-D tool now BUILDS a polygon's
  // circumscribed / inscribed circle, and guidance for something the parser handles is a lie (the
  // header's own rule; the third category retired by SUPPORTING its form, after S3 and S4).
  it('an inscription statement is BUILT now, not guided away', () => {
    expect(classifyGuidance3('משולש ABC חסום במעגל')).toBeNull();
    expect(classifyGuidance3('מעגל חסום במשולש ABC')).toBeNull();
  });
  it('the SUPPORTED in-space circle form stays null', () => {
    expect(classifyGuidance3('מעגל שמרכזו O משיק לישר AB בנקודה B')).toBeNull();
  });
  it('a GIVEN circle with a continuation stays null — a genuine gap, not a brush-off (held for scoping)', () => {
    expect(classifyGuidance3('נתון מעגל שמרכזו O.')).toBeNull();
  });
});

describe('#73 — bare-solid (say what to add)', () => {
  // #247: «פרמידה» (missing-yod) + the «נתון» prefix.
  for (const u of ['פירמידה', 'מנסרה', 'pyramid', 'פרמידה', 'נתון פירמידה']) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('bare-solid'));
  }
  it('a based pyramid stays null', () => expect(classifyGuidance3('פירמידה SABCD שבסיסה ריבוע')).toBeNull());
  it('a NAMED solid stays null («פירמידה SABCD» parses)', () => expect(classifyGuidance3('פירמידה SABCD')).toBeNull());
});

describe('#73 — ui-command (marks derive from givens)', () => {
  it('סימון זווית ישרה D', () => expect(classifyGuidance3('סימון זווית ישרה D')?.category).toBe('ui-command'));
});

describe('#321 — oblique-prism (a base with no oblique model — say what works)', () => {
  // #349 (ADR-3D-089) NARROWED this family: obliqueness is a modifier of any prism kind now, so a
  // triangle / general-quad / parallelogram-family base BUILDS oblique. What is still refused is a base
  // whose only template would assert a given the student never stated (a REGULAR pentagon/hexagon —
  // ADR-052), or an explicitly-oblique prism with no base noun at all (the base is missing).
  for (const u of [
    'מנסרה שבסיסה מחומש',
    'מנסרה שבסיסה משושה',
    'מנסרה מחומשת',
    'מנסרה נטויה',
    'prism with a pentagon base',
    'pentagonal prism ABCDE',
    'oblique prism',
  ]) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('oblique-prism'));
  }
  it('#349: the triangle / general-quad bare forms are no longer brushed off (they build oblique)', () => {
    for (const u of ['מנסרה שבסיסה משולש', 'מנסרה שבסיסה מרובע', 'מנסרה משולשת', 'prism with a triangle base', 'triangular prism ABC']) {
      expect(classifyGuidance3(u), u).toBeNull();
    }
  });
  it('the SUPPORTED parallelogram-family bare forms stay null (they build oblique)', () => {
    for (const u of ['מנסרה שבסיסה מעוין', 'מנסרה שבסיסה מעויין', 'מנסרה שבסיסה ריבוע', 'מנסרה שבסיסה מלבן', 'מנסרה שבסיסה מקבילית', 'prism with a rhombus base']) {
      expect(classifyGuidance3(u), u).toBeNull();
    }
  });
  it('the ישרה forms stay null (they parse as right prisms)', () => {
    expect(classifyGuidance3('מנסרה ישרה שבסיסה משולש שווה צלעות')).toBeNull();
    expect(classifyGuidance3('right triangular prism ABC')).toBeNull();
  });
});

describe('#73 — NO THEFT: the whole supported catalog classifies null (both locales)', () => {
  it('catalog sweep', () => {
    for (const entry of COMMAND_CATALOG_3D) {
      for (const u of [entry.he, entry.en]) {
        expect(classifyGuidance3(u), `catalog example must stay null: ${u}`).toBeNull();
      }
    }
  });
});
