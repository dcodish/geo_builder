/**
 * THE LETTER POPOVER (#1631) — click a point, type its new letter, in place.
 *
 * Operator, 2026-10-01: *"the letter is replaced without the need to write the text in the input and if
 * a letter is occupied, it offers to switch letters … we want that same mechanism now for analytics and
 * also for the 3d tool"*. This is 2-D's point menu (FR-RN-10; #238 / ADR-520 the holder line; #1013 /
 * #1199 / ADR-532 the symmetric swap offer; ADR-520 Am. 2 the declared button colour), moved here
 * unchanged in behaviour and look so every builder renders the same one.
 *
 * Parameterized by the caller (ADR-W-016 rule 2): the position, the title, the point's label, the two
 * operations as callbacks, and every string. It imports no product tree and no i18n, and never asks which
 * product it is in. Its decisions live in {@link ./letterOffer} so the locks call them.
 *
 * The caller MOUNTS it per opening (a fresh `key` per point click), so the typed text, the note and the
 * offer never leak from one point to the next — 2-D's `openMenu` reset, made structural.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { color } from '../theme';
import { afterRename, afterSwap, fillLetters, swapOffered, typedLetter, type LetterHolderView, type LetterRenameResult, type LetterSwapResult } from './letterOffer';

export interface LetterPopoverStrings {
  /** the input's placeholder («אות») */
  placeholder: string;
  /** the ✓ button's tooltip («החילו») */
  apply: string;
  /** the note on a taken letter («האות כבר בשימוש») */
  taken: string;
  /** the note on any other refusal («אות לא תקינה») */
  bad: string;
  /** the holder line, `{{what}}` = the holder's text («האות תפוסה על ידי: «{{what}}»») */
  takenBy: string;
  /** the swap button, `{{a}}` = this point, `{{b}}` = the letter asked for («החליפו בין {{a}} ל-{{b}}») */
  swapLetters: string;
}

export interface LetterPopoverProps {
  /** the anchor, in px of the positioned container the popover is drawn in (the click point) */
  x: number;
  y: number;
  /** that container's size — the popover is clamped inside it */
  bounds: { width: number; height: number };
  /** the header line (2-D: the label; 3-D: «שינוי שם: A») */
  title: ReactNode;
  /** the clicked point's label — what `onRename`/`onSwap` receive as their first letter */
  label: string;
  /** absent = no letter input (2-D: a hidden point shows only «show label») */
  onRename?: (from: string, to: string) => LetterRenameResult;
  /** absent = no swap offer, even on a taken letter */
  onSwap?: (a: string, b: string) => LetterSwapResult;
  strings: LetterPopoverStrings;
  onClose: () => void;
  /** the longest label the product can type (2-D 3 — `C12`; 3-D 4 — `C12'`) */
  maxLength?: number;
  /** the product's own extra menu items, below the letter block (2-D: hide/show label) */
  children?: ReactNode;
  testId?: string;
}

/**
 * The popover's buttons. The COLOUR IS DECLARED (ADR-520 Am. 2, #1277): the swap offer sits inside the
 * holder note's muted block and a button may inherit its colour — the operator read a live offer as
 * disabled. Declared, with the ink value as the fallback for a builder whose stylesheet has no token.
 */
export const letterPopoverBtn: CSSProperties = {
  color: `var(--color-text, ${color.ink})`,
  padding: '5px 9px',
  fontSize: 13,
  lineHeight: 1.2,
  minWidth: 28,
  borderRadius: 6,
  border: `1px solid ${color.borderStrong}`,
  background: color.surfaceDim,
  cursor: 'pointer',
};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function LetterPopover({ x, y, bounds, title, label, onRename, onSwap, strings, onClose, maxLength = 3, children, testId }: LetterPopoverProps) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState<'taken' | 'bad' | null>(null);
  const [takenBy, setTakenBy] = useState<{ holder: LetterHolderView; to: string } | null>(null);

  function apply() {
    const to = typedLetter(value);
    if (!to || !onRename) return;
    const out = afterRename(onRename(label, to), to);
    if (out.close) return onClose();
    setNote(out.note);
    setTakenBy(out.takenBy);
    // #238: the holder is a step row the student has no reason to connect to «האות כבר בשימוש» —
    // the product lights it up, where it can.
    out.takenBy?.holder.onHighlight?.();
  }

  /**
   * #1013: THE OFFER EXCHANGES TWO LETTERS. IT NEVER DELETES A STATEMENT. It once dropped the holder and
   * renamed onto the freed letter; operator ruling 2026-09-18: *"deleting a phase is a capability I do not
   * want to have automatically done as users will not expect the consequences."* A swap destroys nothing.
   */
  function swap() {
    if (!takenBy || !onSwap) return;
    const out = afterSwap(onSwap(label, takenBy.to));
    if (out.close) return onClose();
    setNote(out.note);
  }

  return (
    <>
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />
      <div
        data-testid={testId}
        style={{
          position: 'absolute',
          // PHYSICAL `left`, not `insetInlineStart` (2-D F1/REN-1): `x` is a left-based canvas pixel, and
          // under the Hebrew-default `dir=rtl` a logical inset resolves to `right` — the menu would open
          // MIRRORED, far from the clicked point.
          left: clamp(x + 8, 0, Math.max(0, bounds.width - 150)),
          top: clamp(y + 8, 0, Math.max(0, bounds.height - 80)),
          background: color.surface,
          border: `1px solid ${color.borderStrong}`,
          borderRadius: 8,
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 10,
          minWidth: 132,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{title}</div>
        {onRename && (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              autoFocus
              data-testid={testId ? `${testId}-input` : undefined}
              value={value}
              maxLength={maxLength}
              placeholder={strings.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                if (note) setNote(null);
                if (takenBy) setTakenBy(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply();
                if (e.key === 'Escape') onClose();
              }}
              style={{ width: 64, padding: '3px 6px', fontSize: 13, borderRadius: 6, border: `1px solid ${color.borderStrong}`, textTransform: 'uppercase' }}
            />
            <button type="button" style={letterPopoverBtn} title={strings.apply} aria-label={strings.apply} onClick={apply}>
              ✓
            </button>
          </div>
        )}
        {note && <div style={{ fontSize: 11, color: color.danger }}>{note === 'taken' ? strings.taken : strings.bad}</div>}
        {takenBy && (
          <div style={{ fontSize: 11, color: color.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* #238: the holder, in the student's OWN wording — a step row they can recognise. */}
            <span>{fillLetters(strings.takenBy, { what: takenBy.holder.text })}</span>
            {onSwap && swapOffered(takenBy.holder) && (
              <button type="button" data-testid={testId ? `${testId}-swap` : undefined} style={{ ...letterPopoverBtn, textAlign: 'start' }} onClick={swap}>
                {fillLetters(strings.swapLetters, { a: label, b: takenBy.to })}
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
