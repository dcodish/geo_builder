/**
 * THE FORCED-NARROWING NOTE, ONE SENTENCE IN EVERY BUILDER (#1996, ADR-W-129) — the shared rows (docs/28 §5c,
 * 04w "How a cross-product wiring guard is written").
 *
 * Operator rulings of 2026-10-13 (#1996, three ballots): a note whenever the givens force a narrower named kind
 * than the noun typed, whatever caused it; one cause-naming family; triangles too, except when the typed given
 * IS the right angle; several givens listed as typed; the statement typed first named; silent when only numeric
 * values force a kind on a plain «משולש» / «מרובע». #1899's circle rows (ruling 2026-10-08) are rows here.
 *
 * The decision lives once (`shell/narrowing.ts`); whether each builder WIRES it — its sample pool, its noun
 * reading, its cause search, its locale — is not visible from `shell/`. So each tree hands its REAL submit path
 * and its own text function over as a {@link NarrowGate} (`src/app/__tests__/narrowing-note-1996.test.ts`,
 * `src3d/__tests__/narrowing-note-1996.test.ts`, `src-analytic/__tests__/narrowing-note-1996.test.ts`), and
 * `shell/__tests__/narrowing-note-meta-1996.test.ts` proves these checks catch a broken gate.
 */

export type Builder = '2d' | '3d' | 'analytic';

/** What a builder did with a sequence: whether every line recorded, and the narrowing notes on screen after it. */
export interface NarrowGateVerdict {
  recorded: boolean;
  /** the forced-narrowing sentences shown, in the page's Hebrew, bidi isolates removed */
  notes: string[];
}
export type NarrowGate = (steps: readonly string[]) => NarrowGateVerdict | Promise<NarrowGateVerdict>;

export interface NarrowRow {
  steps: readonly string[];
  /** the exact Hebrew note, or null for a sequence that must stay silent */
  note: string | null;
  /** a builder that reads the sentence in another spelling (3-D's `|AB| = |BC|`, #1680) — steps and note as typed there */
  spelled?: Partial<Record<Builder, { steps: readonly string[]; note: string | null }>>;
  /** a builder that does not read the INPUT by design (an EXCEPTIONS family, docs/22 §10) — never run there */
  exception?: Partial<Record<Builder, string>>;
  /** a known gap: the row FAILS in that builder today and names its open issue — "move it" when it passes */
  gap?: Partial<Record<Builder, number>>;
}

const CIRCUM = 'כדי שהמעגל יעבור דרך כל הקודקודים';
const INCIRCLE = 'כדי שהמעגל יהיה משיק לכל הצלעות';
const note = (cause: string, ring: string, from: string, to: string, kindOf: string) => `${cause}, ${ring} הוגבל מ${from} ל${to} — ${kindOf}.`;
const P_RECT = (cause: string) => note(cause, 'ABCD', 'מקבילית', 'מלבן', 'מלבן הוא סוג של מקבילית');
const X8_CIRCLE_POINTS = 'X8 — 3-D does not read points stated on a circle (docs/22 §10)';
const X8_INCIRCLE = 'X8 — 3-D refuses a circle inside a quadrilateral (incircle-needs-triangle)';

