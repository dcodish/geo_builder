/**
 * The four builders' locale tables, read by FILE — the one reader every shell-level locale lock shares
 * (#2201's `suite-locale.test.ts`, #2202's `quote-style.test.ts` and `suite-wordings-2202.test.ts`).
 *
 * Shell may not import a product tree (ADR-W-016 rule 2), so the tables are read from disk: JSON for 2-D and
 * 3-D, and the `const he = {…}` / `const en: typeof he = {…}` object literals of analytic and complex through
 * the TypeScript compiler API (a real parser in place of a regex). Test-only: nothing here is imported by
 * runtime code.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

export const ROOT = path.resolve(__dirname, '..', '..', '..');
export const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

export type Lang = 'he' | 'en';
export type Table = Record<string, string>;
export const PRODUCTS = ['2d', '3d', 'complex', 'analytic'] as const;
export type Product = (typeof PRODUCTS)[number];

/** Every string leaf, dotted (array elements by index). */
export function flatten(o: unknown, prefix = '', out: Table = {}): Table {
  if (typeof o === 'string') out[prefix] = o;
  else if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** The value of a locale-literal node: strings, `'a' + 'b'`, arrays and nested objects. Anything else is
 *  computed and cannot be read statically; it is counted so the reader cannot go quietly blind. */
let unreadable = 0;
export const unreadableCount = () => unreadable;
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

export const TABLE_FILE: Record<Product, (lang: Lang) => string> = {
  '2d': (l) => `src/i18n/locales/${l}.json`,
  '3d': (l) => `src3d/i18n/locales/${l}.json`,
  complex: () => 'src-complex/i18n/index.ts',
  analytic: () => 'src-analytic/i18n/index.ts',
};

/** One builder's OWN table (the suite text it merges in is not part of it). */
export function productTable(p: Product, lang: Lang): Table {
  const rel = TABLE_FILE[p](lang);
  return rel.endsWith('.json') ? flatten(JSON.parse(read(rel))) : tsTable(rel, lang);
}

/** The suite-wide text (`shell/locales`, ADR-W-148). */
export const suiteTable = (lang: Lang): Table => flatten(JSON.parse(read(`shell/locales/${lang}.json`)));
