/**
 * #2888 ([ADR-AG-476](../../docs/06c-decisions-analytic.md#adr-ag-476); ADR-W-210 invariant 4) — COMPUTE ONCE: solved
 * content is keyed by content, and outlives the student's action.
 *
 * `derive` folded a new construction on every call and every solver memo hangs off the construction object, so one
 * student action solved the same figure several times (measured over the fixture walks: 52.8 % of the counted work was
 * a configuration of a line list the same session had already solved). These locks are of the memo itself:
 *
 *  1. the same content is solved once, whichever array or call asked;
 *  2. different content is never answered by a remembered one;
 *  3. what a caller gets is its own (a fresh derivation and a fresh view), and the PAGE's state about a figure — its
 *     deferred pool — is never another reader's;
 *  4. the bound holds, and the clear function empties everything;
 *  5. A RESULT IS THE SAME COLD AND WARM: the figure, the refusals, the panel's rows and the «בודק…» a page shows first.
 *
 * test-budget: lock 5 derives a sample of the saved fixtures three times cold and once more warm, with the whole pool
 * read each time (the 24-seed walk is what a result is read off).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIGURATIONS_MAX, LINE_LISTS_MAX, clearAnalyticCaches, derive, heldLineLists, type Derivation } from '../engine/derive';
import { configurationPool, evaluateStats, settled, POOL_SIZE, type Seed } from '../engine/evaluate';
import { BoundedStore, ContentCache, contentOf, viewOf } from '../engine/content';
import { anotherConfiguration } from '../app/another';
import { panelKnowledge } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { readWork } from '../../shell/workMeter';
import { sequencesOf } from './work-meter/walkAnalytic';
import type { Construction } from '../engine/types';

const fmt = (v: number) => String(Math.round(v * 1e6) / 1e6);
/** Solver work (the work meter's unit) spent by `fn`. */
function units(fn: () => void): number {
  const before = readWork().total;
  fn();
  return readWork().total - before;
}
const dist = (d: Derivation, a: string, b: string): number => {
  const p = d.figure.points.find((q) => q.id === a)!;
  const q = d.figure.points.find((r) => r.id === b)!;
  return Math.hypot(p.x - q.x, p.y - q.y);
};

/** A figure whose every configuration costs a solve: a triangle with two stated sides and a point riding the third. */
const LINES = ['משולש ABC', 'AB = 5', 'AC = 6', 'D על BC', 'AD = 4'];
/** A DETERMINED figure (the 572 exam's part B): every value is one number, so a page that has read three seeds shows «בודק…». */
const DETERMINED = [
  'נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2', 'k הוא פרמטר',
  'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N על הישר 3', 'M נקודת החיתוך של הישר 3 עם ציר ה-y', 'דרך M עובר ישר l4',
  'A נקודת החיתוך של הישר l4 עם הישר 1', 'B נקודת החיתוך של הישר l4 עם הישר 2', 'M אמצע AB',
];

beforeEach(() => clearAnalyticCaches());

describe('#2888 — the same content is solved once', () => {
  it('a second derive of the same lines and configuration costs no solver work, whichever array asked', () => {
    const cold = units(() => derive(LINES, 0));
    expect(cold).toBeGreaterThan(0);
    expect(units(() => derive(LINES, 0))).toBe(0);
    expect(units(() => derive([...LINES], 0))).toBe(0);
    // the configuration, not its spelling, is the key: seed 3 and its canonical configuration are one
    const at3 = units(() => derive(LINES, 3));
    expect(at3).toBeGreaterThanOrEqual(0);
    expect(units(() => derive(LINES, { seed: 3, reach: 1, wide: true }))).toBe(0);
  });

  it('every configuration of a line list is solved on ONE construction: a pool one derivation read is free to the next', () => {
    const d0 = derive(LINES, 0);
    expect(units(() => configurationPool(d0.construction).fill())).toBeGreaterThan(0);
    // another derivation of the same configuration, and one of another configuration: the 24 seeds are solved
    expect(units(() => configurationPool(derive(LINES, 0).construction).fill())).toBe(0);
    const d5 = derive(LINES, 5);
    expect(units(() => configurationPool(d5.construction).fill())).toBe(0);
    expect(contentOf(d5.construction)).toBe(contentOf(d0.construction));
  });

  it('«הציגו תצורה אחרת» pressed twice walks the same configurations once', () => {
    const first = units(() => anotherConfiguration(LINES, 0));
    expect(first).toBeGreaterThan(0);
    expect(units(() => anotherConfiguration(LINES, 0))).toBe(0);
  });

  it('a cold derivation costs the same work every time (the clear function really clears)', () => {
    const run = () => units(() => configurationPool(derive(LINES, 0).construction).fill());
    const a = run();
    expect(heldLineLists()).toBe(1);
    clearAnalyticCaches();
    expect(heldLineLists()).toBe(0);
    const before = evaluateStats.uncached;
    const b = run();
    expect(b).toBe(a);
    expect(evaluateStats.uncached - before, 'the solves were made again, not read').toBeGreaterThan(0);
  });
});

