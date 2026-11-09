/**
 * THE POINT-NAME ATOM IS SPELLED ONCE (#2621 C, [ADR-AG-395](../../docs/06c-decisions-analytic.md#adr-ag-395)) — docs/17 §3's
 * "inline lexical fragments" chokepoint. Before #2621 the atom `[A-Z][0-9₀-₉]?` was spelled inline some thirty times across
 * `src-analytic/`, so teaching it the prime («A'») meant teaching every copy, and a copy that missed it read «A'B» as A and
 * B. Every reader now composes `engine/pointName.ts`. This ratchet counts the inline copies left, per file: a count may only
 * go DOWN (lower the baseline when it does). The ones left are not point names: the subscript of a coordinate's axis
 * («X_A»), two circle letters in the common-tangent head, and two comments that quote the atom.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..');
// #2075 (ADR-AG-398) made the index a digit run, so the `*` and `+` spellings are copies of the same atom.
const SPELLINGS = [
  '[A-Z][0-9₀-₉]?',
  '[A-Z]\d?',
  '[A-Z](?:[0-9]|[₀-₉])?',
  '[A-Z][0-9]?',
  '[A-Z][0-9₀-₉]*',
  '[A-Z]\d*',
  '[A-Z](?:[0-9]+|[₀-₉]+)?',
  '[A-Z][0-9]*',
];
const BASELINE: Readonly<Record<string, number>> = {
  // engine/pointName.ts: 0 since #2624 (ADR-AG-446) — the atom moved to `shell/indexedName` (NAME_ATOM), which 2-D shares
  'engine/apply.ts': 1, // `isPointLabel`: an id parser that also takes a repeated prime
  'parser/frameAnalytic.ts': 4, // the «X_A» axis subscript (2) and the common-tangent head's circle letters (2)
  'parser/parseAnalytic.ts': 3, // comments quoting the atom
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('#2621 C — the point-name atom has one spelling', () => {
  it('no file gains an inline copy of the atom, and no new file carries one', () => {
    const measured: Record<string, number> = {};
    for (const f of files(ROOT)) {
      const text = readFileSync(f, 'utf8');
      const n = SPELLINGS.reduce((acc, s) => acc + (text.split(s).length - 1), 0);
      if (n > 0) measured[path.relative(ROOT, f).split(path.sep).join('/')] = n;
    }
    const grew = Object.entries(measured).filter(([f, n]) => n > (BASELINE[f] ?? 0)).map(([f, n]) => `${f}: ${BASELINE[f] ?? 0} → ${n} — compose engine/pointName.ts`);
    expect(grew).toEqual([]);
  });
});
