/**
 * #1453 (ADR-W-098) — ONE WORDING FOR ONE STATE, in every builder (operator ruling 2026-09-27, the
 * "Explicit set"). The same state had four wordings («נקבע במלואו» / «הכול נקבע על-ידי הנתונים» / …) and
 * one button three («חשב» / «שאל» / «שאלו»). Shell holds no strings, so this reads each product's locale
 * by FILE (the row-parity pattern — no test may import two product trees) and asserts that every role
 * resolves to the same text, in Hebrew and in English, wherever the product has that surface.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

type Lang = 'he' | 'en';
type Product = '2d' | '3d' | 'complex' | 'analytic';

function jsonValue(product: '2d' | '3d', lang: Lang, key: string): string | undefined {
  const tree = product === '2d' ? 'src' : 'src3d';
  let o: unknown = JSON.parse(read(`${tree}/i18n/locales/${lang}.json`));
  for (const k of key.split('.')) o = (o as Record<string, unknown> | undefined)?.[k];
  return typeof o === 'string' ? o : undefined;
}

/** A TS-object locale: `const he = { … }` then `const en: typeof he = { … }`. */
function tsValue(product: 'complex' | 'analytic', lang: Lang, key: string): string | undefined {
  const src = read(`${product === 'complex' ? 'src-complex' : 'src-analytic'}/i18n/index.ts`);
  const heAt = src.indexOf('const he = {');
  const enAt = src.indexOf('const en: typeof he = {');
  const block = lang === 'he' ? src.slice(heAt, enAt) : src.slice(enAt);
  const m = block.match(new RegExp(String.raw`\n\s*${key}:\s*'((?:[^'\\]|\\.)*)'`));
  return m?.[1];
}

const valueOf = (p: Product, lang: Lang, key: string) =>
  p === '2d' || p === '3d' ? jsonValue(p, lang, key) : tsValue(p, lang, key);

/**
 * role → the key(s) each product shows it with. `null` = the product has no such surface at all (said
 * why), which is not a different wording. Several keys = every one must read the role's wording.
 */
const ROLES: Record<string, Record<Product, string[] | null>> = {
  determined: { '2d': ['actions.determined'], '3d': ['cue.determined'], complex: ['freedomPinned'], analytic: ['pinned'] },
  // #1444 (ADR-556): count 0 but more than one configuration. Only 2-D's cue reads a discrete admissible
  // pool (the ruling was scoped to 2-D); a sibling whose cue gains that state adds its key here.
  determinedUpToConfig: { '2d': ['actions.determinedUpToConfig'], '3d': null, complex: null, analytic: null },
  dofCount: { '2d': ['actions.dof'], '3d': ['cue.free'], complex: ['freedomCount'], analytic: ['freeDof'] },
  // complex has no asynchronous path (no LLM, no deferred values), so it never shows a busy state
  busy: { '2d': ['input.loading', 'values.computing'], '3d': ['input.thinking'], complex: null, analytic: ['thinking'] },
  askSubmit: { '2d': ['values.queryAdd'], '3d': ['query.add'], complex: ['askAdd'], analytic: ['askAdd'] },
  undo: { '2d': ['actions.undo'], '3d': ['actions.undo'], complex: ['undo'], analytic: ['undo'] },
  redo: { '2d': ['actions.redo'], '3d': ['actions.redo'], complex: ['redo'], analytic: ['redo'] },
  clearAll: { '2d': ['actions.clear'], '3d': ['actions.clear'], complex: ['clearAll'], analytic: ['clearAll'] },
  showAnother: { '2d': ['actions.another'], '3d': ['actions.another'], complex: ['anotherConfig'], analytic: ['another'] },
  about: { '2d': ['header.about'], '3d': ['aboutLabel'], complex: ['menuAbout'], analytic: ['about'] },
};

/** The ruled wording (the "Explicit set", 2026-09-27) — the lock's anchor, not just "all equal". */
const RULED: Record<string, Record<Lang, string>> = {
  determined: { he: '✓ הציור נקבע במלואו על ידי הנתונים', en: '✓ The figure is fully determined by the givens' },
  determinedUpToConfig: { he: 'נקבע עד כדי בחירת תצורה', en: 'Determined up to the choice of configuration' },
  dofCount: { he: 'דרגות חופש: {{N}}', en: 'Degrees of freedom: {{N}}' },
  busy: { he: 'חושב…', en: 'Working…' },
  askSubmit: { he: 'שאלו', en: 'Ask' },
};

/** Interpolation names differ per product ({{count}} / {{n}}) — the WORDING is what must match. */
const normalize = (s: string) => s.replace(/\{\{\s*\w+\s*\}\}/g, '{{N}}');

describe('#1453 — one wording per role, in every builder', () => {
  for (const [role, perProduct] of Object.entries(ROLES)) {
    for (const lang of ['he', 'en'] as const) {
      it(`${role} (${lang}) reads the same everywhere`, () => {
        const seen: string[] = [];
        for (const [product, keys] of Object.entries(perProduct) as [Product, string[] | null][]) {
          if (keys === null) continue;
          for (const key of keys) {
            const v = valueOf(product, lang, key);
            expect(v, `${product} ${lang} ${key} is missing`).toBeDefined();
            seen.push(`${normalize(v!)}`);
          }
        }
        expect(new Set(seen).size, `${role} (${lang}): ${[...new Set(seen)].join(' | ')}`).toBe(1);
        if (RULED[role]) expect(seen[0]).toBe(RULED[role][lang]);
      });
    }
  }

  it('the reader is not vacuous: it finds a known key in each locale form', () => {
    expect(valueOf('complex', 'he', 'undo')).toBe('בטל');
    expect(valueOf('analytic', 'en', 'undo')).toBe('Undo');
    expect(valueOf('2d', 'he', 'actions.undo')).toBe('בטל');
  });
});
