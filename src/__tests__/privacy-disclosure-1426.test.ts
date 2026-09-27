/**
 * #1426 — the 2-D half of the privacy-disclosure lock (docs/28 §5c, ADR-W-090).
 *
 * Calls the product's REAL declaration through its REAL i18n; the shared rows measure what the
 * bundle wires. The operator's ruling (2026-09-27): every builder that wires the model fallback says
 * so — the row "wired ⊆ declared" is what enforces it.
 */
import i18n from '../i18n';
import { privacyDeclaration } from '../ui/privacy';
import { privacyDisclosureSuite } from '../../shell/__tests__/fixtures/privacy-disclosure-rows';

privacyDisclosureSuite('2d', (lng) => privacyDeclaration(i18n.getFixedT(lng)));
