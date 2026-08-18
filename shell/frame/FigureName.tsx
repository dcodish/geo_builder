/**
 * The figure's name — ONE component, mounted identically by every builder (the operator's B3
 * ruling: the name is CENTERED ABOVE THE CANVAS, because it names the drawing; and the operator's
 * sharing challenge: a field that existed separately in 2-D and 3-D — the ≥2× evidence — becomes
 * shared the moment its position is standardized, or it drifts a third time).
 *
 * One control is both the field and the visible name (the #42 pattern). The value and its store
 * are the product's; the LOOK and the position discipline are the suite's.
 */
import type { CSSProperties } from 'react';
import { color, fs } from '../theme';

export function FigureName({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      dir="auto"
      aria-label={placeholder}
      style={field}
    />
  );
}

const field: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: 440,
  marginInline: 'auto',
  padding: '7px 12px',
  fontSize: fs.title,
  fontWeight: 600,
  textAlign: 'center',
  color: color.ink,
  background: 'transparent',
  border: `1.5px dashed ${color.borderStrong}`,
  borderRadius: 9,
  outline: 'none',
};
