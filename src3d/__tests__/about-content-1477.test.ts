/**
 * #1477 — the 3-D half of the About-content lock (docs/28 §5c, ADR-W-091).
 *
 * The shared rows run 3-D's REAL declaration through its REAL i18n, and every try step through the
 * store's real `submit` (the `decideSubmit3` gate the input box calls), in order, from a cleared
 * canvas. A step is accepted when it leaves no error and adds a fact.
 */
import i18n3d from '../i18n';
import { aboutContent } from '../ui/about';
import { useGeo3 } from '../store/store3';
import { aboutContentSuite, type StepVerdict } from '../../shell/__tests__/fixtures/about-content-rows';

function run(steps: readonly string[]): StepVerdict[] {
  useGeo3.getState().clear();
  return steps.map((step) => {
    const before = useGeo3.getState().facts.length;
    useGeo3.getState().submit(step);
    const { lastError, facts } = useGeo3.getState();
    return !lastError && facts.length > before ? { step, ok: true } : { step, ok: false, why: JSON.stringify(lastError ?? 'no fact added') };
  });
}

aboutContentSuite('3d', (lng) => aboutContent(i18n3d.getFixedT(lng)), run);
