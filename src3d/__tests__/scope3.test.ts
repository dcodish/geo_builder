/**
 * #73 (ADR-3D-040): the 3-D guidance register — verbatim prod utterances per family + the
 * NO-THEFT invariant (every supported catalog3 example, both locales, classifies null).
 */
import { describe, expect, it } from 'vitest';
import { classifyGuidance3 } from '../parser/scope3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

describe('#73 — valueless-query (the reproduce-verify charter, student-facing)', () => {
  for (const u of ["הזווית בין הישר AC' לבין המישור ABCD", 'הזווית בין המישורים', "מצא את הזווית D'FD", '∠DEF', '∠DEF=', '∠DEF=?']) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('valueless-query'));
  }
  it('a VALUED angle stays null (it parses; and must never be brushed off)', () => {
    expect(classifyGuidance3('הזווית בין המישורים π1 ו-π2 היא 45')).toBeNull();
    expect(classifyGuidance3("הזווית בין הישר AC' לבין המישור ABCD היא 30")).toBeNull();
  });
});

describe('#73 — cross-app (bare 2-D nouns → the 2-D tool)', () => {
  for (const u of ['מעגל', 'מלבן', 'מעוין', 'חסום במעגל']) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('cross-app'));
  }
  it('the SUPPORTED in-space circle form stays null', () => {
    expect(classifyGuidance3('מעגל שמרכזו O משיק לישר AB בנקודה B')).toBeNull();
  });
});

describe('#73 — bare-solid (say what to add)', () => {
  for (const u of ['פירמידה', 'מנסרה', 'pyramid']) {
    it(u, () => expect(classifyGuidance3(u)?.category).toBe('bare-solid'));
  }
  it('a based pyramid stays null', () => expect(classifyGuidance3('פירמידה SABCD שבסיסה ריבוע')).toBeNull());
});

describe('#73 — ui-command (marks derive from givens)', () => {
  it('סימון זווית ישרה D', () => expect(classifyGuidance3('סימון זווית ישרה D')?.category).toBe('ui-command'));
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
