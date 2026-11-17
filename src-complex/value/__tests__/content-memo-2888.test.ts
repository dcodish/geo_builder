/**
 * THE CONTENT-KEYED MEMO, on its own (#2888, [ADR-CX-090](../../../docs/06d-decisions-complex.md#adr-cx-090)).
 *
 * `value/contentMemo.ts` is the one table every "compute once" memo of this builder is made from. These are its
 * three rules as assertions: the same key gives the stored value and a different key never does; the table is
 * bounded, least recently used out first; a stored value is frozen, so no caller can change what the next one reads.
 * And the one clear function empties every memo, including one made after it was written.
 */
import { describe, expect, it } from 'vitest';

import { clearContentMemos, contentMemo, contentMemoSizes, deepFreeze } from '../contentMemo';

describe('contentMemo — one bounded table from a content key to a value', () => {
  it('returns what was stored under a key, and nothing under a key that was not stored', () => {
    const m = contentMemo<{ v: number }>('test-1', 4);
    const one = { v: 1 };
    expect(m.set('a', one)).toBe(one);
    expect(m.get('a')).toBe(one);
    expect(m.get('b')).toBeUndefined();
    expect(m.get('A')).toBeUndefined();
    expect(m.get('a ')).toBeUndefined();
  });

  it('never holds more than its bound, and drops the LEAST RECENTLY USED entry first', () => {
    const m = contentMemo<number[]>('test-2', 3);
    m.set('a', [1]);
    m.set('b', [2]);
    m.set('c', [3]);
    expect(m.size).toBe(3);
    // reading «a» makes it the most recent: «b» is now the oldest
    expect(m.get('a')).toEqual([1]);
    m.set('d', [4]);
    expect(m.size).toBe(3);
    expect(m.get('b')).toBeUndefined();
    expect(m.get('a')).toEqual([1]);
    expect(m.get('c')).toEqual([3]);
    expect(m.get('d')).toEqual([4]);
    for (let k = 0; k < 100; k++) m.set(`k${k}`, [k]);
    expect(m.size).toBe(3);
    expect(m.max).toBe(3);
  });

  it('storing a key again replaces its value and does not grow the table', () => {
    const m = contentMemo<string[]>('test-3', 2);
    m.set('a', ['old']);
    m.set('a', ['new']);
    expect(m.size).toBe(1);
    expect(m.get('a')).toEqual(['new']);
  });

  it('refuses a bound that is not a positive whole number', () => {
    expect(() => contentMemo('test-4', 0)).toThrow();
    expect(() => contentMemo('test-5', 1.5)).toThrow();
  });

  it('freezes what it stores, deeply: a caller that tried to change a shared value is stopped where it writes', () => {
    const m = contentMemo<{ list: { n: bigint }[]; byName: Map<string, { deg: number }> }>('test-6', 2);
    const stored = m.set('a', { list: [{ n: 1n }], byName: new Map([['x', { deg: 30 }]]) });
    expect(() => stored.list.push({ n: 2n })).toThrow(TypeError);
    expect(() => {
      (stored.list[0] as { n: bigint }).n = 5n;
    }).toThrow(TypeError);
    expect(() => {
      (stored as { list: unknown }).list = [];
    }).toThrow(TypeError);
    // a Map cannot be frozen, so what it HOLDS is
    expect(() => {
      stored.byName.get('x')!.deg = 31;
    }).toThrow(TypeError);
    expect(m.get('a')).toEqual({ list: [{ n: 1n }], byName: new Map([['x', { deg: 30 }]]) });
  });

  it('deepFreeze leaves a RegExp usable and ends on a cycle', () => {
    const re = /a/g;
    const cyc: { self?: unknown; re: RegExp } = { re };
    cyc.self = cyc;
    deepFreeze(cyc);
    expect(Object.isFrozen(cyc)).toBe(true);
    expect(Object.isFrozen(re)).toBe(false);
    expect(re.test('a')).toBe(true);
    expect(re.lastIndex).toBe(1);
  });

  it('a memo made again under the same name takes the first one\'s place (a module reloaded in development)', () => {
    const first = contentMemo<number[]>('test-reloaded', 2);
    first.set('x', [1]);
    const names = Object.keys(contentMemoSizes()).length;
    const second = contentMemo<number[]>('test-reloaded', 3);
    expect(Object.keys(contentMemoSizes()).length).toBe(names);
    expect(contentMemoSizes()['test-reloaded']).toEqual({ size: 0, max: 3 });
    second.set('y', [2]);
    clearContentMemos();
    expect(second.size).toBe(0);
  });

  it('clearContentMemos empties EVERY memo, one made later included', () => {
    const a = contentMemo<number[]>('test-7', 2);
    a.set('x', [1]);
    const before = Object.keys(contentMemoSizes()).length;
    const b = contentMemo<number[]>('test-8', 2);
    b.set('y', [2]);
    expect(Object.keys(contentMemoSizes()).length).toBe(before + 1);
    clearContentMemos();
    expect(a.size).toBe(0);
    expect(b.size).toBe(0);
    expect(Object.values(contentMemoSizes()).every((s) => s.size === 0)).toBe(true);
    expect(a.get('x')).toBeUndefined();
  });
});
