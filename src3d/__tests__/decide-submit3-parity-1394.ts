/**
 * #1394 — THE PARITY LOCK for extracting `decideSubmit3` out of `store3.submit`.
 *
 * Debt, not behaviour: nothing a student sees may change. This replays every 3-D fixture, every catalog
 * specimen (both languages) and every string-array sequence the 3-D suite already types (harvested from
 * `src3d/__tests__`, zero authoring) through the REAL `submit`, line by line. It records what the store
 * holds after each line: `lastError`, `lastNotice`, the seed, and the fact list without its random ids.
 *
 * The goldens were recorded from `submit` BEFORE the extraction (at `838b1848`). The lock asserts that the
 * dispatcher reproduces them exactly, per sequence. Re-record only with `UPDATE_PARITY_GOLDEN=1`, and only
 * for a change that is MEANT to alter behaviour, named in its own ADR.
 *
 * #2739 (ADR-W-191) — ONE WALK PER SHARED PREFIX, FOUR SHARDS. One file replayed all 3,298 sequences from an
 * empty store, ~12 min alone and 17 min in the full suite: the suite's floor. 3,034 of its lines repeated a
 * prefix an earlier sequence had already replayed. Now:
 *  - the sequences are walked as a TRIE of lines: each distinct prefix is submitted once, the store's state
 *    after it is kept, and every continuation starts from that state instead of replaying the prefix. The
 *    store is a pure fold of `(facts, seed)` (ADR-484), so the state after a prefix is the state a fresh
 *    replay reaches. The records are byte-identical: each sequence's record is the same JSON, hashed the same.
 *  - the sequences are split into four shards by their FIRST line (a stable hash, so a shared prefix never
 *    straddles two shards and a new sequence never moves an old one), one golden per shard, as #1395 does.
 * Shard 1 also checks, statically, that the four goldens partition the corpus.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { useGeo3, type Geo3State } from '../store/store3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { foldedSequences } from './foldedSequences';

export const SHARDS = 4;
const goldenOf = (shard: number): string => path.join(__dirname, `decide-submit3-parity-1394-${shard}.golden.json`);
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
  // #2739: the arrays of the case files folded away, frozen as they were typed
  for (const items of foldedSequences()) add(`suite:${JSON.stringify(items)}`, items);
  return seqs;
}

/** The shard of a sequence: a stable hash of its first line, so every sequence sharing a prefix lands together. */
export const shardOf = (lines: readonly string[]): number =>
  (createHash('sha256').update(lines[0]).digest().readUInt32BE(0) % SHARDS) + 1;

interface Node { readonly children: Map<string, Node>; readonly ends: string[] }

/** The store's data (every non-function field): what a restore puts back. */
type Snapshot = Partial<Geo3State>;
const snapshot = (): Snapshot =>
  Object.fromEntries(Object.entries(useGeo3.getState()).filter(([, v]) => typeof v !== 'function')) as Snapshot;

/**
 * Every sequence's record — the JSON of `{line, err, notice, seed, facts}` per line, exactly as a replay from an
 * empty store writes it — with each distinct prefix submitted once.
 */
function walk(seqs: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  const root: Node = { children: new Map(), ends: [] };
  for (const [name, lines] of seqs) {
    let node = root;
    for (const line of lines) {
      let next = node.children.get(line);
      if (!next) node.children.set(line, (next = { children: new Map(), ends: [] }));
      node = next;
    }
    node.ends.push(name);
  }
  const out = new Map<string, string>();
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, queries: [], planeDisplay: {}, displayMode: {} });
  const visit = (node: Node, before: Snapshot, recs: readonly string[]): void => {
    for (const [line, child] of node.children) {
      useGeo3.setState(before); // the state after this prefix, as a replay of it reaches it
      useGeo3.getState().submit(line);
      const st = useGeo3.getState();
      const trail = [
        ...recs,
        JSON.stringify({
          line,
          err: st.lastError,
          notice: st.lastNotice,
          seed: st.seed,
          facts: st.facts.map((f) => [f.utterance, f.cmds, f.enabled]),
        }),
      ];
      // `JSON.stringify(array)` is its elements' JSON joined by commas: the replay's record, byte for byte.
      for (const name of child.ends) out.set(name, `[${trail.join(',')}]`);
      if (child.children.size) visit(child, snapshot(), trail);
    }
  };
  visit(root, snapshot(), []);
  return out;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** One shard: walk its sequences, compare with (or, under UPDATE_PARITY_GOLDEN=1, write) its golden. */
export function parityShard3(shard: number): void {
  const GOLDEN = goldenOf(shard);
  describe(`#1394 — shard ${shard}: the dispatched submit reproduces the recorded one, sequence by sequence`, () => {
    const all = corpus();
    const seqs = new Map([...all].filter(([, lines]) => shardOf(lines) === shard));
    const actual: Record<string, string> = {};
    const detail: Record<string, string> = {};

    beforeAll(() => {
      for (const [name, s] of walk(seqs)) {
        actual[name] = hash(s);
        detail[name] = s;
      }
      if (process.env.UPDATE_PARITY_GOLDEN === '1') writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n');
    }, 1_200_000);

    if (shard === 1) {
      it('the corpus is not empty (fixtures, catalog and suite sequences all present)', () => {
        const names = [...all.keys()];
        expect(names.filter((n) => n.startsWith('fixture:')).length).toBeGreaterThan(20);
        expect(names.filter((n) => n.startsWith('catalog:')).length).toBeGreaterThan(50);
        expect(names.filter((n) => n.startsWith('suite:')).length).toBeGreaterThan(100);
      });

      it('the four goldens partition the corpus (static: no replay)', () => {
        const keys = Array.from({ length: SHARDS }, (_, i) =>
          Object.keys(JSON.parse(readFileSync(goldenOf(i + 1), 'utf8')) as Record<string, string>),
        );
        const union = keys.flat();
        expect(union.length).toBe(new Set(union).size); // no key in two goldens
        expect([...union].sort()).toEqual([...all.keys()].sort());
      });
    }

    it('every sequence matches its recorded behaviour', () => {
      const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
      const drift = Object.keys(golden).filter((k) => golden[k] !== actual[k]);
      // A key the corpus no longer harvests (an edited literal array RENAMES its key) has no `detail`, and
      // `JSON.parse(undefined)` used to throw here — the crash replaced the report the batch needs to attribute
      // the drift. Report the three sets instead (#1992).
      const gone = Object.keys(golden).filter((k) => !(k in actual));
      const added = Object.keys(actual).filter((k) => !(k in golden));
      if (drift.length || added.length) {
        const dir = path.resolve(__dirname, '../../reports');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `decide-submit3-parity-drift-${shard}.json`), JSON.stringify({
          drifted: Object.fromEntries(drift.filter((k) => k in actual).map((k) => [k, JSON.parse(detail[k])])),
          goneFromCorpus: gone,
          newInCorpus: added,
        }, null, 1));
      }
      expect(drift).toEqual([]);
      expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
    });
  });
}
