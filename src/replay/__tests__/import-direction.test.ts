/**
 * Intra-product import-direction guard (S1.2 of docs/24) — the layering is
 *
 *     engine  ←  replay  ←  store (zustand shell)  ←  app/UI
 *
 * and until this test existed it held only by discipline (the docs/23 review's finding: nothing
 * enforced that src/engine never imports the store). The cross-PRODUCT sibling is
 * server/__tests__/isolation.test.ts (src ↔ src3d); this one polices layers INSIDE src/.
 *
 * Rules:
 *  - src/engine/** may import only within src/engine (relative) — never store, replay, parser,
 *    render, app, react, zustand.
 *  - src/replay/** may import src/engine + within itself — never store, parser, render, app,
 *    react, zustand (pure over facts; the Fact type lives HERE, not in the store).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue; // tests may import across layers freely
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Every static/dynamic import specifier in a file. */
function specifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [
    ...[...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ...[...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  ];
}

const FORBIDDEN_EVERYWHERE = ['react', 'react-dom', 'zustand', 'zundo'];

function violations(dir: string, forbiddenPrefixes: string[]): string[] {
  const out: string[] = [];
  for (const f of sourceFiles(path.join(root, dir))) {
    for (const spec of specifiers(f)) {
      const bad =
        FORBIDDEN_EVERYWHERE.some((m) => spec === m || spec.startsWith(`${m}/`)) ||
        forbiddenPrefixes.some((p) => spec.startsWith(p)) ||
        // a relative escape into a forbidden sibling directory
        (spec.startsWith('.') &&
          forbiddenPrefixes.some((p) => {
            const target = path.resolve(path.dirname(f), spec).replace(/\\/g, '/');
            const alias = p.replace('@/', `${root.replace(/\\/g, '/')}/src/`);
            return target.startsWith(alias);
          }));
      if (bad) out.push(`${path.relative(root, f)} → ${spec}`);
    }
  }
  return out;
}

describe('import direction (engine ← replay ← store)', () => {
  it('src/engine imports nothing from replay/store/parser/render/app or UI libraries', () => {
    expect(violations('src/engine', ['@/store', '@/replay', '@/parser', '@/render', '@/app'])).toEqual([]);
  });

  it('src/replay imports nothing from store/parser/render/app or UI libraries', () => {
    expect(violations('src/replay', ['@/store', '@/parser', '@/render', '@/app'])).toEqual([]);
  });

  it('non-vacuity: the scanner actually sees both trees', () => {
    expect(sourceFiles(path.join(root, 'src/engine')).length).toBeGreaterThan(10);
    expect(sourceFiles(path.join(root, 'src/replay')).length).toBeGreaterThan(0);
  });
});
