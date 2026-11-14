/**
 * #2890 ([ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477); ADR-W-210 phase 3) — A FINISHED ACTION AS DATA,
 * AND ITS ADOPTION (`engine/settle.ts`).
 *
 * The page may not solve, so the heap that solved hands it what it solved and the page adopts it. These are the locks of
 * the hand-over itself:
 *  1. the two lanes are two heaps: nothing a worker solves is readable from the page until it is adopted;
 *  2. an adopted result makes `derive` a lookup and every gate warm, in either direction (worker to page, and the page's
 *     own store back to a new worker);
 *  3. what a clone would drop without a word is carried: the tables that say which configuration a figure is;
 *  4. A MESSAGE THAT WOULD LOSE SOMETHING IN THE CLONE FAILS (`cloneLoss`): a function, a class instance, an accessor, a
 *     hidden member that is not one of the four the design leaves behind, and nothing in a real result;
 *  5. the four hidden rank readers a clone leaves behind are read by no page code;
 *  6. every memo of the product is named, by a name of its own: an unnamed one would stay behind in the worker.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearAnalyticCaches, derive, heldLineListKeys, heldLineLists, type Derivation } from '../engine/derive';
import { configurationPool, drawnSampleOf } from '../engine/evaluate';
import { ContentCache, namedContentCaches } from '../engine/content';
import { DROPPED_BY_A_CLONE, adoptSettled, cloneLoss, settledOf, settling, type Settled } from '../engine/settle';
import { panelKnowledge } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { locusChips, askLocus } from '../app/locusChip';
import { anotherConfiguration } from '../app/another';
import { inWorkerLane, readWork } from '../../shell/workMeter';
import { heapSequences } from './heapsAn';

/**
 * The two LANES of one module instance are two heaps (`derive`'s store is one per lane): run `fn` in the worker's
 * lane, then hand the page what it settled, through a structured clone. The unit-level form of a worker's hand-over;
 * the walk and the reading comparison use a second module instance (`heapsAn.ts`).
 */
function handOver<T>(fn: () => T): { value: T; loss: string[]; lists: number } {
  const { value, keys } = inWorkerLane(() => settling(fn));
  const message = inWorkerLane(() => settledOf(keys));
  const loss = cloneLoss(message);
  adoptSettled(structuredClone(message));
  return { value, loss, lists: message.lists.length };
}

const fmt = (v: number) => String(Math.round(v * 1e6) / 1e6);
function units(fn: () => void): number {
  const before = readWork().total;
  fn();
  return readWork().total - before;
}
/** As text, with maps and sets spelled out: what two heaps are compared by. */
const text = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x instanceof Map ? { map: [...x] } : x instanceof Set ? { set: [...x] } : typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));

/** A figure whose every configuration costs a solve, with a second position of D to list. */
const LINES = ['משולש ABC', 'AB = 5', 'AC = 6', 'D על BC', 'AD = 4'];
/** The 2024 summer-B locus (#1138): a chip and a traced curve. */
const LOCUS = ['M(1,2)', 'K(1,0)', 'נקודה E', 'E על הישר x = -1', 'דרך E עובר ישר l1 מקביל לציר ה-x', 'l2 אנך אמצעי ל-EK', 'G נקודת החיתוך של הישר l1 עם הישר l2'];

/** Everything a page reads off a figure once its pool is complete. */
function reading(lines: readonly string[], seed = 0): string {
  const d = derive(lines, seed);
  configurationPool(d.construction).fill();
  const knows = panelKnowledge(d);
  return text({
    figure: d.figure,
    configuration: d.configuration,
    faults: d.faults,
    stated: d.stated,
    knows,
    points: knows.points.map((p) => pointText(d, p.id, p.x as never, p.y as never, fmt)),
    chips: locusChips(d),
    sample: drawnSampleOf(d.figure),
  });
}

beforeEach(() => clearAnalyticCaches());

describe('#2890 — the two lanes are two heaps', () => {
  it('what the worker lane solves is not in the page lane\'s store, and the page pays for it again', () => {
    const inWorker = units(() => inWorkerLane(() => reading(LINES)));
    expect(inWorker).toBeGreaterThan(0);
    expect(inWorkerLane(() => heldLineLists())).toBe(1);
    expect(heldLineLists()).toBe(0);
    expect(units(() => reading(LINES))).toBe(inWorker);
  });

  it('clearAnalyticCaches empties both', () => {
    reading(LINES);
    inWorkerLane(() => reading(LINES));
    clearAnalyticCaches();
    expect(heldLineLists()).toBe(0);
    expect(inWorkerLane(() => heldLineLists())).toBe(0);
  });
});

