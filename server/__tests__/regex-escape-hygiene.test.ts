/**
 * #983 (ADR-500) — A REGEX BUILT IN A TEMPLATE LITERAL MUST DOUBLE ITS ESCAPES.
 *
 * `new RegExp(\`^(\S+) is not a diagonal$\`)` does not do what it looks like: JavaScript resolves the
 * template literal FIRST, and `\S` there is just the character `S`. The RegExp never sees an escape,
 * the pattern matches nothing, and — this is what makes the class expensive — **nothing errors**. The
 * two «אלכסון» refusals reached Hebrew-first students as raw English for a full release because of it,
 * and the commit that introduced them verified that the i18n *keys* existed rather than that a pattern
 * matched its message.
 *
 * This guard is the mechanism-level lock: it reads the SOURCE and fails on a lone escape inside any
 * `new RegExp(\`…\`)` anywhere in the workspace, so the next one cannot ship silently in any product.
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in EVERY per-product lane
 * and belongs to no product — the hazard is JavaScript's, not any tree's.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BS = String.fromCharCode(92);
const ROOT = join(import.meta.dirname, '..', '..');
/** Every tree that ships to a student, plus the shared ones. `archive/` is not compiled. */
const TREES = ['src', 'src3d', 'src-complex', 'shell', 'server', 'scripts'];

const sources = (dir: string, out: string[] = []): string[] => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a tree that does not exist yet (src-analytic) is not a failure
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|dist-.*|\.git)$/.test(e.name)) sources(p, out);
    } else if (/\.(?:tsx?|mjs|cjs|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
};

/** A backslash that is NOT itself escaped, immediately before a letter — i.e. `\S`, `\s`, `\d`, `\b`. */
const LONE_ESCAPE = new RegExp(`(^|[^${BS}${BS}])${BS}${BS}([A-Za-z])`);
/** The template-literal argument of a `new RegExp(\`…\`)` call, on one line. */
const TEMPLATE_REGEX = /new RegExp\(`([^`]*)`/g;

describe('#983 — a template-literal RegExp must double its escapes', () => {
  const files = TREES.flatMap((t) => sources(join(ROOT, t)));

  it('the scan actually reads the workspace (a guard that finds no files passes by checking nothing)', () => {
    // The #909/#174 lesson: an audit with an early return passes green while exercising nothing.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(join('i18n', 'humanizeError.ts')))).toBe(true);
  });

  it('no source builds a regex from a template literal with a collapsed escape', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(TEMPLATE_REGEX)) {
            if (LONE_ESCAPE.test(m[1])) offenders.push(`${f.slice(ROOT.length + 1)}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offenders, `a lone escape inside new RegExp(\`…\`) is silently dropped:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the detector itself catches the shape it exists for (both directions)', () => {
    // Asserted on the two real spellings, so the guard cannot rot into a regex that matches nothing —
    // which would be this very bug, in the test that exists to prevent it.
    expect(LONE_ESCAPE.test('^(' + BS + 'S+) is not a diagonal$')).toBe(true);
    expect(LONE_ESCAPE.test('^(' + BS + BS + 'S+) is not a diagonal$')).toBe(false);
    expect(LONE_ESCAPE.test('^[A-Z]+ is not a diagonal$')).toBe(false);
  });
});
