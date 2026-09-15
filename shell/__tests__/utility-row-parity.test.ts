/**
 * THE SESSION ACTIONS ARE IN ONE ORDER IN EVERY BUILDER (#1087).
 *
 * Operator, 2026-09-15: *"I want the visualization of the tool to match that of the other tools.
 * currently the buttons are not located in same locations and there is no load and save and stuff
 * we have on other tools"* — reported about the analytic builder, which passed `utilityActions`
 * nothing at all and therefore had no row.
 *
 * The three older builders had grown the same order by hand, which is the state just before a
 * drift: nothing held it. This is the source-scan lock in the shape `row-parity.test.ts` uses —
 * the Apps are not rendered, their SOURCE ORDER is read — so a fourth product joining the suite,
 * or a fifth, fails here rather than in front of a student.
 *
 * The row is SAVE · LOAD · COPY IMAGE · SAVE IMAGE · (export the question, where a product has it)
 * · GUIDE: what the session IS first, what you take out of it second, how to use it last.
 *
 * NOTE what this does not yet cover: `row-parity.test.ts` still enumerates three products by hand
 * and does not know the analytic builder exists (filed as debt). This file knows all four.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** Every builder in the suite, by its App file. A product added here without a row fails below. */
const APPS = ['src/App.tsx', 'src3d/App3.tsx', 'src-complex/App.tsx', 'src-analytic/App.tsx'];

/**
 * The canonical order, as ROLES rather than key names — each product's i18n namespaces them
 * differently (`file.save`, `actions.save`, `save`), and the namespace is not the contract.
 */
const ORDER = ['save', 'load', 'copyImage', 'saveImage', 'saveQuestion', 'manual'] as const;

/**
 * The roles a product actually offers, in the order its source mounts them.
 *
 * Matched on the whole key rather than a namespace segment: the products spell these
 * `file.save` / `actions.save` / `save` and `manualButton` / `manual.button`, and the spelling is
 * not the contract — the ROLE is. Longer roles are tested first so `saveImage` is never read as
 * `save`.
 */
const MATCH: ReadonlyArray<[(typeof ORDER)[number], (key: string) => boolean]> = [
  ['saveQuestion', (k) => k.includes('savequestion')],
  ['saveImage', (k) => k.includes('saveimage')],
  ['copyImage', (k) => k.includes('copyimage')],
  ['manual', (k) => k.includes('manual')],
  ['save', (k) => k === 'save' || k.endsWith('.save')],
  ['load', (k) => k === 'load' || k.endsWith('.load')],
];

function rolesOf(src: string): string[] {
  const start = src.indexOf('utilityActions=');
  expect(start, 'the product passes no utilityActions at all').toBeGreaterThan(-1);
  // The row ends where the next top-level prop of AppFrame begins.
  const rest = src.slice(start);
  const end = rest.search(/\n {6}[a-zA-Z]+=\{/);
  const seg = end > 0 ? rest.slice(0, end) : rest.slice(0, 2500);

  const out: string[] = [];
  for (const m of seg.matchAll(/t\('([A-Za-z.]+)'/g)) {
    const key = m[1].toLowerCase();
    const hit = MATCH.find(([, test]) => test(key));
    if (hit && !out.includes(hit[0])) out.push(hit[0]);
  }
  return out;
}

describe('#1087 — the utility row is the same row everywhere', () => {
  for (const rel of APPS) {
    it(`${rel} mounts the session actions in the suite's order`, () => {
      const roles = rolesOf(read(rel));
      // Every product carries at least the four that define a session.
      expect(roles, rel).toEqual(expect.arrayContaining(['save', 'load', 'copyImage', 'saveImage']));
      expect(roles.includes('manual'), `${rel} offers no guide`).toBe(true);
      // ...and whatever subset it offers appears in the canonical order.
      const canonical = ORDER.filter((r) => roles.includes(r));
      expect(roles, rel).toEqual([...canonical]);
    });
  }

  it('all four builders agree — the row is a suite decision, not a per-product one', () => {
    const rows = APPS.map((rel) => rolesOf(read(rel)));
    // Pairwise: the shared roles appear in the same relative order in every product.
    for (const a of rows) {
      for (const b of rows) {
        const shared = a.filter((r) => b.includes(r));
        expect(shared).toEqual(b.filter((r) => a.includes(r)));
      }
    }
  });
});
