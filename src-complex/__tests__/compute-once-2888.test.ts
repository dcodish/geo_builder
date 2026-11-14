/**
 * COMPUTE ONCE (#2888, [ADR-CX-090](../../docs/06d-decisions-complex.md#adr-cx-090); ADR-W-210 invariant 4).
 *
 * Three memos keep what this builder computes, by content: a line's reading (`parseLineV2`), a folded figure
 * (`deriveLines`) and a compiled pattern (`rx`). A memo may only ever change how much work is EXECUTED, so this
 * file holds each one to four things:
 *
 *  1. the same content is computed once;
 *  2. the key is the whole input — content read under a different context is never served another context's result;
 *  3. cold equals warm — over the whole fixture corpus, driven through the student's own entry points, everything a
 *     student can see is identical whether every action starts from empty memos or the memos hold a whole session;
 *  4. the table is bounded, and the one clear function empties it.
 *
 * Executed work is read from the work meter (`shell/workMeter`): one unit is one executed line read or one exact
 * solve, so "computed once" is a count, not a timing.
 *
 * pipeline-lock: "a result does not depend on cache warmth" is a property of the whole route from the typed line to
 * the scene, across every memo on it and across a session's history. A fixture or a scenario asserts one figure's
 * verdict in one run and cannot compare two runs of the same session, so this file drives the route itself. The
 * table the memos are made from has its own unit test (`value/__tests__/content-memo-2888.test.ts`).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { readWork } from '../../shell/workMeter';
import { askRowsOf } from '../app/askLane';
import { coincidencesCx } from '../app/coincidences';
import { DERIVE_MEMO_MAX, clearComplexCaches, complexScopeOf, deriveKey, deriveLines } from '../app/deriveLines';
import { realParamNotes } from '../app/paramNote';
import { editLine, hydrateSession, submitLine, toggleLine } from '../app/submit';
import { CATALOG } from '../parser/catalog';
import { RX_MEMO_MAX, rx } from '../parser/lexicon';
import { PARSE_MEMO_MAX, parseKey, parseLineV2 } from '../parser/rules';
import { buildScene } from '../scene/scene';
import { useComplexStore } from '../store/useComplexStore';
import { contentMemoSizes } from '../value/contentMemo';

const files = import.meta.glob('./fixtures/*.complex.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const fixtures = Object.entries(files)
  .map(([file, text]) => ({ name: file.replace('./fixtures/', ''), file: JSON.parse(text) as { lines: string[] } }))
  .sort((a, b) => (a.name < b.name ? -1 : 1));

const store = () => useComplexStore.getState();

/** The units of work `fn` EXECUTED. */
function workOf(fn: () => void): number {
  const before = readWork().total;
  fn();
  return readWork().total - before;
}

/** Everything in a value, as text: a `Map`, a `Set`, a bigint and a non-finite number each keep their own spelling. */
const text = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === 'bigint') return `${v}n`;
    if (typeof v === 'number' && !Number.isFinite(v)) return `#${String(v)}`;
    if (v instanceof Map) return { '#map': [...v] };
    if (v instanceof Set) return { '#set': [...v] };
    return v;
  });

/** How many entries each of the three memos holds: the compiled patterns, the line readings, the folded figures. */
const sizes = (): { patterns: number; readings: number; figures: number } => {
  const { patterns, readings, figures } = contentMemoSizes();
  return { patterns: patterns.size, readings: readings.size, figures: figures.size };
};

const SCOPES: readonly (readonly string[])[] = [[], ['u'], ['r'], ['a', 'b'], ['u', 'r']];
/** Every line the corpus knows: the catalog's specimens in both languages, and every line of every fixture. */
const CORPUS_LINES = [...new Set([...CATALOG.flatMap((e) => [e.he, e.en]), ...fixtures.flatMap((f) => f.file.lines)])];

beforeEach(() => {
  store().resetSession();
  clearComplexCaches();
});