export const NARROW_ROWS: readonly NarrowRow[] = [
  // ── a circle through every vertex (#1899's four pairs, every spelling) ──
  { steps: ['מקבילית ABCD', 'ABCD חסום במעגל'], note: P_RECT(CIRCUM) },
  { steps: ['מקבילית ABCD חסום במעגל'], note: P_RECT(CIRCUM) },
  { steps: ['מקבילית ABCD', 'מקבילית ABCD חסומה במעגל'], note: P_RECT(CIRCUM) }, // operator's T56, 2026-10-14
  { steps: ['מעוין ABCD', 'ABCD חסום במעגל'], note: note(CIRCUM, 'ABCD', 'מעוין', 'ריבוע', 'ריבוע הוא סוג של מעוין') },
  { steps: ['טרפז ABCD', 'ABCD חסום במעגל'], note: note(CIRCUM, 'ABCD', 'טרפז', 'טרפז שווה שוקיים', 'טרפז שווה שוקיים הוא סוג של טרפז') },
  { steps: ['דלתון ABCD', 'ABCD חסום במעגל'], note: note(CIRCUM, 'ABCD', 'דלתון', 'דלתון ישר־זווית', 'דלתון ישר־זווית הוא סוג של דלתון') },
  {
    steps: ['מעגל O', 'A, B, C ו-D על המעגל', 'AB = 3', 'BC = 4', 'מקבילית ABCD'], // operator's #1913 T1
    note: P_RECT(CIRCUM),
    exception: { '3d': X8_CIRCLE_POINTS },
  },
  { steps: ['ABCD חסום במעגל', 'מקבילית ABCD'], note: P_RECT(CIRCUM) }, // 2-D since ADR-656 (#1914)
  // ── a circle tangent to every side ──
  { steps: ['מלבן ABCD', 'מעגל חסום במלבן ABCD'], note: note(INCIRCLE, 'ABCD', 'מלבן', 'ריבוע', 'ריבוע הוא סוג של מלבן'), exception: { '3d': X8_INCIRCLE } },
  { steps: ['מקבילית ABCD', 'מעגל חסום במקבילית ABCD'], note: note(INCIRCLE, 'ABCD', 'מקבילית', 'מעוין', 'מעוין הוא סוג של מקבילית'), exception: { '3d': X8_INCIRCLE } },
  // ── one given ──
  {
    steps: ['מקבילית ABCD', 'AB = BC'],
    note: note('בגלל הנתון AB = BC', 'ABCD', 'מקבילית', 'מעוין', 'מעוין הוא סוג של מקבילית'),
    spelled: { '3d': { steps: ['מקבילית ABCD', '|AB| = |BC|'], note: note('בגלל הנתון |AB| = |BC|', 'ABCD', 'מקבילית', 'מעוין', 'מעוין הוא סוג של מקבילית') } },
  },
  { steps: ['מקבילית ABCD', 'זווית DAB = 90'], note: P_RECT('בגלל הנתון זווית DAB = 90') },
  {
    steps: ['מקבילית ABCD', 'AC = BD'],
    note: P_RECT('בגלל הנתון AC = BD'),
    spelled: { '3d': { steps: ['מקבילית ABCD', '|AC| = |BD|'], note: P_RECT('בגלל הנתון |AC| = |BD|') } },
  },
  {
    steps: ['מלבן ABCD', 'AB = BC'],
    note: note('בגלל הנתון AB = BC', 'ABCD', 'מלבן', 'ריבוע', 'ריבוע הוא סוג של מלבן'),
    spelled: { '3d': { steps: ['מלבן ABCD', '|AB| = |BC|'], note: note('בגלל הנתון |AB| = |BC|', 'ABCD', 'מלבן', 'ריבוע', 'ריבוע הוא סוג של מלבן') } },
  },
  {
    steps: ['טרפז ABCD', 'AD = BC'],
    note: note('בגלל הנתון AD = BC', 'ABCD', 'טרפז', 'טרפז שווה שוקיים', 'טרפז שווה שוקיים הוא סוג של טרפז'),
    spelled: { '3d': { steps: ['טרפז ABCD', '|AD| = |BC|'], note: note('בגלל הנתון |AD| = |BC|', 'ABCD', 'טרפז', 'טרפז שווה שוקיים', 'טרפז שווה שוקיים הוא סוג של טרפז') } },
  },
  { steps: ['טרפז ABCD', 'זווית DAB = 90'], note: note('בגלל הנתון זווית DAB = 90', 'ABCD', 'טרפז', 'טרפז ישר זווית', 'טרפז ישר זווית הוא סוג של טרפז') },
  // ── triangles (card 3) ──
  {
    steps: ['משולש שווה שוקיים ABC', 'זווית BAC = 60'],
    note: note('בגלל הנתון זווית BAC = 60', 'ABC', 'משולש שווה שוקיים', 'משולש שווה צלעות', 'משולש שווה צלעות הוא סוג של משולש שווה שוקיים'),
  },
  {
    steps: ['משולש ABC', 'AB = AC'],
    note: note('בגלל הנתון AB = AC', 'ABC', 'משולש', 'משולש שווה שוקיים', 'משולש שווה שוקיים הוא סוג של משולש'),
    spelled: { '3d': { steps: ['משולש ABC', '|AB| = |AC|'], note: note('בגלל הנתון |AB| = |AC|', 'ABC', 'משולש', 'משולש שווה שוקיים', 'משולש שווה שוקיים הוא סוג של משולש') } },
  },
  { steps: ['משולש ABC', 'זווית C = 90'], note: null }, // the typed right angle is the carve-out
  { steps: ['משולש שווה שוקיים ABC', 'זווית BAC = 90'], note: null },
  {
    steps: ['משולש ABC', 'זווית C = 90', 'AC = BC'], // follow-up card 10 (P6): start from the right triangle
    note: note('בגלל הנתון AC = BC', 'ABC', 'משולש ישר זווית', 'משולש ישר זווית שווה שוקיים', 'משולש ישר זווית שווה שוקיים הוא סוג של משולש ישר זווית'),
    spelled: { '3d': { steps: ['משולש ABC', 'זווית C = 90', '|AC| = |BC|'], note: note('בגלל הנתון |AC| = |BC|', 'ABC', 'משולש ישר זווית', 'משולש ישר זווית שווה שוקיים', 'משולש ישר זווית שווה שוקיים הוא סוג של משולש ישר זווית') } },
  },
  // ── several givens, listed as typed (card 5) and a circle with a given (card 6) ──
  {
    steps: ['משולש ABC', 'AB = BC', 'BC = AC'],
    note: note('בגלל הנתונים AB = BC ו-BC = AC', 'ABC', 'משולש', 'משולש שווה צלעות', 'משולש שווה צלעות הוא סוג של משולש'),
    spelled: { '3d': { steps: ['משולש ABC', '|AB| = |BC|', '|BC| = |AC|'], note: note('בגלל הנתונים |AB| = |BC| ו-|BC| = |AC|', 'ABC', 'משולש', 'משולש שווה צלעות', 'משולש שווה צלעות הוא סוג של משולש') } },
  },
  {
    steps: ['מקבילית ABCD', 'ABCD חסום במעגל', 'AB = BC'],
    note: note('בגלל הנתונים ABCD חסום במעגל ו-AB = BC', 'ABCD', 'מקבילית', 'ריבוע', 'ריבוע הוא סוג של מקבילית'),
    spelled: { '3d': { steps: ['מקבילית ABCD', 'ABCD חסום במעגל', '|AB| = |BC|'], note: note('בגלל הנתונים ABCD חסום במעגל ו-|AB| = |BC|', 'ABCD', 'מקבילית', 'ריבוע', 'ריבוע הוא סוג של מקבילית') } },
  },
  // ── the statement typed first is named (card 7; the #1915 re-attribution) ──
  { steps: ['מקבילית ABCD', 'זווית DAB = 90', 'ABCD חסום במעגל'], note: P_RECT('בגלל הנתון זווית DAB = 90') },
  { steps: ['מקבילית ABCD', 'ABCD חסום במעגל', 'זווית DAB = 90'], note: P_RECT(CIRCUM) },
  // ── silent: numbers alone on a plain shape (card 4 + third ballot A) ──
  { steps: ['משולש ABC', 'AB = 3', 'BC = 4', 'AC = 5'], note: null },
  // ── silent: nothing narrowed, or no noun (false-note guards) ──
  { steps: ['טרפז שווה שוקיים ABCD', 'ABCD חסום במעגל'], note: null },
  { steps: ['מלבן ABCD', 'ABCD חסום במעגל'], note: null },
  { steps: ['ABCD חסום במעגל'], note: null },
  { steps: ['משולש שווה צלעות ABC'], note: null },
  { steps: ['טרפז שווה שוקיים ABCD'], note: null },
  { steps: ['טרפז ישר זווית ABCD'], note: null },
  { steps: ['משולש ישר זווית ABC'], note: null },
  { steps: ['משולש שווה שוקיים ABC'], note: null },
  { steps: ['דלתון ABCD'], note: null },
  // ── #2171 (ADR-W-131, 2-D's ADR-656 #4): two sibling nouns the ring carries together — ONE note, in every builder ──
  { steps: ['מלבן ABCD', 'מעוין ABCD'], note: 'ABCD הוא כעת ריבוע, שהוא גם מלבן וגם מעוין.' },
  { steps: ['מעוין ABCD', 'מלבן ABCD'], note: 'ABCD הוא כעת ריבוע, שהוא גם מעוין וגם מלבן.' },
  { steps: ['מלבן ABCD', 'דלתון ABCD'], note: 'ABCD הוא כעת ריבוע, שהוא גם מלבן וגם דלתון.' },
  { steps: ['דלתון ABCD', 'מלבן ABCD'], note: 'ABCD הוא כעת ריבוע, שהוא גם דלתון וגם מלבן.' },
  { steps: ['מקבילית ABCD', 'דלתון ABCD'], note: 'ABCD הוא כעת מעוין, שהוא גם מקבילית וגם דלתון.' },
  { steps: ['דלתון ABCD', 'מקבילית ABCD'], note: 'ABCD הוא כעת מעוין, שהוא גם דלתון וגם מקבילית.' },
  // ── #2171: a trapezoid adjective stated after «טרפז» narrows the ring — silent, never «adds nothing» (3-D said it did) ──
  { steps: ['טרפז ABCD', 'טרפז שווה שוקיים ABCD'], note: null },
  { steps: ['טרפז ABCD', 'טרפז ישר זווית ABCD'], note: null },
];

