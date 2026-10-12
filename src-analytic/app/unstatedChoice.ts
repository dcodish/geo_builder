/**
 * #1864 ([ADR-AG-267](../../docs/06c-decisions-analytic.md#adr-ag-267)) — the SENTENCE for an unstated choice, in the
 * student's language: what is drawn now, a line that pins it (one this tool READS — the lock types each one back
 * through `decideSubmit`), and the button that cycles it.
 *
 * The analytic mirror of 2-D's `src/ui/unstatedChoice.ts`. A product-local copy by design (docs/22 §9, the second
 * copy stays local): the wording is held equal to 2-D's by the shared vocabulary lock
 * (`shell/__tests__/suite-vocabulary.test.ts`), never by sharing a string. The obtuse-vertex and axes templates are
 * analytic's own — 2-D reads neither sentence — in the frame the operator approved on 2026-10-08 (W3).
 */
import type { UnstatedChoice } from '../engine/unstatedChoices';

/** The i18next `t` shape this needs — kept minimal so the builder is testable without React. */
export type Translate = (key: string, opts?: Record<string, string>) => string;

const seg = (s: readonly [string, string]): string => s.join('');

export function unstatedChoiceText(choice: UnstatedChoice, t: Translate): string {
  const another = t('another');
  switch (choice.kind) {
    case 'equal-pair': {
      const drawn = choice.pairs.map((p) => `${seg(p[0])} = ${seg(p[1])}`).join(', ');
      const [first] = choice.pairs;
      // 2-D's #997 rule: the pin is the BARE equality, one fact on its own line.
      const stateIt = t('stateEqualPair', { pair: `${seg(first[0])}=${seg(first[1])}` });
      return t('unstatedEqualPair', { drawn, stateIt, another });
    }
    case 'parallel-pair': {
      const [a, b] = choice.parallel.map(seg);
      const drawn = t('drawnParallel', { a, b });
      const stateIt = t('stateParallel', { a, b });
      if (!choice.legs) return t('unstatedParallelPairPlain', { drawn, stateIt });
      return t('unstatedParallelPair', { drawn, legs: choice.legs.map(seg).join(', '), stateIt });
    }
    case 'obtuse-vertex':
      return t('unstatedObtuse', {
        drawn: t('drawnObtuse', { v: choice.vertex }),
        stateIt: t('stateObtuse', { v: choice.vertex }),
        another,
      });
    case 'axes': {
      const groups = [
        ...(choice.onX.length > 0 ? [t('drawnAxis', { points: choice.onX.join(', '), axis: 'x' })] : []),
        ...(choice.onY.length > 0 ? [t('drawnAxis', { points: choice.onY.join(', '), axis: 'y' })] : []),
      ];
      // A vertex whose axis is still open — never one a stated line already placed.
      const point = choice.open[0] ?? [...choice.onX, ...choice.onY][0];
      const axis = choice.onX.includes(point) ? 'x' : 'y';
      return t('unstatedAxes', { drawn: groups.join('; '), stateIt: t('stateAxis', { point, axis }), another });
    }
  }
}
