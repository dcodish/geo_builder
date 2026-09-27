/**
 * THE ABOUT CONTENT IS A DECLARATION, NOT FREE JSX (#1477, ADR-W-091).
 *
 * `AppFrameAbout.body` used to be a free `ReactNode`, so the About STRUCTURE was not a shell contract:
 * each builder hand-wrote its own body, and only the first one (2-D) wrote the full version — a lead,
 * what the tool does, a «try this» sequence and the author credit. 3-D and complex shipped one
 * sentence, analytic a plain string. The operator, playing round #1469: *"the text on the 2d tool is
 * more detailed than the rest of the tools"*. The same shape #1426 fixed for the privacy note
 * (ADR-W-090): the frame took free content where it should take a declaration.
 *
 * So a product hands the frame the PARTS, and the frame renders ONE layout. A builder can no longer
 * ship a thinner About, because there is nothing to leave out: the §5c lock
 * (`shell/__tests__/fixtures/about-content-rows.ts`) holds every registered builder to a non-empty
 * lead, at least three points and at least two try steps in he AND en — and runs every try step
 * through that builder's real submit gate, in order, on an empty canvas, so a sample line that stops
 * building fails the suite instead of teaching a student a sentence the tool refuses.
 *
 * The CREDIT line is suite chrome — the same author and contact in every builder — so its LAYOUT is
 * here, drawn from the design tokens. Its words stay the caller's (ADR-W-016 rule 2): this module
 * holds no strings and knows no product.
 */
import type { CSSProperties } from 'react';
import { makeBidi } from '../bidi';
import { color, fs } from '../theme';

export interface AboutCredit {
  /** «פותח על־ידי» / "Developed by". */
  by: string;
  /** The author's name as the locale writes it. */
  name: string;
  /** The contact label before the address («לשאלות» / "Questions"). */
  contact: string;
  /** The contact address (a mailto link). */
  email: string;
}

export interface AboutContent {
  /** One paragraph: what the tool is. */
  lead: string;
  /** What it does, one bullet each: who it is for, step-by-step building, draws-not-solves, … */
  points: ReadonlyArray<string>;
  /** The heading above the sample sequence. */
  tryTitle: string;
  /** Sample lines that BUILD, in order, on an empty canvas — each one a sentence the student can type. */
  trySteps: ReadonlyArray<string>;
  credit: AboutCredit;
}

/** A sample line's base direction comes from its CONTENT (#118): «ריבוע ABCD» is RTL, `z1 = 3+4i` LTR. */
const dirOf = makeBidi().textDir;

/** The one About layout every builder renders — the frame's modal and 2-D's first-load intro alike. */
export function AboutBody({ content }: { content: AboutContent }) {
  const { lead, points, tryTitle, trySteps, credit } = content;
  return (
    <>
      <p style={{ marginTop: 0 }}>{lead}</p>
      <ul style={pointsStyle}>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div style={tryTitleStyle}>{tryTitle}</div>
      <ol style={stepsStyle}>
        {trySteps.map((s) => (
          <li key={s} dir={dirOf(s)} data-about-step="" style={stepStyle}>
            {s}
          </li>
        ))}
      </ol>
      <p style={creditStyle}>
        {credit.by} <strong style={{ color: color.ink }}>{credit.name}</strong> · {credit.contact}:{' '}
        <a href={`mailto:${credit.email}`} style={{ color: color.primary, textDecoration: 'none' }}>
          {credit.email}
        </a>
      </p>
    </>
  );
}

// The list markers are STATED (the frame's rule: a shell component states every property it cares
// about). Consumer resets differ — 2-D's and 3-D's stylesheets strip markers, complex's and analytic's
// do not — so leaving it unset drew bullets and numbers in two builders and none in the other two.
const pointsStyle: CSSProperties = { listStyle: 'none', margin: '8px 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 };
const tryTitleStyle: CSSProperties = { fontWeight: 600, marginTop: 12 };
const stepsStyle: CSSProperties = { listStyle: 'none', margin: '6px 0 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4 };
const stepStyle: CSSProperties = { fontSize: fs.body, color: color.primaryInk };
const creditStyle: CSSProperties = { marginTop: 12, marginBottom: 0, fontSize: fs.small, color: color.muted };