describe('#2888 — a line is read once per content', () => {
  it('the same text under the same declared letters is read once, and the reading is the same object', () => {
    let first!: ReturnType<typeof parseLineV2>;
    expect(workOf(() => (first = parseLineV2('|z1| = 9r')))).toBe(1);
    let second!: ReturnType<typeof parseLineV2>;
    expect(workOf(() => (second = parseLineV2('|z1| = 9r')))).toBe(0);
    expect(second).toBe(first);
    expect(sizes().readings).toBe(1);
  });

  it('a different TEXT is a different reading, down to a space: the key is the line as typed', () => {
    expect(workOf(() => parseLineV2('z1 = 3+4i'))).toBe(1);
    expect(workOf(() => parseLineV2('z1 = 3+4i '))).toBe(1);
    expect(workOf(() => parseLineV2('z1  = 3+4i'))).toBe(1);
    expect(workOf(() => parseLineV2('Z1 = 3+4i'))).toBe(1);
    expect(sizes().readings).toBe(4);
  });

  it.each([
    // [line, declared letter, how it reads without the declaration, how it reads with it]
    ['u^5 = 32', 'u', { ok: true, roots: 0, constraints: 1 }, { ok: true, roots: 1, constraints: 0 }],
    ['u1, u2, u3 סדרה הנדסית', 'u', { ok: false }, { ok: true, roots: 0, constraints: 1 }],
    ['|z1| = 9r', 'r', { ok: true, roots: 0, constraints: 1 }, { ok: false }],
  ] as const)('«%s» is never served the reading made under other declared letters (%s)', (line, letter, plain, declared) => {
    const shape = (r: ReturnType<typeof parseLineV2>) => (r.ok ? { ok: true, roots: r.line.roots.length, constraints: r.line.constraints.length } : { ok: false });
    // each order, from empty memos: whichever context is read first, the other gets its own reading
    for (const order of [['plain', 'declared'], ['declared', 'plain']] as const) {
      clearComplexCaches();
      for (const which of order) {
        const scope = which === 'plain' ? new Set<string>() : new Set([letter]);
        expect(workOf(() => expect(shape(parseLineV2(line, scope))).toEqual(which === 'plain' ? plain : declared))).toBe(1);
      }
      // and both stay served, each its own
      expect(workOf(() => expect(shape(parseLineV2(line))).toEqual(plain))).toBe(0);
      expect(workOf(() => expect(shape(parseLineV2(line, new Set([letter])))).toEqual(declared))).toBe(0);
    }
  });

  it('the declared letters are keyed as the SET they are: order and identity do not matter, membership does', () => {
    const line = 'u1, u2, u3 סדרה הנדסית';
    expect(workOf(() => parseLineV2(line, new Set(['u', 'v'])))).toBe(1);
    expect(workOf(() => parseLineV2(line, new Set(['v', 'u'])))).toBe(0);
    expect(workOf(() => parseLineV2(line, new Set(['v'])))).toBe(1);
    // a set a caller goes on changing is read as it is NOW, never as it was when it was first seen
    const growing = new Set<string>();
    expect(parseLineV2(line, growing).ok).toBe(false);
    growing.add('u');
    expect(parseLineV2(line, growing).ok).toBe(true);
  });

  it('no text can imitate a set of declared letters: the two parts of a key cannot run into each other', () => {
    const keys = new Set<string>();
    const cases: [string, string[]][] = [
      ['x', []],
      ['x', ['u']],
      ['x', ['u', 'v']],
      ['x', ['u,v']],
      ['["u"]x', []],
      [`["u"]${String.fromCharCode(0)}x`, []],
      [`${String.fromCharCode(0)}x`, []],
      ['', ['x']],
    ];
    for (const [raw, scope] of cases) keys.add(parseKey(raw, new Set(scope)));
    expect(keys.size).toBe(cases.length);
    expect(parseKey('x', new Set(['u', 'v']))).toBe(parseKey('x', new Set(['v', 'u'])));
  });

  it('COLD EQUALS WARM for every line the corpus knows, under every set of declared letters tried', () => {
    expect(CORPUS_LINES.length).toBeGreaterThan(100);
    // warm: every line under every scope, then the whole pass again in the opposite order, from full memos
    const warm = new Map<string, string>();
    const ask = (line: string, scope: readonly string[]) => text(parseLineV2(line, new Set(scope)));
    for (const scope of SCOPES) for (const line of CORPUS_LINES) warm.set(`${scope.join()}|${line}`, ask(line, scope));
    let served = 0;
    expect(
      workOf(() => {
        for (const scope of [...SCOPES].reverse())
          for (const line of [...CORPUS_LINES].reverse()) {
            expect(ask(line, scope), `«${line}» under {${scope.join()}}, served again`).toBe(warm.get(`${scope.join()}|${line}`));
            served++;
          }
      }),
    ).toBe(0);
    expect(served).toBe(SCOPES.length * CORPUS_LINES.length);
    // cold: each one alone, from empty memos
    for (const scope of SCOPES)
      for (const line of CORPUS_LINES) {
        clearComplexCaches();
        expect(ask(line, scope), `«${line}» under {${scope.join()}}, read cold`).toBe(warm.get(`${scope.join()}|${line}`));
      }
  });

  it('a reading is frozen: no caller can change what the next caller is served', () => {
    const r = parseLineV2('z1 = 3+4i');
    if (!r.ok) throw new Error('the specimen must read');
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.line.constraints)).toBe(true);
    expect(Object.isFrozen(r.line.constraints[0].rhs)).toBe(true);
    expect(() => (r.line.declares as string[]).push('z9')).toThrow(TypeError);
    expect(text(parseLineV2('z1 = 3+4i'))).toBe(text(r));
  });

  it('the table is bounded: past the bound the least recently used reading goes, and one still in use stays', () => {
    const line = (k: number) => `z${k} = ${k}+2i`;
    parseLineV2(line(0));
    for (let k = 1; k < PARSE_MEMO_MAX; k++) {
      parseLineV2(line(k));
      if (k % 100 === 0) parseLineV2(line(0)); // a line the session keeps reading
    }
    expect(sizes().readings).toBe(PARSE_MEMO_MAX);
    for (let k = PARSE_MEMO_MAX; k < PARSE_MEMO_MAX + 300; k++) parseLineV2(line(k));
    expect(sizes().readings).toBe(PARSE_MEMO_MAX);
    // the line that was read again and again is still served; the oldest untouched one was dropped and is read anew
    parseLineV2(line(0));
    expect(workOf(() => parseLineV2(line(0)))).toBe(0);
    expect(workOf(() => parseLineV2(line(1)))).toBe(1);
    expect(workOf(() => parseLineV2(line(PARSE_MEMO_MAX + 299)))).toBe(0);
  });
});

