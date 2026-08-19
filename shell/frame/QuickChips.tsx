/**
 * The EMPTY-CANVAS quick commands (D9b's first half, B4 #669): large clickable chips centered on
 * the empty canvas — a first click that needs no reading and no typing — with a warm headline and
 * a manual link slot. One component, every builder; the commands and every string are the
 * caller's (the A3 config's curated list rides in where the operator saved one).
 *
 * LABEL AND COMMAND ARE TWO VALUES, NOT ONE (#751, ADR-W-029). The chip used to render the same
 * string it submitted, so a caller passing a post-processed `t()` value shipped the DISPLAY form —
 * Unicode isolates and all — into the fact list, the saved file, the prod log and the `.docx`
 * (where Word draws U+2066/U+2069 as missing-glyph boxes). `commands` are RAW: what a student
 * would have typed, and exactly what `onPick` receives. `display` is presentation only, applied on
 * the way to the screen and nowhere else — pass the product's bidi kit so an LTR run inside a
 * Hebrew chip still lays out correctly.
 *
 * The split lives HERE rather than at the two call sites deliberately: fixing the callers would
 * have left the shared component still able to conflate the two, which is the defect.
 */
import type { CSSProperties } from 'react';
import { color, fs } from '../theme';

export function QuickChips({
  title,
  hint,
  commands,
  onPick,
  display,
  manualLabel,
  manualHref,
}: {
  title: string;
  hint: string;
  /** RAW commands — what the student would have typed. Never a post-processed display string. */
  commands: readonly string[];
  /** Always receives the RAW command, whatever `display` did to the label. */
  onPick: (command: string) => void;
  /** Presentation only (the product's bidi isolation). Identity when omitted. */
  display?: (command: string) => string;
  manualLabel?: string;
  manualHref?: string;
}) {
  return (
    <div style={wrap}>
      <div style={titleStyle}>{title}</div>
      <div style={hintStyle}>{hint}</div>
      <div style={chipRow}>
        {commands.map((cmd) => (
          <button key={cmd} type="button" style={chip} onClick={() => onPick(cmd)}>
            {display ? display(cmd) : cmd}
          </button>
        ))}
      </div>
      {manualLabel && manualHref && (
        <a href={manualHref} style={manual}>
          {manualLabel}
        </a>
      )}
    </div>
  );
}

const wrap: CSSProperties = { textAlign: 'center', padding: '28px 12px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' };
const titleStyle: CSSProperties = { fontSize: fs.h1, fontWeight: 700, color: color.ink };
const hintStyle: CSSProperties = { fontSize: fs.control, color: color.muted, marginBottom: 10 };
const chipRow: CSSProperties = { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' };
const chip: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 16,
  direction: 'ltr',
  padding: '13px 20px',
  borderRadius: 999,
  border: `1.5px solid ${color.primaryBorder}`,
  background: color.primarySoft,
  color: color.primaryInk,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)',
};
const manual: CSSProperties = {
  display: 'inline-block',
  marginTop: 14,
  color: color.accentInk,
  fontSize: fs.control,
  textDecoration: 'none',
  borderBottom: `1px dashed ${color.accentBorder}`,
};
