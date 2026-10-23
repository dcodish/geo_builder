/**
 * #1995 batch 1 ([ADR-W-155](../../docs/06w-decisions-workspace.md#adr-w-155)) — ONE WORDING for "a side is not a
 * bisector" in 2-D and analytic (ADR-W-118 B1: for plane geometry 2-D is the reference for the words).
 *
 * The batch rewrote both sentences to give a next step; two hand-kept copies is how they drift. This reads each
 * tree's REAL locale off disk (the `one-fact-per-line-parity-1962` pattern): `shell/` may not import a product tree.
 * Analytic's locale is a TypeScript module, so its key is read by source text — exactly twice, `he` then `en`, as a
 * single-quoted literal with no escapes. Its polygon sentence names the noun `{{polygonNoun}}` where 2-D's says
 * `{{noun}}`; the two are compared with that one slot name aligned.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '')) as Record<string, Record<string, string>>;
const twoD = (lng: 'he' | 'en', key: string) => readJson(`src/i18n/locales/${lng}.json`).input[key];

const analyticLiterals = (key: string): string[] => {
  const src = fs.readFileSync(path.join(ROOT, 'src-analytic/i18n/index.ts'), 'utf8');
  return [...src.matchAll(new RegExp(String.raw`^\s*${key}:\s*'([^'\\]*)',\s*$`, 'gm'))].map((m) => m[1]);
};
const analytic = (lng: 'he' | 'en', key: string) => {
  const all = analyticLiterals(key);
  return all.length === 2 ? all[lng === 'he' ? 0 : 1] : undefined;
};

const PAIRS = [
  { twoD: 'cevianBisectorIsSide', analytic: 'errBisectorIsSide', align: (s: string) => s },
  { twoD: 'cevianBisectorIsPolygonSide', analytic: 'errBisectorIsPolygonSide', align: (s: string) => s.replace('{{polygonNoun}}', '{{noun}}') },
] as const;

describe('#1995 batch 1 — a side is not a bisector: one sentence in 2-D and analytic', () => {
  for (const p of PAIRS) {
    it.each(['he', 'en'] as const)(`%s: analytic ${p.analytic} is 2-D input.${p.twoD}, byte for byte`, (lng) => {
      const a = analytic(lng, p.analytic);
      expect(typeof a, `analytic ${p.analytic} has one literal per locale`).toBe('string');
      expect(typeof twoD(lng, p.twoD)).toBe('string');
      expect(p.align(a!)).toBe(twoD(lng, p.twoD));
    });
  }
});