describe('#2888 — different content is never answered by a remembered one', () => {
  it('a changed number, an added line, another seed name: each is its own figure', () => {
    const five = derive(['משולש ABC', 'AB = 5'], 0);
    configurationPool(five.construction).fill();
    const six = derive(['משולש ABC', 'AB = 6'], 0);
    expect(dist(five, 'A', 'B')).toBeCloseTo(5, 6);
    expect(dist(six, 'A', 'B')).toBeCloseTo(6, 6);
    expect(contentOf(six.construction)).not.toBe(contentOf(five.construction));
    // a prefix is not its extension
    const longer = derive(['משולש ABC', 'AB = 5', 'AC = 5'], 0);
    expect(dist(longer, 'A', 'C')).toBeCloseTo(5, 6);
    expect(longer.construction.constraints.length).toBeGreaterThan(five.construction.constraints.length);
    // the session's seed names are part of the content (they move where a free vertex starts)
    const renamed = derive(['משולש ABC', 'AB = 5'], 0, { A: 'Q' });
    expect(renamed.construction.seedNames).toEqual({ A: 'Q' });
    expect(five.construction.seedNames).toBeUndefined();
    expect(contentOf(renamed.construction)).not.toBe(contentOf(five.construction));
    expect(heldLineLists()).toBe(4);
  });

  it('a recorded host is part of the content: the same lines pinned to another ring are another line list', () => {
    const lines = ['משולש ABC', 'AE גובה'];
    const free = derive(lines, 0);
    const pinned = derive(lines, 0, {}, { 1: ['A', 'B', 'C'] });
    expect(pinned.pins).toEqual({ 1: ['A', 'B', 'C'] });
    expect(free.pins).toEqual({});
    expect(contentOf(pinned.construction)).not.toBe(contentOf(free.construction));
  });

  it('two configurations of one line list are two derivations', () => {
    const free = ['משולש ABC'];
    const a = derive(free, 0);
    const b = derive(free, 5);
    expect(a.seed).toBe(0);
    expect(b.seed).toBe(5);
    expect(contentOf(b.construction)).toBe(contentOf(a.construction));
    expect(JSON.stringify(b.figure.points)).not.toBe(JSON.stringify(a.figure.points));
  });
});