describe('#2890 — an adopted result is as good as a computed one', () => {
  it('after the hand-over the page derives and reads everything for no solver work, and reads the same', () => {
    const { value: theirs, loss } = handOver(() => reading(LINES));
    expect(loss).toEqual([]);
    let mine = '';
    expect(units(() => (mine = reading(LINES)))).toBe(0);
    expect(mine).toBe(theirs);
  });

  it('a second configuration the worker solved is a lookup too; one it did not solve is solved on the page, correctly', () => {
    const { value: theirs } = handOver(() => [reading(LINES, 0), reading(LINES, 1)]);
    expect(units(() => expect(reading(LINES, 1)).toBe(theirs[1]))).toBe(0);
    const cold = inWorkerLane(() => reading(LINES, 5));
    let mine = '';
    units(() => (mine = reading(LINES, 5)));
    expect(mine).toBe(cold);
  });

  it('the traced locus and the chips cross with their figure', () => {
    const { value: theirs, loss } = handOver(() => {
      const d = derive(LOCUS, 0);
      configurationPool(d.construction).fill();
      return text([locusChips(d), askLocus(d, 'G', fmt)]);
    });
    expect(loss).toEqual([]);
    const d = derive(LOCUS, 0);
    configurationPool(d.construction).fill();
    let mine = '';
    expect(units(() => (mine = text([locusChips(d), askLocus(d, 'G', fmt)])))).toBe(0);
    expect(mine).toBe(theirs);
  });

  it('«הציגו תצורה אחרת» decides the same on adopted content, for no solver work', () => {
    const { value: theirs } = handOver(() => {
      reading(LINES);
      return anotherConfiguration(LINES, 0);
    });
    let mine: unknown;
    expect(units(() => (mine = anotherConfiguration(LINES, 0)))).toBe(0);
    expect(mine).toEqual(theirs);
  });

  it('the page\'s own store reseeds a new worker: the hand-over runs in either direction', () => {
    handOver(() => reading(LINES));
    const page = structuredClone(settledOf(heldLineListKeys())); // read in the page's lane: what the page adopted
    expect(page.lists).toHaveLength(1);
    clearAnalyticCaches(); // the worker is terminated: its heap is gone
    expect(inWorkerLane(() => heldLineLists())).toBe(0);
    inWorkerLane(() => adoptSettled(page));
    expect(inWorkerLane(() => units(() => reading(LINES)))).toBe(0);
  });

  it('an adopted derivation\'s lists are frozen again, and a caller still gets its own view', () => {
    handOver(() => reading(LINES));
    const a = derive(LINES, 0);
    const b = derive(LINES, 0);
    expect(Object.isFrozen(a.faults)).toBe(true);
    expect(Object.isFrozen(a.outcomes)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.construction).not.toBe(b.construction);
    expect(a.figure).toBe(b.figure);
  });
});

describe('#2890 — what a clone would drop without a word is carried', () => {
  it('which configuration a figure is: without the side tables an adopted figure has no sample', () => {
    const { value: theirs, keys } = inWorkerLane(() => settling(() => drawnSampleOf(derive(LINES, 0).figure)));
    expect(theirs).toBeDefined();
    const message = inWorkerLane(() => settledOf(keys));
    expect(message.figures.length).toBeGreaterThan(0);
    // a clone of the figure alone has lost it …
    expect(drawnSampleOf(structuredClone(inWorkerLane(() => derive(LINES, 0).figure)))).toBeUndefined();
    // … and the settled result brings it
    adoptSettled(structuredClone(message));
    expect(drawnSampleOf(derive(LINES, 0).figure)).toBe(theirs);
  });

  it('settling reports the line lists an action touched, an inner listener\'s too', () => {
    const outer = settling(() => {
      derive(LINES, 0);
      const inner = settling(() => derive(LOCUS, 0));
      expect(inner.keys).toHaveLength(1);
      derive(LINES, 1);
      return null;
    });
    expect(outer.keys).toHaveLength(2);
    expect(settledOf(outer.keys).lists.map(([key]) => key).sort()).toEqual([...outer.keys].sort());
  });

  it('a line list the store no longer holds is left out, and a memo this build does not have is an error', () => {
    expect(settledOf(['["no such lines"]'])).toEqual({ lists: [], memos: [], figures: [] });
    const { keys } = settling(() => derive(LINES, 0));
    const message: Settled = structuredClone(settledOf(keys));
    message.memos.push(['a memo of another build', message.lists[0][1].front.construction, 1]);
    expect(() => adoptSettled(message)).toThrow(/a memo of another build/);
  });
});

