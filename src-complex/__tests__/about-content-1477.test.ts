/**
 * #1477 — the complex half of the About-content lock (docs/28 §5c, ADR-W-091).
 *
 * The shared rows run complex's REAL declaration through its REAL i18n, and every try step through
 * `submitLine` — THE one entry point the input box uses (parse, the ask-lane routing, the acceptance
 * gate) — in order, from a reset session. A step is accepted when it is recorded as a line.
 */
import { complexI18n } from '../i18n';
import { aboutContent } from '../ui/about';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';
import { aboutContentSuite, type StepVerdict } from '../../shell/__tests__/fixtures/about-content-rows';

function run(steps: readonly string[]): StepVerdict[] {
  useComplexStore.getState().resetSession();
  return steps.map((step) => {
    const before = useComplexStore.getState().lines.length;
    const ok = submitLine(step) && useComplexStore.getState().lines.length > before;
    return ok ? { step, ok } : { step, ok, why: JSON.stringify(useComplexStore.getState().lastError ?? 'not recorded') };
  });
}

aboutContentSuite('complex', (lng) => aboutContent(complexI18n.getFixedT(lng)), run);
