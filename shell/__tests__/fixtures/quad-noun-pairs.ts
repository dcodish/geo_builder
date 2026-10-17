/**
 * TWO SHAPE NOUNS ON ONE QUADRILATERAL, ONE ANSWER IN EVERY BUILDER (#2169 / #2171 / #2180,
 * [ADR-W-131](../../../docs/06w-decisions-workspace.md#adr-w-131)) — the shared rows.
 *
 * Operator rulings of 2026-10-16: *"Analytic and 3-D give 2-D's answers"* (ballot round 4, card 1, A) — the same
 * refusals and the same «became a square» notice — and «טרפז שווה שוקיים ABCD» · «טרפז ישר זווית ABCD», in either
 * order, is refused in all three builders, 2-D included, naming a declared isosceles or right trapezoid with its
 * adjective (ballot round 5, card 1, A).
 *
 * Every ordered pair of the nine nouns every builder knows, plus the three-noun rows (#2180's scope note). The values
 * are 2-D's MEASURED answers (after the adjective fix), written out — never derived from the lattice the builders
 * read (`shell/narrowing.ts`), so the lock is not circular. `last` is what the LAST line did:
 * - `restates` — accepted, and no row added («כבר קיים» / already known / already stated);
 * - `refines` — recorded as a new row;
 * - `refused` — refused with `refusal`, the exclusion sentence, word for word.
 * `notes` are the ring notes on screen after the sequence (the merge note; a forced narrowing never fires here).
 * The `builds` verdict of geo-input-parity cannot tell `restates` from `refines`, which is how «ריבוע ABCD» ·
 * «דלתון ABCD» recording a second row in analytic survived it.
 *
 * Each tree hands its REAL submit path over as a {@link PairGate} (`src/app/__tests__/quad-noun-pairs-2169.test.ts`,
 * `src3d/__tests__/quad-noun-pairs-2169.test.ts`, `src-analytic/__tests__/quad-noun-pairs-2169.test.ts`), and
 * `shell/__tests__/quad-noun-pairs-meta-2169.test.ts` proves the check catches a broken gate.
 */

export type Builder = '2d' | '3d' | 'analytic';

export type Last = 'restates' | 'refines' | 'refused';

/** What a builder did with a sequence: the last line's outcome, its refusal text, and the ring notes shown after it. */
export interface PairVerdict {
  last: Last;
  /** the refusal sentence, Hebrew, bidi isolates removed — only for `refused` */
  refusal?: string;
  /** the ring notes shown after the sequence (merge / narrowing), plus any «adds nothing» notice, as read */
  notes: string[];
  /** every earlier line was accepted */
  earlierAccepted: boolean;
}
export type PairGate = (steps: readonly string[]) => PairVerdict | Promise<PairVerdict>;

export interface PairRow {
  /** the nouns, each stated over «ABCD» on its own line, in order */
  nouns: readonly string[];
  last: Last;
  refusal?: string;
  notes?: readonly string[];
  /** a known gap: the row FAILS in that builder today and names its open issue — "move it" when it passes */
  gap?: Partial<Record<Builder, number>>;
}

/** The exclusion sentence (2-D `errors.shapeExcluded`, 3-D `err.shapeLessSpecific`, analytic `errShapeExcluded`). */
const EXCL = (actual: string, stated: string) => `הצורה כבר ידועה כ־${actual} — ולכן אינה נקראת ${stated}. מחקו את הנתון הקודם אם התכוונתם ${stated}.`;
/** 2-D's merge note (#1993, ADR-656): «ABCD הוא כעת ריבוע, שהוא גם מלבן וגם מעוין.». */
const MERGED = (now: string, a: string, b: string) => `ABCD הוא כעת ${now}, שהוא גם ${a} וגם ${b}.`;

