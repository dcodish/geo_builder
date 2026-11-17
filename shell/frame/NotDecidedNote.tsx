/**
 * #2893 ([ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 4) — the page's face of "not decided"
 * (`shell/notDecided`): a search reached its work limit without a solution. Operator, 2026-11-14 (#2893, questions 1
 * and 2): «עדיין לא נמצא פתרון — החיפוש נעצר אחרי כ-10 שניות.» with a button «המשיכו לחפש», which searches the same
 * amount again from where it stopped.
 *
 * The builder places it where it shows a refusal today. It carries no strings: the sentence and the button's label
 * are the suite's (`suite.notDecided.message`, `suite.notDecided.continue`), read through the caller's `t`. It is a
 * `status`, not an `alert`: nothing was refused. While the next round runs the button is off (the builder's working
 * state says so, as for any job).
 */
import type { CSSProperties } from 'react';
import { color, fs, radius } from '../theme';

interface NotDecidedNoteProps {
  /** The caller's translation of `suite.notDecided.message`. */
  message: string;
  /** The caller's translation of `suite.notDecided.continue`. */
  continueLabel: string;
  /** Run one more round from where the search stopped. */
  onContinue: () => void;
  /** A round is running. */
  busy?: boolean;
}

export function NotDecidedNote({ message, continueLabel, onContinue, busy = false }: NotDecidedNoteProps) {
  return (
    <div role="status" data-not-decided="" style={box}>
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      <button type="button" onClick={onContinue} disabled={busy} style={busy ? { ...btn, opacity: 0.6, cursor: 'default' } : btn}>
        {continueLabel}
      </button>
    </div>
  );
}

const box: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid',
  borderColor: color.warnBorder,
  background: color.warnSoft,
  color: color.warn,
  borderRadius: radius.control,
  padding: '6px 10px',
  fontSize: fs.body,
  lineHeight: 1.5,
};
const btn: CSSProperties = {
  border: '1px solid',
  borderColor: color.warnBorder,
  background: color.surface,
  color: color.warn,
  borderRadius: radius.control,
  padding: '2px 10px',
  fontSize: fs.body,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
};
