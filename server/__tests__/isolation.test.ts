/**
 * Product-isolation guard (ADR-266; the docs/20 §12 rule made mechanical).
 *
 * The workspace hosts multiple products as sibling apps (src/ = 2-D Geo Builder,
 * src3d/ = 3-D Space Builder). The operator-authority rule is that product source
 * trees NEVER import from each other — patterns are COPIED, not shared — so a
 * change in one product cannot break another. Until now the rule was held by
 * convention only; this test enforces it.
 *
 * It lives in server/__tests__ because the shared-server tests run in EVERY
 * per-product CI lane, so a violating import added in any product fails its own lane.
 *
 * Note the trap this closes: tsconfig maps `@/*` → `src/*` repo-wide, so a stray
 * `@/` import inside src3d/ would typecheck and even resolve under the shared
 * vitest config — silently coupling the 3-D app to 2-D code.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

/** Recursively collect .ts/.tsx source files under a directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** All import/require specifiers in a file (static, dynamic, and re-exports). */
function importSpecifiers(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const specs: string[] = [];
  const re = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) specs.push(m[1]);
  return specs;
}

/** Does a relative specifier from `file` land inside `forbiddenDir`? */
function resolvesInto(file: string, spec: string, forbiddenDir: string): boolean {
  if (!spec.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(file), spec);
  return resolved === forbiddenDir || resolved.startsWith(forbiddenDir + path.sep);
}

describe('product isolation (src ↔ src3d never import each other)', () => {
  const src = path.join(ROOT, 'src');
  const src3d = path.join(ROOT, 'src3d');

  it('the product trees exist (guard is not vacuous)', () => {
    expect(fs.existsSync(src)).toBe(true);
    expect(fs.existsSync(src3d)).toBe(true);
  });

  it('src3d/ imports nothing from src/ (no @/ alias, no relative escape)', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(src3d)) {
      for (const spec of importSpecifiers(file)) {
        if (spec === '@' || spec.startsWith('@/') || resolvesInto(file, spec, src)) {
          violations.push(`${path.relative(ROOT, file)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('src/ imports nothing from src3d/', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(src)) {
      for (const spec of importSpecifiers(file)) {
        if (spec.includes('src3d') || resolvesInto(file, spec, src3d)) {
          violations.push(`${path.relative(ROOT, file)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
