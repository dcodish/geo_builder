/**
 * #2893 ([ADR-W-210](../docs/06w-decisions-workspace.md#adr-w-210) phase 4, invariant 3) — "NOT DECIDED": the third
 * outcome of a search, beside a verdict and a refusal. A search that reached its work limit (`shell/workLimit`)
 * without a solution says so, and carries what it needs to go on FROM WHERE IT STOPPED (`resume`: opaque to everything
 * but the search that made it — the seeds or configurations already tried, so a next round does not repeat them).
 *
 * The rules every builder follows (operator, 2026-11-13 and 2026-11-14, #2893):
 *   - it is never a verdict and never a refusal that names a statement;
 *   - it is never cached in a memo as a verdict, never stored as a fact, never in the undo history as a commit;
 *   - the page shows «עדיין לא נמצא פתרון — החיפוש נעצר אחרי כ-10 שניות.» with «המשיכו לחפש» (`suite.notDecided`,
 *     `frame/NotDecidedNote`), and the button runs one more round of the same size from `resume`;
 *   - a typed line whose search stopped stays in the box and is not added.
 * It crosses the worker client as plain data (`structuredClone`).
 */
export interface NotDecided<R = unknown> {
  readonly kind: 'not-decided';
  /** What the search needs to go on from where it stopped. Opaque here. */
  readonly resume: R;
  /** The units the round spent (the work meter's unit), for the record. */
  readonly spent: number;
}

export const notDecided = <R>(resume: R, spent: number): NotDecided<R> => ({ kind: 'not-decided', resume, spent });

export const isNotDecided = (v: unknown): v is NotDecided => typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'not-decided';
