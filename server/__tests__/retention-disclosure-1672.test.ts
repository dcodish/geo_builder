/**
 * #1672 (ADR-W-110) — the privacy note's RETENTION WINDOW is the server's, in every builder.
 *
 * The class: the note is prose and the window is a constant, and nothing held one to the other. Every
 * builder told students their statements are kept «למספר ימים» / "for a few days" — true at 7 days,
 * false at 30 (and false in practice for 3-D even at 7, which the shared prune marker let drift to 18).
 * The ADR-W-090 lock already holds each note's SINK LIST to the product's wiring; this file holds the
 * one number the usage-log sentence states to `DEFAULT_RETENTION_DAYS`, so raising or lowering the
 * window without rewording every note fails here.
 *
 * It lives in server/ because only server/ may import both the constant and the product trees
 * (BOUNDARIES.json: server → src / src3d / src-complex / src-analytic; shell/ may import neither).
 * The table is checked against the roster, so a fifth builder cannot ship a note this file never read.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_DAYS, retentionDays } from '../eventLog';
import i18n2d from '../../src/i18n';
import { privacyDeclaration as declare2d } from '../../src/ui/privacy';
import i18n3d from '../../src3d/i18n';
import { privacyDeclaration as declare3d } from '../../src3d/ui/privacy';
import { complexI18n } from '../../src-complex/i18n';
import { privacyDeclaration as declareComplex } from '../../src-complex/ui/privacy';
import { analyticI18n } from '../../src-analytic/i18n';
import { privacyDeclaration as declareAnalytic } from '../../src-analytic/ui/privacy';

/** server/ may not import shell/ (BOUNDARIES.json), so the declaration type is read off a product. */
type PrivacyDeclaration = ReturnType<typeof declare2d>;

/** Each builder's REAL declaration through its REAL i18n — the same calls its ADR-W-090 lock makes. */
const DECLARE: Record<string, (lng: string) => PrivacyDeclaration> = {
  '2d': (lng) => declare2d(i18n2d.getFixedT(lng)),
  '3d': (lng) => declare3d(i18n3d.getFixedT(lng)),
  complex: (lng) => declareComplex(complexI18n.getFixedT(lng)),
  analytic: (lng) => declareAnalytic(analyticI18n.getFixedT(lng)),
};
const LOCALES = ['he', 'en'];

/** The number as a whole token — `30` in «עד 30 יום», never the `30` inside `300` or `2030`. */
const statesWindow = (text: string, days: number) => new RegExp(`(^|[^\\d])${days}([^\\d]|$)`).test(text);
/** The vague wording every note used before #1672: it fits a week, not a month. */
const VAGUE = /few days|מספר ימים/i;

describe('#1672 — every privacy note states the server retention window (ADR-W-110)', () => {
  afterEach(() => {
    delete process.env.EVENTS_RETENTION_DAYS;
  });

  it('the window is 30 days, the operator ruling of 2026-10-02, and it is what an unset env gets', () => {
    delete process.env.EVENTS_RETENTION_DAYS;
    expect(DEFAULT_RETENTION_DAYS).toBe(30);
    expect(retentionDays()).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('the table covers every enabled builder in the roster', () => {
    const roster = JSON.parse(readFileSync(path.resolve(__dirname, '../../products.json'), 'utf8')) as {
      products: { id: string; enabled: boolean }[];
    };
    const enabled = roster.products.filter((p) => p.enabled).map((p) => p.id).sort();
    expect(enabled.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(DECLARE).sort()).toEqual(enabled);
  });

  for (const [id, declare] of Object.entries(DECLARE)) {
    for (const lng of LOCALES) {
      it(`${id} [${lng}]: a note that declares the usage log states ${DEFAULT_RETENTION_DAYS} days, not "a few days"`, () => {
        const d = declare(lng);
        // exercised: every builder wires the usage log today; a note without it would check nothing here
        expect(d.discloses, `${id} no longer declares the usage log — re-read this lock`).toContain('usage-log');
        expect(statesWindow(d.text, DEFAULT_RETENTION_DAYS), `${id} [${lng}]: «${d.text}»`).toBe(true);
        expect(d.text).not.toMatch(VAGUE);
      });
    }
  }

  it('the matcher really checks: it rejects the old wording and a different number', () => {
    expect(statesWindow('kept for a few days', 30)).toBe(false);
    expect(statesWindow('kept for up to 300 days', 30)).toBe(false);
    expect(statesWindow('נשמרות עד 7 ימים', 30)).toBe(false);
    expect(statesWindow('נשמרות עד 30 יום', 30)).toBe(true);
    expect(VAGUE.test('למספר ימים בלבד')).toBe(true);
  });
});
