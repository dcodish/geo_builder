/**
 * THE MANUAL SCREEN — one chrome for the per-builder guide (A6 #665 / B7 #672; docs/28 §4a D9,
 * operator ruling 2026-08-16: *"a separate screen altogether for each tool with examples of how to
 * enter commands — more of a manual guide than just a list of options"*).
 *
 * A full-page overlay over the tool (its own scroll — a manual reads like a document), with the
 * builder's example sentences grouped into sections. Every string and every entry comes from the
 * CALLER — the products drive this from their catalogs, which are also their coverage maps, so a
 * construct missing from the manual is a construct missing from coverage (the catalog discipline).
 * An entry with `onTry` is clickable: it SUBMITS the example into the tool and closes the manual —
 * reading about a command and watching it build are one gesture.
 */
import type { CSSProperties, ReactNode } from 'react';
import { color } from '../theme';

export interface ManualEntry {
  /** The example sentence, exactly as typed. Pass it pre-ISOLATED (the product's bidi kit) when
   *  it mixes scripts. */
  example: string;
  /** Base direction by CONTENT (the #118 rule): a Hebrew sentence is rtl, pure math ltr — the
   *  product's own textDir decides. Defaults to ltr for the math-first callers. */
  dir?: 'rtl' | 'ltr';
  /** Optional — a catalog without prose (3-D's) lists bare examples. */
  description?: ReactNode;
  onTry?: () => void;
}

export interface ManualSection {
  key: string;
  title: string;
  entries: readonly ManualEntry[];
}

export interface ManualScreenProps {
  open: boolean;
  title: string;
  intro?: ReactNode;
  sections: readonly ManualSection[];
  closeLabel: string;
  onClose: () => void;
  /** Tooltip for a clickable example (e.g. «לחצו כדי לנסות»). */
  tryHint?: string;
  /** A GUIDE shows representatives, not the inventory (operator ruling 2026-08-18: the full list
   *  is overwhelming) — cap each section at N examples; `moreNote` renders after a capped
   *  section («...ואלו רק דוגמאות»). Omit for the full list. */
  sectionCap?: number;
  moreNote?: string;
}

export function ManualScreen({ open, title, intro, sections, closeLabel, onClose, tryHint, sectionCap, moreNote }: ManualScreenProps) {
  if (!open) return null;
  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div style={sheet}>
        <div style={head}>
          <h1 style={titleStyle}>{title}</h1>
          <button type="button" style={closeBtn} onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {intro != null && <p style={introStyle}>{intro}</p>}
        {sections.map((s) => {
          const shown = sectionCap ? s.entries.slice(0, sectionCap) : s.entries;
          return (
          <section key={s.key} style={sectionStyle}>
            <h2 style={sectionTitle}>{s.title}</h2>
            <div style={entryList}>
              {shown.map((e) => (
                <div key={e.example} style={entryRow}>
                  {e.onTry ? (
                    <button
                      type="button"
                      style={e.dir === 'rtl' ? { ...exampleBtn, direction: 'rtl' } : exampleBtn}
                      dir={e.dir ?? 'ltr'}
                      title={tryHint}
                      onClick={e.onTry}
                    >
                      {e.example}
                    </button>
                  ) : (
                    <code style={e.dir === 'rtl' ? { ...exampleCode, direction: 'rtl' } : exampleCode} dir={e.dir ?? 'ltr'}>
                      {e.example}
                    </code>
                  )}
                  {e.description != null && <span style={descStyle}>{e.description}</span>}
                </div>
              ))}
              {sectionCap !== undefined && s.entries.length > sectionCap && moreNote != null && (
                <span style={moreStyle}>{moreNote}</span>
              )}
            </div>
          </section>
          );
        })}
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  background: color.surfaceDim,
  overflowY: 'auto',
  fontFamily: "system-ui, 'Segoe UI', sans-serif",
  lineHeight: 1.5,
  color: color.ink,
};
const sheet: CSSProperties = { maxWidth: 880, margin: '0 auto', padding: '28px 24px 60px' };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 };
const titleStyle: CSSProperties = { fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.3 };
const closeBtn: CSSProperties = {
  border: `1px solid ${color.border}`,
  background: color.surface,
  color: color.ink,
  borderRadius: 9,
  padding: '8px 16px',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const introStyle: CSSProperties = { margin: '0 0 18px', color: color.muted, fontSize: '0.95rem', maxWidth: 640 };
const sectionStyle: CSSProperties = { marginBottom: 22 };
const sectionTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: '0 0 8px',
  paddingBottom: 4,
  borderBottom: `1px solid ${color.border}`,
};
const entryList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const entryRow: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' };
const exampleBtn: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '0.9rem',
  direction: 'ltr',
  padding: '4px 12px',
  borderRadius: 8,
  border: `1px solid ${color.primaryBorder}`,
  background: color.primarySoft,
  color: color.primaryInk,
  cursor: 'pointer',
  flexShrink: 0,
};
const exampleCode: CSSProperties = {
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: '0.9rem',
  direction: 'ltr',
  padding: '4px 12px',
  borderRadius: 8,
  border: `1px solid ${color.border}`,
  background: color.surface,
  flexShrink: 0,
};
const descStyle: CSSProperties = { fontSize: '0.9rem', color: color.muted, minWidth: 200, flex: 1 };
const moreStyle: CSSProperties = { fontSize: '0.8rem', color: color.faint, fontStyle: 'italic', paddingTop: 2 };