describe('#2888 — a rule\'s pattern is compiled once', () => {
  it('the same pattern is the same compiled expression; another pattern or other flags are not', () => {
    const a = rx('^(z\\d*)$');
    expect(rx('^(z\\d*)$')).toBe(a);
    expect(rx('^(w\\d*)$')).not.toBe(a);
    expect(rx('^(z\\d*)$', 'u')).not.toBe(a);
    expect(a.flags).toBe('iu');
    expect(a.test('Z12')).toBe(true);
  });

  it('a global or sticky expression is never shared: it carries its position between calls', () => {
    const g1 = rx('a', 'giu');
    expect(g1.test('aa')).toBe(true);
    expect(g1.lastIndex).toBe(1);
    const g2 = rx('a', 'giu');
    expect(g2).not.toBe(g1);
    expect(g2.lastIndex).toBe(0);
    expect(rx('a', 'y')).not.toBe(rx('a', 'y'));
  });

  it('the patterns are the grammar\'s, not the student\'s: reading the whole corpus leaves the table far under its bound', () => {
    for (const scope of SCOPES) for (const line of CORPUS_LINES) parseLineV2(line, new Set(scope));
    const { patterns } = sizes();
    expect(patterns).toBeGreaterThan(20);
    expect(patterns).toBeLessThan(RX_MEMO_MAX / 4);
    // …and reading more TEXT adds none
    for (let k = 0; k < 200; k++) parseLineV2(`z${k} = ${k}cis${k} `);
    expect(sizes().patterns).toBe(patterns);
  });
});

