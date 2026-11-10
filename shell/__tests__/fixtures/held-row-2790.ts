/**
 * #2790 ([ADR-W-204](../../../docs/06w-decisions-workspace.md#adr-w-204), building
 * [ADR-W-200](../../../docs/06w-decisions-workspace.md#adr-w-200)) — A LINE THE FIGURE ALREADY HOLDS IS ACCEPTED AS ITS OWN
 * ROW, WITH ONE NOTICE, IN EVERY BUILDER (operator 2026-11-09: *"if user enters an input that is already existing in the
 * diagram, it should be accepted but with a notice that it already exists. this should be on all tools."*).
 *
 * The shared half of a per-builder lock (the re-based #1990 table, `already-drawn-1990.ts`). Each tree drives these
 * sequences through its OWN decision in `<tree>/__tests__/already-drawn-1990.test.ts` and asserts, per sequence:
 *  (i) the last line appends exactly one row; (ii) it carries {@link HELD_NOTICE}; (iii) no point moves at 4 seeds;
 *  (iv) after unticking, then deleting, the row `earlier` names, the restated row still holds.
 * Controls answer differently: a contradiction is refused; a muted twin re-ticks with no notice; a pinning value
 * records with no notice.
 *
 * Shell may not import a product tree (ADR-W-016 rule 2). Test-only.
 */

export type HeldProduct = '2d' | '3d' | 'complex' | 'analytic';

/** The one notice, new text of the session's (ADR-W-174), recorded with `judgments.mjs chose`. */
export const HELD_NOTICE = {
  key: 'suite.notice.alreadyHeld',
  he: 'זה כבר קיים באיור — נוסף כנתון נפרד.',
  en: "That's already on the figure — added as a separate given.",
} as const;

export interface HeldCase {
  /** the lines, typed in order; the LAST restates what the figure holds */
  lines: string[];
  /** the 0-based index of the earlier line the last one restates — unticked, then deleted, in (iv); absent = not asked */
  earlier?: number;
  why: string;
}

/** 2-D's cases (#2790 §1 and #2795 §1): exact repeats, other spellings, held values, held operand ink. */
export const HELD_CASES_2D: readonly HeldCase[] = [
  { lines: ['ריבוע ABCD', 'ריבוע ABCD'], why: 'an exact repeat of a shape' },
  { lines: ['משולש ABC', 'AB = AC', 'AB = AC'], earlier: 1, why: 'an exact repeat of a relation (moved 5/5 when forced, #2795 H1)' },
  { lines: ['ריבוע ABCD', 'AB = 3', 'AB = 3'], earlier: 1, why: 'an exact repeat of a value' },
  { lines: ['משולש ABC', 'זווית ABC = 90', 'זווית ABC = 90'], earlier: 1, why: 'an exact repeat of a right angle' },
  { lines: ['משולש ABC', 'זווית ABC = 90', 'AB ⟂ BC'], earlier: 1, why: 'another spelling (ADR-542)' },
  { lines: ['משולש ABC', 'AB = AC', 'זווית ABC = זווית ACB'], earlier: 1, why: 'the base angles of an isosceles triangle' },
  { lines: ['ריבוע ABCD', 'זווית DAB = 90'], why: 'a held VALUE that recorded silently' },
  { lines: ['ריבוע ABCD', 'AB = 3', 'AC = 3√2'], why: 'a held VALUE with its operand ink (operator 2026-11-10: drawn and marked)' },
  { lines: ['טרפז שווה שוקיים ABCD', 'AC = BD'], why: 'held operand ink — moved 0.46 at seed 0 (#2795 H3)' },
  { lines: ['טרפז ABCD', 'AD = BC', 'AC = BD'], earlier: 1, why: 'a consequence of an earlier line (#2795 H3)' },
  { lines: ['משולש ABC', 'D על AB', 'D על BA'], earlier: 1, why: 'a reversed rider — moved D up to 3.3 (#2795 H2)' },
];

/** 3-D's cases ([ADR-3D-484](../../../docs/06b-decisions-3d.md#adr-3d-484)): the #1990 / ADR-3D-449 lines that answered
 *  «כבר קיים» with no row, and #2795's mover. 2-D's plane lines ride the same 3-D grammar where 3-D reads them. */
export const HELD_CASES_3D: readonly HeldCase[] = [
  { lines: ['ריבוע ABCD', 'ריבוע ABCD'], why: 'an exact repeat of a shape (the ruling’s own line)' },
  { lines: ['פירמידה SABC', 'משולש ABC', 'משולש ABC'], why: 'an exact repeat of a face' },
  { lines: ['פירמידה SABC', 'זווית ABC = 90', 'זווית ABC = 90'], earlier: 1, why: 'an exact repeat of a right angle' },
  { lines: ['ריבוע ABCD', 'מרובע ADCB'], why: 'a ring restated in another reading (#1953)' },
  { lines: ['משולש ABC', 'AB = AC', 'AB = AC'], earlier: 1, why: 'an exact repeat of a relation' },
  { lines: ['משולש ABC', 'זווית ABC = 90', 'AB ⟂ BC'], earlier: 1, why: 'another spelling' },
  { lines: ['משולש ABC', 'AB = AC', 'זווית ABC = זווית ACB'], earlier: 1, why: 'the base angles — moved 1e-3 before #2795 (ADR-3D-483)' },
  { lines: ['ריבוע ABCD', 'זווית DAB = 90'], why: 'a held VALUE' },
  { lines: ["קוביה ABCDA'B'C'D'", 'AB = 3', 'AC = 3√2'], why: 'a held VALUE with its operand ink (operator 2026-11-10: drawn and marked)' },
  { lines: ['טרפז שווה שוקיים ABCD', 'AC = BD'], why: 'held operand ink' },
  { lines: ['משולש ABC', 'D על AB', 'D על BA'], earlier: 1, why: 'a reversed rider' },
  { lines: ['A(0,0,0)', 'B(√2,0,0)', 'B=(√2,0,0)'], earlier: 1, why: 'stated numbers restated (#2341)' },
  { lines: ["קובייה ABCDA'B'C'D'", 'AB ∥ CD'], why: 'a relation the solid holds (#2341)' },
  { lines: ['מעוין ABCD', 'AC ⟂ BD'], why: 'a relation the shape holds by construction' },
  { lines: ['מרובע ABCD', 'פירמידה ABCDS', 'פירמידה ABCDS'], earlier: 1, why: 'an exact repeat that creates a point (the fold steps it aside while its twin stands)' },
  { lines: ['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB', 'M אמצע AB'], earlier: 2, why: 'an exact repeat of a construction' },
];
