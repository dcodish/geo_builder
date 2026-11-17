/**
 * THE 2-D SLOW CORPUS (#2873, [ADR-W-210](../../../docs/06w-decisions-workspace.md#adr-w-210)) — the open speed
 * issues' own sequences, typed line by line.
 *
 * They are evidence, not a work list (the ADR's words): each closes when the phase that removes its cause lands, and
 * until then its work is recorded in `baseline-slow.jsonl` beside the fixtures' baseline. Too slow for the suite, so
 * the gate walks them only on demand: `npm run work:check -- <builder> --slow` (`work:record` to re-record).
 * `scripts/perf/2d/perf2d.ts` times the same sequences.
 */
export interface SlowSequence {
  /** The sequence's name: its issue number and a word. */
  id: string;
  /** The issue or PR it is the evidence of. */
  ref: string;
  lines: string[];
}

export const SLOW_CORPUS_2D: SlowSequence[] = [
  { id: '2860-tangent-right-triangle', ref: 'PR #2860 / #2831 / #2867', lines: ['נתון מעגל O שרדיוסו 5', 'מנקודה A הוציאו משיק למעגל בנקודה B', 'OA = 13', 'משולש ישר זווית ABD', 'BD = 6'] },
  { id: '2481-inscribed-square', ref: '#2481', lines: ['מרובע ABCD', 'AB = 3', 'BC = 4', 'ריבוע ABCD חסום במעגל'] },
  { id: '2481-control', ref: '#2481 control / #2359 square analog', lines: ['מרובע ABCD', 'AB = 3', 'BC = 4', 'ABCD ריבוע'] },
  { id: '2359-pentagon', ref: '#2359', lines: ['מחומש ABCDE', 'AB = 3', 'BC = 4', 'המחומש משוכלל'] },
  { id: '2359-pentagon-ok', ref: '#2359 control', lines: ['מחומש ABCDE', 'המחומש משוכלל'] },
  { id: '2295-iso-8', ref: '#2295', lines: ['משולש שווה שוקיים ABC', 'AB = 4', 'BC = 8'] },
  { id: '2295-iso-9', ref: '#2295', lines: ['משולש שווה שוקיים ABC', 'AB = 4', 'BC = 9'] },
  { id: '2513', ref: '#2513', lines: ['מעגל O', 'ריבוע ABCD חסום במעגל O', 'ריבוע חוסם את מעגל O'] },
  { id: '2104-named', ref: '#2104', lines: ['משולש ABC', 'מעגל O', 'AB משיק למעגל בנקודה D', 'BC משיק למעגל בנקודה E', 'CA משיק למעגל בנקודה F'] },
  { id: '2104-unnamed', ref: '#2104', lines: ['משולש ABC', 'מעגל O', 'AB משיק למעגל', 'BC משיק למעגל', 'CA משיק למעגל'] },
  { id: '2104-list', ref: '#2104', lines: ['משולש ABC', 'מעגל O', 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'] },
  { id: '2104-square', ref: '#2104', lines: ['ריבוע ABCD', 'מעגל O', 'AB משיק למעגל בנקודה D', 'BC משיק למעגל בנקודה E', 'CA משיק למעגל בנקודה F'] },
  { id: '1768-kite-area', ref: '#1768', lines: ['ABCD דלתון חסום במעגל', 'AB=AD', 'CB=CD', 'E על DC', 'BE⊥DC', 'AC', 'N = חיתוך BE ו-AC', 'שטח משולש NCE = שטח משולש ACD'] },
  { id: '2572-chord', ref: '#2572', lines: ['מעגל O ברדיוס 2', 'AB מיתר במעגל', 'AB = 6'] },
  { id: '2572-inscribed', ref: '#2572', lines: ['מעגל O ברדיוס 3', 'משולש ABC חסום במעגל O', 'AB = 8'] },
  { id: '2601-incircle-reach', ref: '#2601 / #2572 / #2538', lines: ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'AB = 4'] },
  { id: '2601-566-arc', ref: '#2601 (the #566 arc figure)', lines: ['משולש ישר זווית ABC', 'משולש ABC חסום במעגל', 'קשת AB = קשת BC'] },
];
