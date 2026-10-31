/**
 * #1566 ([ADR-3D-398](../../docs/06b-decisions-3d.md#adr-3d-398); #2048 ruling A, card d6, and the operator's ruling
 * of 2026-10-30, 3A) — EVERY GUIDE EXAMPLE BUILDS ON A BLANK CANVAS.
 *
 * A guide click on an empty canvas submits the entry's `needs` lines and then the example (`guideTryLines3`). This lock
 * does exactly that for every construction-lane entry, in Hebrew and in English, through the store's own submit: each
 * `needs` line records one green row, and the example records one more, with every row green.
 *
 * Measured at 216cf8bb before the fix: 66 of 238 examples failed on a blank canvas, the same 66 in English.
 *
 * THE ALLOWLIST CAN ONLY SHRINK. Every row on it names the issue that owns its failure, and is asserted to STILL fail:
 * the day an owning issue lands, its rows turn this file red until they are taken off. A row is never added to make
 * the suite pass — an example that stops building on a blank canvas is a regression of #1566.
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { guideTryLines3 } from '../app/guideTry3';

/** Each remaining failure, keyed by its Hebrew spelling (the English spelling of the same entry shares it). */
const STILL_FAILS: Record<string, string> = {
  // #2609 — a point created on a blank canvas is never placed: a relation over free points does not place them (C2)
  'אורך AS שווה לאורך AB': '#2609',
  'נפח הפירמידה SENB שווה לנפח הפירמידה CENB': '#2609',
  '∠SAB = ∠SAD': '#2609',
  'הזווית שבין AB לבין AC שווה לזווית שבין AB לבין AD': '#2609',
  'נתון: AB = (k-1, k, 3), AC = (k+1, 0, k-3)': '#2609',
  'המישור ACD מקביל ל-AB': '#2609',
  'AB∥ACD': '#2609',
  "הישר A'C חותך את המישור BC'D בנקודה K": '#2609',
  'SM מאונך ל-DB': '#2609',
  "E, C, A' על ישר אחד": '#2609',
  'שטח המשולש ABC = 4.5': '#2609',
  'המישור KBC: x + 2y + 3z - 26 = 0': '#2609',
  'EF מקביל למישור ABC': '#2609',
  'AC ו-BD נחתכים': '#2609',
  'AB מתלכד עם CD': '#2609',
  "המישור ABC מקביל למישור A'B'C'": '#2609',
  'קוסינוס הזווית ACB = 3/4': '#2609',
  'AE יוצר זוויות שוות עם AB ו-AD': '#2609',
  "הזווית בין הישר AC' לבין המישור ABCD היא 30": '#2609',
  'T על הקטע SC כך ש-TABCD היא פירמידה ישרה': '#2609',
  'אורך AB=BC': '#2609',
  'זווית SAB = זווית SAD': '#2609',
  // #2610 — a face or plane named by four letters creates four points that are not in one plane (C3)
  'O מפגש האלכסונים של הפאה ABCD': '#2610',
  "ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'": '#2610',
  'BE היטל הישר TB על המישור ABCD': '#2610',
  // #2611 — «D על המעגל» creates no circle (C6)
  'D על המעגל': '#2611',
  // #2563 — a new point with letter coordinates
  'נתונות הנקודות: A(1, 4, -3), B(2t, t, k)': '#2563',
};

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const ENTRIES = COMMAND_CATALOG_3D.filter((e) => e.lane !== 'rewrite');

/** What a guide click on a blank canvas leaves: null when every line recorded one green row, else the failure. */
function clickOnBlank(entry: (typeof ENTRIES)[number], lang: 'he' | 'en'): string | null {
  reset();
  const lines = guideTryLines3(entry, lang, 0);
  for (const [i, line] of lines.entries()) {
    st().submit(line);
    const err = st().lastError;
    if (err) return `«${line}» refused ${err.code}`;
    if (st().facts.length !== i + 1) return `«${line}» recorded ${st().facts.length - i} rows`;
  }
  const status = derive3(st().facts, st().seed).status;
  const red = Object.entries(status).filter(([, s]) => s !== 'ok');
  return red.length ? `red rows: ${JSON.stringify(red)}` : null;
}

describe('#1566 — every guide example builds on a blank canvas (after the lines it needs)', () => {
  it('the allowlist names live catalog entries, each with its owning issue, and none of them carries needs', () => {
    for (const [he, owner] of Object.entries(STILL_FAILS)) {
      const entry = ENTRIES.find((e) => e.he === he);
      expect(entry, he).toBeDefined();
      expect(owner).toMatch(/^#\d+$/);
      // a row with prerequisite lines is #1566's own: it must build, never be excused
      expect(entry!.needs, he).toBeUndefined();
    }
  });

  it('every needs line is itself a line that builds, in both languages, and the two lists are the same length', () => {
    for (const e of ENTRIES) {
      if (!e.needs) continue;
      expect(e.needs.he.length, e.he).toBe(e.needs.en.length);
      expect(e.needs.he.length, e.he).toBeGreaterThan(0);
    }
  });

  for (const lang of ['he', 'en'] as const) {
    it(`${lang}: every entry not on the allowlist builds, and every allowlisted entry still fails`, () => {
      const broken: string[] = [];
      const healed: string[] = [];
      for (const e of ENTRIES) {
        const failure = clickOnBlank(e, lang);
        const owner = STILL_FAILS[e.he];
        if (owner === undefined && failure !== null) broken.push(`${e[lang]} — ${failure}`);
        if (owner !== undefined && failure === null) healed.push(`${e[lang]} (${owner}): it builds now — take it off the allowlist`);
      }
      expect(broken).toEqual([]);
      expect(healed).toEqual([]);
    }, 300_000);
  }
});