describe('#2890 — a message that would lose something in the clone fails', () => {
  it('plain data loses nothing, however it is nested and shared', () => {
    const shared = { x: 1 };
    const loop: Record<string, unknown> = { shared };
    loop.self = loop;
    expect(cloneLoss({ a: [1, 'two', null, undefined, NaN, shared], m: new Map<unknown, unknown>([[shared, new Set([shared])]]), loop })).toEqual([]);
  });

  it('a function, a symbol and a class instance are named with their path', () => {
    class Held {
      n = 1;
    }
    const loss = cloneLoss({ memo: [{ read: () => 1 }], tag: Symbol('t'), held: new Held(), when: new Date(0), weak: new WeakMap() });
    expect(loss).toHaveLength(5);
    expect(loss.join('\n')).toMatch(/\$\.memo\[0\]\.read: a function/);
    expect(loss.join('\n')).toMatch(/\$\.tag: a symbol/);
    expect(loss.join('\n')).toMatch(/\$\.held: an instance of Held/);
    expect(loss.join('\n')).toMatch(/\$\.when: an instance of Date/);
    expect(loss.join('\n')).toMatch(/\$\.weak: an instance of WeakMap/);
  });

  it('an accessor, a symbol key and a hidden member are named', () => {
    const o: Record<string, unknown> = { plain: 1 };
    Object.defineProperty(o, 'computed', { enumerable: true, get: () => 2 });
    Object.defineProperty(o, 'hiddenLazy', { enumerable: false, value: () => 3 });
    (o as Record<symbol, unknown>)[Symbol.for('k')] = 4;
    const loss = cloneLoss({ inside: new Map([['row', o]]) });
    expect(loss.join('\n')).toMatch(/\$\.inside<row>\.computed: an accessor/);
    expect(loss.join('\n')).toMatch(/\$\.inside<row>\.hiddenLazy: not enumerable/);
    expect(loss.join('\n')).toMatch(/\$\.inside<row>: a symbol-keyed member/);
    expect(loss).toHaveLength(3);
  });

  it('the four hidden rank readers are the only members a clone may leave behind', () => {
    const figure: Record<string, unknown> = { points: [] };
    for (const name of DROPPED_BY_A_CLONE) Object.defineProperty(figure, name, { enumerable: false, value: () => 0 });
    expect(cloneLoss(figure)).toEqual([]);
    expect([...DROPPED_BY_A_CLONE].sort()).toEqual(['freedomOfRead', 'ringDof', 'separationDof', 'shapeDof']);
  });

  it('a real figure does carry them, so the list is not vacuous', () => {
    const figure = derive(LINES, 0).figure;
    expect(Object.getOwnPropertyNames(figure)).toContain('separationDof');
    expect(Object.keys(figure)).not.toContain('separationDof');
    expect(Object.getOwnPropertyNames(structuredClone(figure))).not.toContain('separationDof');
  });

  it('nothing in a real settled result is lost, and its clone reads the same as text', () => {
    for (const s of heapSequences(false)) {
      clearAnalyticCaches();
      const { keys } = settling(() => {
        for (let n = 1; n <= s.lines.length; n += 1) {
          const d: Derivation = derive(s.lines.slice(0, n), 0);
          configurationPool(d.construction).fill();
          locusChips(d);
        }
      });
      const message = settledOf(keys);
      expect(message.lists.length, s.id).toBeGreaterThan(0);
      expect(cloneLoss(message), s.id).toEqual([]);
      expect(text(structuredClone(message)), s.id).toBe(text(message));
    }
  });
});

describe('#2890 — the page does not read what a clone leaves behind, and no memo stays behind unnamed', () => {
  const SRC = join(__dirname, '..');
  const sources = (dirs: string[]): Array<[string, string]> =>
    dirs.flatMap((dir) =>
      readdirSync(join(SRC, dir), { withFileTypes: true })
        .filter((f) => f.isFile() && /\.tsx?$/.test(f.name))
        .map((f): [string, string] => [`${dir}/${f.name}`, readFileSync(join(SRC, dir, f.name), 'utf8')]),
    );

  it('no page code reads a hidden rank reader', () => {
    const page: Array<[string, string]> = [...sources(['app', 'render', 'store', 'ui']), ['App.tsx', readFileSync(join(SRC, 'App.tsx'), 'utf8')]];
    expect(page.length).toBeGreaterThan(30);
    const readers = page.flatMap(([file, src]) => DROPPED_BY_A_CLONE.filter((name) => new RegExp(`\\b${name}\\b`).test(src)).map((name) => `${file}: ${name}`));
    expect(readers).toEqual([]);
  });

  it('every content cache of the product is named', () => {
    const unnamed = sources(['engine', 'app', 'render', 'store']).flatMap(([file, src]) =>
      file === 'engine/content.ts' ? [] : [...src.matchAll(/new ContentCache<[^;]*>\(\s*\)/g)].map(() => file),
    );
    expect(unnamed).toEqual([]);
    expect(namedContentCaches().size).toBeGreaterThanOrEqual(18);
  });

  it('two memos may not share a name', () => {
    const name = 'settle.test: a name of its own';
    expect(new ContentCache<number>(name).name).toBe(name);
    expect(() => new ContentCache<number>(name)).toThrow(/is taken/);
    expect(namedContentCaches().has(name)).toBe(true);
  });
});