describe('#2888 — a figure is folded once per content', () => {
  const LINES = ['|z1| = 9r', '|z2| = 12r', 'arg z1 - arg z2 = 90', 'z2 ברביע הראשון', 'המשולש Oz1z2', 'שטח Oz1z2 הוא 54'];

  it('the same lines, configuration, seed, questions and chips are folded once, and the figure is the same object', () => {
    let first!: ReturnType<typeof deriveLines>;
    expect(workOf(() => (first = deriveLines(LINES, 0, 0)))).toBeGreaterThan(LINES.length);
    let second!: ReturnType<typeof deriveLines>;
    expect(workOf(() => (second = deriveLines([...LINES], 0, 0, [], new Set())))).toBe(0);
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.points)).toBe(true);
  });

  it('each of the five inputs is in the key', () => {
    const base = deriveKey(LINES, 0, 0, [], new Set());
    const others = [
      deriveKey(LINES.slice(0, -1), 0, 0, [], new Set()),
      deriveKey([...LINES].reverse(), 0, 0, [], new Set()),
      deriveKey(LINES, 1, 0, [], new Set()),
      deriveKey(LINES, 0, 1, [], new Set()),
      deriveKey(LINES, 0, 0, ['|z1|'], new Set()),
      deriveKey(LINES, 0, 0, [], new Set([0])),
      deriveKey(LINES, 0, 0, [], new Set([1])),
      // the list boundaries are kept: a line is never run into its neighbour or into the questions
      deriveKey([LINES.join('","')], 0, 0, [], new Set()),
      deriveKey(LINES.slice(0, -1), 0, 0, [LINES[LINES.length - 1]], new Set()),
      deriveKey(LINES, 0, 10, [], new Set()),
      deriveKey(LINES, 10, 0, [], new Set()),
    ];
    expect(new Set([base, ...others]).size).toBe(others.length + 1);
    // the chips are a set: the order they were toggled in is not an input
    expect(deriveKey(LINES, 0, 0, [], new Set([2, 0]))).toBe(deriveKey(LINES, 0, 0, [], new Set([0, 2])));
    // every number keeps its own spelling
    expect(new Set([0, -0, 1, NaN, Infinity, -Infinity].map((s) => deriveKey(LINES, 0, s))).size).toBe(6);
  });

  it('a figure asked with a question, a chip, another seed or another line order is never served the plain one', () => {
    const cold = (run: () => ReturnType<typeof deriveLines>): string => {
      clearComplexCaches();
      return text(run());
    };
    const variants: [string, () => ReturnType<typeof deriveLines>][] = [
      ['plain', () => deriveLines(LINES, 0, 0)],
      ['a question', () => deriveLines(LINES, 0, 0, ['|z1-z2|'])],
      ['another question', () => deriveLines(LINES, 0, 0, ['היקף Oz1z2'])],
      ['a chip on the last line', () => deriveLines(LINES, 0, 0, [], new Set([5]))],
      ['seed 3', () => deriveLines(LINES, 3, 3)],
      ['configuration 1, seed 0', () => deriveLines(LINES, 1, 0)],
      ['the lines in another order', () => deriveLines([LINES[1], LINES[0], ...LINES.slice(2)], 0, 0)],
      ['one line fewer', () => deriveLines(LINES.slice(0, -1), 0, 0)],
    ];
    const coldText = variants.map(([, run]) => cold(run));
    // the variants really are different figures (else this test would lock nothing)
    expect(new Set(coldText).size).toBeGreaterThanOrEqual(6);
    // warm: all of them from ONE set of memos, asked in two orders — each is served exactly its own cold figure
    clearComplexCaches();
    for (const [i, [name, run]] of variants.entries()) expect(text(run()), `${name}, first asked`).toBe(coldText[i]);
    for (const [i, [name, run]] of [...variants.entries()].reverse()) {
      expect(workOf(() => expect(text(run()), `${name}, served again`).toBe(coldText[i]))).toBe(0);
    }
  });

  it('a line read under new declared letters changes the figure it is part of (the declaration arrives later)', () => {
    // «u^5 = 32» reads u as a real parameter; once «u מספר מרוכב» is in the list the SAME line is five roots
    const real = text(deriveLines(['u^5 = 32'], 0, 0));
    const declared = text(deriveLines(['u^5 = 32', 'u מספר מרוכב'], 0, 0));
    expect(deriveLines(['u^5 = 32'], 0, 0).points.length).toBe(0);
    expect(deriveLines(['u^5 = 32', 'u מספר מרוכב'], 0, 0).points.length).toBe(5);
    // and back: the plain figure is still the plain one, warm and cold
    expect(text(deriveLines(['u^5 = 32'], 0, 0))).toBe(real);
    clearComplexCaches();
    expect(text(deriveLines(['u^5 = 32', 'u מספר מרוכב'], 0, 0))).toBe(declared);
    clearComplexCaches();
    expect(text(deriveLines(['u^5 = 32'], 0, 0))).toBe(real);
  });

  it('the table is bounded, and the figure on screen survives a long run of other figures', () => {
    deriveLines(LINES, 0, 0);
    for (let seed = 1; seed < DERIVE_MEMO_MAX + 40; seed++) {
      deriveLines(['z1 = 3+4i', '|z2| = 2'], seed, seed);
      if (seed % 50 === 0) deriveLines(LINES, 0, 0);
    }
    expect(sizes().figures).toBe(DERIVE_MEMO_MAX);
    deriveLines(LINES, 0, 0);
    expect(workOf(() => deriveLines(LINES, 0, 0))).toBe(0);
    // the oldest untouched figure was dropped: asking for it folds again (its lines are still read from the memo)
    expect(workOf(() => deriveLines(['z1 = 3+4i', '|z2| = 2'], 1, 1))).toBeGreaterThan(0);
  });

  it('clearComplexCaches empties every memo: the next action executes its work again', () => {
    const cold = workOf(() => deriveLines(LINES, 0, 0));
    expect(workOf(() => deriveLines(LINES, 0, 0))).toBe(0);
    expect(sizes().readings).toBeGreaterThan(0);
    expect(sizes().figures).toBe(1);
    expect(sizes().patterns).toBeGreaterThan(0);
    clearComplexCaches();
    expect(sizes()).toEqual({ patterns: 0, readings: 0, figures: 0 });
    expect(workOf(() => deriveLines(LINES, 0, 0))).toBe(cold);
  });
});

