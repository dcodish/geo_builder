/**
 * #1426 — the analytic half of the privacy-disclosure lock (docs/28 §5c, ADR-W-090).
 *
 * The reported case: analytic's note said «המשפטים שאתם מקלידים נשמרים בדפדפן שלכם» / "The
 * statements you type stay in your own browser." while every final submission was posted to the
 * server usage log (#1243/#1363) and unrecognised statements went to the model fallback. The shared
 * rows hold the declaration to the bundle's real wiring; the extra row pins the reported pair so
 * the regression is named in its own words.
 */
import { describe, expect, it } from 'vitest';
import { analyticI18n } from '../i18n';
import { privacyDeclaration } from '../ui/privacy';
import { privacyDisclosureSuite } from '../../shell/__tests__/fixtures/privacy-disclosure-rows';

const declare = (lng: string) => privacyDeclaration(analyticI18n.getFixedT(lng));

privacyDisclosureSuite('analytic', declare);

describe('#1426 — analytic discloses the usage log and the model fallback', () => {
  it('its declaration covers both sinks the report found undisclosed', () => {
    for (const lng of ['he', 'en']) {
      expect(declare(lng).discloses).toEqual(expect.arrayContaining(['usage-log', 'llm']));
    }
  });
  it('and the text no longer claims the statements stay in the browser', () => {
    expect(declare('he').text).not.toMatch(/נשמרים בדפדפן שלכם/);
    expect(declare('en').text).not.toMatch(/stay in your own browser/);
  });
});
