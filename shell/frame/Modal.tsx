/**
 * A small, dependency-free modal overlay — the 2-D `src/ui/Modal.tsx` mechanism entering the
 * shared shell (ADR-W-016: the app frame's About/privacy modal; 3-D's own code said "this app has
 * no about modal", which is the gap the shared frame closes).
 *
 * Centered card over a dimmed backdrop; closes on backdrop click or Escape; inherits the
 * document's `dir` (RTL Hebrew), so content lays out right-to-left.
 *
 * A11y (the 2-D F6 discipline, kept): the dialog takes INITIAL FOCUS on open, TRAPS Tab inside
 * itself, is labelled by its title, and RESTORES focus to the opener on close.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { color, fs, radius } from '../theme';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, width = 540 }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // remember the opener, take initial focus, and restore on close
    const opener = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && cardRef.current) {
        // keep Tab cycling INSIDE the dialog (a11y focus trap)
        const focusables = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => el.offsetParent !== null,
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === cardRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        ref={cardRef}
        tabIndex={-1}
        style={{ ...card, maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={head}>
          <div id={titleId} style={{ fontSize: 18, fontWeight: 700 }}>
            {title}
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="close">
            ×
          </button>
        </div>
        <div style={body}>{children}</div>
        {footer && <div style={foot}>{footer}</div>}
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};
const card: CSSProperties = {
  width: '100%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  background: color.surface,
  color: color.ink,
  borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
  overflow: 'hidden',
  outline: 'none',
};
const head: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 18px',
  borderBottom: `1px solid ${color.border}`,
};
const body: CSSProperties = { padding: 18, overflowY: 'auto', fontSize: fs.control, lineHeight: 1.6 };
const foot: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 18px',
  borderTop: `1px solid ${color.border}`,
};
const closeBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  lineHeight: 1,
  color: color.muted,
  cursor: 'pointer',
  padding: '0 4px',
  borderRadius: radius.control,
};
