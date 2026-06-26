/**
 * A small, dependency-free modal overlay (Phase-1 UX).
 *
 * Centered card over a dimmed backdrop; closes on backdrop click or Escape. It
 * inherits the document's `dir` (RTL Hebrew), so content lays out right-to-left.
 * Used for the "what is this?" intro and the help guide.
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, footer, width = 540 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={{ ...card, maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
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

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};
const card: React.CSSProperties = {
  width: '100%',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  color: '#0f172a',
  borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
  overflow: 'hidden',
};
const head: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 18px',
  borderBottom: '1px solid #e2e8f0',
};
const body: React.CSSProperties = { padding: 18, overflowY: 'auto', fontSize: 14, lineHeight: 1.6 };
const foot: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 18px',
  borderTop: '1px solid #e2e8f0',
};
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  lineHeight: 1,
  color: '#64748b',
  cursor: 'pointer',
  padding: '0 4px',
};
