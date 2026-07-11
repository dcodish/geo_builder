/**
 * Out-of-scope classifier (src/parser/scope.ts) — the boundary that tells a deliberately
 * unsupported concept ("alternate angles", "prove that…", "calculate x", free text) apart from a
 * GENUINE construction gap we should still implement. Drives the tailored student message + the
 * dashboard's `scope:<category>` analytics tag.
 */

import { describe, it, expect } from 'vitest';
import { classifyOutOfScope, looksCompound } from '../scope';

describe('classifyOutOfScope — analytic / coordinate geometry (a different, planned tool)', () => {
  for (const he of [
    'ציר ה-x',
    'ציר y',
    'מערכת צירים',
    'ראשית הצירים',
    'השיפוע של AB הוא 2',
    'משוואת הישר AB',
    'הקואורדינטות של A',
    'שיעורי הנקודה A',
  ]) {
    it(`Hebrew: ${he}`, () => expect(classifyOutOfScope(he)?.category).toBe('analytic'));
  }
  for (const en of [
    'the y axis',
    'x-axis',
    'the coordinate system',
    'slope of AB is 2',
    'y = 2x + 3',
    'y = -x',
    'equation of the line AB',
    'origin of the axes',
    'cartesian plane',
  ]) {
    it(`English: ${en}`, () => expect(classifyOutOfScope(en)?.category).toBe('analytic'));
  }
  it('exposes the i18n message key', () =>
    expect(classifyOutOfScope('the y axis')?.messageKey).toBe('input.scope.analytic'));
});

describe('looksCompound — several statements packed into one line (advise breaking up)', () => {
  for (const c of [
    'ריבוע Abcd, נקודה f נמצאת על צלע ab, זווית cfd 37 מעלות', // the operator example (shape + point + angle)
    'משולש ABC ומעגל חוסם אותו', // triangle AND a circumscribing circle
    'draw triangle ABC and a point D on AB and angle ABC = 40', // 3 En statements
    'circle O, triangle ABC inscribed in it', // circle + inscribed triangle
  ]) {
    it(`compound: ${c}`, () => expect(looksCompound(c)).toBe(true));
  }
  for (const single of [
    'triangle ABC', // one construction
    'circle through A, B, C', // ONE construction with list-commas (only the first piece carries a keyword)
    'F, G, H on AB, AC, CB', // a supported single construction (ADR-076) — bare-label pieces don't count
    'משולש ABC ישר זווית', // one shape, no separator
    'AB = 4, BC = 6', // a givens list — pieces are bare labels, not keyword statements
  ]) {
    it(`NOT compound: ${single}`, () => expect(looksCompound(single)).toBe(false));
  }
});

describe('classifyOutOfScope — angle/theorem relationships', () => {
  it('Hebrew alternate angles (the operator example)', () =>
    expect(classifyOutOfScope('זוויות מתחלפות')?.category).toBe('angle-relation'));
  it('Hebrew corresponding angles', () =>
    expect(classifyOutOfScope('זוויות מתאימות')?.category).toBe('angle-relation'));
  it('Hebrew co-interior angles', () =>
    expect(classifyOutOfScope('זוויות חד-צדדיות')?.category).toBe('angle-relation'));
  it('English alternate angles', () =>
    expect(classifyOutOfScope('alternate angles')?.category).toBe('angle-relation'));
  it('English corresponding angles', () =>
    expect(classifyOutOfScope('corresponding angles')?.category).toBe('angle-relation'));
  it('a theorem name (Pythagoras)', () =>
    expect(classifyOutOfScope('משפט פיתגורס')?.category).toBe('angle-relation'));
  it('exposes the i18n message key', () =>
    expect(classifyOutOfScope('alternate angles')?.messageKey).toBe('input.scope.angle-relation'));
});

describe('classifyOutOfScope — proof requests', () => {
  it('Hebrew "prove that"', () => expect(classifyOutOfScope('הוכח שהמשולש שווה שוקיים')?.category).toBe('proof'));
  it('Hebrew "show that"', () => expect(classifyOutOfScope('הראה ש AB=CD')?.category).toBe('proof'));
  it('English prove', () => expect(classifyOutOfScope('prove that the triangle is isosceles')?.category).toBe('proof'));
});

describe('classifyOutOfScope — compute / solve requests', () => {
  it('Hebrew calculate', () => expect(classifyOutOfScope('חשב את הזווית')?.category).toBe('compute'));
  it('Hebrew "find the area"', () => expect(classifyOutOfScope('מצא את השטח של ABC')?.category).toBe('compute'));
  it('English calculate', () => expect(classifyOutOfScope('calculate the area')?.category).toBe('compute'));
  it('English "find the value"', () => expect(classifyOutOfScope('find the value of x')?.category).toBe('compute'));
});

