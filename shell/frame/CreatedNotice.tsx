/**
 * #1467 (ADR-W-162) — the created-points notice: «נוצרה נקודה חדשה X — אם זו טעות הקלדה, לחצו ✕ לביטול השורה» with
 * one ✕ that removes the line. String-free: the text and the button's accessible name are the caller's translations
 * of the suite keys in `shell/session/createdPoints.ts`, so every builder shows the identical sentence.
 */
import { Banner } from './Banner';

interface CreatedNoticeProps {
  /** The notice sentence, already translated and interpolated. */
  text: string;
  /** The ✕ button's accessible name («ביטול השורה»). */
  undoLabel: string;
  /** Remove the line that created the points. */
  onUndo: () => void;
}

export function CreatedNotice({ text, undoLabel, onUndo }: CreatedNoticeProps) {
  return (
    <div data-testid="created-notice">
      <Banner kind="notice" onDismiss={onUndo} dismissLabel="✕" dismissAriaLabel={undoLabel}>
        {text}
      </Banner>
    </div>
  );
}
