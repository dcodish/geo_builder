/**
 * The shared app frame — the header every builder shares, per the operator's rulings:
 * docs/28 §4 ("shell/ owns the frame": a switcher in every builder's toolbar is a frame the
 * builders share) and §4a D4 (full bar; title and the switcher visible; secondary actions behind
 * the `⋯` overflow; every builder mounts the FULL action set, About/privacy included).
 *
 * Parameterized by the caller, always: every label, every menu item, the About content and the
 * privacy note arrive translated through the product's own i18n instance. `shell/` holds no
 * strings and knows no product (ADR-W-003 / ADR-W-016 rule 2). The About modal REQUIRES the
 * privacy text — NFR-SE-3's note is part of the frame precisely so no builder can ship publicly
 * without one again (complex did).
 *
 * What is deliberately NOT here: the DOF cue and the figure actions live UNDER THE CANVAS by D7
 * — a body concern the product composes (B6, #671); quick commands are B4 (#669); the fact list
 * is B5 (#670). The frame is the bar, the banners' voice, the About, and the switcher.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { color, fs } from '../theme';
import { Modal } from './Modal';
import { OverflowMenu, type MenuItem } from './Menu';
import { ProductSwitcher, type RosterEntry } from './Switcher';

export interface AppFrameAbout {
  /** The overflow entry's label (e.g. «אודות»). */
  label: string;
  title: string;
  body: ReactNode;
  /** The in-app privacy note (NFR-SE-3). Required — a public builder without one is the gap. */
  privacy: string;
  closeLabel: string;
}

export interface AppFrameProps {
  title: string;
  subtitle?: string;
  /** The product's PRIMARY visible controls (figure actions move under the canvas in B6/D7). */
  headerActions?: ReactNode;
  /** D4's collapsed set: save / load / export / language / guide — the frame appends About. */
  overflowItems?: MenuItem[];
  /** Accessible label for the `⋯` trigger. */
  menuLabel: string;
  about: AppFrameAbout;
  /** The build stamp (`__BUILD__`), shown in About — provenance for bug reports. */
  buildStamp?: string;
  /** The builder roster, as DATA (A2's registry lights this; <2 entries renders nothing). */
  roster?: RosterEntry[];
  activeProductId?: string;
  /** A notice/error region between the header and the body (load audit, global notices). */
  banner?: ReactNode;
  children: ReactNode;
}

export function AppFrame({
  title,
  subtitle,
  headerActions,
  overflowItems,
  menuLabel,
  about,
  buildStamp,
  roster,
  activeProductId,
  banner,
  children,
}: AppFrameProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const items: MenuItem[] = [
    ...(overflowItems ?? []),
    { key: 'about', label: about.label, onSelect: () => setAboutOpen(true) },
  ];

  return (
    <>
      <header style={headerRow}>
        <div style={{ minWidth: 0 }}>
          <h1 style={h1Style}>{title}</h1>
          {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        </div>
        <div style={actionsRow}>
          {headerActions}
          {roster && activeProductId ? (
            <ProductSwitcher roster={roster} activeId={activeProductId} />
          ) : null}
          <OverflowMenu label={menuLabel} items={items} />
        </div>
      </header>
      {banner}
      {children}
      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={about.title}
        footer={
          <button type="button" style={closeBtnStyle} onClick={() => setAboutOpen(false)}>
            {about.closeLabel}
          </button>
        }
      >
        {about.body}
        <p style={privacyStyle}>{about.privacy}</p>
        {buildStamp && <p style={stampStyle}>{buildStamp}</p>}
      </Modal>
    </>
  );
}

const headerRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 10,
};
const h1Style: CSSProperties = { fontSize: fs.h1, margin: 0, color: color.ink };
const subtitleStyle: CSSProperties = { margin: '2px 0 0', color: color.muted, fontSize: fs.body };
const actionsRow: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const closeBtnStyle: CSSProperties = {
  fontSize: fs.body,
  padding: '7px 14px',
  border: `1px solid ${color.primary}`,
  borderRadius: 8,
  background: color.primary,
  color: '#fff',
  cursor: 'pointer',
};
const privacyStyle: CSSProperties = { marginTop: 12, marginBottom: 0, fontSize: fs.small, color: color.muted };
const stampStyle: CSSProperties = { marginTop: 6, marginBottom: 0, fontSize: fs.caption, color: color.faint };
