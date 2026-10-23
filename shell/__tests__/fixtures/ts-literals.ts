/**
 * #2201 phase 2 + #1995 stage 5 ([ADR-W-153](../../../docs/06w-decisions-workspace.md#adr-w-153)) — THE SOURCE-LITERAL
 * WALKER the two text ratchets share. It reads `.ts`/`.tsx` source with the TypeScript compiler API (syntax only, no
 * program, no type check), so a comment is never a node and is excluded by construction.
 *
 * - `inline-hebrew-ratchet.test.ts` counts the Hebrew string literals per file (`hebrewLiteralCount`).
 * - `src/i18n/__tests__/refusal-style.test.ts` enumerates the note keys `src/app/` hands the student
 *   (`propertyStrings(sf, 'key')`).
 *
 * Test-only: nothing here is imported by runtime code. It reads files by path, so it imports no product tree
 * (ADR-W-016 rule 2).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** The repository root (this file is `shell/__tests__/fixtures/ts-literals.ts`). */
export const REPO_ROOT = join(__dirname, '..', '..', '..');

/**
 * The ratchets' one regeneration switch: `UPDATE_BASELINE=1 npx vitest run <the ratchet>` rewrites its baseline from
 * what it measures. Raising a baseline is therefore a reviewed diff, never a silent pass.
 */
export const UPDATE_BASELINE = process.env.UPDATE_BASELINE === '1';

/** The one wording both ratchets print when a baseline is looser than the code (it only tightens). */
export const lowerTheBaseline = (baseline: string, what: string): string =>
  `ratchet: ${what} — lower the baseline (UPDATE_BASELINE=1 regenerates ${baseline}) so it only tightens`;

/** The product/workspace trees BOUNDARIES.json declares (a new tree is covered on arrival). */
export function declaredTrees(): string[] {
  const b = JSON.parse(readFileSync(join(REPO_ROOT, 'BOUNDARIES.json'), 'utf8')) as { trees: Record<string, unknown> };
  return Object.keys(b.trees).sort();
}

const HEBREW = /[֐-׿]/;
export const hasHebrew = (s: string): boolean => HEBREW.test(s);

/** Repo-relative POSIX path. */
export const repoPath = (abs: string): string => relative(REPO_ROOT, abs).split(sep).join('/');

/**
 * Every `.ts`/`.tsx` under `roots` (repo-relative directory names), skipping `node_modules`, declaration files, test
 * files, and any directory whose NAME is in `skipDirs`. Sorted, repo-relative, POSIX separators.
 */
export function sourceFiles(roots: readonly string[], skipDirs: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.') || skipDirs.has(e.name)) continue;
        walk(abs);
      } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(repoPath(abs));
    }
  };
  for (const r of roots) walk(join(REPO_ROOT, r));
  return out.sort();
}

/** Parse one repo-relative file (syntax only). */
export function parseSource(path: string, text?: string): ts.SourceFile {
  const src = text ?? readFileSync(join(REPO_ROOT, path), 'utf8');
  return ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** The literal text of a string-ish node: a string, a no-substitution template, a template (head + spans), JSX text. */
function literalText(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => s.literal.text).join('');
  return null;
}

/**
 * The string literals in `sf` that carry Hebrew (U+0590–U+05FF): StringLiteral, NoSubstitutionTemplateLiteral,
 * TemplateExpression (one node, its head and spans together) and JsxText — a sentence written in the code instead of
 * a locale table. An import specifier is a module name, not text, and is skipped.
 */
export function hebrewLiterals(sf: ts.SourceFile): string[] {
  const hits: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    const text = literalText(n);
    if (text !== null && hasHebrew(text)) hits.push(text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

export const hebrewLiteralCount = (sf: ts.SourceFile): number => hebrewLiterals(sf).length;

/**
 * Every value assigned to an object-literal property `name` (`{ key: 'input.foo' }`): a full string for a literal,
 * and a PREFIX for a template (`{ key: \`input.trigGiven.${why}\` }` → `input.trigGiven.`), so a computed key family
 * is enumerated too. A property SIGNATURE (a type) is not an assignment and is skipped.
 */
export function propertyStrings(sf: ts.SourceFile, name: string): { literals: string[]; prefixes: string[] } {
  const literals = new Set<string>();
  const prefixes = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && n.name.text === name) {
      const v = n.initializer;
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) literals.add(v.text);
      else if (ts.isTemplateExpression(v)) prefixes.add(v.head.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { literals: [...literals].sort(), prefixes: [...prefixes].sort() };
}
