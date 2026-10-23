/**
 * #2305 ([ADR-755](../../docs/06-decisions.md#adr-755)) — HOW A SENTENCE NAMES A CIRCLE.
 *
 * `circleRefs` (src/engine/circleRef.ts, ADR-552/714) is the one seam that knows how a circle is NAMED: by its
 * centre's letter, by its ADR-342 token, as the only circle, or — one of a concentric pair — by its ROLE
 * («המעגל החיצוני» / «המעגל הפנימי», operator ruling on #2264, 2026-10-16, option A). The values panel words that
 * reference in `render/valueRowText.ts`; this module is its twin for SENTENCES: a requirement line, a notice, a
 * refusal, a clarifying question, a menu title. Every one of those used to spell the name itself from the circle's
 * id or its centre letter, so the inner circle of a pair read «מעגל O-2» (the id's mint suffix) or «מעגל O» (its
 * sibling's name).
 *
 * The rule: a circle slot in a template takes a NOUN PHRASE, never a bare letter after a hard-coded «מעגל».
 *  - a role → the role phrase («המעגל הפנימי», "the inner circle");
 *  - anything else (a centre letter, a token, the only circle, or no reference at all) → TODAY'S LETTER inside
 *    today's words («מעגל O»), so every sentence about a circle that is not one of a pair is byte-identical.
 *
 * Hebrew needs three forms of the phrase, because the article and «ל» fuse with the noun: `circle` «מעגל O»,
 * `circleThe` «המעגל O», `circleTo` «למעגל O» (a role phrase is already definite: «המעגל הפנימי», «למעגל הפנימי»).
 *
 * Every phrase is rendered WITHOUT the bidi post-processor (`applyPostProcessor: false`): it is a fragment that
 * the caller's template interpolates, and the bidi pass runs once, on the whole sentence (#464). A fragment that
 * arrived pre-isolated would switch the outer pass off (`isolateLtrRuns` never nests).
 */
import type { CircleRef, Id } from '@/engine';

/** The subset of i18next's `t` this module needs. */
export type CircleT = (key: string, opts?: Record<string, unknown>) => string;

/** Circle references by circle id — `circleRefs(construction)`. */
export type CircleRefs = ReadonlyMap<Id, CircleRef>;

/** One circle to word: its reference (absent when the seam names none) and the letter today's text prints. */
export interface CircleItem {
  ref?: CircleRef;
  letter: string;
}

/** The noun-phrase forms of one circle a template slot can take. */
export interface CircleWords {
  /** «מעגל O» / «המעגל הפנימי» — "circle O" / "the inner circle" */
  circle: string;
  /** «המעגל O» / «המעגל הפנימי» — after a construct noun («במרכז המעגל O», «רדיוס המעגל O = 4») */
  circleThe: string;
  /** «למעגל O» / «למעגל הפנימי» — after «מחוץ» */
  circleTo: string;
}

const RAW = { applyPostProcessor: false } as const;
const isRole = (ref: CircleRef | undefined): ref is Extract<CircleRef, { via: 'role' }> => ref?.via === 'role';

/** The noun phrases of one circle. A role is named by its role; every other circle keeps `letter` (today's text). */
export function circleText(ref: CircleRef | undefined, letter: string, t: CircleT): CircleWords {
  if (isRole(ref)) {
    const w = t(`circleName.${ref.role}`, RAW);
    return { circle: w, circleThe: w, circleTo: t(`circleName.${ref.role === 'outer' ? 'toOuter' : 'toInner'}`, RAW) };
  }
  return {
    circle: t('circleName.letter', { c: letter, ...RAW }),
    circleThe: t('circleName.theLetter', { c: letter, ...RAW }),
    circleTo: t('circleName.toLetter', { c: letter, ...RAW }),
  };
}

/** Two circles as one subject: «המעגלים O ו-P» when both keep a letter (today's text), else «המעגל החיצוני והמעגל הפנימי». */
export function circlePair(a: CircleItem, b: CircleItem, t: CircleT): string {
  if (!isRole(a.ref) && !isRole(b.ref)) return t('circleName.pairLetters', { a: a.letter, b: b.letter, ...RAW });
  return t('circleName.pair', { a: circleText(a.ref, a.letter, t).circle, b: circleText(b.ref, b.letter, t).circle, ...RAW });
}

/**
 * Word the CIRCLE SLOTS of a params bag: each slot `s` (whose current value is the letter today's text prints)
 * becomes its {@link CircleWords} — `s` (the `circle` form), `${s}The`, `${s}To`. A bag whose slots include both
 * `c1` and `c2` also gets `circlePair` ({@link circlePair}). Every other param is returned unchanged.
 */
export function wordCircleSlots(
  params: Record<string, string>,
  slots: readonly string[],
  refOf: (slot: string) => CircleRef | undefined,
  t: CircleT,
): Record<string, string> {
  const out = { ...params };
  for (const s of slots) {
    if (params[s] === undefined) continue;
    const w = circleText(refOf(s), params[s], t);
    out[s] = w.circle;
    out[`${s}The`] = w.circleThe;
    out[`${s}To`] = w.circleTo;
  }
  if (slots.includes('c1') && slots.includes('c2') && params.c1 !== undefined && params.c2 !== undefined)
    out.circlePair = circlePair({ ref: refOf('c1'), letter: params.c1 }, { ref: refOf('c2'), letter: params.c2 }, t);
  return out;
}

/**
 * A resolver from a circle's TEXT TOKEN — the circle id, or the letters `sanitizeIds` leaves of it (`circle-O-2` →
 * `O-2`) — to its reference. `sanitize` is passed in (humanizeError's `sanitizeIds`) so this module has no cycle
 * with it. A token two circles share resolves to neither: no circle is named by a guess.
 */
export function circleTokenResolver(refs: CircleRefs | undefined, sanitize: (s: string) => string): (token: string) => CircleRef | undefined {
  if (!refs || refs.size === 0) return () => undefined;
  const byToken = new Map<string, CircleRef | null>();
  const add = (k: string, ref: CircleRef) => byToken.set(k, byToken.has(k) && byToken.get(k) !== ref ? null : ref);
  for (const [id, ref] of refs) {
    add(id, ref);
    const s = sanitize(id);
    if (s !== id) add(s, ref);
  }
  return (token) => byToken.get(token) ?? undefined;
}

/** The context-menu title of a circle: «⊙ O» (today's text), or «⊙ המעגל הפנימי» for one of a concentric pair. */
export function circleMenuTitle(id: Id, refs: CircleRefs | undefined, t: CircleT): string {
  const ref = refs?.get(id);
  return isRole(ref) ? `⊙ ${t(`circleName.${ref.role}`, RAW)}` : id.replace(/^circle-/, '⊙ ');
}
