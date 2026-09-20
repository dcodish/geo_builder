/**
 * #1044 — A TEST FILE THAT CANNOT FAIL IS NOT A TEST.
 *
 * `src/__tests__/_scratch556b.test.ts` shipped in the suite with **zero assertions**. It ran six replay
 * sweeps on every `test:full`, cost time on every run and every machine, and could not fail — so it
 * reported green forever whatever the engine did. It was left behind as a scratch diagnostic and never
 * removed.
 *
 * Deleting that one file is the patch shape. The class is live rather than hypothetical: the
 * `/decisions` pass of 2026-09-17 found two more (`tmp-probe.test.ts`, `tmp-probe2.test.ts`) sitting
 * untracked in `src-analytic/__tests__/` the same morning. So the deletion comes with this guard, and
 * the next scratch file fails the suite instead of joining it.
 *
 * ## The heuristic, stated deliberately rather than silently
 *
 * "Contains no assertion" is judged from the SOURCE, because vitest reports no per-file assertion count
 * this can read. A file counts as asserting when it, **or any local module it imports**, contains one of
 * the assertion forms below. The one-level import hop is what keeps a file that asserts through a shared
 * harness — `scenarios-harness.ts` is the tree's own example — from being flagged.
 *
 * It is a heuristic and it is allowed to be: its failure direction is a false ALARM on a file that
 * asserts in some way not listed here, which is fixed by adding the form or by naming a waiver. The
 * expensive direction — a file that cannot fail passing silently — is the one it closes.
 *
 * ## Why `.only` is here too
 *
 * The same class from the other end: `.only` leaves the rest of the file unrun while the suite still
 * reports green. CLAUDE.md's readiness gate already forbids "skipped or `.only` specs hiding gaps"; this
 * is the mechanical half of that promise, which until now was a convention someone had to remember.
 *
 * Lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in EVERY per-product lane and
 * belongs to no product.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
/** Every tree that carries tests. `archive/` is excluded from the suite entirely. */
const TREES = ['src', 'src3d', 'src-complex', 'src-analytic', 'shell', 'server', 'scripts'];

/**
 * A file asserts if it contains any of these. `expect(` is the overwhelming majority; the rest are the
 * forms this workspace actually uses, and the list is meant to grow when a new one appears.
 */
const ASSERTION_FORMS = [/\bexpect\s*\(/, /\bexpect\s*\./, /\bassert\s*[.(]/, /\.rejects\b/, /\.resolves\b/];

/**
 * Files allowed to carry no assertion, each with the reason it is legitimate.
 *
 * A guard with no escape hatch is disabled the first time it is inconvenient, so the hatch is here and
 * it is NAMED — an entry with no reason is as good as no guard.
 */
const WAIVERS: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'src/validation/__tests__/triageDump.test.ts',
    why: 'An env-gated operator TOOL, skipped in the normal suite: it replays the prod log and WRITES a JSONL report. Its output is the deliverable, so there is nothing for it to assert.',
  },
  {
    file: 'src/validation/__tests__/triageHtml.test.ts',
    why: 'The second half of the same tool — env-gated and skipped, it turns that JSONL into the HTML report. Asserting on a report it exists to produce would assert on its own input.',
  },
];

const testFiles = (dir: string, out: string[] = []): string[] => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a tree that does not exist yet is not a failure
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|dist-.*|\.git|coverage|reports)$/.test(e.name)) testFiles(p, out);
    } else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

const read = (p: string): string => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

const asserts = (src: string) => ASSERTION_FORMS.some((re) => re.test(src));

/** The local modules a file imports, resolved one level — enough to catch a shared harness. */
function localImports(file: string, src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const base = resolve(dirname(file), m[1]);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) out.push(base + ext);
  }
  return out;
}

describe('#1044 — every test file can actually fail', () => {
  const files = TREES.flatMap((t) => testFiles(join(ROOT, t)));
  const waived = new Set(WAIVERS.map((w) => w.file));

  it('the guard is looking at a real suite', () => {
    // An oracle with nothing to check passes by checking nothing.
    expect(files.length, 'no test files were discovered — the walk is broken').toBeGreaterThan(300);
  });

  it('no test file is assertion-free', () => {
    const silent: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      if (waived.has(rel)) continue;
      const src = read(f);
      if (asserts(src)) continue;
      // It may assert through a helper it imports — one hop, which covers the harness pattern.
      if (localImports(f, src).some((dep) => asserts(read(dep)))) continue;
      silent.push(rel);
    }
    expect(
      silent,
      `these test files contain no assertion and cannot fail:\n${silent.join('\n')}\n` +
        'Delete them, give them an assertion, or add a WAIVER with a reason.',
    ).toEqual([]);
  });

  it('no test file is pinned with .only — the rest of the suite would not run', () => {
    const pinned = files
      .filter((f) => /\b(?:describe|it|test)\.only\s*\(/.test(read(f)))
      .map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(pinned, `these files pin .only, so their siblings never run:\n${pinned.join('\n')}`).toEqual([]);
  });

  it('every waiver carries a reason', () => {
    for (const w of WAIVERS) expect(w.why.length, `waiver for ${w.file} has no reason`).toBeGreaterThan(10);
  });
});
