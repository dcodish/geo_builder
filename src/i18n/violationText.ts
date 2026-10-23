/**
 * #2305 ([ADR-755](../../docs/06-decisions.md#adr-755)) — the WORDS of the figure's requirement lines and notices.
 *
 * The verifier (`engine/verify.ts`) hands each unmet requirement over as `messageKey` + `params`, and the params that
 * name a circle as `circleSlots` (param → circle id). This is the one place they are rendered, so the App and the
 * locks read the same decision: the constraint vocabulary is translated (`translateParams`, #413), and each circle
 * slot is worded through `circleRefs` → `circleText` — one of a concentric pair reads «המעגל הפנימי», every other
 * circle keeps today's letter.
 */
import type { ForcedOffArc, GivenViolation } from '@/engine';
import { circleText, circleTokenResolver, wordCircleSlots, type CircleRefs, type CircleT } from './circleText';
import { sanitizeIds, translateParams } from './humanizeError';

/** One requirement line, worded. `refs` is `circleRefs(construction)` of the figure the line is about. */
export function violationText(v: GivenViolation, t: CircleT, refs?: CircleRefs): string {
  const resolve = circleTokenResolver(refs, sanitizeIds);
  const params = translateParams(v.params, t, resolve) ?? {};
  const slots = Object.keys(v.circleSlots ?? {});
  const worded = slots.length ? wordCircleSlots(params, slots, (s) => refs?.get(v.circleSlots![s]), t) : params;
  return t(v.messageKey, worded);
}

/** The «the construction forces it there» notice for a point on the undrawn part of a circle. */
export function offArcNoticeText(f: ForcedOffArc, t: CircleT, refs?: CircleRefs): string {
  return t('figure.offArcNotice', { point: f.point, circle: circleText(refs?.get(f.circle), f.circle.replace(/^circle-/, ''), t).circle });
}
