/**
 * #1426 — the complex half of the privacy-disclosure lock (docs/28 §5c, ADR-W-090).
 *
 * Calls the product's REAL declaration through its REAL i18n; the shared rows measure what the
 * bundle wires. Complex's note is the one that TRUTHFULLY says the work stays in the browser, so its
 * extra row holds that: no usage log and no model fallback are declared. When complex's usage
 * emitter lands (#1243's remainder) the shared row fails first — the wired sink is undeclared — and
 * this row then has to be revisited together with the note, never before it.
 */
import { describe, expect, it } from 'vitest';
import { complexI18n } from '../i18n';
import { privacyDeclaration } from '../ui/privacy';
import { privacyDisclosureSuite } from '../../shell/__tests__/fixtures/privacy-disclosure-rows';

const declare = (lng: string) => privacyDeclaration(complexI18n.getFixedT(lng));

privacyDisclosureSuite('complex', declare);

describe('#1426 — complex declares its sinks: the usage log since #1243, and still no model fallback', () => {
  it('usage-log is declared (the emitter is wired now) and llm is not (none exists)', () => {
    const { discloses } = declare('he');
    expect(discloses).toContain('usage-log');
    expect(discloses).not.toContain('llm');
  });
});
