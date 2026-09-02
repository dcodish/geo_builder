/**
 * THE ASK LANE — the one input surface through which a student asks the data panel a question
 * (#741, [ADR-W-038](../../docs/06w-decisions-workspace.md)).
 *
 * The three builders grew this box three times and it looked and behaved like three different
 * products: 2-D rendered it INSIDE the values block, so it existed only after «חשב ערכים» ran — and
 * because the values layer is invalidated by every new fact, it vanished again on the student's next
 * line; 3-D had it unconditionally as a panel child; complex rebuilt it once more at #789. The
 * operator's report was exactly that: *"the data panel is not the same in all tools… we need a
 * unified approach here."*
 *
 * So the LANE is shared and the ANSWERS are not. This component owns what must look and behave the
 * same everywhere — the box, the submit, the collapsed symbol palette, and the rule that **the lane
 * is always there** (never behind a button, never gated on a computation having run). Each product
 * keeps its own answer rows, because an answer is the one part that is genuinely product-shaped: a
 * length with units, a vector equation, a complex modulus. That split is what stops this from
 * becoming a component with a `product` flag in it (the [ADR-W-016](../../docs/06w-decisions-workspace.md)
 * rule — the shell is parameterized by its caller and knows no product).
 *
 * Asking is also the PULL: a product whose answers are expensive computes them when the question is
 * submitted, not when the panel opens (2-D's #217 economics survive the move — nothing is computed
 * until the student actually asks).
 */
import { useState, type FormEvent, type MutableRefObject, type ReactNode } from 'react';
import { SymbolRow, type SymbolRowProps } from './SymbolRow';

export interface AskLaneProps {
  /** Submit the current text. Return true when it was accepted, so the box clears only then. */
  onSubmit: (text: string) => boolean | void;
  /** Placeholder for the box. */
  placeholder: string;
  /** Label of the submit button. */
  addLabel: string;
  /** Tooltip for the box (optional — 2-D explains what may be asked). */
  hint?: string;
  /** Text direction for the box. `'auto'` follows the typed content. */
  dir?: 'ltr' | 'rtl' | 'auto';
  /** The symbol palette, when the product has one. Everything except the controlled value/ref. */
  palette?: Omit<SymbolRowProps, 'value' | 'onChange' | 'inputRef'>;
  /** The product's own answered rows, rendered ABOVE the box. */
  children?: ReactNode;
  /** Shared by the palette so an inserted glyph lands in this box. */
  inputRef: MutableRefObject<HTMLInputElement | null>;
  /** Controlled text — products keep it so a palette click and a load can write to it. */
  value: string;
  onChange: (next: string) => void;
}

export function AskLane({
  onSubmit,
  placeholder,
  addLabel,
  hint,
  dir = 'auto',
  palette,
  children,
  inputRef,
  value,
  onChange,
}: AskLaneProps) {
  const [pending, setPending] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || pending) return;
    setPending(true);
    try {
      if (onSubmit(value) !== false) onChange('');
    } finally {
      setPending(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            title={hint}
            dir={dir}
            aria-label={placeholder}
            data-ask-input
            style={{ minWidth: 0, flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', font: 'inherit' }}
          />
          <button type="submit" disabled={!value.trim()} style={{ flexShrink: 0, cursor: value.trim() ? 'pointer' : 'default' }}>
            {addLabel}
          </button>
        </div>
        {palette && <SymbolRow {...palette} value={value} onChange={onChange} inputRef={inputRef} />}
      </form>
    </div>
  );
}
