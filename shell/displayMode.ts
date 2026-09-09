/**
 * THE PARAMETER DISPLAY CHOICE — shared state shape for a cross-product pedagogy rule (#937,
 * ADR-W-047).
 *
 * The operator's ruling, 2026-09-08: *"if a point, line, vector, angle, segment size or anything is
 * defined by a parameter, and later in input we define that parameter, the user will have a chip
 * toggle where he can decide if he wants to see the parameter display or the value display. this chip
 * will be on the input line that defined the parameter - i.e. on the line with p=3."*
 *
 * A bagrut question is worked in PARTS: part 1 reasons with the letter and every line the student
 * writes is *about* «α», a later part supplies the value. The figure serves both, and which form
 * belongs on screen depends on where in the question the student is — which the tool cannot infer and
 * must not guess. So the default follows their last statement (the VALUE, once stated) and the chip
 * lets them go back.
 *
 * ## What this module is, and is not
 *
 * It is the state shape and its pure operations, nothing else. It carries no product knowledge, no
 * strings, and no opinion about which surfaces compete — that predicate is derived per product over
 * its own display builders, because *"compete" is a property of a SURFACE, not of the figure*
 * (operator, same ruling): an angle's two forms compete on the canvas ARC, a coordinate's compete in
 * the data PANEL, and a symbol nothing renders competes nowhere and gets no chip.
 *
 * ## Why it is keyed by FACT ID
 *
 * The chip rides the row that VALUED the parameter, so the choice is keyed by that fact's id — which
 * survives a reseed and a branch cycle, because the figure is derived from the fact list and the id is
 * not. That is what makes the ruling's *"show another config and save/reload should keep the choice"*
 * work without the choice living in anything a reseed rebuilds.
 *
 * It is a DISPLAY PREFERENCE and not a geometric fact, so it never enters the ordered fact list —
 * CLAUDE.md's source-of-truth rule is untouched. It sits beside `seed` in the store, in `partialize`,
 * and in the save file, exactly as each product's other display preferences do.
 */

/** Which form of a valued parameter a surface shows. */
export type DisplayMode = 'letter' | 'value';

/** fact id (the VALUING line) → the student's choice for it. Absent = the default. */
export type DisplayModeMap = Record<string, DisplayMode>;

/**
 * The default is the VALUE — today's behaviour in every product, and the ruling's own default once
 * the student has stated it. A file saved before this shipped carries no map and therefore loads
 * showing values, so there is no migration and the load audit stays green.
 */
export const DISPLAY_MODE_DEFAULT: DisplayMode = 'value';

/** The choice for one valuing fact. */
export function displayModeOf(map: DisplayModeMap | undefined, factId: string): DisplayMode {
  return map?.[factId] ?? DISPLAY_MODE_DEFAULT;
}

/** Flip one row's choice. Returns a NEW map (the store sets it as state). */
export function toggleDisplayMode(map: DisplayModeMap, factId: string): DisplayModeMap {
  return { ...map, [factId]: displayModeOf(map, factId) === 'value' ? 'letter' : 'value' };
}

/**
 * Drop entries whose fact is gone — a delete, a replace, a load.
 *
 * Left alone, a deleted row's choice would sit in the map for the session and ride the save file, and
 * a later fact minted with a recycled id would silently inherit a preference nobody set. Entries for
 * OTHER facts are untouched, so an undo that restores the fact restores its choice with the state,
 * exactly as it restores the facts themselves.
 */
export function pruneDisplayMode(map: DisplayModeMap, liveFactIds: Iterable<string>): DisplayModeMap {
  const live = new Set(liveFactIds);
  const out: DisplayModeMap = {};
  for (const [id, mode] of Object.entries(map)) if (live.has(id)) out[id] = mode;
  return out;
}

/** Parse a persisted map, dropping anything that is not a valid entry (the lenient-load posture). */
export function readDisplayMode(raw: unknown): DisplayModeMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: DisplayModeMap = {};
  for (const [id, mode] of Object.entries(raw as Record<string, unknown>)) {
    if (mode === 'letter' || mode === 'value') out[id] = mode;
  }
  return out;
}

/**
 * THE FILE'S HANDLE FOR A FACT IS ITS POSITION, NOT ITS ID.
 *
 * A fact id is minted per session (`nanoid`), and a load RE-PARSES the saved utterances into fresh
 * facts with fresh ids — that is the whole point of the save format: it stores what the student said,
 * not object identities, so an old file picks up parser and engine fixes automatically. An id-keyed
 * map therefore means nothing on the other side of a file, and a first cut of #937 lost the choice on
 * every reload while looking correct in the store (the round trip's own lock caught it).
 *
 * The stable handle across that boundary is the fact's INDEX in the ordered list, which is the file's
 * own source of truth. So the map is converted at the boundary and only there: the store stays
 * id-keyed, as the design requires for a reseed and a branch cycle, and the file stays index-keyed,
 * which is what survives re-parsing.
 */
export function displayModeToIndexed(map: DisplayModeMap, factIds: readonly string[]): Record<string, DisplayMode> {
  const out: Record<string, DisplayMode> = {};
  factIds.forEach((id, i) => {
    const mode = map[id];
    if (mode !== undefined && mode !== DISPLAY_MODE_DEFAULT) out[String(i)] = mode;
  });
  return out;
}

/** The inverse, against the freshly parsed facts. Out-of-range or unparsable indices are dropped. */
export function displayModeFromIndexed(raw: unknown, factIds: readonly string[]): DisplayModeMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: DisplayModeMap = {};
  for (const [k, mode] of Object.entries(raw as Record<string, unknown>)) {
    if (mode !== 'letter' && mode !== 'value') continue;
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= factIds.length) continue;
    out[factIds[i]] = mode;
  }
  return out;
}
