/**
 * The cross-product checks for the ABOUT CONTENT (#1477, ADR-W-091), written per docs/28 §5c.
 *
 * The operator, playing round #1469: *"the text on the 2d tool is more detailed than the rest of the
 * tools"*. Measured: 2-D's About carried a lead, three points, a «try this» sequence and the credit;
 * 3-D and complex carried one sentence, analytic a plain string. The class: `AppFrameAbout.body` was
 * free JSX, so the About STRUCTURE was not a contract and each builder wrote as much as it happened
 * to. It is now a declaration (`shell/frame/about.tsx` → `AboutContent`), and these rows hold every
 * registered builder to it.
 *
 * ## The rows
 *
 *  - he AND en are both declared (a builder's English UI must not fall back to a one-liner);
 *  - a non-empty lead and try title, at least {@link MIN_POINTS} points and {@link MIN_STEPS} try
 *    steps, none empty and none repeated (a repeat is also a React key collision);
 *  - the credit is complete, and its address is the suite's ONE copy (`products.json` → `contact`);
 *  - **every try step BUILDS**: the product's runner submits the steps through its REAL submit gate,
 *    in order, from an empty canvas, and each must be accepted. A sample line that stops parsing — or
 *    that parses and is refused in that figure — fails here, never on a student's screen;
 *  - the runner was EXERCISED: it returned one verdict per step. A runner that returns early would
 *    otherwise pass a builder by checking nothing;
 *  - the shared layout RENDERS every section: each point, the try title, one `data-about-step` line per
 *    step with its content-derived direction, and the credit.
 *
 * The step text is submitted with its bidi format controls stripped: the product's i18n isolates LTR
 * runs in the DISPLAYED line (`ריבוע ⁦ABCD⁩`), and what a student types is the bare text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeBidi, stripFormatControls } from '../../bidi';
import { AboutBody, type AboutContent } from '../../frame/about';
import { REPO_ROOT, registryProducts } from './privacy-disclosure-rows';

export const MIN_POINTS = 3;
export const MIN_STEPS = 2;
export const LOCALES = ['he', 'en'] as const;

/** One try step's outcome through the product's real submit gate. */
export interface StepVerdict {
  step: string;
  ok: boolean;
  /** Why it was refused — the gate's own words, for the failure message. */
  why?: string;
}

/** Submit `steps` in order on an EMPTY canvas through the product's real gate; one verdict per step. */
export type StepRunner = (steps: readonly string[]) => StepVerdict[];

export interface AboutSubject {
  /** The declaration the product hands `AppFrame`, per locale, through its real i18n. */
  declarations: Partial<Record<string, AboutContent>>;
  run: StepRunner;
  /** The layout under test. Default: the shared `AboutBody`; the meta-lock substitutes broken ones. */
  Body?: (props: { content: AboutContent }) => ReactNode;
  /** The suite's contact address. Default: `products.json` → `contact.email`. */
  contactEmail?: string;
}

export function suiteContactEmail(root: string = REPO_ROOT): string {
  return (JSON.parse(readFileSync(path.join(root, 'products.json'), 'utf8')) as { contact: { email: string } }).contact.email;
}

