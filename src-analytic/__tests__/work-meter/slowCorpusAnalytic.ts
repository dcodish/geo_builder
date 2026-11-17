/**
 * THE ANALYTIC SLOW CORPUS (#2873, [ADR-W-210](../../../docs/06w-decisions-workspace.md#adr-w-210)) — the open speed
 * issues' own sequences, typed line by line.
 *
 * They are evidence, not a work list (the ADR's words): each closes when the phase that removes its cause lands, and
 * until then its work is recorded in `baseline-slow.jsonl` beside the fixtures' baseline. Too slow for the suite, so
 * the gate walks them only on demand: `npm run work:check -- <builder> --slow` (`work:record` to re-record).
 * `scripts/perf/analytic/harness.ts` times the same sequences.
 */
export interface SlowSequenceA {
  /** The sequence's name: its issue number and a word. */
  id: string;
  lines: string[];
}

const NINE = ['מרובע', 'טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית', 'מקבילית', 'מלבן', 'מעוין', 'ריבוע', 'דלתון'];

export const SLOW_CORPUS_ANALYTIC: SlowSequenceA[] = [
  { id: '#2737 nine+1 shapes', lines: [...NINE, 'משולש'] },
  { id: '#2737 ten free quadrilaterals', lines: Array.from({ length: 10 }, () => 'מרובע') },
  { id: '#1647 touch sentence', lines: ['משולש AOB ישר זווית', 'O ראשית הצירים', 'הצלע AO נמצאת על ציר ה-x', 'הצלע BO נמצאת על ציר ה-y', 'הצלעות AO ו-BO משיקות למעגל בנקודות D ו-E בהתאמה'] },
];
