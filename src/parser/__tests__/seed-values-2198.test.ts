/**
 * #2198 ([ADR-677](../../../docs/06-decisions.md#adr-677), [ADR-678](../../../docs/06-decisions.md#adr-678)) — unit locks:
 * a SEED never accounts a stated number, and the read-extent probe asks the reading about each stated number.
 */
import { describe, expect, it } from 'vitest';
import { droppedGivenNumbers, statedNumberOccurrences } from '@/parser';
import { isSeedValue, seedFields, type AnyCommand } from '@/engine';
import { readNumbers, type Reader } from '../../../shell/readExtent';

describe('ADR-677 — the accountant skips seed values', () => {
  it('a free-radius 5, a free apex x = 12 and a line marker’s offset 5 do not account a stated 5 / 12', () => {
    expect(droppedGivenNumbers('ברדיוס 5', [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true }])).toEqual([5]);
    expect(droppedGivenNumbers('מרחקה 12', [{ type: 'free-point', id: 'E', x: 12, y: 0, free: true }])).toEqual([12]);
    expect(droppedGivenNumbers('ואורכו 5', [{ type: 'point-on-line', id: 'A', line: 'tan-T', offset: 5 }])).toEqual([5]);
  });

  it('a pinned radius 5, a typed point (12, 0) and a set-distance 5 do account it', () => {
    expect(droppedGivenNumbers('ברדיוס 5', [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }])).toEqual([]);
    expect(droppedGivenNumbers('E=(12,0)', [{ type: 'free-point', id: 'E', x: 12, y: 0 }])).toEqual([]);
    expect(droppedGivenNumbers('AB=5', [{ type: 'set-distance', a: 'A', b: 'B', value: 5 } as AnyCommand])).toEqual([]);
  });

  it('the predicate is declared per command kind, beside the command types', () => {
    expect(seedFields({ type: 'circle', id: 'c', center: 'O', radius: 5, freeRadius: true })).toEqual(['radius']);
    expect(seedFields({ type: 'circle', id: 'c', center: 'O', radius: 5 })).toEqual([]);
    expect(isSeedValue({ type: 'free-point', id: 'E', x: 1, y: 2, free: true }, 'x')).toBe(true);
    expect(isSeedValue({ type: 'free-point', id: 'E', x: 1, y: 2 }, 'x')).toBe(false);
    expect(isSeedValue({ type: 'point-on-circle', id: 'A', circle: 'c', theta: 1, free: true }, 'theta')).toBe(true);
    expect(isSeedValue({ type: 'point-on-circle', id: 'A', circle: 'c', theta: 1 }, 'theta')).toBe(false);
  });
});

describe('ADR-678 — the number class of the read-extent probe', () => {
  /** A toy reader: lowers "r N" to `N` when the rule reads it, a constant when it ignores it. */
  const reader = (readsIt: boolean): Reader<string> => ({
    read: (t) => (/^r \d+$/.test(t) ? (readsIt ? t.slice(2) : 'free') : null),
    same: (a, b) => a === b,
  });

  it('read: the lowering changes when the number does', () => {
    const r = readNumbers('r 5', '5', reader(true), [{ text: '5', at: 2, end: 3 }]);
    expect(r.read.map((o) => o.text)).toEqual(['5']);
    expect(r.unread).toEqual([]);
  });

  it('unread: the lowering is identical with another number', () => {
    const r = readNumbers('r 5', 'free', reader(false), [{ text: '5', at: 2, end: 3 }]);
    expect(r.unread.map((o) => o.text)).toEqual(['5']);
  });

  it('a failed re-read counts as read (no evidence of a drop)', () => {
    const failing: Reader<string> = { read: (t) => (t === 'r 5' ? 'x' : null), same: (a, b) => a === b };
    expect(readNumbers('r 5', 'x', failing, [{ text: '5', at: 2, end: 3 }]).unread).toEqual([]);
  });

  it('the substitute is a same-kind value not in the line (an integer → the next free integer; a decimal keeps its places)', () => {
    const seen: string[] = [];
    const spy: Reader<string> = { read: (t) => (seen.push(t), 'same'), same: (a, b) => a === b };
    readNumbers('5 6 2.5', 'same', spy, [{ text: '5', at: 0, end: 1 }, { text: '2.5', at: 4, end: 7 }]);
    expect(seen).toEqual(['7 6 2.5', '5 6 2.6']);
  });

  it('the scanner: a name index («α1», «O1») and a count («2 משיקים») are never stated numbers', () => {
    expect(statedNumberOccurrences('מנקודה A יוצאים 2 משיקים למעגל').occurrences).toEqual([]);
    expect(statedNumberOccurrences('∠ABC = α1').occurrences).toEqual([]);
    expect(statedNumberOccurrences('מעגל O1 ברדיוס 3').occurrences.map((o) => o.text)).toEqual(['3']);
  });
});
