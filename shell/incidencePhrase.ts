/**
 * #2547 ([ADR-W-161](../docs/06w-decisions-workspace.md#adr-w-161)) — THE INCIDENCE-PHRASE OPENERS, ONE SPELLING OF
 * "THROUGH" FOR EVERY BUILDER.
 *
 * The words that open an incidence phrase on a carrier: «[ה|ש|ו]עובר דרך/ב X», bare «דרך X», «במרכז …»;
 * "(that) passes / passing / goes / runs through X", bare "through X". Moved here verbatim from 2-D's
 * `src/parser/lexicon.ts` (#2532, [ADR-765](../docs/06-decisions.md#adr-765)), which re-exports them, so 2-D's
 * incidence-phrase member (`src/app/unreadThrough.ts`) and analytic's arm 3 of the lost part
 * (`src-analytic/app/lostPart.ts`, ADR-AG-334) read ONE spelling — a third copy is never written (docs/22 §9).
 *
 * The VERB forms are the narrower atom: a bare «דרך» / "through" is also a fronted locative a rule may tolerate
 * («דרך הנקודה C העבירו משיק»), so only the verb opener is ever deleted alone. The `_HE` / `_EN` atoms are bare
 * alternations; `THROUGH_OPEN` / `THROUGH_VERB` carry the boundaries. No product knowledge lives here.
 */

/** No Latin letter before / after an English word (the same guards as 2-D's `EN_START` / `EN_END`). */
const EN_START = String.raw`(?<![A-Za-z])`;
const EN_END = String.raw`(?![A-Za-z])`;

export const THROUGH_VERB_HE = String.raw`[ושה]{0,2}עוב(?:ר|רת|רים|רות)\s+(?:דרך|ב-?(?=\S))`;
export const THROUGH_OPEN_HE = String.raw`${THROUGH_VERB_HE}|דרך|במרכז`;
export const THROUGH_VERB_EN = String.raw`(?:(?:that|which)\s+)?(?:pass(?:es|ing)?|go(?:es|ing)?|runs?|running)\s+through`;
export const THROUGH_OPEN_EN = String.raw`(?:(?:that|which)\s+)?(?:(?:pass(?:es|ing)?|go(?:es|ing)?|runs?|running)\s+)?through`;
/** The openers with their boundaries, both locales: no Hebrew letter before a Hebrew opener, no Latin letter around an English one. */
export const THROUGH_OPEN = String.raw`(?:(?<![א-ת])(?:${THROUGH_OPEN_HE})|${EN_START}(?:${THROUGH_OPEN_EN})${EN_END})`;
export const THROUGH_VERB = String.raw`(?:(?<![א-ת])(?:${THROUGH_VERB_HE})|${EN_START}(?:${THROUGH_VERB_EN})${EN_END})`;

/** A clause break: the phrase never runs past one (2-D's `[^,;.]*` phrase extent). */
const CLAUSE_BREAK = /[,;.]/;
const OPEN_AT_START = new RegExp(String.raw`^(?:${THROUGH_OPEN})\s*`, 'i');

/**
 * Is `text` ONE incidence phrase — an opener at its start, running to its end within one clause? Returns the opener
 * as typed and the point text after it, or null (no opener at the start, nothing after it, or a clause break inside).
 */
export function incidencePhraseAtStart(text: string): { opener: string; point: string } | null {
  const t = text.trim();
  if (CLAUSE_BREAK.test(t)) return null;
  const m = OPEN_AT_START.exec(t);
  if (!m) return null;
  const point = t.slice(m[0].length).trim();
  return point ? { opener: m[0].trim(), point } : null;
}

/**
 * Where the first opener in `text` starts, after at least one character of head text — the head is what comes
 * before it. -1 when the line holds no opener past its start.
 */
export function firstIncidenceOpener(text: string): number {
  const re = new RegExp(THROUGH_OPEN, 'gi');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (text.slice(0, m.index).trim()) return m.index;
    if (m[0].length === 0) re.lastIndex++;
  }
  return -1;
}
