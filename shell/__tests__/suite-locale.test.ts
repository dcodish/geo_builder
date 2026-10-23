/**
 * #2201 phase 1 ([ADR-W-148](../../docs/06w-decisions-workspace.md#adr-w-148)) — SUITE-WIDE TEXT HAS ONE OWNER.
 *
 * The operator asked (2026-10-16): *"is there one place I can change that message, or do I have to look
 * around the code to find where that message exists?"* For text every builder shows byte for byte (the
 * builder names, the About credit, the guide chrome) the answer is now `shell/locales/{he,en}.json`, under
 * `suite.*`; each builder merges it under its own table (`{ ...suite, ...own }`). Shell CODE stays string-free.
 *
 * The locks, each about the CLASS (a second copy that can drift), not about today's keys:
 * - (a) the suite file has the same keys in Hebrew and English;
 * - (b) no product table defines a `suite.*` key, so no builder can shadow the suite text;
 * - (c) no product table holds a key whose Hebrew AND English are byte-identical to a suite key's: a copy
 *   cannot come back under a new key name. A PAIR, not one language, because a Hebrew homonym is not a
 *   copy (analytic's parabola «מדריך» is "directrix", the guide's «מדריך» is "Guide");
 * - (d) is `<tree>/__tests__/suite-text-2201.test.tsx` in each tree (assertions shared in
 *   `fixtures/suite-text-rows.tsx`): rendering needs the builder's own i18n instance, which shell may not import.
 *
 * Shell may not import a product tree, so the product tables are read by FILE: JSON for 2-D and 3-D, and
 * the `const he = {…}` / `const en: typeof he = {…}` object literals of analytic and complex through the
 * TypeScript compiler API (the row-parity / suite-vocabulary pattern, with a real parser in place of a regex).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

type Lang = 'he' | 'en';
type Table = Record<string, string>;
const PRODUCTS = ['2d', '3d', 'complex', 'analytic'] as const;
type Product = (typeof PRODUCTS)[number];

/** Every string leaf, dotted (array elements by index). */
function flatten(o: unknown, prefix = '', out: Table = {}): Table {
  if (typeof o === 'string') out[prefix] = o;
  else if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** The value of a locale-literal node: strings, `'a' + 'b'`, arrays and nested objects. Anything else is
 *  computed and cannot be read statically; it is counted so the reader cannot go quietly blind. */
let unreadable = 0;
function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return literalValue(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = literalValue(node.left);
    const r = literalValue(node.right);
    if (typeof l === 'string' && typeof r === 'string') return l + r;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => literalValue(e));
  if (ts.isObjectLiteralExpression(node)) {
    const o: Record<string, unknown> = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) {
        unreadable++;
        continue;
      }
      const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name) ? p.name.text : undefined;
      if (name === undefined) {
        unreadable++;
        continue;
      }
      o[name] = literalValue(p.initializer);
    }
    return o;
  }
  unreadable++;
  return undefined;
}

/** A TS-object locale: the initializer of the top-level `const he` / `const en`. */
function tsTable(rel: string, lang: Lang): Table {
  const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === lang && d.initializer && ts.isObjectLiteralExpression(d.initializer))
        return flatten(literalValue(d.initializer));
    }
  }
  throw new Error(`${rel}: no top-level \`const ${lang} = {…}\``);
}

const TABLE_FILE: Record<Product, (lang: Lang) => string> = {
  '2d': (l) => `src/i18n/locales/${l}.json`,
  '3d': (l) => `src3d/i18n/locales/${l}.json`,
  complex: () => 'src-complex/i18n/index.ts',
  analytic: () => 'src-analytic/i18n/index.ts',
};

function productTable(p: Product, lang: Lang): Table {
  const rel = TABLE_FILE[p](lang);
  return rel.endsWith('.json') ? flatten(JSON.parse(read(rel))) : tsTable(rel, lang);
}

const suite = { he: flatten(JSON.parse(read('shell/locales/he.json'))), en: flatten(JSON.parse(read('shell/locales/en.json'))) };

/** The (b) and (c) faults of one product's own tables against the suite file — the function the meta-lock
 *  below feeds broken stubs, so the claim that it bites is exercised, not assumed. */
function suiteFaults(name: string, own: Record<Lang, Table>, s: Record<Lang, Table> = suite): string[] {
  const faults: string[] = [];
  for (const lang of ['he', 'en'] as const)
    for (const k of Object.keys(own[lang]))
      if (k === 'suite' || k.startsWith('suite.')) faults.push(`${name} ${lang}: defines ${k} (shadows the suite text)`);
  for (const [k, he] of Object.entries(own.he)) {
    for (const [sk, she] of Object.entries(s.he)) {
      if (he === she && own.en[k] === s.en[sk]) faults.push(`${name}: ${k} is a copy of ${sk} («${he}» / "${own.en[k]}")`);
    }
  }
  return faults;
}

const tables = Object.fromEntries(PRODUCTS.map((p) => [p, { he: productTable(p, 'he'), en: productTable(p, 'en') }])) as Record<
  Product,
  Record<Lang, Table>
>;

describe('#2201 phase 1 — suite-wide text lives once, in shell/locales', () => {
  it('(a) the suite file has the same keys in Hebrew and English, all non-empty, all under suite.*', () => {
    expect(Object.keys(suite.he).sort()).toEqual(Object.keys(suite.en).sort());
    for (const lang of ['he', 'en'] as const)
      for (const [k, v] of Object.entries(suite[lang])) {
        expect(k.startsWith('suite.'), `${lang} ${k} is outside the suite namespace`).toBe(true);
        expect(v.trim(), `${lang} ${k} is empty`).not.toBe('');
      }
  });

  it('(b)+(c) no builder redefines a suite key or keeps a byte-identical copy of one', () => {
    expect(PRODUCTS.flatMap((p) => suiteFaults(p, tables[p]))).toEqual([]);
  });

  it('every builder table is read completely (the reader is not blind)', () => {
    expect(unreadable, 'a locale entry the static reader could not evaluate').toBe(0);
    for (const p of PRODUCTS) {
      expect(Object.keys(tables[p].he).length, `${p} he`).toBeGreaterThan(100);
      expect(Object.keys(tables[p].en).length, `${p} en`).toBeGreaterThan(100);
    }
    // a known key in each locale form, so a wrong reader fails here rather than passing (b)/(c) vacuously
    expect(tables.complex.he.undo).toBe('בטל');
    expect(tables.analytic.en.undo).toBe('Undo');
    expect(tables['2d'].he['actions.undo']).toBe('בטל');
    expect(tables['3d'].en['actions.undo']).toBe('Undo');
  });

  it('the lock bites: a re-added copy, a shadowing key — and NOT a Hebrew homonym', () => {
    const anyKey = Object.keys(suite.he)[0];
    const stub = (he: Table, en: Table) => suiteFaults('stub', { he, en });
    // a copy under a brand-new key name
    expect(stub({ fresh: suite.he[anyKey] }, { fresh: suite.en[anyKey] })).toHaveLength(1);
    // a product that defines a suite key itself
    expect(stub({ [anyKey]: 'x' }, { [anyKey]: 'x' }).some((f) => f.includes('shadows'))).toBe(true);
    // the same Hebrew word with a different meaning (and so different English) is not a copy
    expect(stub({ word: suite.he[anyKey] }, { word: 'something else' })).toEqual([]);
  });
});
