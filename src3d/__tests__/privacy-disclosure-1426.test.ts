/**
 * #1426 — the 3-D half of the privacy-disclosure lock (docs/28 §5c, ADR-W-090).
 *
 * Calls the product's REAL declaration through its REAL i18n; the shared rows measure what the
 * bundle wires.
 */
import i18n3d from '../i18n';
import { privacyDeclaration } from '../ui/privacy';
import { privacyDisclosureSuite } from '../../shell/__tests__/fixtures/privacy-disclosure-rows';

privacyDisclosureSuite('3d', (lng) => privacyDeclaration(i18n3d.getFixedT(lng)));