/** The row as this builder runs it: its own spelling, or null when the row is an exception there. */
export function rowFor(row: NarrowRow, b: Builder): { steps: readonly string[]; note: string | null } | null {
  if (row.exception?.[b]) return null;
  return row.spelled?.[b] ?? { steps: row.steps, note: row.note };
}

/**
 * Every fault of `gate` (builder `b`) against the rows. A gap row must still FAIL (a passing gap row says "move
 * it": the known gap closed and the row should become a plain one).
 */
export async function narrowingFaults(gate: NarrowGate, b: Builder, rows: readonly NarrowRow[] = NARROW_ROWS): Promise<string[]> {
  const faults: string[] = [];
  for (const row of rows) {
    const r = rowFor(row, b);
    if (!r) continue;
    const v = await gate(r.steps);
    const want = r.note === null ? [] : [r.note];
    const ok = v.recorded && v.notes.length === want.length && v.notes.every((n, i) => n === want[i]);
    const label = `«${r.steps.join(' · ')}»`;
    if (row.gap?.[b]) {
      if (ok) faults.push(`${label} passes in ${b} — the known gap #${row.gap[b]} closed: move it to a plain row`);
      continue;
    }
    if (!v.recorded) faults.push(`${label} did not record in ${b}`);
    else if (!ok) faults.push(`${label} in ${b}: expected ${JSON.stringify(want)}, got ${JSON.stringify(v.notes)}`);
  }
  return faults;
}
