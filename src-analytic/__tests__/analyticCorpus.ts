/**
 * THE ANALYTIC FIGURE CORPUS (#1289, shared with #1473) — every string-array literal in
 * `src-analytic/__tests__` (harvested from source, zero authoring) plus each catalog entry with its
 * `needs`. Analytic has no scenario corpus of its own, so the figures its suite already builds ARE the
 * corpus. Extracted from the #1289 invariant so the #1473 knowledge-pool invariant sweeps the SAME set.
 * Not a test file: a helper both locks import.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const HERE = __dirname;
const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ARRAY = new RegExp(String.raw`\[\s*((?:${STR})(?:\s*,\s*(?:${STR}))*)\s*,?\s*\]`, 'g');
const ITEM = new RegExp(STR, 'g');

/** Every string-array literal in the analytic tests, plus every catalog entry with its context. */
export function analyticCorpus(): string[][] {
  const seqs = new Map<string, string[]>();
  for (const f of readdirSync(HERE).filter((n) => /\.tsx?$/.test(n))) {
    const src = readFileSync(path.join(HERE, f), 'utf8');
    for (const m of src.matchAll(ARRAY)) {
      const items = [...m[1].matchAll(ITEM)].map((x) => x[0].slice(1, -1).replace(/\\(['"\\])/g, '$1'));
      seqs.set(JSON.stringify(items), items);
    }
  }
  for (const e of COMMAND_CATALOG_ANALYTIC) {
    const s = [...(e.needs ?? []), e.he];
    seqs.set(JSON.stringify(s), s);
  }
  return [...seqs.values()];
}
