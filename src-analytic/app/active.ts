/**
 * THE ACTIVE PROJECTION (#1548, docs/28 D6) — what the figure is folded from.
 *
 * The store keeps every line the student wrote plus the indexes they MUTED. Disable answers *"what
 * if I hadn't said this?"*, so a muted line stays in the list and out of the figure. Every figure
 * consumer — `derive`, `decideSubmit`, the fallback, «הציגו תצורה אחרת», the ask lane — takes the
 * active lines, and they need no knowledge of muting at all: to each of them a muted line simply was
 * never said. That is the honest counterfactual, and it is why muting lives HERE rather than as a
 * flag threaded through the engine.
 *
 * The one thing that must translate back is the ROW: a derivation's per-line results (faults, the
 * names the tool chose) are indexed in the active list, and the fact list shows the whole one.
 * `rowOf` is that translation, in one place.
 */

/** The lines that build the figure: every line not muted, in order. */
export const activeOf = (lines: readonly string[], disabled: readonly number[]): string[] =>
  lines.filter((_, i) => !disabled.includes(i));

/** For each ACTIVE index, the full-list row it came from. `rowOf(...)[k]` is the row of active line k. */
export const rowOf = (count: number, disabled: readonly number[]): number[] => {
  const rows: number[] = [];
  for (let i = 0; i < count; i++) if (!disabled.includes(i)) rows.push(i);
  return rows;
};
