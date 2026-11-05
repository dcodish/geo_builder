/**
 * The analytic page's forced-narrowing notes (#1996, ADR-AG-276) and its ellipse-made-a-circle notes (#1863, ADR-AG-377),
 * each on the suite's one face, the blue ⓘ strip (`shell/frame/NarrowingNote`, #2266, ADR-W-180). Its own component
 * because the App reaches them after paint: a server-rendered lock sees them only here.
 */
import { NarrowingNote } from '../../shell/frame/NarrowingNote';
import { circleNoteText, type CircleNote } from './conicMarks';
import { narrowingKey, narrowingText, type AnalyticNarrowing } from './narrowing';

interface Props {
  notes: readonly AnalyticNarrowing[];
  circles: readonly CircleNote[];
  t: (key: string, options?: Record<string, unknown>) => string;
  /** Row `i`, as the student reads it. */
  shownLine: (i: number) => string;
  isolate: (ring: string) => string;
}

export function NarrowingNotes({ notes, circles, t, shownLine, isolate }: Props) {
  return (
    <>
      {notes.map((n) => (
        <div key={narrowingKey(n)} style={{ marginTop: 8 }} data-testid="analytic-narrowing-note">
          <NarrowingNote>{narrowingText(n, t, shownLine, isolate)}</NarrowingNote>
        </div>
      ))}
      {circles.map((n) => (
        <div key={`round-note:${n.curve}`} style={{ marginTop: 8 }} data-testid="analytic-conic-circle-note">
          <NarrowingNote>{circleNoteText(n, t, shownLine)}</NarrowingNote>
        </div>
      ))}
    </>
  );
}
