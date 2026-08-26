/**
 * THE INPUT AREA — one component, every builder (B4 #669; docs/28 §4a D5 + D9b, built under the
 * 2026-08-18 shared-components ruling: chrome exists ONCE, products pass content).
 *
 * What is shared here: the box, the submit button, the wrap-selection symbol palette (the #525
 * shape: the product passes ITS symbols; the insert behaviour is `shell/symbols.applySymbol` —
 * an empty selection is a caret insert), the live PREVIEW seam (shown only when it adds
 * information — the product passes its previewer, e.g. its bidi kit's `inputPreview`; 2-D's
 * maths renderer rides the same prop at its adoption), and the COMPACT quick-command strip that
 * appears above the box once a figure exists (D9b's second half; the big empty-canvas chips are
 * `QuickChips`).
 *
 * What stays the product's: the value and submit handling (stores, gates, LLM escalation, busy
 * states), the symbols, every string.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useRef } from 'react';
import { color, fs, radius } from '../theme';
import type { SymbolSpec } from '../symbols';
import { SymbolRow } from './SymbolRow';

export interface InputAreaProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitLabel: string;
  /** Replaces the submit label while the product is thinking (LLM escalation etc.). */
  busy?: boolean;
  busyLabel?: string;
  /** The product's palette (#525: shared core + per-tool extension — the DATA is per product). */
  symbols: readonly SymbolSpec[];
  /** Tooltip resolver for a palette entry (the product's own i18n). */
  symbolTitle?: (spec: SymbolSpec) => string;
  /** The live-preview seam: return the rendered/isolated form (a string, or a rendered node —
   *  2-D's maths renderer), or null when it adds nothing. */
  preview?: (text: string) => ReactNode | null;
  /** Base direction for the preview by CONTENT (the #118 lesson: never dir="auto") — the
   *  product's own textDir. */
  previewDir?: (text: string) => 'rtl' | 'ltr';
  /** Direction for the BOX itself, by content — the same #118 lesson applies while typing:
   *  dir="auto" keys off the first strong character, and «AB שווה …» would take an LTR base.
   *  Absent = auto (the math-first products). */
  boxDir?: (text: string) => 'rtl' | 'ltr';
  /** The compact quick-command strip (D9b): shown when non-empty; a pick SUBMITS the command. */
  quickCommands?: readonly string[];
  onQuickCommand?: (command: string) => void;
  /** Per-chip direction for quick commands — needed when the commands are SENTENCES (2-D's Hebrew
   *  examples), not math tokens. Absent = the strip stays LTR. */
  quickDir?: (command: string) => 'rtl' | 'ltr';
  /** Extra product content under the palette (errors, hints) — rendered inside the card. */
  children?: ReactNode;
}

export function InputArea({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  busy,
  busyLabel,
  symbols,
  symbolTitle,
  preview,
  previewDir,
  boxDir,
  quickCommands,
  onQuickCommand,
  quickDir,
  children,
}: InputAreaProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const previewText = preview ? preview(value) : null;

  return (
    <div style={card}>
      {quickCommands && quickCommands.length > 0 && onQuickCommand && (
        <div style={quickRow} dir={quickDir ? undefined : 'ltr'}>
          {quickCommands.map((cmd) => (
            <button
              key={cmd}
              type="button"
              style={quickDir ? { ...quickChip, direction: undefined } : quickChip}
              dir={quickDir?.(cmd)}
              onClick={() => onQuickCommand(cmd)}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
      <form
        style={inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={boxDir ? boxDir(value) : 'auto'}
          style={box}
        />
        <button type="submit" disabled={busy} style={busy ? { ...send, opacity: 0.6 } : send}>
          {busy ? (busyLabel ?? submitLabel) : submitLabel}
        </button>
      </form>
      {previewText !== null && (
        // aria-hidden: it duplicates the input for sighted users; a screen reader has the input
        <div
          style={previewStyle}
          aria-hidden="true"
          data-testid="bidi-preview"
          dir={previewDir?.(value)}
        >
          {previewText}
        </div>
      )}
      {/* #525: the palette row is the SHARED mechanism now (SymbolRow) — this surface mounts it
          expanded, the secondary surfaces (query boxes, the fact-list editor) mount it collapsed */}
      <SymbolRow symbols={symbols} symbolTitle={symbolTitle} value={value} onChange={onChange} inputRef={inputRef} />
      {children}
    </div>
  );
}

const card: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};
const inputRow: CSSProperties = { display: 'flex', gap: 8 };
const box: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '11px 12px',
  fontSize: 15,
  fontFamily: 'ui-monospace, Consolas, monospace',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: 9,
};
const send: CSSProperties = {
  background: color.primary,
  border: `1px solid ${color.primary}`,
  color: '#fff',
  fontWeight: 600,
  borderRadius: 9,
  padding: '10px 18px',
  fontSize: fs.control,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const previewStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: fs.body,
  color: color.primaryInk,
  background: color.primarySoft,
  border: `1px solid ${color.primaryBorder}`,
  borderRadius: radius.control,
  padding: '5px 10px',
};
const quickRow: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const quickChip: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: fs.small,
  direction: 'ltr',
  padding: '5px 12px',
  borderRadius: 999,
  border: `1px solid ${color.primaryBorder}`,
  background: color.primarySoft,
  color: color.primaryInk,
  cursor: 'pointer',
};
