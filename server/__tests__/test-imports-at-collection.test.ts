/**
 * #1417 (ADR-W-102), lifted from #1305 (ADR-3D-261) — every test in the workspace loads its source
 * modules AT COLLECTION, never inside a timed test body.
 *
 * The class: a test that does `await import('../render/scene3')` in its body is charged the module's
 * LOAD time against the 5 s per-test timeout. In isolation that load is ~50 ms and invisible. Under the
 * full suite every worker's module requests queue on the one shared vite-node server, and the load can
 * take seconds — so the test times out on some runs and not others, on an unchanged tree. That is
 * exactly how 3-D's `free-line.test.ts` went red-then-green on sha 23a28a0e (round #1292, "Test timed
 * out in 5000ms"). A static import pays the same latency during collection, which no per-test timeout
 * covers.
 *
 * #1305 closed the class in `src3d/` only (docs/17 §1: a sibling's instances are filed, not fixed there)
 * and filed the other trees as #1417, which found eight more sites in 2-D, complex and server. This is
 * the same rule, lifted here so it judges every tree at once — including test files added later. It
 * lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in EVERY per-product lane and
 * belongs to no product.
 *
 * The rule, mechanically: an indented (i.e. not top-level) dynamic `import('…')` of anything but a
 * `node:` builtin, in CODE (not inside a string or a comment), is refused. A body that genuinely needs
 * the import to happen late — e.g. a fresh instance after `vi.resetModules()`, or a test whose subject
 * IS what importing does — says so on that line with `// load-in-body-ok: <reason>`, and does the import
 * in a `beforeAll`/`beforeEach` with its own generous timeout, not in the `it` body
 * (`src-complex/__tests__/no-session-restore-919.test.ts` is the worked example).
 *
 * Known limit, stated rather than hidden: the scan is line-by-line, so a line INSIDE a multi-line
 * template string that spells `import('…')` is read as code. Such a line takes the marker.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
/** Every tree that carries tests. `archive/` is excluded from the suite entirely. */
const TREES = ['src', 'src3d', 'src-complex', 'src-analytic', 'shell', 'server', 'scripts'];
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
/** This file quotes the forbidden shape in its own self-test strings and regexes, so it is not scanned. */
const SELF = join(import.meta.dirname, 'test-imports-at-collection.test.ts');

/**
 * The CODE of one line: string contents blanked, and cut at a trailing `//` comment. A regex literal is
 * not modelled (a quote inside one would open a "string"); that errs toward a missed hit on a line that
 * also holds a regex with a quote, never toward a false alarm on real code.
 */
function codeOf(line: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') {
        i++;
        out += '  ';
        continue;
      }
      if (c === quote) {
        quote = null;
        out += c;
      } else out += ' ';
      continue;
    }
    if (c === '/' && line[i + 1] === '/') break;
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
  }
  return out;
}

/** The detector — the lint and its self-test both call THIS function. */
function bodyImports(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  source.split(/\r?\n/).forEach((text, i) => {
    if (!/^\s+/.test(text)) return; // top-level await import runs at collection — fine
    if (/^\s*(\*|\/\/|\/\*)/.test(text)) return; // a comment line mentions, never loads
    if (/load-in-body-ok:/.test(text)) return;
    const code = codeOf(text);
    // `typeof import('…')` is a type, erased at compile time: it loads nothing.
    for (const m of code.matchAll(/(?<!typeof\s)\bimport\(/g)) {
      const spec = /^import\(\s*(['"`])([^'"`]+)\1/.exec(text.slice(m.index));
      if (spec?.[2].startsWith('node:')) continue; // builtins are not transformed; nothing queues
      hits.push({ line: i + 1, text: text.trim() });
      break;
    }
  });
  return hits;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a tree that does not exist yet is not a failure
  }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (TEST_FILE.test(e.name) && p !== SELF) out.push(p);
  }
  return out;
}

const HOW_TO_FIX =
  'A test body must not load a module: the load is charged to its 5 s timeout and times out under ' +
  'full-suite load (#1305, #1417, ADR-W-102). Fix each file:line listed below by MOVING the import to the top of ' +
  "the file — `const { f } = await import('../x');` inside an `it` becomes `import { f } from '../x';` " +
  'with the other imports (drop the now-unneeded `async` if nothing else awaits). Only when the import ' +
  'must happen late ON PURPOSE (after vi.resetModules(), or importing IS what the test checks): do it in ' +
  'a beforeAll/beforeEach with an explicit timeout, e.g. `beforeAll(async () => { m = await ' +
  "import('../x'); // load-in-body-ok: <why> }, 60_000)`, and say why on that line.";

describe('#1417 — tests import at collection, never inside a timed test body (every tree)', () => {
  const files = TREES.flatMap((t) => walk(join(ROOT, t)));

  it('the detector flags the #1305 shape and passes the allowed ones (it can fail)', () => {
    const bad = "  it('x', async () => {\n    const { buildScene3 } = await import('../render/scene3');\n  });";
    expect(bodyImports(bad)).toEqual([{ line: 2, text: "const { buildScene3 } = await import('../render/scene3');" }]);
    expect(bodyImports("    const he = (await import('../../i18n/locales/he.json')).default;")).toHaveLength(1);
    expect(bodyImports("    const x = f(\"msg\", await import('../x'));")).toHaveLength(1); // a string BEFORE it
    expect(bodyImports("const t = await import('../x');")).toHaveLength(0); // top level
    expect(bodyImports("    const fs = await import('node:fs');")).toHaveLength(0);
    expect(bodyImports("   * a comment naming await import('../x')")).toHaveLength(0);
    expect(bodyImports("    f(); // then await import('../x')")).toHaveLength(0); // trailing comment
    expect(bodyImports("      \"void import('./lazy');\",")).toHaveLength(0); // fixture text in a string
    expect(bodyImports("    const real = await importOriginal<typeof import('../../parser/parse3')>();")).toHaveLength(0);
    expect(bodyImports("  let m!: typeof import('../x');")).toHaveLength(0);
    expect(bodyImports("    const m = await import('../x'); // load-in-body-ok: fresh instance after resetModules")).toHaveLength(0);
  });

  it('scans every tree — otherwise the lint proves nothing', () => {
    const per = (t: string) => files.filter((f) => relative(ROOT, f).split(/[\\/]/)[0] === t).length;
    expect(files.length).toBeGreaterThan(900);
    for (const t of ['src', 'src3d', 'src-complex', 'src-analytic', 'shell', 'server']) {
      expect(per(t), `test files found under ${t}/`).toBeGreaterThan(10);
    }
  });

  it('no test loads a source module inside its body', () => {
    const offenders = files.flatMap((f) =>
      bodyImports(readFileSync(f, 'utf8')).map((h) => `${relative(ROOT, f)}:${h.line}  ${h.text}`),
    );
    expect(offenders, HOW_TO_FIX).toEqual([]);
  });
});
