/**
 * The EMPTY-CANVAS quick commands (D9b's first half, B4 #669): large clickable chips centered on
 * the empty canvas — a first click that needs no reading and no typing — with a warm headline and
 * a manual link slot. One component, every builder; the commands and every string are the
 * caller's (the A3 config's curated list rides in where the operator saved one).
 */
import type { CSSProperties } from 'react';
import { color, fs } from '../theme';

export function QuickChips({
  title,
  hint,
  commands,
  onPick,
  manualLabel,
  manualHref,
}: {
  title: string;
  hint: string;
  commands: readonly string[];
  onPick: (command: string) => void;
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
            {cmd}
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