/**
 * THE LOCK THE HARD CONSTRAINT ASKS FOR: a result may not depend on cache warmth.
 *
 * Every fixture is driven through the student's own entry points — type each line, «הציגו תצורה אחרת», load the
 * saved file, edit the last line, mute and restore a line, delete the first — and after each step everything a
 * student can see is written down: the store (lines, questions, seed, the refusal, the notice, the load audit), the
 * folded figure, the scene drawn from it, the answers to the questions, the parameter notes and the coincidences.
 * Once COLD (the memos emptied before every step and every read, which is the code as it was before any memo), and
 * once WARM (never emptied, after the whole corpus was already driven once in the opposite order, so every memo is
 * full of other figures' content). The two transcripts must be identical.
 */
describe('#2888 — cold equals warm over the whole corpus, at the student\'s entry points', () => {
  function seen(): string {
    const g = store();
    const active = g.lines.filter((_, i) => !g.disabled.includes(i));
    const d = deriveLines(active, g.seed, g.seed, g.queries, new Set());
    return text({
      lines: g.lines,
      disabled: g.disabled,
      queries: g.queries,
      seed: g.seed,
      lastError: g.lastError,
      lastNote: g.lastNote,
      loadAudit: g.loadAudit,
      derived: d,
      scene: buildScene(d, { n: 1 }),
      asks: askRowsOf(g.queries, d.knowledge, new Set(complexScopeOf(active).keys())),
      notes: realParamNotes(active, d, g.seed),
      coincidences: coincidencesCx(d),
    });
  }

  /** One fixture's session, as a transcript: what the student sees after every step. `before` runs ahead of each. */
  function session(file: { lines: string[] }, before: () => void): string[] {
    const out: string[] = [];
    const step = (name: string, act: () => unknown): void => {
      before();
      const result = act();
      before();
      out.push(`${name} → ${String(result)} :: ${seen()}`);
    };
    store().resetSession();
    file.lines.forEach((line, k) => step(`submit#${k + 1}`, () => submitLine(line)));
    step('another', () => store().nextConfig());
    step('load', () => hydrateSession(file));
    const last = store().lines.length - 1;
    if (last >= 0) {
      step('edit', () => editLine(last, store().lines[last]));
      step('mute', () => toggleLine(0));
      step('restore', () => toggleLine(0));
      step('delete', () => store().removeLine(0));
      step('retype', () => submitLine(file.lines[0]));
    }
    return out;
  }

  it('every fixture, every step: the same transcript with empty memos and with full ones', () => {
    expect(fixtures.length).toBeGreaterThan(40);
    const cold = new Map(fixtures.map((f) => [f.name, session(f.file, clearComplexCaches)]));
    // fill the memos with the whole corpus, in the opposite order, then drive it again without ever emptying them
    clearComplexCaches();
    for (const f of [...fixtures].reverse()) session(f.file, () => {});
    let steps = 0;
    let served = 0;
    for (const f of fixtures) {
      const warm = session(f.file, () => {});
      const c = cold.get(f.name)!;
      expect(warm.length, f.name).toBe(c.length);
      for (let i = 0; i < c.length; i++) {
        expect(warm[i], `${f.name}, step ${i + 1} (${c[i].slice(0, c[i].indexOf(' ::'))})`).toBe(c[i]);
        steps++;
      }
      served += warm.length;
    }
    expect(steps).toBeGreaterThan(400);
    expect(served).toBe(steps);
    // and the warm pass really was warm: a second full pass over the corpus executes no line read at all
    const readsBefore = sizes().readings;
    for (const f of fixtures) session(f.file, () => {});
    expect(sizes().readings).toBe(readsBefore);
  });

  it('the warm pass does less work than the cold one (the memo is not inert)', () => {
    const f = fixtures.find((x) => x.name.startsWith('2b-capstone'))!;
    const coldWork = workOf(() => session(f.file, clearComplexCaches));
    clearComplexCaches();
    session(f.file, () => {});
    const warmWork = workOf(() => session(f.file, () => {}));
    // measured: 379 units with empty memos before every step, 12 with full ones (the entailment gate's exact solves)
    expect(coldWork).toBeGreaterThan(200);
    expect(warmWork).toBeLessThan(coldWork / 10);
  });
});
