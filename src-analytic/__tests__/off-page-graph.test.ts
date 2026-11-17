/**
 * #2890 ([ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477); ADR-W-210 phase 3) — WHAT WILL RUN OFF THE PAGE
 * IMPORTS NO PAGE: the engine, the decisions and the readers reach neither the store, nor React, nor the App.
 *
 * A worker has no DOM and must not carry a second copy of the session store. Measured in the design pass: a worker bundle
 * that imported the load's audit through `app/loadSession.ts` carried `store/`, zustand, zundo and React with it. The
 * audit is now `app/loadAudit.ts`, and this lock keeps the whole set clean: it follows every VALUE import (a type-only
 * import is erased and leaves no edge) from the modules a worker entry will import, and fails on the first path into the
 * page, naming the chain.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const TREE = join(__dirname, '..');
const REPO = join(TREE, '..');

/** The modules a worker entry will import: all of the engine, the decisions, and the readers that force a lazy. */
const ENTRIES = [
  ...readdirSync(join(TREE, 'engine'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `engine/${f}`),
  ...['submit', 'another', 'rename', 'loadAudit', 'active', 'ask', 'answers', 'measurable', 'locusChip', 'panelRows', 'pointText', 'curveText', 'lineAngle', 'conicMarks', 'narrowing', 'shapeWarnings', 'coincidences', 'drawnBox'].map((f) => `app/${f}.ts`),
];

/** Packages a worker may not load, and what is the page: the store, the page's own text, the i18n bootstrap, any component. */
const PAGE_PACKAGES = /^(react|react-dom|react-i18next|i18next|zustand|zundo)(\/|$)/;
const PAGE_PATHS = /^src-analytic\/(store|ui)\/|^src-analytic\/i18n\/index\.ts$|\.tsx$/;

/** The value imports of a source: `import … from`, `export … from` and a bare `import '…'`; a type-only one is no edge. */
function valueImports(source: string): string[] {
  const out: string[] = [];
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of stripped.matchAll(/^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue; // import type … / export type …
    const names = /\{([^}]*)\}/.exec(m[3]);
    const hasDefaultOrStar = /^[\w$*]/.test(m[3].trim()) && !m[3].trim().startsWith('{');
    // every named specifier marked `type`, and nothing else imported: erased
    if (names && !hasDefaultOrStar && names[1].split(',').map((n) => n.trim()).filter(Boolean).every((n) => n.startsWith('type '))) continue;
    out.push(m[4]);
  }
  for (const m of stripped.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out;
}

function fileOf(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Every path from the entries into the page: `entry > … > the page module or package`. */
function pathsIntoThePage(): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of valueImports(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) {
        if (PAGE_PACKAGES.test(spec)) found.push([...chain, spec].join(' > '));
        continue;
      }
      const target = fileOf(file, spec);
      if (!target) continue; // a json or an asset
      const name = relative(REPO, target).split('\\').join('/');
      if (PAGE_PATHS.test(name)) {
        found.push([...chain, name].join(' > '));
        continue;
      }
      walk(target, [...chain, name]);
    }
  };
  for (const entry of ENTRIES) walk(join(TREE, entry), [`src-analytic/${entry}`]);
  return found;
}

describe('#2890 — what will run off the page imports no page', () => {
  it('the entries are there', () => {
    expect(ENTRIES.length).toBeGreaterThan(40);
    for (const entry of ENTRIES) expect(existsSync(join(TREE, entry)), entry).toBe(true);
  });

  it('the reader of imports sees a value import and skips a type-only one', () => {
    const src = [
      "import { derive } from '../engine/derive';",
      "import type { Derivation } from '../engine/derive2';",
      "import { type A, type B } from '../store/types';",
      "import React, { type FC } from 'react';",
      "import { useStore, type S } from 'zustand';",
      "export { x } from './x';",
      "export type { T } from './t';",
      "// import { no } from './commented';",
      "import './side-effect';",
    ].join('\n');
    expect(valueImports(src)).toEqual(['../engine/derive', 'react', 'zustand', './x', './side-effect']);
  });

  it('no value import leads from the engine, the decisions or the readers into the store, React or the App', () => {
    expect(pathsIntoThePage()).toEqual([]);
  });

  it('the lock is live: the session loader, which writes the store, is caught', () => {
    const seen = new Set<string>();
    const reaches = (file: string): boolean => {
      if (seen.has(file)) return false;
      seen.add(file);
      return valueImports(readFileSync(file, 'utf8')).some((spec) => {
        if (!spec.startsWith('.')) return PAGE_PACKAGES.test(spec);
        const target = fileOf(file, spec);
        if (!target) return false;
        return PAGE_PATHS.test(relative(REPO, target).split('\\').join('/')) || reaches(target);
      });
    };
    expect(reaches(join(TREE, 'app', 'loadSession.ts'))).toBe(true);
  });
});
