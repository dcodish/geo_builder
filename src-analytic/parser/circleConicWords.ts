/**
 * The words a circle-and-conic statement is named by in a refusal (#2618 PR 2, ADR-AG-360 / ADR-AG-361) — the grammar's
 * own nouns and verbs, kept beside the parser that reads them rather than inline in the engine (the #2201 inline-Hebrew
 * ratchet, as `conicRoleWords.ts`). Imports nothing, so the solver can read it without a cycle.
 */
export const CIRCLE_CONIC_WORDS = {
  circle: 'מעגל',
  ellipse: 'האליפסה',
  parabola: 'הפרבולה',
  touches: 'משיק ל',
  inscribedIn: 'חסום ב',
  circumscribes: 'חוסם את',
} as const;
