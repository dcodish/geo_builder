/**
 * Every literal `t('…')` key in a product's source RESOLVES in its locale.
 *
 * **Why this exists, written the day it was needed.** While wiring #1372 a banner was given
 * `t('load.dismiss')` in the 3-D app. There is no such key. `tsc` cannot see it (the argument is
 * just a string), and the existing he⇄en parity guard could not either — the key was missing from
 * BOTH locales, so the two agreed perfectly. The student-facing result of that class is a raw
 * `load.dismiss` printed on screen where a sentence should be.
 *
 * Only LITERAL keys are checkable; a computed one (`t(\`err.${code}\`)`) is skipped, and the count of
 * skips is returned so a caller can assert the guard still sees most of the surface rather than
 * quietly checking nothing.
 *
 * The trees with TS-object locales (complex, analytic) get this structurally from
 * `const en: typeof he` and do not need it; the JSON-locale trees (2-D, 3-D) do.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every path of a locale object, dotted — leaves AND the container path of an array.
 *
 * The array half is not a detail: a locale array (`about.points`, read with
 * `returnObjects: true`) is addressed by the CONTAINER key, while its elements are what parity
 * wants to compare. Emitting only the indexed leaves made this guard report three perfectly good
 * 2-D keys as missing on its first run — a false alarm that would have been filed as a prod defect
 * if it had not been checked against the locale.
 */
export function localePaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  const children = Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    localePaths(v, prefix ? `${prefix}.${k}` : k),
  );
  return Array.isArray(obj) && prefix ? [prefix, ...children] : children;
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export interface KeyAudit {
  /** `file: key` for every literal key with no entry in the locale. */
  missing: string[];
  /** How many literal keys were checked — a guard that checks none is not a guard. */
  checked: number;
  /** How many `t(...)` calls were computed rather than literal, and so unverifiable here. */
  computed: number;
}

/**
 * Scan `roots` for `t('key')` / `t("key")` and report the ones absent from `locale`.
 *
 * `ignore` takes the keys a tree legitimately builds elsewhere — a prefix that a computed call
 * completes, for instance — and each entry is a PREFIX match so a family can be excused in one line.
 */
export function i18nKeyAudit(
  treeRoot: string,
  roots: string[],
  locale: unknown,
  ignore: string[] = [],
): KeyAudit {
  const known = new Set(localePaths(locale));
  const missing: string[] = [];
  let checked = 0;
  let computed = 0;

  for (const root of roots) {
    for (const file of sourceFiles(join(treeRoot, root))) {
      const text = readFileSync(file, 'utf8');
      // A literal key: t('a.b') or t("a.b"), optionally with more arguments after it.
      for (const m of text.matchAll(/\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1/g)) {
        const key = m[2];
        checked++;
        if (known.has(key)) continue;
        if (ignore.some((p) => key === p || key.startsWith(p))) continue;
        missing.push(`${file.slice(treeRoot.length + 1)}: ${key}`);
      }
      // A computed key — counted, never failed on.
      for (const _ of text.matchAll(/\bt\(\s*`/g)) computed++;
    }
  }
  return { missing, checked, computed };
}
