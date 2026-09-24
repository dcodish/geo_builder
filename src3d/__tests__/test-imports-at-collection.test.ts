/**
 * #1305 (ADR-3D-261) — a 3-D test loads its source modules AT COLLECTION, never inside a test body.
 *
 * The class: a test that does `await import('../render/scene3')` in its body is charged the module's
 * LOAD time against the 5 s per-test timeout. In isolation that load is ~50 ms and invisible. Under the
 * full suite every worker's module requests queue on the one shared vite-node server, and the load can
 * take seconds — so the test times out on some runs and not others, on an unchanged tree. That is
 * exactly how `free-line.test.ts` went red-then-green on sha 23a28a0e (round #1292, "Test timed out in
 * 5000ms"). A static import pays the same latency during collection, which no per-test timeout covers.
 *
 * The rule, mechanically: an indented (i.e. not top-level) dynamic `import('…')` of anything but a
 * `node:` builtin is refused. A body that genuinely needs a fresh module instance (e.g. after
 * `vi.resetModules()`) says so on the line with `// load-in-body-ok: <reason>`.
 *
 * Deliberately 3-D only: docs/17 §1 — a sibling product's instances are filed, not fixed here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // src3d/
const TEST_FILE = /\.test\.tsx?$/;
/** This file quotes the forbidden shape in its own self-test strings, so it is not scanned. */
const SELF = fileURLToPath(import.meta.url);

/** The detector — the lint and its self-test both call THIS function. */
function bodyImports(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  source.split(/\r?\n/).forEach((text, i) => {
    if (!/^\s+/.test(text)) return; // top-level await import runs at collection — fine
    if (/^\s*(\*|\/\/|\/\*)/.test(text)) return; // a comment line mentions, never loads
    if (/load-in-body-ok:/.test(text)) return;
    const re = /(?<!typeof\s)\bimport\(\s*(['"`])([^'"`]+)\1/g;
    for (const m of text.matchAll(re)) {
      if (m[2].startsWith('node:')) continue; // builtins are not transformed; nothing queues
      hits.push({ line: i + 1, text: text.trim() });
    }
  });
  return hits;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (TEST_FILE.test(e.name) && p !== SELF) out.push(p);
  }
  return out;
}

describe('#1305 — 3-D tests import at collection, never inside a timed test body', () => {
  const files = walk(ROOT);

  it('the detector flags the #1305 shape and passes the allowed ones (it can fail)', () => {
    const bad = "  it('x', async () => {\n    const { buildScene3 } = await import('../render/scene3');\n  });";
    expect(bodyImports(bad)).toHaveLength(1);
    expect(bodyImports("const t = await import('../x');")).toHaveLength(0); // top level
    expect(bodyImports("    const fs = await import('node:fs');")).toHaveLength(0);
    expect(bodyImports("   * a comment naming await import('../x')")).toHaveLength(0);
    expect(bodyImports("    const real = await importOriginal<typeof import('../../parser/parse3')>();")).toHaveLength(0);
    expect(bodyImports("    const m = await import('../x'); // load-in-body-ok: fresh instance after resetModules")).toHaveLength(0);
  });

  it('scans the whole 3-D test tree — otherwise the lint proves nothing', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('no 3-D test loads a source module inside its body', () => {
    const offenders = files.flatMap((f) =>
      bodyImports(readFileSync(f, 'utf8')).map((h) => `${relative(ROOT, f)}:${h.line}  ${h.text}`),
    );
    expect(
      offenders,
      'hoist these to static imports at the top of the file: a body-time import is charged to the 5 s ' +
        'per-test timeout and times out under full-suite load (#1305, ADR-3D-261)',
    ).toEqual([]);
  });
});