export const QUAD_NOUN_ROWS: readonly PairRow[] = [
  { nouns: ['מרובע', 'מרובע'], last: 'restates' },
  { nouns: ['מרובע', 'ריבוע'], last: 'refines' },
  { nouns: ['מרובע', 'מלבן'], last: 'refines' },
  { nouns: ['מרובע', 'מעוין'], last: 'refines' },
  { nouns: ['מרובע', 'מקבילית'], last: 'refines' },
  { nouns: ['מרובע', 'דלתון'], last: 'refines' },
  { nouns: ['מרובע', 'טרפז'], last: 'refines' },
  { nouns: ['מרובע', 'טרפז שווה שוקיים'], last: 'refines' },
  { nouns: ['מרובע', 'טרפז ישר זווית'], last: 'refines' },
  { nouns: ['ריבוע', 'מרובע'], last: 'restates' },
  { nouns: ['ריבוע', 'ריבוע'], last: 'restates' },
  { nouns: ['ריבוע', 'מלבן'], last: 'restates' },
  { nouns: ['ריבוע', 'מעוין'], last: 'restates' },
  { nouns: ['ריבוע', 'מקבילית'], last: 'restates' },
  { nouns: ['ריבוע', 'דלתון'], last: 'restates' },
  { nouns: ['ריבוע', 'טרפז'], last: 'refused', refusal: EXCL('ריבוע', 'טרפז') },
  { nouns: ['ריבוע', 'טרפז שווה שוקיים'], last: 'refused', refusal: EXCL('ריבוע', 'טרפז שווה שוקיים') },
  { nouns: ['ריבוע', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('ריבוע', 'טרפז ישר זווית') },
  { nouns: ['מלבן', 'מרובע'], last: 'restates' },
  { nouns: ['מלבן', 'ריבוע'], last: 'refines' },
  { nouns: ['מלבן', 'מלבן'], last: 'restates' },
  { nouns: ['מלבן', 'מעוין'], last: 'refines', notes: [MERGED('ריבוע', 'מלבן', 'מעוין')] },
  { nouns: ['מלבן', 'מקבילית'], last: 'restates' },
  { nouns: ['מלבן', 'דלתון'], last: 'refines', notes: [MERGED('ריבוע', 'מלבן', 'דלתון')] },
  { nouns: ['מלבן', 'טרפז'], last: 'refused', refusal: EXCL('מלבן', 'טרפז') },
  { nouns: ['מלבן', 'טרפז שווה שוקיים'], last: 'refused', refusal: EXCL('מלבן', 'טרפז שווה שוקיים') },
  { nouns: ['מלבן', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('מלבן', 'טרפז ישר זווית') },
  { nouns: ['מעוין', 'מרובע'], last: 'restates' },
  { nouns: ['מעוין', 'ריבוע'], last: 'refines' },
  { nouns: ['מעוין', 'מלבן'], last: 'refines', notes: [MERGED('ריבוע', 'מעוין', 'מלבן')] },
  { nouns: ['מעוין', 'מעוין'], last: 'restates' },
  { nouns: ['מעוין', 'מקבילית'], last: 'restates' },
  { nouns: ['מעוין', 'דלתון'], last: 'restates' },
  { nouns: ['מעוין', 'טרפז'], last: 'refused', refusal: EXCL('מעוין', 'טרפז') },
  { nouns: ['מעוין', 'טרפז שווה שוקיים'], last: 'refused', refusal: EXCL('מעוין', 'טרפז שווה שוקיים') },
  { nouns: ['מעוין', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('מעוין', 'טרפז ישר זווית') },
  { nouns: ['מקבילית', 'מרובע'], last: 'restates' },
  { nouns: ['מקבילית', 'ריבוע'], last: 'refines' },
  { nouns: ['מקבילית', 'מלבן'], last: 'refines' },
  { nouns: ['מקבילית', 'מעוין'], last: 'refines' },
  { nouns: ['מקבילית', 'מקבילית'], last: 'restates' },
  { nouns: ['מקבילית', 'דלתון'], last: 'refines', notes: [MERGED('מעוין', 'מקבילית', 'דלתון')] },
  { nouns: ['מקבילית', 'טרפז'], last: 'refused', refusal: EXCL('מקבילית', 'טרפז') },
  { nouns: ['מקבילית', 'טרפז שווה שוקיים'], last: 'refused', refusal: EXCL('מקבילית', 'טרפז שווה שוקיים') },
  { nouns: ['מקבילית', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('מקבילית', 'טרפז ישר זווית') },
  { nouns: ['דלתון', 'מרובע'], last: 'restates' },
  { nouns: ['דלתון', 'ריבוע'], last: 'refines' },
  { nouns: ['דלתון', 'מלבן'], last: 'refines', notes: [MERGED('ריבוע', 'דלתון', 'מלבן')] },
  { nouns: ['דלתון', 'מעוין'], last: 'refines' },
  { nouns: ['דלתון', 'מקבילית'], last: 'refines', notes: [MERGED('מעוין', 'דלתון', 'מקבילית')] },
  { nouns: ['דלתון', 'דלתון'], last: 'restates' },
  { nouns: ['דלתון', 'טרפז'], last: 'refused', refusal: EXCL('דלתון', 'טרפז') },
  { nouns: ['דלתון', 'טרפז שווה שוקיים'], last: 'refused', refusal: EXCL('דלתון', 'טרפז שווה שוקיים') },
  { nouns: ['דלתון', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('דלתון', 'טרפז ישר זווית') },
  { nouns: ['טרפז', 'מרובע'], last: 'restates' },
  { nouns: ['טרפז', 'ריבוע'], last: 'refused', refusal: EXCL('טרפז', 'ריבוע') },
  { nouns: ['טרפז', 'מלבן'], last: 'refused', refusal: EXCL('טרפז', 'מלבן') },
  { nouns: ['טרפז', 'מעוין'], last: 'refused', refusal: EXCL('טרפז', 'מעוין') },
  { nouns: ['טרפז', 'מקבילית'], last: 'refused', refusal: EXCL('טרפז', 'מקבילית') },
  { nouns: ['טרפז', 'דלתון'], last: 'refused', refusal: EXCL('טרפז', 'דלתון') },
  { nouns: ['טרפז', 'טרפז'], last: 'restates' },
  { nouns: ['טרפז', 'טרפז שווה שוקיים'], last: 'refines' },
  { nouns: ['טרפז', 'טרפז ישר זווית'], last: 'refines' },
  { nouns: ['טרפז שווה שוקיים', 'מרובע'], last: 'restates' },
  { nouns: ['טרפז שווה שוקיים', 'ריבוע'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'ריבוע') },
  { nouns: ['טרפז שווה שוקיים', 'מלבן'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'מלבן') },
  { nouns: ['טרפז שווה שוקיים', 'מעוין'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'מעוין') },
  { nouns: ['טרפז שווה שוקיים', 'מקבילית'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'מקבילית') },
  { nouns: ['טרפז שווה שוקיים', 'דלתון'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'דלתון') },
  { nouns: ['טרפז שווה שוקיים', 'טרפז'], last: 'restates' },
  { nouns: ['טרפז שווה שוקיים', 'טרפז שווה שוקיים'], last: 'restates' },
  { nouns: ['טרפז שווה שוקיים', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית') },
  { nouns: ['טרפז ישר זווית', 'מרובע'], last: 'restates' },
  { nouns: ['טרפז ישר זווית', 'ריבוע'], last: 'refused', refusal: EXCL('טרפז ישר זווית', 'ריבוע') },
  { nouns: ['טרפז ישר זווית', 'מלבן'], last: 'refused', refusal: EXCL('טרפז ישר זווית', 'מלבן') },
  { nouns: ['טרפז ישר זווית', 'מעוין'], last: 'refused', refusal: EXCL('טרפז ישר זווית', 'מעוין') },
  { nouns: ['טרפז ישר זווית', 'מקבילית'], last: 'refused', refusal: EXCL('טרפז ישר זווית', 'מקבילית') },
  { nouns: ['טרפז ישר זווית', 'דלתון'], last: 'refused', refusal: EXCL('טרפז ישר זווית', 'דלתון') },
  { nouns: ['טרפז ישר זווית', 'טרפז'], last: 'restates' },
  { nouns: ['טרפז ישר זווית', 'טרפז שווה שוקיים'], last: 'refused', refusal: EXCL('טרפז ישר זווית', 'טרפז שווה שוקיים') },
  { nouns: ['טרפז ישר זווית', 'טרפז ישר זווית'], last: 'restates' },
  { nouns: ['מלבן', 'מעוין', 'ריבוע'], last: 'restates', notes: [MERGED('ריבוע', 'מלבן', 'מעוין')] },
  { nouns: ['מקבילית', 'דלתון', 'מעוין'], last: 'restates', notes: [MERGED('מעוין', 'מקבילית', 'דלתון')] },
  { nouns: ['טרפז', 'טרפז שווה שוקיים', 'מלבן'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'מלבן') },
  { nouns: ['טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית'], last: 'refused', refusal: EXCL('טרפז שווה שוקיים', 'טרפז ישר זווית') },
];

/** The sequence a row types: each noun over «ABCD». */
export const stepsOf = (row: PairRow): string[] => row.nouns.map((n) => `${n} ABCD`);

/** Every fault of `gate` (builder `b`) against the rows; a gap row must still FAIL. */
export async function pairFaults(gate: PairGate, b: Builder, rows: readonly PairRow[] = QUAD_NOUN_ROWS): Promise<string[]> {
  const faults: string[] = [];
  for (const row of rows) {
    const steps = stepsOf(row);
    const v = await gate(steps);
    const wantNotes = row.notes ?? [];
    const problems: string[] = [];
    if (!v.earlierAccepted) problems.push('an earlier line was not accepted');
    if (v.last !== row.last) problems.push(`last line ${v.last}, expected ${row.last}`);
    if (row.last === 'refused' && v.refusal !== row.refusal) problems.push(`refusal ${JSON.stringify(v.refusal)}, expected ${JSON.stringify(row.refusal)}`);
    if (v.notes.length !== wantNotes.length || v.notes.some((n, i) => n !== wantNotes[i])) problems.push(`notes ${JSON.stringify(v.notes)}, expected ${JSON.stringify(wantNotes)}`);
    const label = `«${steps.join(' · ')}»`;
    if (row.gap?.[b]) {
      if (!problems.length) faults.push(`${label} passes in ${b} — the known gap #${row.gap[b]} closed: move it to a plain row`);
      continue;
    }
    if (problems.length) faults.push(`${label} in ${b}: ${problems.join('; ')}`);
  }
  return faults;
}
