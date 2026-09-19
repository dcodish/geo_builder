/**
 * The analytic builder's BIDI KIT, on its own module.
 *
 * It used to be one line inside `i18n/index.ts`, beside the resources and the i18next bootstrap. That
 * was fine while only `App.tsx` needed it — and it is exactly why the CANVAS never adopted it (#1191):
 * `render/scene.ts` is a pure module with no React and no i18n, and importing the bootstrap into it to
 * reach one function would have dragged i18next, every locale and the post-processor chain into the
 * renderer.
 *
 * So the kit moves out and `i18n/index.ts` re-exports it — every existing import is untouched, and the
 * renderer imports two lines instead of a bootstrap. Deliberately NOT injected on `SceneKnowledge`
 * (the alternative the issue offered): an injected isolator is one a caller can forget, and forgetting
 * is the entire defect. One instance, so `extraCore` cannot drift between the panel and the canvas —
 * two kits with different alphabets would isolate the same string two ways.
 */
import { makeBidi } from '../../shell/bidi';

/** The bidi kit — for composed (non-`t()`) strings, the canvas labels, and the palette drift lock. */
export const analyticBidi = makeBidi({ extraCore: '_' });
