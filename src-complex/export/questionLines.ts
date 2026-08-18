/**
 * The «נתון:» list for the complex builder's question export (#745) — one line per ENABLED statement,
 * in entry order, exactly as the student typed it.
 *
 * Here the mapping is as direct as it gets: this tool's source of truth already IS an ordered list of
 * statements (`z1 = 3+4i`, `w = z1*z2`, `z^5 = w^2`), each of which is a given. There is nothing to
 * classify and nothing to summarise — unlike 2-D, where a submission lowers to several commands and
 * some of them are pure ink (ADR-252). Disabled statements are excluded for the reason the fact list
 * mutes them: a muted statement is one the student took OUT of the figure (B5/D6).
 *
 * Kept as a named module rather than an inline `.filter()` at the call site so the rule has one home
 * and a test can address it — the three builders answer the same question and each answers it once.
 */

/**
 * @param lines the store's ordered statements
 * @param disabled the store's DISABLED indexes — they name positions, not texts (the store's own
 *   convention, preserved across removals), so membership is by index and duplicate texts cannot
 *   silently mute one another.
 */
export function questionLines(lines: readonly string[], disabled: readonly number[] = []): string[] {
  const off = new Set(disabled);
  return lines.filter((line, i) => !off.has(i) && line.trim() !== '').map((line) => line.trim());
}
