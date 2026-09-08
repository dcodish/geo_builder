/**
 * #934 (ADR-3D-228) — THE `dir="auto"` INVENTORY: A DISPLAY SURFACE MAY NOT DECIDE ITS OWN
 * DIRECTION FROM ITS FIRST STRONG CHARACTER.
 *
 * Three docblocks in this repo already said never to use `dir="auto"` — `shell/bidi.ts`,
 * `shell/frame/InputArea.tsx`, `src3d/i18n/bidi.ts` — and one of them names the very trap
 * («C במרחק…», #118/ADR-312). The advice was written and never enforced, so two rows in `App3.tsx`
 * and one in `src-complex/App.tsx` kept it, and #934 shipped for as long as those rows existed.
 *
 * A grep lock is the right shape here because the defect is the ATTRIBUTE, not a behaviour: any new
 * display surface written with `dir="auto"` is wrong by construction, whatever it renders.
 *
 * EDITABLE FIELDS ARE THE ALLOWLIST, and it is an inventory rather than a pattern exemption: a text
 * box must re-resolve as the student types, and forcing a direction on an editable value is what
 * #118 reverted. Adding a file here is a deliberate act with a reason attached.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src3d', 'src-complex'];

const DIR_AUTO = /dir=("auto"|\{'auto'\}|\{"auto"\})/;

/**
 * Blank out every comment, keeping the line count.
 *
 * A prefix test (`^\s*(//|/*|*)`) is not enough and the difference matters: the warnings about
 * `dir="auto"` in this codebase sit on JSX comment lines opening with `{/*` and on unmarked
 * continuation lines inside a block, so a prefix test makes the lock fire on its own documentation.
 * Strings are not tracked — no line here holds a `//` inside a string literal, and a false BLANK
 * would only ever hide an offender from a lock that also has a per-file assertion below it.
 */
function stripComments(src: string): string {
  const keepNewlines = (m: string) => m.replace(/[^\n]/g, ' ');
  return src.replace(/\/\*[\s\S]*?\*\//g, keepNewlines).replace(/\/\/[^\n]*/g, keepNewlines);
}

/** Every `dir="auto"` occurrence in product CODE, as `<file>:<line>`. */
function occurrences(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      stripComments(readFileSync(p, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (DIR_AUTO.test(line)) out.push(`${p.split(path.sep).join('/')}:${i + 1}`);
        });
    }
  };
  ROOTS.forEach(walk);
  return out.sort();
}

/**
 * The ONE remaining editable field that resolves its own direction per keystroke: the complex ask
 * box, a text input the student types a question into. `dir="auto"` is the browser's own live
 * re-resolution and is correct there, where a value recomputed on every render is not.
 *
 * Compared by FILE, not by line, so an unrelated edit above it does not fail the lock — the
 * question this asks is "which surfaces still decide their own direction", and that is a file-level
 * fact. A new offender in a listed file is caught by the second test for `App3.tsx`; a new offender
 * anywhere else is caught here.
 */
const ALLOWED_FILES = ['src-complex/App.tsx'];

describe('#934 — `dir="auto"` is banned on a display surface', () => {
  it('the inventory is exactly the editable-field allowlist', () => {
    const found = occurrences();
    const files = [...new Set(found.map((x) => x.split(':')[0]))].sort();
    expect(files, `dir="auto" found at:\n${found.join('\n')}`).toEqual(ALLOWED_FILES);
  });

  it('src-complex keeps exactly ONE — the ask input, not a display row', () => {
    const found = occurrences().filter((x) => x.startsWith('src-complex/'));
    expect(found).toHaveLength(1);
    const [line] = found;
    const src = readFileSync('src-complex/App.tsx', 'utf8').split('\n');
    const n = Number(line.split(':')[1]);
    // The five lines around it must be an AskLane/input element — a display `<span>` that drifted
    // into the allowlist would not match, which is the whole point of pinning the shape.
    const around = src.slice(Math.max(0, n - 6), n + 2).join('\n');
    expect(around).toMatch(/AskLane|<input/);
  });

  it('the fact row and the ask row of App3 carry no `dir="auto"`', () => {
    expect(stripComments(readFileSync('src3d/App3.tsx', 'utf8'))).not.toMatch(DIR_AUTO);
  });
});
