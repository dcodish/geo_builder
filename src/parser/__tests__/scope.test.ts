/**
 * Out-of-scope classifier (src/parser/scope.ts) — the boundary that tells a deliberately
 * unsupported concept ("alternate angles", "prove that…", "calculate x", free text) apart from a
 * GENUINE construction gap we should still implement. Drives the tailored student message + the
 * dashboard's `scope:<category>` analytics tag.
 */

import { describe, it, expect } from 'vitest';
import { classifyOutOfScope } from '../scope';

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
  ]) {
    it(`null for: ${real}`, () => expect(classifyOutOfScope(real)).toBeNull());
  }
});
