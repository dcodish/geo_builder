/**
 * THE 3-D SLOW CORPUS (#2873, [ADR-W-210](../../../docs/06w-decisions-workspace.md#adr-w-210)) — the open speed
 * issues' own sequences, typed line by line.
 *
 * They are evidence, not a work list (the ADR's words): each closes when the phase that removes its cause lands, and
 * until then its work is recorded in `baseline-slow.jsonl` beside the fixtures' baseline. Too slow for the suite, so
 * the gate walks them only on demand: `npm run work:check -- <builder> --slow` (`work:record` to re-record).
 * `scripts/perf/3d/sweep3.ts` times the same sequences.
 */
export interface SlowSequence3 {
  /** The sequence's name: its issue number and a word. */
  id: string;
  lines: string[];
}

export const SLOW_CORPUS_3D: SlowSequence3[] = [
  { id: '#2787 square', lines: ['ריבוע ABCD', 'קטע AS', '|SA| = 5'] },
  { id: '#2787 rectangle', lines: ['מלבן ABCD', 'קטע AS', '|SA| = 5'] },
  { id: '#2787 control apex', lines: ['מלבן ABCD', 'פירמידה ABCDS שבסיסה ריבוע', '|SA| = 5'] },
  { id: '#2749 narrowed', lines: ['מלבן ABCD', 'ריבוע ABCD', 'קטע AS', '|SA| = 5'] },
  { id: '#2749 narrowed AC', lines: ['מלבן ABCD', 'ריבוע ABCD', '|AC| = 5'] },
  { id: '#2806 x-axis', lines: ['ריבוע ABCD', 'הקודקוד A נמצא על ציר ה-x'] },
  { id: '#2806 z-axis', lines: ['ריבוע ABCD', 'הקודקוד A נמצא על ציר ה-z'] },
  { id: '#2806 origin', lines: ['ריבוע ABCD', 'A בראשית הצירים'] },
  { id: '#2806 rhombus', lines: ['מעוין ABCD', 'הקודקוד A נמצא על ציר ה-x'] },
  { id: '#2806 kite', lines: ['דלתון ABCD', 'הקודקוד A נמצא על ציר ה-x'] },
  { id: '#863 on-line', lines: ["מנסרה ישרה משולשת ABCA'B'C'", "ישר AA'=(k-1,k-7,k+1)", 'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)'] },
  { id: '#863 equation', lines: ["מנסרה ישרה משולשת ABCA'B'C'", "ישר AA'=(k-1,k-7,k+1)", 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)'] },
  { id: '#863 pair', lines: ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)'] },
  { id: '#863 fixture', lines: ["מנסרה ישרה משולשת ABCA'B'C'", "AA'=(k-1,k-7,k+1)", 'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)'] },
];
