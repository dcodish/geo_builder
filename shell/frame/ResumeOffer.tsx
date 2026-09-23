/**
 * The continue-or-start-fresh OFFER (#1238, ADR-W-068) — the one surface through which a stored
 * session may re-enter a builder.
 *
 * The operator's 2026-09-21 ruling: *"offer to continue, never restore silently."* Every builder
 * still opens on an empty canvas (ADR-W-046 stands); when `shell/session/persist` reports a recent
 * session, the frame shows this banner and the student decides. There is deliberately no third
 * affordance and no auto-dismiss: a banner that expires on its own is a silent start-fresh.
 *
 * Strings are the caller's, through its own i18n instance — `shell/` holds none (ADR-W-016 rule 2).
 * The continue action is the PRIMARY one and is rendered as such, because the student who sees this
 * banner has already lost their work once.
 */
import type { CSSProperties } from 'react';
import { Banner } from './Banner';
import { color, fs, radius } from '../theme';

export interface ResumeOfferProps {
  /** e.g. «נמצאה עבודה שלא נשמרה» — the caller's translated sentence. */
  message: string;
  continueLabel: string;
  restartLabel: string;
  /** Load the stored session through the product's own load path. */
  onContinue: () => void;
  /** Forget it — the caller clears the stored session. */
  onRestart: () => void;
}

export function ResumeOffer({ message, continueLabel, restartLabel, onContinue, onRestart }: ResumeOfferProps) {
  return (
    <Banner kind="notice">
      <div style={row}>
        <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
        <span style={buttons}>
          <button type="button" onClick={onContinue} style={{ ...btn, ...primary }}>
            {continueLabel}
          </button>
          <button type="button" onClick={onRestart} style={btn}>
            {restartLabel}
          </button>
        </span>
      </div>
    </Banner>
  );
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 };
const buttons: CSSProperties = { display: 'flex', gap: 8, flexShrink: 0 };
const btn: CSSProperties = {
  // explicit metrics — a consumer's CSS reset must not restyle the suite's chrome (ToolButton's rule)
  fontFamily: "system-ui, 'Segoe UI', sans-serif",
  lineHeight: 1.4,
  fontSize: fs.body,
  padding: '5px 12px',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const primary: CSSProperties = {
  background: color.primary,
  borderColor: color.primary,
  color: '#ffffff',
  fontWeight: 600,
};
