/**
 * #1477 — the analytic half of the About-content lock (docs/28 §5c, ADR-W-091).
 *
 * The shared rows run analytic's REAL declaration through its REAL i18n, and every try step through
 * `decideSubmit` — the submit path's whole decision (teach, parse, fold, already-known) — in order,
 * from an empty line list. A step is accepted when the verdict is `record`.
 */
import { analyticI18n } from '../i18n';
import { aboutContent } from '../ui/about';
import { decideSubmit } from '../app/submit';
import { aboutContentSuite, type StepVerdict } from '../../shell/__tests__/fixtures/about-content-rows';

function run(steps: readonly string[]): StepVerdict[] {
  const lines: string[] = [];
  return steps.map((step) => {
    const v = decideSubmit(step, lines, 0);
    if (v.kind !== 'record') return { step, ok: false, why: JSON.stringify(v) };
    lines.push(v.line);
    return { step, ok: true };
  });
}

aboutContentSuite('analytic', (lng) => aboutContent(analyticI18n.getFixedT(lng)), run);
