/**
 * The tool-row action button — ONE look for the session actions in every builder (the operator's
 * 2026-08-18 catch: the frame shared the row's structure while each product styled and labelled
 * its own buttons, so שמור/טען rendered visibly differently between builders). Products supply
 * the handler and the translated label; the suite supplies the appearance.
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, fs, radius } from '../theme';

export function ToolButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { ...base, opacity: 0.45, cursor: 'default' } : base}
    >
      {children}
    </button>
  );
}

const base: CSSProperties = {
  fontSize: fs.body,
  padding: '8px 14px',
  border: `1px solid ${color.borderStrong}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