describe('#2888 — what a caller gets is its own', () => {
  it('a fresh derivation and a fresh construction per call, equal field by field', () => {
    const a = derive(LINES, 0);
    const b = derive(LINES, 0);
    expect(b).not.toBe(a);
    expect(b.construction).not.toBe(a.construction);
    expect(b.construction).toEqual(a.construction);
    expect(b.figure).toBe(a.figure); // the solved figure is the shared one
    expect(b.faults).toBe(a.faults);
    expect(Object.isFrozen(a.faults), 'a shared list is frozen: a write throws instead of corrupting').toBe(true);
  });

  it("the page's deferred pool is not another reader's: a decision on the same lines still gets a settled verdict", () => {
    const page = derive(DETERMINED, 0);
    configurationPool(page.construction).defer();
    const decision = derive(DETERMINED, 0);
    const pool = configurationPool(decision.construction);
    expect(pool.deferred).toBe(false);
    // a gate on the page's view answers pending; the same gate on the decision's view fills and settles
    const onPage = settled(() => panelKnowledge(page));
    const onDecision = settled(() => panelKnowledge(decision));
    expect(onDecision.pending).toBe(false);
    expect(pool.complete()).toBe(true);
    expect(configurationPool(page.construction).complete(), 'the page pool still owes its own read').toBe(false);
    expect(onPage.pending).toBe(true);
  });

  it('a deferred pool has read what was asked through ITS construction, whatever the content already holds', () => {
    const readOf = (d: Derivation): number[] => {
      const pool = configurationPool(d.construction);
      pool.defer();
      panelKnowledge(d);
      return pool.ready();
    };
    const cold = readOf(derive(DETERMINED, 0));
    expect(cold.length).toBeGreaterThan(0);
    expect(cold.length).toBeLessThan(POOL_SIZE);
    // every seed solved by another reader: this page has still read only what it asked for
    configurationPool(derive(DETERMINED, 0).construction).fill();
    const warm = derive(DETERMINED, 0);
    expect(readOf(warm)).toEqual(cold);
    // and completing it costs nothing now
    const pool = configurationPool(warm.construction);
    expect(units(() => {
      while (!pool.step());
    })).toBe(0);
    expect(pool.complete()).toBe(true);
  });
});

describe('#2888 — the bound', () => {
  it(`holds at most ${LINE_LISTS_MAX} line lists, the least recently used dropped first`, () => {
    const list = (k: number) => ['משולש ABC', `AB = ${k + 1}`];
    const cold = units(() => derive(list(0), 0));
    expect(cold).toBeGreaterThan(0);
    for (let k = 1; k < LINE_LISTS_MAX; k += 1) derive(list(k), 0);
    expect(heldLineLists()).toBe(LINE_LISTS_MAX);
    expect(units(() => derive(list(0), 0)), 'still held, and now the most recently used').toBe(0);
    derive(list(LINE_LISTS_MAX), 0); // one more: list 1 is the least recently used and goes
    expect(heldLineLists()).toBe(LINE_LISTS_MAX);
    expect(units(() => derive(list(0), 0))).toBe(0);
    expect(units(() => derive(list(1), 0)), 'dropped: solved again').toBeGreaterThan(0);
  });

  it(`a line list asked for more than ${CONFIGURATIONS_MAX} configurations starts again`, () => {
    const first = contentOf(derive(LINES, 0).construction);
    for (let s = 1; s < CONFIGURATIONS_MAX; s += 1) derive(LINES, s);
    expect(contentOf(derive(LINES, 0).construction)).toBe(first);
    const next = derive(LINES, CONFIGURATIONS_MAX);
    expect(heldLineLists()).toBe(1);
    expect(contentOf(next.construction)).not.toBe(first);
    // …and the figure it draws is the one it always drew there
    clearAnalyticCaches();
    expect(JSON.stringify(derive(LINES, CONFIGURATIONS_MAX).figure)).toBe(JSON.stringify(next.figure));
  }, 120_000);

  it('BoundedStore: a read refreshes, the oldest goes first', () => {
    const s = new BoundedStore<number>(2);
    s.set('a', 1);
    s.set('b', 2);
    expect(s.get('a')).toBe(1); // a is now the newest
    s.set('c', 3);
    expect(s.get('b')).toBeUndefined();
    expect(s.get('a')).toBe(1);
    expect(s.get('c')).toBe(3);
    expect(s.size).toBe(2);
  });

  it('ContentCache: every view of a content reads one entry; another content reads none', () => {
    const content = derive(LINES, 0).construction;
    const root = contentOf(content);
    const cache = new ContentCache<string>();
    cache.set(viewOf(root), 'solved');
    expect(cache.get(root)).toBe('solved');
    expect(cache.get(viewOf(viewOf(root)))).toBe('solved');
    const other: Construction = { ...root };
    expect(contentOf(other), 'a plain copy is its own content, not a view').toBe(other);
    expect(cache.has(other)).toBe(false);
    clearAnalyticCaches();
    expect(cache.get(root), 'the clear function empties every content cache').toBeUndefined();
  });
});

