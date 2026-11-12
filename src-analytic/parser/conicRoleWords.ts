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
  /** #1863 (ADR-AG-377): the centre offer's sentence «<letter> מרכז האליפסה», read back by `readRoleRef`'s `centre` role. */
  ellipseCentre: 'מרכז האליפסה',
  /**
   * #2851 (ADR-AG-465): the focus offer's sentences — «<letter> מוקד הפרבולה» (#1432), «<letter> מוקד <side> של האליפסה»
   * (#2616's side reader), each read back by `readRoleRef`'s `focus` role.
   */
  parabolaFocus: 'מוקד הפרבולה',
  ofEllipse: 'של האליפסה',
  side: { right: 'ימני', left: 'שמאלי', top: 'עליון', bottom: 'תחתון' },
} as const;
