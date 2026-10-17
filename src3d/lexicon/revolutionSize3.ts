/**
 * #2076 ([ADR-3D-363](../../docs/06b-decisions-3d.md#adr-3d-363)) — THE SIZE NOUNS OF A SOLID OF REVOLUTION.
 *
 * A cone, cylinder or sphere declaration reads two size slots: its radius and its height (`RADIUS_SLOT` /
 * `HEIGHT_SLOT` in `parse3.ts`). Every OTHER way of stating a size (a diameter, a slant height, a volume, an
 * area, or any size on its own line) is recognised by these nouns, so it is refused with the one «in development»
 * size sentence instead of whichever mechanism failed first (the honesty gate, the model lane, a raw engine id).
 *
 * Spellings only, like `nouns3.ts`: this module imports nothing and lowers nothing. The noun PHRASE is the
 * unit, never a lone word — «שטח הבסיס» names a cone's base only beside a solid noun (a pyramid has a base too),
 * while «יוצר» / «אורך היוצר» is the cone's alone, so it needs no solid noun.
 */

/** The solids of revolution, Hebrew. */
export const REV_SOLID_HE = String.raw`(?:חרוט|גליל|כדור)`;
/** The solids of revolution, English. */
export const REV_SOLID_EN = String.raw`(?:cone|cylinder|sphere)`;

/** A size noun standing before its solid («רדיוס החרוט», «שטח המעטפת של הגליל»). */
export const REV_SIZE_NOUN_HE = String.raw`(?:רדיוס(?:\s+ה?בסיס)?|קוטר(?:\s+ה?בסיס)?|גובה|אורך\s+ה?יוצר|יוצר|נפח|שטח\s+ה?בסיס|שטח\s+ה?מעטפת|שטח\s+ה?פנים(?:\s+ה?כולל)?)`;
/** The cone-only size noun: it names the cone with no solid noun beside it («אורך היוצר 5»). */
export const REV_CONE_ONLY_NOUN_HE = String.raw`(?:אורך\s+ה?יוצר|יוצר)`;
/** A size noun standing before its solid, English ("the slant height of the cone"). */
export const REV_SIZE_NOUN_EN = String.raw`(?:(?:base\s+)?radius|(?:base\s+)?diameter|slant\s+height|height|volume|base\s+area|lateral\s+(?:surface\s+)?area|(?:total\s+)?surface\s+area)`;

/**
 * The size clauses INSIDE a declaration that its two slots do not read — the possessive forms («שקוטרו 4»,
 * «ויוצרו 5», «ונפחו 10π», «שאורך היוצר שלו 5») and their English twins ("with diameter 4", "slant height 5").
 * The radius and height possessives («שרדיוסו», «וגובהו») are the slots and are not listed.
 */
export const REV_UNREAD_SLOT_HE = String.raw`(?:קוטרו|קוטר\s+ה?בסיסו?|יוצרו|אורך\s+ה?יוצר(?:\s+שלו)?|נפחו|שטח\s+(?:ה?בסיסו|ה?מעטפתו|ה?פנים\s+שלו|פניו))`;
/** The English unread size clauses (a "slant height" is read before the bare "height" slot can take it). */
export const REV_UNREAD_SLOT_EN = String.raw`(?:(?:base\s+)?diameter|slant\s+height|volume|base\s+area|lateral\s+(?:surface\s+)?area|(?:total\s+)?surface\s+area)`;