describe('#2888 — every per-construction memo of the tree is keyed by content', () => {
  /**
   * A memo declared as a bare `WeakMap<Construction, …>` is cold on every `derive` (the root cause of #2888), and one that
   * holds a reader's STATE must not be shared. So the bare ones are a closed list: the view table and the content cache's
   * own map, what each reader asked, the pool, and the store a parts walk keeps for itself.
   */
  it('a bare WeakMap keyed by a construction is one of the few that are meant to be per object', () => {
    const roots = ['engine', 'app', 'render', 'store'].map((d) => join(__dirname, '..', d));
    const found: string[] = [];
    for (const dir of roots) {
      for (const f of readdirSync(dir)) {
        if (!/\.tsx?$/.test(f)) continue;
        const text = readFileSync(join(dir, f), 'utf8');
        for (const m of text.matchAll(/(?:const|let|private) (\w+) = new WeakMap<Construction\b/g)) found.push(`${f}:${m[1]}`);
      }
    }
    expect(found.sort()).toEqual(['content.ts:contentRef', 'content.ts:map', 'evaluate.ts:askedOf', 'evaluate.ts:drawnStore', 'evaluate.ts:poolCache']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Cold and warm
// ---------------------------------------------------------------------------------------------------------------
const DIR = join(__dirname, 'fixtures');
const ALL = readdirSync(DIR)
  .sort()
  .flatMap((f) => sequencesOf(f, JSON.parse(readFileSync(join(DIR, f), 'utf8'))));
/**
 * Every seventh saved sequence: about thirty figures across the families, in a fixed order. `CONTENT_CACHE_SAMPLE=all`
 * locks every saved sequence instead (about four minutes; run by hand when the memo or a solver memo changes).
 */
const SAMPLE = process.env.CONTENT_CACHE_SAMPLE === 'all' ? ALL : ALL.filter((_, i) => i % 7 === 3);
const SEEDS: Seed[] = [0, 1, 7];

/** What a student is shown of a derivation: the figure, the refusals, the rows, and what the page says first. */
function shown(lines: readonly string[], at: Seed): string {
  // the page: a deferred pool, the panel read before the pool completes («בודק…» or a value)
  const page = derive(lines, at);
  const pool = configurationPool(page.construction);
  pool.defer();
  const first = settled(() => {
    const pk = panelKnowledge(page);
    return pk.points.map((p) => settled(() => pointText(page, p.id, p.x, p.y, fmt)));
  });
  const readFirst = pool.ready();
  // then the settled reading, as every caller off the page gets it
  const d = derive(lines, at);
  const pk = panelKnowledge(d);
  const rows = pk.points.map((p) => pointText(d, p.id, p.x, p.y, fmt));
  return JSON.stringify({
    figure: d.figure,
    box: d.box,
    seed: d.seed,
    configuration: d.configuration,
    faults: d.faults,
    outcomes: d.outcomes,
    minted: d.minted,
    notices: d.notices,
    hosts: d.hosts,
    stated: d.stated,
    objects: d.construction.objects,
    params: pk.params,
    curves: pk.curves,
    rows,
    first,
    readFirst,
  });
}

describe('#2888 — a result is the same cold and warm', () => {
  it('the sample is real', () => {
    expect(SAMPLE.length).toBeGreaterThan(20);
  });

  for (const s of SAMPLE) {
    it(s.id, () => {
      const cold = SEEDS.map((at) => {
        clearAnalyticCaches();
        return shown(s.lines, at);
      });
      // one session, in another order: the last configuration first, the whole pool read, the prefixes typed, a press
      // of «הציגו תצורה אחרת», and only then the configurations compared
      clearAnalyticCaches();
      configurationPool(derive(s.lines, 7).construction).fill();
      for (let n = 1; n < s.lines.length; n += 1) derive(s.lines.slice(0, n), 0);
      anotherConfiguration(s.lines, 0);
      const warm = [...SEEDS].reverse().map((at) => shown(s.lines, at)).reverse();
      for (let i = 0; i < SEEDS.length; i += 1) expect(warm[i] === cold[i], `configuration ${JSON.stringify(SEEDS[i])}`).toBe(true);
      // and warm again costs nothing at all
      expect(units(() => SEEDS.forEach((at) => shown(s.lines, at)))).toBe(0);
    }, 300_000);
  }
});
