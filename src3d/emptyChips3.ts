/**
 * #1446 (ADR-3D-288) — THE empty-state chips: the one list `App3` renders on an empty canvas.
 *
 * docs/28 D9b: the chips are "the most popular commands that a user can click and see build without
 * data entry". They are shown ONLY while `facts.length === 0`, so a chip that presumes a figure
 * («M אמצע BB'») can never succeed from where it is offered. Every entry here must therefore be
 * SELF-CONTAINED — it starts a figure on an empty canvas — which `empty-chips-1446.test.ts` locks
 * by running this very list (both locales) through `decideSubmit3`.
 *
 * The chip submits the RAW translation (`postProcess: []`, #751/ADR-W-029): the bidi isolates are
 * for display only and never enter the fact list.
 */
import type { TFunction } from 'i18next';

export const EMPTY_STATE_CHIP_KEYS = ['ex1', 'ex2', 'ex3', 'ex4'] as const;

/** The raw command each empty-state chip submits, in the active locale of `t`. */
export const emptyStateChips3 = (t: TFunction): string[] =>
  EMPTY_STATE_CHIP_KEYS.map((k) => t(`examples.${k}`, { postProcess: [] }) as string);
