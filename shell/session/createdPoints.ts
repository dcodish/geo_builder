/**
 * #1467 ([ADR-W-162](../../docs/06w-decisions-workspace.md#adr-w-162); operator ruling 2026-09-27, "Create everywhere
 * + notice", follow-up "Notice with one-click undo") — ONE created-points notice in every builder.
 *
 * A sentence that refers to a point the figure does not have yet creates it as a free point, and the tool says so:
 * «נוצרה נקודה חדשה X — אם זו טעות הקלדה, לחצו ✕ לביטול השורה». The notice is the typo guard that replaced the
 * old refusals (3-D's #840 guard, analytic's ADR-AG-015 rule): a mistyped letter is now created, and the notice is
 * the only signal, so its ✕ removes the whole line — and with it the points, because every builder derives
 * positions from its list of lines.
 *
 * Shell owns the WORDING (suite keys, so the text cannot differ by construction) and the CONTRACT below; each
 * builder owns WHICH points a line created by reference and HOW its line is removed. A line that DECLARES its own
 * points («משולש ABC», «קטע AB», «נקודה C», coordinates, a solid, a complex definition's left side) announces
 * nothing, and a line's own subject (M in «M אמצע AB») is never named.
 */

/** The suite keys of the notice. `one` / `many` interpolate `{{names}}`; `undo` is the ✕ button's accessible name. */
export const CREATED_NOTICE_KEYS = {
  one: 'suite.notice.createdPoint',
  many: 'suite.notice.createdPoints',
  undo: 'suite.notice.createdUndo',
} as const;

/** What a builder's notice shows: the created labels, in the order the line named them. */
export interface CreatedNotice {
  readonly names: readonly string[];
}

/** The key and interpolation for a notice — singular for one point, plural otherwise. */
export function createdNoticeText(names: readonly string[]): { key: string; params: { names: string } } {
  return { key: names.length === 1 ? CREATED_NOTICE_KEYS.one : CREATED_NOTICE_KEYS.many, params: { names: names.join(', ') } };
}

/**
 * The §5c contract (docs/28): what a builder exposes so the shared suite
 * (`shell/__tests__/fixtures/created-notice-rows.ts`) can drive its REAL submit path. Not a test double — each tree's
 * lock wires the methods to the store actions its App calls.
 */
export interface CreatedPointsAdapter {
  /** Return to an empty canvas. */
  reset(): void;
  /** Submit one line through the product's real submit path (the Enter key's). */
  submit(line: string): void | Promise<void>;
  /** What the notice would show now, or null when there is none. */
  lastCreated(): CreatedNotice | null;
  /** What the notice's ✕ does. */
  undoLastLine(): void;
  /** The figure's point labels now. */
  pointNames(): string[];
  /** How many lines the list holds now. */
  lineCount(): number;
}
