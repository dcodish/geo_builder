/**
 * THE FORCED-NARROWING NOTE'S FACE (#2266, ADR-W-180): the blue information strip, opened by the ⓘ, in every builder.
 *
 * Operator, 2026-10-16: *"no other tool as that symbol so we need same messages across tools"*, then *"2266 - A"*:
 * keep the ⓘ everywhere, as 2-D has it. The sentence was already one family (`shell/narrowing.ts`, ADR-W-129); the mark
 * and the colour were each builder's own, which is how analytic came to draw it amber and 3-D to lose the ⓘ. They live
 * here so they cannot differ again. The sentence is the caller's, through its own locale: this file holds no string.
 */
export { InfoNote as NarrowingNote } from './Banner';
