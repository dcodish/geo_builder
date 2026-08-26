/**
 * THE SYMBOL ROW — the palette's insert mechanism, extracted so any text surface can mount it
 * (#525): the buttons, the wrap-selection insert (`shell/symbols.applySymbol`), the
 * keep-focus/caret-restore behaviour. The #525 diagnosis was that the palette was bound to one
 * `<input>`'s JSX rather than to "how this app types math" — every later text surface (the query
 * boxes, the fact-list editor) was born without it. One control, N mount points.
 *
 * The vocabulary stays the PRODUCT's (its own `SymbolSpec[]`, its own drift/bidi locks); this
 * component owns only the mechanism. `startCollapsed` is for the secondary surfaces (the issue's
 * constraint): a small toggle keeps a cramped query box quiet until the student wants glyphs.
 */
import { useState, type CSSProperties, type RefObject } from 'react';
import { applySymbol, type SymbolSpec } from '../symbols';
import { color } from '../theme';

export interface SymbolRowProps {
  symbols: readonly SymbolSpec[];
  /** Tooltip per symbol, translated by the product. */
  symbolTitle?: (spec: SymbolSpec) => string;
  /** The controlled value of the target input, and its setter. */
  value: string;
  onChange: (next: string) => void;
  /** The target input — the row inserts at its caret and returns focus to it. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Secondary surfaces start collapsed behind a small toggle. */
  startCollapsed?: boolean;
  /** Tooltip/aria for the collapsed toggle (translated by the product). */
  toggleTitle?: string;
  /** Compact chips for cramped surfaces (query boxes, the fact-list editor). */
  compact?: boolean;
}

export function SymbolRow({
  symbols,
  symbolTitle,
  value,
  onChange,
  inputRef,
  startCollapsed,
  toggleTitle,
  compact,
}: SymbolRowProps) {
  const [open, setOpen] = useState(!startCollapsed);

  const insert = (spec: SymbolSpec) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const next = applySymbol(value, start, end, spec);
    onChange(next.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  };

  const symStyle = compact ? symSmall : sym;
  return (
    <div style={row} dir="ltr">
      {startCollapsed && (
        <button
          type="button"
          style={symStyle}
          aria-expanded={open}
          title={toggleTitle}
          aria-label={toggleTitle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '×' : 'αβ√'}
        </button>
      )}
      {open &&
        symbols.map((s) => (
          <button
            key={s.label + s.before}
            type="button"
            title={symbolTitle?.(s)}
            style={symStyle}
            // mousedown would BLUR the target input — and a blur commits the fact-list edit, so
            // the insert would land after the editor closed. Focus never leaves the input.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(s)}
          >
            {s.label}
          </button>
        ))}
    </div>
  );
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 5 };

const sym: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '0.92rem',
  padding: '6px 10px',
  background: color.surfaceDim,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  cursor: 'pointer',
};

const symSmall: CSSProperties = { ...sym, padding: '2px 7px', fontSize: '0.8rem', borderRadius: 6 };
