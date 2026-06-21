/**
 * Hidden point labels (FR-RN-10) — a DISPLAY preference: a point's label + dot can be
 * hidden on the figure (it still participates in the construction). It's UI-only (the
 * student un-hides by clicking the ghost again, not via undo), and `rename`/`merge` must
 * rewrite it so it tracks the renamed letter; `clear` resets it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Command } from '@/engine';
import { useGeoStore } from '../geoStore';

const SQUARE: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
const s = () => useGeoStore.getState();

beforeEach(() => {
  s().clear();
});

describe('store.toggleHidden — hide/show a point label', () => {
  it('toggles a point in and out of the hidden set (case-insensitive)', () => {
    s().execute(SQUARE, 'square ABCD');
    expect(s().hidden).toEqual([]);
    s().toggleHidden('C');
    expect(s().hidden).toEqual(['C']);
    s().toggleHidden('c'); // same point, lowercased — toggles back off
    expect(s().hidden).toEqual([]);
  });

  it('hides several points independently', () => {
    s().execute(SQUARE, 'square ABCD');
    s().toggleHidden('C');
    s().toggleHidden('D');
    expect(new Set(s().hidden)).toEqual(new Set(['C', 'D']));
    s().toggleHidden('C');
    expect(s().hidden).toEqual(['D']);
  });

  it('rename rewrites the hidden letter so the point stays hidden under its new name', () => {
    s().execute(SQUARE, 'square ABCD');
    s().toggleHidden('C');
    s().rename('C', 'E');
    expect(s().hidden).toEqual(['E']); // tracks the rename
  });

  it('merge rewrites the hidden letter (and dedupes)', () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute({ type: 'point-on-segment', id: 'F', a: 'A', b: 'B', t: 0.5 }, 'F on AB');
    s().toggleHidden('F');
    s().toggleHidden('B');
    s().merge('F', 'B'); // fold F into B → both map to B, deduped
    expect(s().hidden).toEqual(['B']);
  });

  it('clear resets the hidden set', () => {
    s().execute(SQUARE, 'square ABCD');
    s().toggleHidden('C');
    s().clear();
    expect(s().hidden).toEqual([]);
  });
});

describe('store.toggleSegHidden / toggleSegDashed — per-segment display style', () => {
  it('toggles a segment hidden, then back off (drops the entry when clear)', () => {
    s().execute(SQUARE, 'square ABCD');
    expect(s().segStyle).toEqual({});
    s().toggleSegHidden('seg-AB');
    expect(s().segStyle['seg-AB']).toEqual({ hidden: true });
    s().toggleSegHidden('seg-AB');
    expect(s().segStyle['seg-AB']).toBeUndefined(); // both flags off → entry removed
  });

  it('hidden and dashed are independent flags on the same segment', () => {
    s().execute(SQUARE, 'square ABCD');
    s().toggleSegDashed('seg-AB');
    expect(s().segStyle['seg-AB']).toEqual({ dashed: true });
    s().toggleSegHidden('seg-AB');
    expect(s().segStyle['seg-AB']).toEqual({ dashed: true, hidden: true });
    s().toggleSegHidden('seg-AB'); // un-hide keeps dashed remembered
    expect(s().segStyle['seg-AB']).toEqual({ dashed: true });
  });

  it('rename rewrites the seg-id key (re-sorted endpoints) so the style tracks the renamed point', () => {
    s().execute(SQUARE, 'square ABCD');
    s().toggleSegDashed('seg-AB');
    s().rename('A', 'E'); // seg AB → endpoints E,B → sorted → seg-BE
    expect(s().segStyle['seg-AB']).toBeUndefined();
    expect(s().segStyle['seg-BE']).toEqual({ dashed: true });
  });

  it('clear resets the segment styles', () => {
    s().execute(SQUARE, 'square ABCD');
    s().toggleSegDashed('seg-AB');
    s().clear();
    expect(s().segStyle).toEqual({});
  });
});
