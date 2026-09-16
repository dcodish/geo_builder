/**
 * THE COMMIT-SEAM REGISTRY — the inventory nobody kept (#1132).
 *
 * **Why this file exists.** Two shipped, green features were dead in production for the same reason, and
 * no gate could see either:
 *
 *  - [#1102](https://github.com/dcodish/geo_builder/issues/1102) — analytic's submit decision lived
 *    inline in `App.tsx` with no exported seam, so its lock REPRODUCED the decision. The copy had no
 *    `created` arm; a change fifteen minutes later shadowed the real branch and the lock stayed green.
 *  - [#1041](https://github.com/dcodish/geo_builder/issues/1041) — ADR-510 moved the post-commit
 *    configuration search out of the commit seams into their callers and re-armed only one. The ✎ edit
 *    seam kept a comment describing a connection that did not exist.
 *
 * The shared root is not a wrong line. It is that **nothing enumerates the seams**, so a forgotten one
 * and a deliberately exempt one are indistinguishable. `replaceGroup`'s own docblock had already recorded
 * that it is the seam that drifts (its `PARITY CAVEAT`) — the note was there, and the ADR-510 move still
 * missed it. **Prose is not a mechanism.**
 *
 * So the two lists below are assertions, not comments. A seam that appears in a store and not in the
 * registry fails this suite; a decision module a seam claims and does not have fails this suite.
 *
 * **What this file does NOT claim to do.** It cannot detect a test that reproduces its subject — that is
 * a judgement, not a pattern. What it can do is remove the conditions that make reproduction tempting:
 * every seam must name an exported decision module, and every such module must be exercised by a test.
 * A decision with a callable seam tends to get called.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/* ------------------------------------------------------------------ *
 * 1. The seams that RESET THE SEED, extracted from the stores.
 * ------------------------------------------------------------------ */

/**
 * A store action definition. Deliberately loose about indentation — the point is to find the enclosing
 * action name for each seed reset, not to validate formatting.
 */
const ACTION = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/;

/**
 * A seed reset, in BOTH spellings the codebase uses.
 *
 * The second one is load-bearing: `replaceGroup` writes `patch.seed = 0`, not `seed: 0`. A first draft of
 * this extractor matched only the object-literal form and silently missed the one seam this whole file
 * exists because of — a guard that misses the motivating case is worse than no guard, because it grants
 * confidence it has not earned.
 */
const SEED_RESET = /\bseed\s*[:=]\s*0\b/;

/** Actions that reset the seed, per store file, discovered rather than declared. */
function seedResettingActions(storeFile: string): string[] {
  const lines = read(storeFile).split('\n');
  let current: string | null = null;
  const found = new Set<string>();
  for (const ln of lines) {
    const m = ACTION.exec(ln);
    if (m) current = m[1];
    if (SEED_RESET.test(ln) && current) found.add(current);
  }
  return [...found].sort();
}

type SeamStatus =
  /** Launches the post-commit configuration search. */
  | 'wired'
  /** Deliberately does not, with a measurement behind it. */
  | 'exempt'
  /** Known to need it and known not to have it — an open issue must be named. */
  | 'gap'
  /** Not a session mutation at all (initial state, a full reset with nothing left to satisfy). */
  | 'not-a-seam';

interface Seam {
  action: string;
  status: SeamStatus;
  /** Why — required for every status except `wired`. Prose here is fine; the STATUS is the assertion. */
  note: string;
}

/**
 * 2-D, `src/store/geoStore.ts`.
 *
 * Six actions reset the seed. #1041 documented three of them; the extractor above found six, and the
 * two extra ones turned out to matter — see `toggle` / `setGroupEnabled`.
 */
const GEO_SEAMS: Seam[] = [
  { action: 'replaceGroup', status: 'wired', note: 'the ✎ edit seam — ADR-518 / #1041' },
  {
    action: 'removeGroup',
    status: 'exempt',
    note:
      'MEASURED (ADR-518): over 12 deletions across three figures, a remainder that stays satisfiable ' +
      'was valid at seed 0 every time, and one that breaks had no valid seed in 0..79. No case exists ' +
      'where the search would rescue a recoverable figure — deletion only ever relaxes.',
  },
  {
    action: 'remove',
    status: 'exempt',
    note:
      'Same shape as removeGroup (deleting one fact rather than a group), exempt on the same reasoning. ' +
      'Its own measurement is owed and is listed on #1133 step 3.',
  },
  {
    action: 'toggle',
    status: 'gap',
    note:
      'GAP — #1133. Re-enabling a disabled given ADDS a requirement back, the same direction as a ' +
      'submit, and submits have always searched. Measured stranded on «משולש ABC»/«גובה AD»/«AB = 10»/' +
      '«AD = 7»: seed 0 invalid, seed 1 valid, nothing searches.',
  },
  {
    action: 'setGroupEnabled',
    status: 'gap',
    note: 'GAP — #1133, the group-level twin of `toggle`. Same measurement.',
  },
  {
    action: 'clear',
    status: 'not-a-seam',
    note: 'Empties the session — there is nothing left to satisfy, so there is nothing to search for.',
  },
  {
    action: 'set',
    status: 'not-a-seam',
    note:
      'Not an action: the extractor attributes the INITIAL STATE object’s `seed: 0` to the nearest ' +
      'preceding `name: (` above it. Listed so the count reconciles rather than being filtered away ' +
      'silently — a filter is where a real seam would hide.',
  },
];

