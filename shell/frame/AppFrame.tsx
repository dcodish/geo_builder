/**
 * The shared app frame — TWO of the three levels of the ruled model (docs/28 §4a, the operator's
 * 2026-08-17 levels ruling on mockup D: *a control lives at the level of the thing it acts on*):
 *
 *   LEVEL 1 — the SUITE bar: which tool. The builder strip + the `⋯` menu (language, About).
 *   Identical chrome in every builder.
 *   LEVEL 2 — the TOOL row: this session. The product's title/subtitle beside its session
 *   actions (שמור/טען; B3's figure-name field joins the same cluster).
 *   LEVEL 3 — the SURFACE — is deliberately NOT here: figure actions live UNDER THE CANVAS (D7),
 *   the palette with the input box, row operations with the fact list. The product composes those.
 *
 * Parameterized by the caller, always: every label, every menu item, the About content and the
 * privacy note arrive translated through the product's own i18n instance. `shell/` holds no
 * strings and knows no product (ADR-W-003 / ADR-W-016 rule 2). The About modal REQUIRES the
 * privacy text — NFR-SE-3's note is part of the frame precisely so no builder can ship publicly
 * without one again (complex did).
 *
 * The frame is page-level: the suite bar runs full-bleed with a bottom border, and the bar's
 * inner content + the tool row share one centred container so the levels align with the body.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { color, fs, radius } from '../theme';
import { Modal } from './Modal';
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
  /** VISIBLE utilities in the TOOL row — שמור/טען per the #706 D4 amendment and level model. */
  utilityActions?: ReactNode;
  /** SUITE-level actions, rendered as visible buttons on the suite bar (the operator's 2026-08-17
   *  ruling retired the `⋯` menu: with two items left, a menu is pure hiding). The product passes
   *  its language toggle; the frame appends the About button. */
  suiteActions?: ReactNode;
  about: AppFrameAbout;
  /** The build stamp (`__BUILD__`), shown in About — provenance for bug reports. */
  buildStamp?: string;
  /** The builder roster, as DATA (A2's registry lights this; <2 entries renders nothing). */
  roster?: RosterEntry[];
  activeProductId?: string;
  /** Accessible name for the builder strip — the caller's string. */
  switcherLabel?: string;
  /** The strip's fold-segment label («עוד») — needed once the roster outgrows the inline cap. */
  switcherMoreLabel?: string;
  /** A notice/error region between the header and the body (load audit, global notices). */
  banner?: ReactNode;
  children: ReactNode;
}

export function AppFrame({
  title,
  subtitle,
  headerActions,
  utilityActions,
  suiteActions,
  about,
  buildStamp,
  roster,
  activeProductId,
  switcherLabel,
  switcherMoreLabel,
  banner,
  children,
}: AppFrameProps) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      {/* LEVEL 1 — the suite: which tool. Full-bleed bar, identical in every builder. */}
      <div style={suiteBar}>
        <div style={{ ...container, ...suiteInner }}>
          {roster && activeProductId ? (
            <ProductSwitcher
              roster={roster}
              activeId={activeProductId}
              ariaLabel={switcherLabel}
              moreLabel={switcherMoreLabel}
            />
          ) : (
            <span />
          )}
          <div style={suiteActionsRow}>
            {suiteActions}
            <button type="button" style={suiteBtn} onClick={() => setAboutOpen(true)}>
              {about.label}
            </button>
          </div>
        </div>
      </div>
      {/* LEVEL 2 — the tool: this session. Title beside the session's actions. */}
      <header style={{ ...container, ...toolRow }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={h1Style}>{title}</h1>
          {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        </div>
        <div style={actionsRow}>
          {headerActions}
          {utilityActions}
        </div>
      </header>
      {banner && <div style={container}>{banner}</div>}
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

/** One centred container so the suite bar's content, the tool row and the body align. */
const container: CSSProperties = {
  maxWidth: 1180,
  margin: '0 auto',
  paddingInline: 16,
};
const suiteBar: CSSProperties = {
  background: color.surface,
  borderBottom: `1px solid ${color.border}`,
};
const suiteInner: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  paddingBlock: 7,
};
const toolRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  paddingBlock: 12,
};
const suiteActionsRow: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' };
const suiteBtn: CSSProperties = {
  fontSize: fs.body,
  padding: '6px 12px',
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
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
