/**
 * Relabel a point (e.g. E → G) so the student can match a textbook's lettering.
 * A rename is a store operation, not a geometry command: it rewrites the letter
 * across every fact (and its display utterance), leaves the figure geometrically
 * identical, is undoable, and refuses to merge two distinct points. The
 * `parseRename` boundary recognises the He/En phrasings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Command } from '@/engine';
import { parseRename } from '@/parser';
import { replay, useGeoStore } from '../geoStore';

const SQUARE: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
const G_ON_AD: Command = { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 };

const s = () => useGeoStore.getState();
const derived = () => replay(s().facts);

beforeEach(() => {
  s().clear();
});

describe('parseRename — the relabel phrasings', () => {
  it('reads English forms', () => {
    expect(parseRename('rename E to G')).toEqual({ from: 'E', to: 'G' });
    expect(parseRename('relabel e as g')).toEqual({ from: 'E', to: 'G' });
    expect(parseRename('rename E G')).toEqual({ from: 'E', to: 'G' });
  });
  it('reads Hebrew forms', () => {
    expect(parseRename('שנה שם E ל-G')).toEqual({ from: 'E', to: 'G' });
    expect(parseRename('שנה E ל G')).toEqual({ from: 'E', to: 'G' });
    expect(parseRename('החלף E ב-G')).toEqual({ from: 'E', to: 'G' });
    expect(parseRename('החלף את F עם E')).toEqual({ from: 'F', to: 'E' }); // "replace F with E" — עם connector
  });
  it('reads "replace … with …"', () => {
    expect(parseRename('replace F with E')).toEqual({ from: 'F', to: 'E' });
  });
  it('is not a rename → null (so the parser/LLM handle it)', () => {
    expect(parseRename('square ABCD')).toBeNull();
    expect(parseRename('point G on AD')).toBeNull();
    expect(parseRename('rename E to E')).toBeNull(); // no-op letter
  });
});

describe('store.rename — relabel across the fact list', () => {
  it('rewrites the letter in every fact that references it, and its utterance', () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute(G_ON_AD, 'point G on AD');
    const before = derived().positions.get('G');

    const res = s().rename('G', 'E');
    expect(res).toEqual({ ok: true });

    const onSeg = s().facts.map((f) => f.cmd).find((c) => c.type === 'point-on-segment') as { id: string; a: string; b: string };
    expect(onSeg.id).toBe('E');
    expect([onSeg.a, onSeg.b]).toEqual(['A', 'D']); // its carrier letters are untouched
    expect(s().facts.find((f) => f.cmd.type === 'point-on-segment')?.utterance).toBe('point E on AD');

    // The point exists under its new name at the SAME place — geometry is unchanged.
    expect(derived().positions.get('E')).toEqual(before);
    expect(derived().positions.has('G')).toBe(false);
  });

  it('rewrites a shape vertex everywhere it appears', () => {
    s().execute(SQUARE, 'square ABCD');
    s().rename('D', 'X');
    const sq = s().facts[0].cmd as Extract<Command, { type: 'square' }>;
    expect(sq.ids).toEqual(['A', 'B', 'C', 'X']);
  });

  it('refuses to relabel onto an existing point (no silent merge)', () => {
    s().execute(SQUARE, 'square ABCD');
    const res = s().rename('A', 'B');
    expect(res).toEqual({ ok: false, reason: 'target-taken' });
    expect((s().facts[0].cmd as Extract<Command, { type: 'square' }>).ids).toEqual(['A', 'B', 'C', 'D']); // unchanged
  });

  it('reports a missing source and a no-op', () => {
    s().execute(SQUARE, 'square ABCD');
    expect(s().rename('Z', 'Q')).toEqual({ ok: false, reason: 'no-source' });
    expect(s().rename('A', 'A')).toEqual({ ok: false, reason: 'same' });
  });

  it('leaves a measure expression (its variable/text) untouched while relabelling its points', () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute({ type: 'measure-length', a: 'A', b: 'B', expr: { var: 'x', coef: 3, text: '3x' } } as never, 'AB = 3x');
    s().rename('A', 'P');
    const m = s().facts.map((f) => f.cmd).find((c) => c.type === 'measure-length') as { a: string; b: string; expr: { var: string; text: string } };
    expect([m.a, m.b]).toEqual(['P', 'B']);
    expect(m.expr).toEqual({ var: 'x', coef: 3, text: '3x' }); // the variable 'x' was NOT renamed
  });

  it('is undoable as a single step', () => {
    s().execute(SQUARE, 'square ABCD');
    s().rename('D', 'X');
    useGeoStore.temporal.getState().undo();
    expect((s().facts[0].cmd as Extract<Command, { type: 'square' }>).ids).toEqual(['A', 'B', 'C', 'D']);
  });
});
