/**
 * #109 + #108 (ADR-419) — the guidance register answers two more prod classes instead of paying the LLM.
 *
 * ADR-289 already built the register AND its pre-LLM short-circuit; these are the gaps measured against the
 * utterances the 2026-07-13 log-triage recorded:
 *  - #109 the SOLID vocabulary was a sample, not the vocabulary («פרמידה» single-yod, גליל/כדור/חרוט,
 *    «תלת ממדי»), and the analytic patterns missed an UPPERCASE axis letter, a grid, and a coordinate LIST;
 *  - #108 a compound line had no family at all, so it escalated — against the operator's ruling that the
 *    student should be TAUGHT the one-statement-at-a-time discipline.
 */
import { describe, expect, it } from 'vitest';
import { classifyOutOfScope, splitGuidance } from '@/parser/scope';
import { parse } from '@/parser';
import i18n from '@/i18n';

const cat = (u: string) => classifyOutOfScope(u)?.category ?? null;

describe('#109 — the wrong-product and wrong-frame classes', () => {
  it('every 3-D solid noun points at the Space Builder', () => {
    for (const u of ['תיבה', "תיבה ABCDA'B'C'D'", 'קוביה', 'קובייה', 'פירמידה', 'פרמידה', 'מנסרה', 'גליל', 'כדור', 'חרוט', 'מקבילון', 'ארבעון', 'מעגל תלת ממדי', 'cylinder', 'a sphere', 'cone']) {
      expect(cat(u), u).toBe('cross-app');
    }
  });

  it('coordinate / analytic input gets the future-tool answer', () => {
    for (const u of ['הקודקוד A נמצא על ציר y', 'קודקוד B על ציר x', 'D מונח על ציר ה-Y', 'ציר X', 'רשת X Y', 'מערכת צירים', 'מערכת צירים קרטזית', 'נקודה A(1,4) B(1,1) C(5,1), D(7,1)', 'the x-axis', 'slope of AB']) {
      expect(cat(u), u).toBe('analytic');
    }
  });

  it('the messages carry the operator’s two decisions', () => {
    expect(i18n.t('input.scope.cross-app'), 'names the 3-D tool').toContain('3d-builder');
    expect(i18n.t('input.scope.analytic'), 'promises the future tool').toMatch(/לעתיד|מתוכנן/);
  });

  it('does NOT mislabel a real 2-D construction', () => {
    // each of these parses, so the classifier never sees them — but if a pattern ever leaks, this catches it
    for (const u of ['מעגל O', 'משולש ABC', 'ריבוע ABCD', 'AB = 4', 'D אמצע BC']) {
      expect(parse(u).ok, `${u} still parses`).toBe(true);
      expect(cat(u), `${u} is not out of scope`).not.toBe('cross-app');
    }
  });
});

describe('#108 — one statement at a time, taught', () => {
  it('a shape with a property glued on is offered as two steps', () => {
    const g = splitGuidance('משולש ABC שווה שוקיים AB=AC');
    expect(g?.category).toBe('split-statements');
    expect(g?.params?.first, 'the construction').toContain('משולש ABC');
    expect(g?.params?.second, 'the given').toContain('AB=AC');
  });

  it('several sentences on one line are offered as their own pieces', () => {
    const g = splitGuidance('משולש ABC. זוית BAC ישרה. AB שווה לBC.');
    expect(g?.category).toBe('split-statements');
    expect(g?.params?.all).toContain('(1) משולש ABC');
    expect(g?.params?.all).toContain('(2) זוית BAC ישרה');
    expect(g?.params?.all).toContain('(3) AB שווה לBC');
  });

  it('the message quotes the pieces back', () => {
    const g = splitGuidance('משולש ABC שווה שוקיים AB=AC')!;
    const msg = i18n.t(g.messageKey, g.params) as string;
    expect(msg).toContain('AB=AC');
    expect(msg).toMatch(/נתון אחד/);
  });

  it('a SINGLE statement is never second-guessed', () => {
    for (const u of ['משולש ABC', 'AB = 4', 'ריבוע ABCD', 'מעגל O שרדיוסו 3', 'D על AB', 'זווית ABC = 40']) {
      expect(splitGuidance(u), u).toBeNull();
    }
  });

  it('a compound with NO shape noun is left to the other machinery', () => {
    // ADR-264's clause split owns connector compounds; a bare pair of relations is not this family's business
    expect(splitGuidance('AB = 4; BC = 5')).toBeNull();
  });
});
