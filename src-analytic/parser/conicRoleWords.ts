/**
 * The words an ellipse's role points are named by in a refusal or a panel label (#2616, ADR-AG-353) — the grammar's own
 * nouns, kept beside the parser that reads them rather than inline in the engine (the #2201 inline-Hebrew ratchet).
 * Imports nothing, so the engine modules that label a role can read it without a cycle.
 */
export const CONIC_ROLE_WORDS = {
  focus: 'מוקד',
  vertex: 'קודקוד',
  distance: 'מרחק',
  ellipseFocus: 'מוקד האליפסה',
  ellipseVertex: 'קודקוד האליפסה',
} as const;
