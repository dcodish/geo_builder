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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

  /**
   * THE LANGUAGE TOGGLE AND THE DIRECTION FLIP ARE THE FRAME'S — suite-level chrome by the level
   * model, implemented ONCE (the operator caught the copy: complex and 3-D each carried an
   * identical dir-sync effect and an identical button — the "implemented-or-forgotten N times"
   * pattern this tree exists to kill). The frame reads the CALLER's i18n instance through the
   * provider it is mounted under — parameterized by context, never by import — and requires ONE
   * documented locale key of every consumer: `language` (the toggle's label, naming the OTHER
   * language). Logical CSS properties do the actual mirroring once `dir` is honest.
   */
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
  }, [i18n.language]);
  // The suite owns the page GROUND: one background in every builder (the parity checker caught
  // 3-D painting an inner div while complex painted body — the frame rows sat on different
  // colors). Set once, by the one component every builder mounts.
  useEffect(() => {
    document.body.style.background = color.surfaceDim;
  }, []);

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
            <button
              type="button"
              style={suiteBtn}
              onClick={() => void i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}
            >
              {t('language')}
            </button>
            <button type="button" style={suiteBtn} onClick={() => setAboutOpen(true)}>
              {about.label}
            </button>
          </div>
        </div>
      </div>
      {/* LEVEL 2 — the tool: this session. Title beside the session's actions — in a FIXED-width
          block (operator, 2026-08-18): the actions must sit at the SAME position in every builder,
          never drifting with the length of a tool's name. */}
      <header style={{ ...container, ...toolRow }}>
        <div style={titleBlock}>
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

/** The frame's OWN font metrics (the parity checker's lesson: buttons and titles measured
 *  differently per tool because consumer CSS resets leaked into unset properties — a shell
 *  component states everything it cares about). */
const frameFont: CSSProperties = {
  fontFamily: "system-ui, 'Segoe UI', sans-serif",
  lineHeight: 1.4,
};
/** One container so the suite bar's content, the tool row and the body align — full width with
 *  matched edge padding (operator, 2026-08-17: the centred cap wasted the screen's sides). */
const container: CSSProperties = {
  margin: '0 auto',
  paddingInline: 20,
};
const suiteBar: CSSProperties = {
  background: color.surface,
  borderBottom: `1px solid ${color.border}`,
};
const suiteInner: CSSProperties = {
  ...frameFont,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  paddingBlock: 7,
  flexWrap: 'wrap', // phones: the strip and the suite buttons stack instead of overflowing
};
/** START-clustered (operator, B3 play): the session actions sit right after the title — on the
 *  RIGHT in Hebrew, on the LEFT in English — never flung to the far end of the row. Logical flex
 *  start gives the mirroring for free when `dir` flips. */
const toolRow: CSSProperties = {
  ...frameFont,
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  gap: 18,
  paddingBlock: 12,
  flexWrap: 'wrap', // phones: the title block and the action buttons stack
};
const suiteActionsRow: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' };
const suiteBtn: CSSProperties = {
  ...frameFont,
  fontSize: fs.body,
  padding: '6px 12px',
  border: `1px solid ${color.border}`,
  borderRadius: radius.control,
  background: color.surface,
  color: color.ink,
  cursor: 'pointer',
};
// EXPLICIT weight — the operator caught the frame trusting browser defaults: complex rendered the
// bold default while 3-D's Tailwind preflight reset headings to normal. A shell component states
// every property it cares about; consumer stylesheets differ by construction.
/** Constant width so the session actions anchor at ONE position across all builders — but never
 *  wider than the viewport allows (phones: the block shrinks and the row wraps). */
const titleBlock: CSSProperties = { flex: '0 1 320px', minWidth: 0, maxWidth: '100%' };
const h1Style: CSSProperties = { fontSize: fs.h1, fontWeight: 700, lineHeight: 1.3, margin: 0, color: color.ink };
const subtitleStyle: CSSProperties = {
  margin: '2px 0 0',
  color: color.muted,
  fontSize: fs.body,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
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
