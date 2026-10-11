/**
 * A LETTER THE TOOL CANNOT READ IS REFUSED BY NAME, IN EVERY BUILDER (#1919, ADR-626 / ADR-3D-328) —
 * the shared rows, written per docs/28 §5c, the `proof-target-rows` way.
 *
 * Operator ruling, 2026-10-08: *"we only support english or hebrew so any letter or mention of anything
 * that is not in these languages is rejected. in all tools"*, with *"Keep Greek as math"* and, for the
 * Cyrillic look-alikes, *"Fold them silently"*. Before it, «משולש ДЖФ» COMMITTED triangle **A, B, C** in
 * 2-D and recorded A, B, C in 3-D — the student's three letters replaced by three he never typed, with a
 * green ✓ — while analytic handed the line to the paid model and complex answered "I did not understand".
 *
 * The rule lives once (`shell/inputScript.ts`), but whether each builder CALLS it at its statement seam is
 * not visible from `shell/`, which may not import a product. So each tree hands its REAL submit decision
 * over as an {@link UnreadGate} (a thin lock per product), and `input-script-1919.test.ts` proves these
 * checks catch a seam that does not call the rule.
 *
 * Every line here speaks of A, B, C only beyond its unreadable letters, so each builder's setup needs at
 * most a figure with those three points.
 */

/** What a builder's REAL statement seam did with one line, in the vocabulary of these checks. */
export interface UnreadGateVerdict {
  /** which ruled sentence the refusal used — `null` when the line was not refused as unreadable */
  unread: 'name' | 'word' | null;
  /** the line, or any part of it, would be recorded / committed */
  recorded: boolean;
  /** the student-facing refusal text through the product's own i18n (null when not refused) */
  text: string | null;
}

/** The product's statement decision, asked about `line`. Pure: it must not leave the session changed. */
export type UnreadGate = (line: string) => UnreadGateVerdict | Promise<UnreadGateVerdict>;

/** A line with a letter the tool cannot read: which sentence answers it, and the letters it must quote. */
export interface UnreadRow {
  line: string;
  kind: 'name' | 'word';
  quotes: string;
}

/**
 * Every ruled line, measured silently drawn or silently escalated at `ad8df1d3`.
 *
 * Cyrillic with no Latin twin, Arabic, and accented Latin — as a shape's vertex list, as a bare point, in
 * a mid-line position, mixed with Latin labels, and with indices. A WORD in another language takes the
 * other sentence.
 */
export const UNREAD_ROWS: readonly UnreadRow[] = [
  // the reported line, and every shape noun that drew A, B, C … for it
  { line: 'משולש ДЖФ', kind: 'name', quotes: 'ДЖФ' },
  { line: 'ריבוע ДЖФИ', kind: 'name', quotes: 'ДЖФИ' },
  { line: 'מחומש ДЖФИЛ', kind: 'name', quotes: 'ДЖФИЛ' },
  { line: 'מקבילית ДЖФИ', kind: 'name', quotes: 'ДЖФИ' },
  { line: 'משולש ישר זווית ДЖФ', kind: 'name', quotes: 'ДЖФ' },
  { line: 'משולש ДЖФ שווה שוקיים', kind: 'name', quotes: 'ДЖФ' },
  { line: 'משולש ДЖФ חסום במעגל', kind: 'name', quotes: 'ДЖФ' },
  { line: 'triangle ДЖФ', kind: 'name', quotes: 'ДЖФ' },
  // other scripts the label grammar cannot read, drawn as A, B, C just the same
  { line: 'משולש ابج', kind: 'name', quotes: 'ابج' },
  { line: 'משולש ÉÜÇ', kind: 'name', quotes: 'ÉÜÇ' },
  // a PARTIAL run and indices — these escalated to the model instead of being drawn
  { line: "משולש ДBC", kind: "name", quotes: "ДBC" },
  { line: 'משולש ÀBC', kind: 'name', quotes: 'ÀBC' },
  { line: 'משולש Д1Ж1Ф1', kind: 'name', quotes: 'Д1Ж1Ф1' },
  // anywhere in the line, not only after a shape noun (the ruling's widened scope)
  { line: 'נקודה Д', kind: 'name', quotes: 'Д' },
  { line: 'נקודה Ж על AB', kind: 'name', quotes: 'Ж' },
  { line: 'מעגל Д', kind: 'name', quotes: 'Д' },
  { line: 'M אמצע Д', kind: 'name', quotes: 'Д' },
  { line: 'Д(1,2)', kind: 'name', quotes: 'Д' },
  // a WORD in another language — the Hebrew-and-English sentence
  { line: 'треугольник ABC', kind: 'word', quotes: 'треугольник' },
  { line: 'مثلث متساوي الساقين', kind: 'word', quotes: 'متساوي' },
];

/**
 * Lines that must NOT be refused as unreadable — a builder may still refuse, ask or escalate each for its
 * own reasons, and only an UNREAD refusal is a fault here.
 *
 * The look-alikes (folded, by the ruling), Hebrew labels (2-D's own note owns them), Greek as notation and
 * as a vertex name (kept as math, so «משולש ΓΔΘ» stays each builder's own verdict), the letterlike math
 * glyphs, the modifier letters complex reads as exponents and indices, and the º the glyph fold reads.
 */
export const READABLE_ROWS: readonly string[] = [
  'משולש КМО',
  'מעגל עם קוטר АВ',
  'משולש אבג',
  'משולש ΓΔΘ',
  'משולש αβγ',
  'α = 30',
  '60 < α < 90',
  'זווית ABC = 40º',
  'ℓ: y = 2x',
  'triangle ABC',
  'משולש ABC',
  "משולש A'B'C'",
  'zⁿ = 8',
  'x² + y² = 25',
  'AB = 2π',
];

/** Every violated property, named. Empty array = the builder conforms. */
export async function unreadLetterFaults(gate: UnreadGate): Promise<string[]> {
  const faults: string[] = [];
  for (const { line, kind, quotes } of UNREAD_ROWS) {
    const v = await gate(line);
    if (v.unread !== kind) faults.push(`«${line}» was not refused as an unreadable ${kind} (got ${v.unread ?? 'no unread refusal'})`);
    if (v.recorded) faults.push(`«${line}» was recorded — a letter the tool cannot read became a figure`);
    if (v.unread !== null && !(v.text ?? '').includes(quotes)) {
      faults.push(`the refusal of «${line}» does not name «${quotes}»: ${JSON.stringify(v.text)}`);
    }
  }
  for (const line of READABLE_ROWS) {
    const v = await gate(line);
    if (v.unread !== null) faults.push(`«${line}» is readable, but was refused as an unreadable ${v.unread}`);
  }
  return faults;
}