const dirOf = makeBidi().textDir;
const blank = (s: string | undefined) => !s || s.trim().length === 0;
const decode = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Every violated property, named. Empty array = the builder's About is complete and every step builds. */
export function aboutContentFaults(s: AboutSubject): string[] {
  const faults: string[] = [];
  const Body = s.Body ?? AboutBody;
  const email = s.contactEmail ?? suiteContactEmail();
  if (Object.keys(s.declarations).length === 0) faults.push('no declaration was supplied — the lock checked nothing');

  for (const loc of LOCALES) {
    const d = s.declarations[loc];
    if (!d) {
      faults.push(`[${loc}] no About declaration for this locale`);
      continue;
    }
    if (blank(d.lead)) faults.push(`[${loc}] the lead is empty`);
    if (blank(d.tryTitle)) faults.push(`[${loc}] the «try this» title is empty`);
    if (d.points.length < MIN_POINTS) faults.push(`[${loc}] ${d.points.length} point(s) — the About needs at least ${MIN_POINTS}`);
    if (d.trySteps.length < MIN_STEPS) faults.push(`[${loc}] ${d.trySteps.length} try step(s) — the About needs at least ${MIN_STEPS}`);
    d.points.forEach((p, i) => blank(p) && faults.push(`[${loc}] point ${i + 1} is empty`));
    d.trySteps.forEach((p, i) => blank(p) && faults.push(`[${loc}] try step ${i + 1} is empty`));
    for (const [what, xs] of [['point', d.points], ['try step', d.trySteps]] as const) {
      const dup = xs.find((x, i) => xs.indexOf(x) !== i);
      if (dup !== undefined) faults.push(`[${loc}] the ${what} «${dup}» appears twice`);
    }
    const c = d.credit;
    if (blank(c?.by) || blank(c?.name) || blank(c?.contact)) faults.push(`[${loc}] the credit line is incomplete`);
    if (c?.email !== email) faults.push(`[${loc}] the credit links «${c?.email}», not the suite contact «${email}» (products.json)`);

    // every try step BUILDS, in order, from an empty canvas, through the product's real gate
    const typed = d.trySteps.map(stripFormatControls);
    const verdicts = s.run(typed);
    if (verdicts.length !== typed.length) {
      faults.push(`[${loc}] the step runner returned ${verdicts.length} verdict(s) for ${typed.length} step(s) — it did not check every step`);
    }
    verdicts.forEach((v, i) => {
      if (!v.ok) faults.push(`[${loc}] try step ${i + 1} «${v.step}» is REFUSED by the submit gate${v.why ? `: ${v.why}` : ''}`);
    });

    // the shared layout renders every section
    const html = renderToStaticMarkup(createElement(Body, { content: d }));
    const text = decode(html);
    for (const part of [d.lead, d.tryTitle, ...d.points, c?.name ?? '', email]) {
      if (part && !text.includes(part)) faults.push(`[${loc}] the rendered About is missing «${part.slice(0, 40)}»`);
    }
    const steps = [...html.matchAll(/<li([^>]*)data-about-step=""([^>]*)>([\s\S]*?)<\/li>/g)];
    if (steps.length !== d.trySteps.length) {
      faults.push(`[${loc}] the rendered About shows ${steps.length} try line(s) for ${d.trySteps.length} step(s)`);
    }
    steps.forEach((m, i) => {
      const step = d.trySteps[i];
      const dir = /\bdir="(rtl|ltr)"/.exec(m[1] + m[2])?.[1];
      if (step !== undefined && dir !== dirOf(step)) faults.push(`[${loc}] try line ${i + 1} renders dir=${dir ?? 'none'}, want ${dirOf(step)} from its content`);
      if (step !== undefined && decode(m[3]) !== step) faults.push(`[${loc}] try line ${i + 1} renders «${decode(m[3])}», not «${step}»`);
    });
  }
  return faults;
}

/** The per-tree lock: one row, so a failure names every fault at once. */
export function aboutContentSuite(productId: string, declare: (locale: string) => AboutContent, run: StepRunner): void {
  const product = registryProducts().find((p) => p.id === productId);
  describe(`#1477 — ${productId}'s About carries every section and its try steps build (ADR-W-091)`, () => {
    it('the product is registered', () => {
      expect(product, `'${productId}' is not in products.json`).toBeDefined();
    });
    it('lead, points, try steps and credit in he and en; every try step passes the real submit gate', () => {
      const declarations = Object.fromEntries(LOCALES.map((l) => [l, declare(l)]));
      expect(aboutContentFaults({ declarations, run })).toEqual([]);
    });
  });
}
