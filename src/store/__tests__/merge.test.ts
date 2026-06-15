/**
 * Merge (fold) two existing points into one (e.g. F → E). Distinct from a rename:
 * a rename refuses to relabel onto a taken letter (no silent merge — ADR-035), while
 * a merge is the EXPLICIT fold — the target survives, the source's own definition is
 * dropped, every reference to the source is rewritten to the target, and any fact that
 * collapsed (a `segment EF` → `EE`) is removed. It is a store operation, undoable, with
 * the `parseMerge` boundary recognising the He/En phrasings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Command } from '@/engine';
import { parseMerge } from '@/parser';
import { replay, useGeoStore } from '../geoStore';

const SQUARE: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
const E_ON_AC: Command = { type: 'point-on-segment', id: 'E', a: 'A', b: 'C', t: 0.45 };
const F_INTERSECT: Command = { type: 'line-line-intersection', id: 'F', a: 'A', b: 'C', c: 'B', d: 'D' };

const s = () => useGeoStore.getState();
const derived = () => replay(s().facts);

beforeEach(() => {
  s().clear();
});

describe('parseMerge — the fold phrasings', () => {
  it('reads English forms', () => {
    expect(parseMerge('merge F into E')).toEqual({ from: 'F', to: 'E' });
    expect(parseMerge('fold f with e')).toEqual({ from: 'F', to: 'E' });
    expect(parseMerge('combine F and E')).toEqual({ from: 'F', to: 'E' });
    expect(parseMerge('merge F E')).toEqual({ from: 'F', to: 'E' });
  });
  it('reads Hebrew forms', () => {
    expect(parseMerge('מזג F ל-E')).toEqual({ from: 'F', to: 'E' });
    expect(parseMerge('מזג F עם E')).toEqual({ from: 'F', to: 'E' });
    expect(parseMerge('מזג את F ו-E')).toEqual({ from: 'F', to: 'E' });
    expect(parseMerge('אחד F ל-E')).toEqual({ from: 'F', to: 'E' });
  });
  it('is not a merge → null (so rename/parser/LLM handle it)', () => {
    expect(parseMerge('rename E to G')).toBeNull(); // a relabel, not a fold
    expect(parseMerge('square ABCD')).toBeNull();
    expect(parseMerge('merge F into F')).toBeNull(); // no-op
  });
});

describe('store.merge — fold one point into another', () => {
  it("drops the source's definition, rewrites its references, and drops collapsed facts", () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute(E_ON_AC, 'point E on AC at 45%');
    s().execute(F_INTERSECT, 'F = AC ∩ BD');
    s().execute({ type: 'segment', a: 'E', b: 'F' }, 'segment EF'); // will collapse to EE
    s().execute({ type: 'segment', a: 'B', b: 'F' }, 'segment BF'); // becomes BE

    const res = s().merge('F', 'E');
    expect(res).toEqual({ ok: true });

    const cmds = s().facts.map((f) => f.cmd);
    // F's own definition (the intersection) is gone; F appears nowhere anymore.
    expect(cmds.some((c) => c.type === 'line-line-intersection')).toBe(false);
    expect(s().facts.flatMap((f) => Object.values(f.cmd)).includes('F')).toBe(false);
    // The collapsed "segment EF" → "EE" was dropped; "segment BF" → "segment BE" survives.
    const segs = cmds.filter((c) => c.type === 'segment') as Array<{ a: string; b: string }>;
    expect(segs.some((g) => g.a === 'E' && g.b === 'E')).toBe(false);
    expect(segs.some((g) => (g.a === 'B' && g.b === 'E') || (g.a === 'E' && g.b === 'B'))).toBe(true);
    // E still exists and the figure replays cleanly.
    expect(derived().lastError).toBeNull();
    expect(derived().positions.has('E')).toBe(true);
    expect(derived().positions.has('F')).toBe(false);
  });

  it('refuses to fold a SHAPE vertex (no standalone definition to drop)', () => {
    s().execute(SQUARE, 'square ABCD');
    const res = s().merge('D', 'A');
    expect(res).toEqual({ ok: false, reason: 'source-in-shape' });
    expect((s().facts[0].cmd as Extract<Command, { type: 'square' }>).ids).toEqual(['A', 'B', 'C', 'D']); // unchanged
  });

  it('refuses when the source or target is missing, or they are the same', () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute(E_ON_AC, 'point E on AC');
    expect(s().merge('Z', 'A')).toEqual({ ok: false, reason: 'no-source' });
    expect(s().merge('E', 'Z')).toEqual({ ok: false, reason: 'no-target' }); // merging into a NEW letter is a rename
    expect(s().merge('E', 'E')).toEqual({ ok: false, reason: 'same' });
  });

  it('is undoable as a single step', () => {
    s().execute(SQUARE, 'square ABCD');
    s().execute(E_ON_AC, 'point E on AC');
    s().execute(F_INTERSECT, 'F = AC ∩ BD');
    const factsBefore = s().facts.length;
    s().merge('F', 'E');
    useGeoStore.temporal.getState().undo();
    expect(s().facts.length).toBe(factsBefore);
    expect(s().facts.some((f) => f.cmd.type === 'line-line-intersection')).toBe(true);
  });
});
