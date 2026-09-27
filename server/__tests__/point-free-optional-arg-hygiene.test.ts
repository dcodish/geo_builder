/**
 * #1440 (ADR-3D-262) — NEVER PASS A FUNCTION WITH AN OPTIONAL 2ND/3RD PARAMETER POINT-FREE TO AN ARRAY
 * ITERATOR.
 *
 * `xs.map(fn)` calls `fn(value, index, array)`. When `fn` declares an optional second parameter —
 * `cleanMag(x, decimals = 2)` — the INDEX silently fills it: element 0 gets `decimals = 0`, element 1
 * gets `1`. 3-D's `formatBranches` did exactly this and answered «t = {0, 2.6}» for the roots −0.23 and
 * 2.63, printing a «0» that is not a solution. Nothing errors and the types check (a number is a number),
 * which is what makes the class expensive. The same holds for an optional THIRD parameter, which receives
 * the array.
 *
 * The guard reads the SOURCE of every shipping tree: it collects every function / arrow declaration whose
 * 2nd or 3rd parameter is optional (`p?:`) or defaulted (`p = …`), BY NAME, and fails on any point-free
 * `.map(name)` / `.forEach(name)` / `.filter(name)` / … of one of those names. Write `xs.map((x) => fn(x))`.
 * Matching by name is deliberately conservative: a same-named function elsewhere also trips it, and the
 * lambda is the fix either way.
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in EVERY per-product lane
 * and belongs to no product — the hazard is JavaScript's, not any tree's.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
/** Every tree that ships to a student, plus the shared chrome. `archive/` is not compiled. */
const TREES = ['src', 'src3d', 'src-complex', 'src-analytic', 'shell'];

const sources = (dir: string, out: string[] = []): string[] => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // a tree that does not exist yet is not a failure
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|dist-.*|\.git|__tests__)$/.test(e.name)) sources(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

/** `function NAME(…)` or `const|let NAME = (…) =>` — group 3 is the parameter list (one level of nested parens). */
const DECL = /(?:function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:<[^>]*>)?\s*\()([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
/** An iterator that calls its callback as `(value, index, array)`. `reduce` is excluded: its shape differs. */
const USE = /\.(map|forEach|flatMap|filter|some|every|find|findIndex|findLast|findLastIndex)\(\s*([A-Za-z_$][\w$]*)\s*\)/g;

/** Split a parameter list at top-level commas. */
function params(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if ('<([{'.includes(ch)) depth++;
    if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const isOptional = (p: string): boolean => /^\s*[\w$]+\s*\?\s*:/.test(p) || /^\s*[\w$]+\s*(?::[^=]*)?=(?!>)/.test(p.replace(/=>/g, '→'));

/** Names whose 2nd or 3rd parameter an iterator would silently fill with the index or the array. */
function optionalTailDecls(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(DECL)) {
    const ps = params(m[3]);
    if (ps.slice(1, 3).some(isOptional)) names.push(m[1] || m[2]);
  }
  return names;
}

function pointFreeUses(src: string, names: ReadonlySet<string>): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(USE)) if (names.has(m[2])) hits.push({ line: i + 1, text: m[0] });
  });
  return hits;
}

describe('#1440 — no point-free iterator call into a function with an optional 2nd/3rd parameter', () => {
  const files = TREES.flatMap((t) => sources(join(ROOT, t)));
  const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
  const names = new Set([...texts.values()].flatMap(optionalTailDecls));

  it('the scan actually reads the workspace and finds the declarations it guards', () => {
    // The #909/#174 lesson: an audit that finds nothing to check passes green while exercising nothing.
    expect(files.length).toBeGreaterThan(200);
    expect(names.size).toBeGreaterThan(50);
    // the declaration this issue is about must be one of them, or the detector has rotted
    expect(names.has('cleanMag')).toBe(true);
  });

  it('no shipping source passes such a function point-free', () => {
    const offenders: string[] = [];
    for (const [f, src] of texts) {
      for (const h of pointFreeUses(src, names)) offenders.push(`${f.slice(ROOT.length + 1)}:${h.line}  ${h.text}`);
    }
    expect(offenders, `the iterator's INDEX/ARRAY fills the optional parameter — write (x) => fn(x):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the detector catches the shape it exists for, and not the fixed spelling', () => {
    const decl = 'export const cleanMag = (x: number, decimals = 2): string => cleanNum(x, decimals);';
    const n = new Set(optionalTailDecls(decl));
    expect([...n]).toEqual(['cleanMag']);
    expect(pointFreeUses('return `{${sorted.map(cleanMag).join(", ")}}`;', n)).toHaveLength(1);
    expect(pointFreeUses('return `{${sorted.map((x) => cleanMag(x)).join(", ")}}`;', n)).toHaveLength(0);
    // `p?:` optional, a function declaration, and a THIRD-position default all count
    expect(optionalTailDecls('function fmt(x: number, d?: number) {}')).toEqual(['fmt']);
    expect(optionalTailDecls('function g(x: number, i: number, a: number[] = []) {}')).toEqual(['g']);
    // a required second parameter, a callback-typed parameter and a one-parameter arrow do not
    expect(optionalTailDecls('function h(x: number, i: number) {}')).toEqual([]);
    expect(optionalTailDecls('const k = (x: number, cb: (y: number) => void) => 0;')).toEqual([]);
    expect(optionalTailDecls('const one = (x: number) => x;')).toEqual([]);
  });
});
