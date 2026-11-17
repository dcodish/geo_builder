/**
 * #2888 ([ADR-3D-491](../../../docs/06b-decisions-3d.md#adr-3d-491)) — THE CONTENT TABLE: one object per content,
 * compared exactly, bounded.
 *
 * The table decides which results two objects share, so every way two graphs can differ is a lock here: a graph that
 * differs in ANY way a reader could see must never be answered with another's object.
 */
import { describe, expect, it } from 'vitest';
import { ContentTable, contentHash3, sameContent3 } from '../content3';

const fresh = () => ({ points: new Map([['A', { kind: 'coord', x: 0 }]]), tags: new Set(['a', 'b']), rows: [{ id: 'r1', n: 1 }, { id: 'r2', n: 2 }], name: 'x' });

describe('#2888 — the same content is the same, exactly', () => {
  it('two graphs built alike are the same content and hash alike', () => {
    expect(sameContent3(fresh(), fresh())).toBe(true);
    expect(contentHash3(fresh())).toBe(contentHash3(fresh()));
  });

  it.each([
    ['a number', (g: ReturnType<typeof fresh>) => void (g.rows[1].n = 3)],
    ['a string', (g: ReturnType<typeof fresh>) => void (g.name = 'y')],
    ['one more array item', (g: ReturnType<typeof fresh>) => void g.rows.push({ id: 'r3', n: 3 })],
    ['a map value', (g: ReturnType<typeof fresh>) => void g.points.set('A', { kind: 'coord', x: 1 })],
    ['one more map entry', (g: ReturnType<typeof fresh>) => void g.points.set('B', { kind: 'coord', x: 0 })],
    ['a set member', (g: ReturnType<typeof fresh>) => void (g.tags = new Set(['a', 'c']))],
    ['one more key', (g: ReturnType<typeof fresh>) => void ((g as Record<string, unknown>).extra = 1)],
  ])('a graph that differs by %s is another content', (_what, change) => {
    const other = fresh();
    change(other);
    expect(sameContent3(fresh(), other)).toBe(false);
  });

  it('order is content: array items, map entries, set members and object keys', () => {
    expect(sameContent3([1, 2], [2, 1])).toBe(false);
    expect(sameContent3(new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]]))).toBe(false);
    expect(sameContent3(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(false);
    expect(sameContent3({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  it('primitives are compared as Object.is does: NaN is NaN, −0 is not 0, null is not undefined or NaN', () => {
    expect(sameContent3({ v: NaN }, { v: NaN })).toBe(true);
    expect(contentHash3({ v: NaN })).toBe(contentHash3({ v: 0 / 0 }));
    expect(sameContent3({ v: -0 }, { v: 0 })).toBe(false);
    expect(sameContent3({ v: null }, { v: NaN })).toBe(false);
    expect(sameContent3({ v: null }, { v: undefined })).toBe(false);
    expect(sameContent3({ v: 1 }, { v: '1' })).toBe(false);
    expect(sameContent3({ v: Infinity }, { v: -Infinity })).toBe(false);
  });

  it('a key that holds undefined is not a missing key', () => {
    expect(sameContent3({ a: 1, b: undefined }, { a: 1 })).toBe(false);
    expect(sameContent3({ a: 1, b: undefined }, { a: 1, b: undefined })).toBe(true);
  });

  it('a kind is content: an array is not a plain object, a map is not a set', () => {
    expect(sameContent3([], {})).toBe(false);
    expect(sameContent3(new Map(), new Set())).toBe(false);
    expect(sameContent3(new Map(), {})).toBe(false);
  });

  it('sharing is content: one object listed twice is not two equal objects', () => {
    const one = { type: 'claim' };
    const shared = { claims: [one], givens: [one] };
    const copies = { claims: [{ type: 'claim' }], givens: [{ type: 'claim' }] };
    expect(sameContent3(shared, copies)).toBe(false);
    expect(sameContent3(copies, shared)).toBe(false);
    const again = { type: 'claim' };
    expect(sameContent3(shared, { claims: [again], givens: [again] })).toBe(true);
  });

  it('a side table is content: corresponding objects must carry the same entry', () => {
    const origin = new WeakMap<object, unknown>();
    const pin = (fact: number | undefined) => {
      const p = { kind: 'length', value: 3 };
      if (fact !== undefined) origin.set(p, [fact]);
      return { pins: [p] };
    };
    const read = (node: object) => origin.get(node);
    expect(sameContent3(pin(1), pin(1), read)).toBe(true);
    expect(sameContent3(pin(1), pin(2), read)).toBe(false);
    expect(sameContent3(pin(1), pin(undefined), read)).toBe(false);
    expect(sameContent3(pin(1), pin(2))).toBe(true); // read by nothing, it is not content
  });

  it('a graph holding a function, a class instance or a cycle has no content', () => {
    expect(contentHash3({ f: () => 1 })).toBeNull();
    expect(contentHash3({ d: new Date(0) })).toBeNull();
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(contentHash3(loop)).toBeNull();
    expect(contentHash3(fresh())).not.toBeNull();
  });
});

describe('#2888 — the table: one object per content, never another content’s object, bounded', () => {
  it('the first object of a content answers for every later one', () => {
    const t = new ContentTable<object>(8);
    const first = fresh();
    expect(t.of(first)).toBe(first);
    expect(t.of(fresh())).toBe(first);
    expect(t.of(first)).toBe(first);
    expect(t.stats).toMatchObject({ fresh: 1, shared: 1 });
  });

  it('another content is never answered with it: every candidate is compared in full', () => {
    const t = new ContentTable<object>(8);
    const first = fresh();
    t.of(first);
    const other = fresh();
    other.rows[0].n = 99;
    expect(t.of(other)).toBe(other);
    // every candidate is compared in full: 2 000 near-equal graphs each stay their own
    const many = new ContentTable<object>(4000);
    const seen = new Set<object>();
    for (let i = 0; i < 2000; i++) seen.add(many.of({ rows: [{ id: 'r', n: i }] }));
    expect(seen.size).toBe(2000);
  });

  it('an object with no content is its own answer and is not held', () => {
    const t = new ContentTable<object>(8);
    const a = { f: () => 1 };
    const b = { f: a.f };
    expect(t.of(a)).toBe(a);
    expect(t.of(b)).toBe(b);
    expect(t.size).toBe(0);
    expect(t.stats.opaque).toBe(2);
  });

  it('an object the settled test turns away is its own answer, and is never a representative', () => {
    const done = new WeakSet<object>();
    const t = new ContentTable<object>(8, undefined, (v) => done.has(v));
    const early = fresh();
    expect(t.of(early)).toBe(early);
    expect(t.size).toBe(0);
    const first = fresh();
    done.add(first);
    expect(t.of(first)).toBe(first);
    const later = fresh();
    done.add(later);
    expect(t.of(later)).toBe(first); // settled objects share
    expect(t.of(early)).toBe(early); // and the one asked too early keeps its own answer
    expect(t.stats).toMatchObject({ opaque: 1, fresh: 1, shared: 1 });
  });

  it('the bound holds, and the least recently used is the one dropped', () => {
    const t = new ContentTable<object>(3);
    const make = (n: number) => ({ rows: [{ id: 'r', n }] });
    const first = make(1);
    const second = make(2);
    t.of(first);
    t.of(second);
    t.of(make(3));
    t.of(make(1)); // the first is used again, so the second is now the oldest
    t.of(make(4));
    expect(t.size).toBe(3);
    expect(t.stats.dropped).toBe(1);
    expect(t.of(make(1))).toBe(first); // still held
    const secondAgain = make(2);
    expect(t.of(secondAgain)).toBe(secondAgain); // dropped: a new representative, never a wrong one
    expect(t.of(second)).toBe(second); // an object already answered keeps its answer
    for (let n = 10; n < 200; n++) t.of(make(n));
    expect(t.size).toBe(3);
  });

  it('clear forgets everything', () => {
    const t = new ContentTable<object>(8);
    const first = fresh();
    t.of(first);
    t.clear();
    expect(t.size).toBe(0);
    const again = fresh();
    expect(t.of(again)).toBe(again);
    expect(t.of(first)).toBe(again); // asked again, the old object is answered by the new representative
  });

  it('changed() reports a representative that was altered after it was taken', () => {
    const t = new ContentTable<object>(8);
    const first = fresh();
    t.of(first);
    expect(t.changed()).toEqual([]);
    first.rows[0].n = 5;
    expect(t.changed()).toEqual([first]);
  });
});
