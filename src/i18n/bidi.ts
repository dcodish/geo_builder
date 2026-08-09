/**
 * Bidi isolation for LTR technical runs embedded in RTL sentences — issue #464.
 *
 * The UI is RTL Hebrew by default, and our messages routinely splice an LTR technical run into a Hebrew
 * sentence: a canonical utterance, a label, a formula. The Unicode bidi algorithm resolves a NEUTRAL
 * character (`∠`, `⊥`, `∥`, `=`, `·`) sitting between an RTL run and an LTR run to the PARAGRAPH
 * direction — RTL — so a leading `∠` is laid out on the far side of the letters it belongs to. The
 * operator saw exactly that: `∠BAC = 50` rendered with the glyph detached to the wrong end.
 *
 * The word forms this replaced (`זווית BAC = 50`) hid the problem because they START with a strong RTL
 * character, so nothing neutral ever had to be resolved.
 *
 * An isolate says "lay this substring out on its own, LTR, and do not let it interact with the
 * surrounding direction" — which is precisely the intent, and unlike the older embedding controls
 * (LRE/PDF) it cannot leak if the string is truncated. Both characters are zero-width and invisible;
 * they affect layout only, never the text's value.
 *
 * Apply at the INTERPOLATION site, never inside the value itself: a canonical utterance is re-parsed by
 * `parse()` in its own round-trip test, and baking layout characters into it would make the string mean
 * something different from what the student would type.
 */
const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

/** Wrap an LTR technical run so a surrounding RTL sentence cannot reorder its neutral characters. */
export function ltrIsolate(s: string): string {
  return `${LRI}${s}${PDI}`;
}
