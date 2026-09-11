/**
 * #973 ([ADR-502](docs/06-decisions.md#adr-502)) — the SENTENCE for an unstated choice, in the student's
 * language. The engine names the choice structurally (`unstatedChoices`); this turns one into the text
 * the step row and the under-canvas line show: what is drawn now, the canonical sentence that would pin it
 * (a form that already parses — measured, not assumed), and the button that cycles it.
 *
 * Every string goes through `t()`; the templates live under `steps.unstated*` / `steps.state*` in both
 * locales and the i18n net (`unstated-choice-notes.test.ts`) walks the kind list against both files.
 */
import type { UnstatedChoice } from '@/engine/shapeVariants';

/** The i18next `t` shape this needs — kept minimal so the builder is testable without React. */
export type Translate = (key: string, opts?: Record<string, string>) => string;

const seg = (s: readonly [string, string]): string => s.join('');

export function unstatedChoiceText(choice: UnstatedChoice, t: Translate): string {
  const another = t('actions.another');
  switch (choice.kind) {
    case 'equal-pair': {
      const drawn = choice.pairs.map((p) => `${seg(p[0])} = ${seg(p[1])}`).join(', ');
      const first = choice.pairs[0];
      const pair = `${seg(first[0])}=${seg(first[1])}`;
      const stateIt = choice.shape === 'isosceles' ? t('steps.stateIsosceles', { ids: choice.ids.join(''), pair }) : t('steps.stateKite', { pair });
      return t('steps.unstatedEqualPair', { drawn, stateIt, another });
    }
    case 'free-endpoint': {
      const drawn = t('steps.stateOnSide', { point: choice.point, side: seg(choice.side) });
      return t('steps.unstatedFreeEndpoint', { point: choice.point, drawn, parallel: t('steps.drawnParallel', { a: seg([choice.ids[3], choice.point]), b: seg(choice.parallelTo) }), stateIt: drawn, another });
    }
    case 'parallel-pair': {
      const drawn = t('steps.drawnParallel', { a: seg(choice.parallel[0]), b: seg(choice.parallel[1]) });
      const legs = choice.legs.map(seg).join(', ');
      return t('steps.unstatedParallelPair', { drawn, legs, stateIt: t('steps.stateParallel', { a: seg(choice.parallel[0]), b: seg(choice.parallel[1]) }) });
    }
  }
}
