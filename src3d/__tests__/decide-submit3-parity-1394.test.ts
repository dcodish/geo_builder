/**
 * #1394 — THE PARITY LOCK for extracting `decideSubmit3` out of `store3.submit`.
 *
 * Debt, not behaviour: nothing a student sees may change. This replays every 3-D fixture, every catalog
 * specimen (both languages) and every string-array sequence the 3-D suite already types (harvested from
 * `src3d/__tests__`, zero authoring) through the REAL `submit`, line by line. It records what the store
 * holds after each line: `lastError`, `lastNotice`, the seed, and the fact list without its random ids.
 *
 * `decide-submit3-parity-1394.golden.json` was recorded from `submit` BEFORE the extraction (at `838b1848`).
 * The lock asserts that the dispatcher reproduces it exactly, per sequence. Re-record only with
 * `UPDATE_PARITY_GOLDEN=1`, and only for a change that is MEANT to alter behaviour, named in its own ADR.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGeo3 } from '../store/store3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

const GOLDEN = path.join(__dirname, 'decide-submit3-parity-1394.golden.json');
const FIXTURES = path.resolve(__dirname, '../../fixtures3');
const HERE = __dirname;
const STR = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ARRAY = new RegExp(String.raw`\[\s*((?:${STR})(?:\s*,\s*(?:${STR}))*)\s*,?\s*\]`, 'g');
const ITEM = new RegExp(STR, 'g');

function corpus(): Map<string, string[]> {
  const seqs = new Map<string, string[]>();
  const add = (name: string, lines: string[]) => { if (lines.length) seqs.set(name, lines); };
  if (existsSync(FIXTURES)) {
    for (const file of readdirSync(FIXTURES).filter((n) => n.endsWith('.geo3.json'))) {
      const saved = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as { facts: { utterance: string }[] };
      add(`fixture:${file}`, saved.facts.map((f) => f.utterance));
    }
  }
  COMMAND_CATALOG_3D.forEach((c, i) => {
    add(`catalog:${i}:he`, [c.he]);
    add(`catalog:${i}:en`, [c.en]);
  });
  for (const f of readdirSync(HERE).filter((n) => /\.tsx?$/.test(n) && !n.startsWith('decide-submit3-parity'))) {
    const src = readFileSync(path.join(HERE, f), 'utf8');
    for (const m of src.matchAll(ARRAY)) {
      const items = [...m[1].matchAll(ITEM)].map((x) => x[0].slice(1, -1).replace(/\\(['"\\])/g, '$1'));
      add(`suite:${JSON.stringify(items)}`, items);
    }
  }
  return seqs;
}

function replay(lines: readonly string[]): string {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, queries: [], planeDisplay: {}, displayMode: {} });
  const recs: unknown[] = [];
  for (const line of lines) {
    useGeo3.getState().submit(line);
    const st = useGeo3.getState();
    recs.push({
      line,
      err: st.lastError,
      notice: st.lastNotice,
      seed: st.seed,
      facts: st.facts.map((f) => [f.utterance, f.cmds, f.enabled]),
    });
  }
  return JSON.stringify(recs);
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

describe('#1394 — the dispatched submit reproduces the recorded one, sequence by sequence', () => {
  const seqs = corpus();
  const actual: Record<string, string> = {};
  const detail: Record<string, string> = {};

  beforeAll(() => {
    for (const [name, lines] of seqs) {
      const s = replay(lines);
      actual[name] = hash(s);
      detail[name] = s;
    }
    if (process.env.UPDATE_PARITY_GOLDEN === '1') writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n');
  }, 1_200_000);

  it('the corpus is not empty (fixtures, catalog and suite sequences all present)', () => {
    const names = [...seqs.keys()];
    expect(names.filter((n) => n.startsWith('fixture:')).length).toBeGreaterThan(20);
    expect(names.filter((n) => n.startsWith('catalog:')).length).toBeGreaterThan(50);
    expect(names.filter((n) => n.startsWith('suite:')).length).toBeGreaterThan(100);
  });

  it('every sequence matches its recorded behaviour', () => {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
    const drift = Object.keys(golden).filter((k) => golden[k] !== actual[k]);
    if (drift.length) {
      const dir = path.resolve(__dirname, '../../reports');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'decide-submit3-parity-drift.json'), JSON.stringify(Object.fromEntries(drift.map((k) => [k, JSON.parse(detail[k])])), null, 1));
    }
    expect(drift).toEqual([]);
    expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
  });
});
