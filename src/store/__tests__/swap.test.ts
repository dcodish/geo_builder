/**
 * Swap two existing labels (A ↔ B) and the rename utterance-relabel fix (ADR-122).
 *
 * Operator report (2026-06-25): on the chord figure (diameter AB + parallel chords CD, AF) the
 * student wanted C and D on opposite sides. "Show another configuration" can't do it (swapping which
 * endpoint is C vs D is a RELABELING, not a different shape), and renaming C→D failed ("target taken").
 * The workaround (rename via a temp label) then hit a corruption bug: the utterance relabel did a
 * SUBSTRING replace, turning "CC1"→"DD1". This suite locks the new `swap` op + the token-aware fix.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replay, useGeoStore } from '../geoStore';
import type { AnyCommand } from '@/engine';

const s = () => useGeoStore.getState();
const fig = () => replay(s().facts, s().seed);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

// The operator's figure: circle O, diameter AB, parallel chords CD and AF.
const CHORD_FIG: AnyCommand[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
  { type: 'diameter', id1: 'A', id2: 'B', circle: 'circle-O' },
  { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
  { type: 'point-on-circle', id: 'D', circle: 'circle-O' },
  { type: 'point-on-circle', id: 'F', circle: 'circle-O' },
  { type: 'segment', a: 'C', b: 'D' },
  { type: 'segment', a: 'A', b: 'F' },
  { type: 'set-parallel', a: 'C', b: 'D', c: 'A', d: 'F' },
];

beforeEach(() => s().clear());

describe('swap — exchange two labels', () => {
  it('swap C ↔ D makes C and D change sides (the operator goal)', () => {
    CHORD_FIG.forEach((c) => s().execute(c, 'chord figure', 'g'));
    const before = fig().positions;
    const Cb = before.get('C')!;
    const Db = before.get('D')!;
    expect(dist(Cb, Db)).toBeGreaterThan(0.5); // they're genuinely on different spots

    expect(s().swap('C', 'D')).toEqual({ ok: true });

    const after = fig().positions;
    expect(dist(after.get('C')!, Db), 'C is now where D was').toBeLessThan(1e-6);
    expect(dist(after.get('D')!, Cb), 'D is now where C was').toBeLessThan(1e-6);
    // figure still valid (every step applied cleanly)
    for (const st of Object.values(fig().status)) expect(st).toBe('ok');
  });

  it('swap is undoable as one step', () => {
    CHORD_FIG.forEach((c) => s().execute(c, 'chord figure', 'g'));
    const Cb = fig().positions.get('C')!;
    s().swap('C', 'D');
    useGeoStore.temporal.getState().undo();
    expect(dist(fig().positions.get('C')!, Cb), 'undo restores C').toBeLessThan(1e-6);
  });

  it('swap of a non-existent label is a no-op with a reason', () => {
    CHORD_FIG.forEach((c) => s().execute(c, 'chord figure', 'g'));
    expect(s().swap('C', 'Z')).toEqual({ ok: false, reason: 'no-source' });
    expect(s().swap('C', 'C')).toEqual({ ok: false, reason: 'same' });
  });
});

describe('rename/swap utterance relabel is token-aware (no substring corruption)', () => {
  it('rename C → E does NOT corrupt a "C1" label in another fact', () => {
    s().execute({ type: 'free-point', id: 'C', x: 0, y: 0, free: true }, 'point C');
    s().execute({ type: 'free-point', id: 'C1', x: 3, y: 0, free: true }, 'point C1');
    expect(s().rename('C', 'E')).toEqual({ ok: true });
    const utts = s().facts.map((f) => f.utterance);
    expect(utts, 'standalone C → E; the C inside C1 is untouched').toEqual(['point E', 'point C1']);
  });

  it('swap C ↔ D leaves a "C1"/"D1" label intact', () => {
    s().execute({ type: 'free-point', id: 'C', x: 0, y: 0, free: true }, 'point C');
    s().execute({ type: 'free-point', id: 'D', x: 1, y: 0, free: true }, 'point D');
    s().execute({ type: 'free-point', id: 'C1', x: 2, y: 0, free: true }, 'point C1');
    s().swap('C', 'D');
    const utts = s().facts.map((f) => f.utterance);
    expect(utts).toEqual(['point D', 'point C', 'point C1']); // C↔D swapped; C1 untouched (not "D1")
  });
});