describe('classifyOutOfScope — unrelated free text (no geometric signal)', () => {
  it('a greeting', () => expect(classifyOutOfScope('שלום מה שלומך')?.category).toBe('unrelated'));
  it('an English greeting', () => expect(classifyOutOfScope('hello how are you')?.category).toBe('unrelated'));
  it('a meta question with no geometry', () => expect(classifyOutOfScope('מה הכלי יודע לעשות')?.category).toBe('unrelated'));
  it('empty input is null (nothing to classify)', () => expect(classifyOutOfScope('   ')).toBeNull());
});

describe('classifyOutOfScope — does NOT steal a genuine construction gap', () => {
  // These have real geometric content; an unhandled one is a REAL gap (stays 'not-understood'), not out-of-scope.
  for (const real of [
    'AB משיק למעגל O', // a tangent the parser may miss → real gap, not out-of-scope
    'מנקודה A מעבירים חותך למעגל בנקודה B', // a secant
    'find the midpoint of AB', // "find" + a CONSTRUCTION (midpoint), not a compute request
    'E נקודת החיתוך של AO עם המעגל', // an intersection point
    '∠GEC=∠CHA', // angle equality (a real relation we support / should)
    'נקודה D על AB', // a plain point-on-segment
    'A = (3, 5)', // coordinate free-point placement — SUPPORTED (freePoint grammar); must NOT read as analytic
    'point B at (1, 2)',
    'AB = 4', // a length given — the "= number" must not trip the line-equation pattern
    'BC = 6, CA = 8',
    'circle O radius 5',
    'משולש ABC', // a bare triangle
    'ריבוע ABCD', // a square (contains no analytic stem)
  ]) {
    it(`null for: ${real}`, () => expect(classifyOutOfScope(real)).toBeNull());
  }
});

// ---------------------------------------------------------------------------
// #43 (ADR-289) — the GUIDANCE register from the baseline log-triage: every family answers with a
// specific "what to do instead"; each case below is a VERBATIM prod utterance.
// ---------------------------------------------------------------------------

describe('#43 — cross-app: a 3-D solid typed into the 2-D tool', () => {
  for (const u of ['תיבה', "תיבה ABCDA'B'C'D'", 'קובייה', 'pyramid SABCD']) {
    it(u, () => expect(classifyOutOfScope(u)?.category).toBe('cross-app'));
  }
});

describe('#43 — ui-command: marks derive from givens', () => {
  for (const u of [
    'תוסיף זוויות',
    'תסמן זוית ישרה',
    'הראו זוויות ישרות',
    'להוסיף את מרכז המעגל',
    'E זוית ישרה הוסף סימון',
    'זוויות',
    'זוויות°',
    'angles',
    'angle°',
    'show the right angles',
  ]) {
    it(u, () => expect(classifyOutOfScope(u)?.category).toBe('ui-command'));
  }
});

describe('#43 — valueless-query: a measure reference with no value', () => {
  for (const u of ['∠DEF', '∠DEF=', '∠DEF=?']) {
    it(u, () => expect(classifyOutOfScope(u)?.category).toBe('valueless-query'));
  }
});

describe('#43 — orientation: canvas layout is not a given', () => {
  for (const u of ['BD אופקי', 'קו AB אופקי', 'AB בסיס למטה', 'A הוא הקודקוד העליון', 'תזיז את הקוטר ב40 מעלות', 'A מימין לקו', 'BD is horizontal']) {
    it(u, () => expect(classifyOutOfScope(u)?.category).toBe('orientation'));
  }
});

describe('#43 — bare-point: a lone label', () => {
  for (const u of ['נקודה A', 'נקודה P', 'C', 'point G', 'קו ועליו נקודה A', 'קו עם נקודה A']) {
    it(u, () => expect(classifyOutOfScope(u)?.category).toBe('bare-point'));
  }
});

describe('#43 — NO THEFT: every supported catalog example stays unclassified (a real construction must never get a guidance brush-off)', () => {
  it('the whole catalog classifies null in both locales', async () => {
    const { COMMAND_CATALOG } = await import('../catalog');
    for (const entry of COMMAND_CATALOG) {
      if (!entry.supported) continue;
      for (const u of [entry.he, entry.en]) {
        expect(classifyOutOfScope(u), `catalog example must stay null: ${u}`).toBeNull();
      }
    }
  });
  it('constructive imperatives that PARSE are out of reach anyway, and near-misses stay real gaps', () => {
    // a failed CONSTRUCT imperative must not be brushed off as ui-command
    expect(classifyOutOfScope('הוסף חוצה זווית מ-A')?.category).not.toBe('ui-command');
    // a valued angle is a given, not a query
    expect(classifyOutOfScope('∠DEF = 60')).toBeNull();
  });
});