const STORES: Array<{ product: string; file: string; seams: Seam[] }> = [
  { product: '2-D', file: 'src/store/geoStore.ts', seams: GEO_SEAMS },
];

describe('#1132 — the commit-seam registry is an assertion, not a comment', () => {
  for (const { product, file, seams } of STORES) {
    it(`${product}: every seed-resetting action in ${file} is declared`, () => {
      const discovered = seedResettingActions(file);
      const declared = seams.map((s) => s.action).sort();

      /**
       * The whole point. A NEW action that resets the seed — or an existing one that starts to — fails
       * here until someone decides, in writing, whether it needs the post-commit search. That decision
       * is exactly what was never made for the ✎ edit seam.
       */
      expect(
        discovered,
        'a store action resets the seed and is not in the registry — decide whether it needs the ' +
          'post-commit resolve, then add it with a status',
      ).toEqual(declared);
    });

    it(`${product}: every declared seam still exists in the store`, () => {
      const src = read(file);
      for (const s of seams) {
        if (s.status === 'not-a-seam' && s.action === 'set') continue; // the initial-state artefact
        expect(src, `registry names «${s.action}», which the store no longer has`).toContain(`${s.action}:`);
      }
    });

    it(`${product}: every non-wired seam carries a reason`, () => {
      for (const s of seams) {
        if (s.status === 'wired') continue;
        expect(s.note.length, `«${s.action}» is ${s.status} with no reason given`).toBeGreaterThan(40);
      }
    });

    it(`${product}: every GAP names its open issue`, () => {
      /**
       * A gap is allowed to exist — pretending otherwise would just push people to mislabel one as
       * exempt. What is not allowed is a gap with nowhere to read about it.
       */
      for (const s of seams.filter((x) => x.status === 'gap')) {
        expect(s.note, `«${s.action}» is a GAP but names no issue`).toMatch(/#\d+/);
      }
    });
  }

  it('the extractor catches BOTH spellings of a seed reset', () => {
    /**
     * Guarding the guard. `replaceGroup` writes `patch.seed = 0`; an object-literal-only pattern misses
     * it, and a registry that misses the seam it was built for would be worse than none.
     */
    expect(SEED_RESET.test('          seed: 0,')).toBe(true);
    expect(SEED_RESET.test('        patch.seed = 0;')).toBe(true);
    expect(seedResettingActions('src/store/geoStore.ts')).toContain('replaceGroup');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Every app-layer decision module is exercised by a test.
 * ------------------------------------------------------------------ */

/**
 * The second half of #1102's root cause.
 *
 * This check would NOT have caught #1102 on its own — that module did not exist, and a file that is not
 * there cannot be untested. It is recorded here honestly rather than oversold: what it prevents is the
 * NEXT state, where a decision module exists and quietly grows a branch nothing calls. The seam list
 * above is what forces the module to exist in the first place.
 */
const APP_DIRS = ['src/app', 'src-analytic/app', 'src-complex/app'];

const testFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs)) {
      const rel = path.join(dir, entry);
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.test\.tsx?$/.test(entry)) out.push(rel);
    }
  };
  for (const d of ['src', 'src3d', 'src-complex', 'src-analytic', 'shell']) walk(d);
  return out;
};

describe('#1132 — an app-layer decision module is reachable from a test', () => {
  const corpus = testFiles().map((f) => read(f)).join('\n');

  for (const dir of APP_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
      const base = entry.replace(/\.ts$/, '');
      it(`${dir}/${base} is imported by at least one test`, () => {
        /**
         * Both import spellings, because tests use either — `@/app/x` from the 2-D alias, `../x` or
         * `../../app/x` from a neighbouring folder. Matching the basename after an `app/` or `../`
         * segment covers both without matching an unrelated file of the same name.
         */
        const imported =
          corpus.includes(`app/${base}'`) ||
          corpus.includes(`/${base}'`) ||
          corpus.includes(`'../${base}'`);
        expect(
          imported,
          `${dir}/${base}.ts holds a decision and no test imports it — a decision nothing can call is ` +
            'a decision whose test will reproduce it instead (#1102)',
        ).toBe(true);
      });
    }
  }
});
