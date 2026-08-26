/**
 * THE FACT LIST — one chrome for the surface the architecture rests on (B5 #670; docs/28 §4a D6:
 * disable + edit-in-place + delete, all three, in every builder; built under the shared-components
 * ruling). The widest divergence the walkthrough found — 3-D could only mute a statement, complex
 * could only destroy one — ends by both mounting THIS.
 *
 * The three operations are semantically distinct and the chrome says so: DISABLE answers "what if
 * I hadn't said this?" and is reversible (the row stays, muted); EDIT keeps the statement's
 * POSITION, because order is meaningful in a construction; DELETE is "I typed that by mistake".
 * An edited line RE-PARSES — the product's `onEditCommit` runs it through the same gates as a
 * typed line and returns false to keep the editor open on refusal (the product's error surface
 * says why).
 *
 * The rows' CONTENT, the handlers, and every string are the product's; a handler the product does
 * not pass renders no control (the conformance matrix tracks capability gaps — the chrome never
 * fakes an affordance).
 */
import type { CSSProperties, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { color } from '../theme';
import type { SymbolSpec } from '../symbols';
import { SymbolRow } from './SymbolRow';

export interface FactRow {
  id: string;
  content: ReactNode;
  /** The row's own error/annotation (e.g. "the engine could not read this"), rendered under it. */
  error?: ReactNode;
  disabled?: boolean;
  /** A SELECTED row (2-D: the row whose elements highlight on the canvas) gets the amber accent. */
  selected?: boolean;
}

export interface FactListProps {
  rows: FactRow[];
  emptyHint: string;
  /** Toggle a row's enabled state. The PRODUCT gates re-enabling (a muted line coming back must
   *  face the acceptance gate) — refusal shows on the product's error surface. */
  onToggle?: (id: string) => void;
  toggleLabel?: string;
  /** Begin/commit an in-place edit. `editValueOf` supplies the raw text; commit returns false to
   *  KEEP the editor open (the edit was refused — the product's error surface names why). */
  editValueOf?: (id: string) => string;
  onEditCommit?: (id: string, next: string) => boolean;
  editLabel?: string;
  /** Direction for the editor box by CONTENT (the #118 lesson: dir="auto" keys off the first
   *  strong character, and a Hebrew edit starting with a Latin label would take an LTR base).
   *  Absent = auto (the math-first products). */
  editDir?: (text: string) => 'rtl' | 'ltr';
  onDelete?: (id: string) => void;
  deleteLabel?: string;
  /** The list-zone actions (clear · counter · undo/redo …) — the product's row, one place. */
  footer?: ReactNode;
  /** Hook for the product's smoke/e2e scripts, applied to the list element. */
  testId?: string;
  /** #525: the product's symbol palette, mounted (collapsed) under the ACTIVE edit box — a step
   *  created with a glyph must be correctable without re-typing a character the UI refuses to
   *  offer. Absent = no palette (the pre-#525 look). */
  symbols?: readonly SymbolSpec[];
  symbolTitle?: (spec: SymbolSpec) => string;
  symbolsToggleTitle?: string;
}

export function FactList({
  rows,
  emptyHint,
  onToggle,
  toggleLabel,
  editValueOf,
  onEditCommit,
  editLabel,
  editDir,
  onDelete,
  deleteLabel,
  footer,
  testId,
  symbols,
  symbolTitle,
  symbolsToggleTitle,
}: FactListProps) {
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const editRef = useRef<HTMLInputElement | null>(null);

  const commit = () => {
    if (!editing || !onEditCommit) return;
    if (onEditCommit(editing.id, editing.text)) setEditing(null);
    // refused → the editor stays open; the product's error surface names the refusal
  };

  return (
    <div style={wrap}>
      <ul style={list} data-testid={testId}>
        {rows.length === 0 && <li style={hint}>{emptyHint}</li>}
        {rows.map((row) => (
          <li
            key={row.id}
            style={{
              ...rowStyle,
              ...(row.disabled ? rowDisabled : null),
              ...(row.selected ? rowSelected : null),
            }}
          >
            {onToggle && (
              <input
                type="checkbox"
                checked={!row.disabled}
                onChange={() => onToggle(row.id)}
                title={toggleLabel}
                aria-label={toggleLabel}
                style={toggle}
              />
            )}
            {editing?.id === row.id ? (
              <div style={editWrap}>
                <input
                  ref={editRef}
                  autoFocus
                  dir={editDir ? editDir(editing.text) : 'auto'}
                  value={editing.text}
                  onChange={(e) => setEditing({ id: row.id, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onBlur={commit}
                  style={editBox}
                />
                {symbols && (
                  <SymbolRow
                    symbols={symbols}
                    symbolTitle={symbolTitle}
                    value={editing.text}
                    onChange={(text) => setEditing({ id: row.id, text })}
                    inputRef={editRef}
                    startCollapsed
                    compact
                    toggleTitle={symbolsToggleTitle}
                  />
                )}
              </div>
            ) : (
              <div style={content}>
                {row.content}
                {row.error && <div style={errorStyle}>{row.error}</div>}
              </div>
            )}
            <span style={rowActions}>
              {editValueOf && onEditCommit && editing?.id !== row.id && (
                <button
                  type="button"
                  title={editLabel}
                  aria-label={editLabel}
                  style={iconBtn}
                  onClick={() => setEditing({ id: row.id, text: editValueOf(row.id) })}
                >
                  ✎
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  title={deleteLabel}
                  aria-label={deleteLabel}
                  style={iconBtn}
                  onClick={() => onDelete(row.id)}
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {footer && <div style={footerStyle}>{footer}</div>}
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const list: CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 };
const hint: CSSProperties = { color: color.faint, fontSize: '0.9rem', padding: '8px 2px' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 9,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
};
const rowDisabled: CSSProperties = { opacity: 0.5 };
const rowSelected: CSSProperties = { borderColor: '#f59e0b', background: '#fffbeb' };
const toggle: CSSProperties = { flexShrink: 0, cursor: 'pointer' };
const content: CSSProperties = { minWidth: 0, flex: 1 };
const errorStyle: CSSProperties = { color: color.danger, fontSize: '0.8rem' };
const editWrap: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const editBox: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '0.92rem',
  padding: '4px 8px',
  border: `1px solid ${color.primary}`,
  borderRadius: 6,
};
const rowActions: CSSProperties = { display: 'flex', gap: 2, marginInlineStart: 'auto', flexShrink: 0 };
const iconBtn: CSSProperties = {
  border: 'none',
  background: 'none',
  color: color.faint,
  cursor: 'pointer',
  padding: '2px 6px',
  fontSize: '0.9rem',
};
const footerStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
