/**
 * #39 — the computed value of a size/ratio given, measured on the current drawing. Read-only over
 * `polygonArea`/`polygonPerimeter`/`dist`. The ratio is the seed-invariant verdict; absolute measures are
 * per-drawing context.
 */
import { describe, it, expect } from 'vitest';
import { readoutForCommand, readoutForGroup } from '../computedValue';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { Id, Vec } from '@/engine';
import { nanoid } from 'nanoid';

const pos = (m: Record<string, [number, number]>): Map<Id, Vec> =>
  new Map(Object.entries(m).map(([k, [x, y]]) => [k, { x, y }]));

describe('readoutForCommand — measure a given off the coordinates (#39)', () => {
  it('a distance given reads the measured length + a ✓ when it matches', () => {
    const r = readoutForCommand({ type: 'set-distance', a: 'A', b: 'B', value: 5 }, pos({ A: [0, 0], B: [5, 0] }))!;
    expect(r.verdict).toMatchObject({ label: '|AB|', value: '5', ok: true });
    const bad = readoutForCommand({ type: 'set-distance', a: 'A', b: 'B', value: 9 }, pos({ A: [0, 0], B: [5, 0] }))!;
    expect(bad.verdict.ok).toBe(false);
  });

  it('an absolute area reads the shoelace area (the solver pins the world scale to it)', () => {
    const r = readoutForCommand({ type: 'set-area', ids: ['A', 'B', 'C'], value: 6 }, pos({ A: [0, 0], B: [4, 0], C: [0, 3] }))!;
    expect(r.verdict).toMatchObject({ label: 'S(ABC)', value: '6', ok: true }); // ½·4·3 = 6
  });

  it('an AREA RATIO reports the ratio as the verdict and the two areas as context', () => {
    // triangle ABC area 6, triangle ABD area 3 → ratio 2
    const p = pos({ A: [0, 0], B: [4, 0], C: [0, 3], D: [0, 1.5] });
    const r = readoutForCommand({ type: 'set-area-ratio', ids1: ['A', 'B', 'C'], ids2: ['A', 'B', 'D'], k: 2 }, p)!;
    expect(r.verdict).toMatchObject({ label: 'S(ABC)/S(ABD)', value: '2', ok: true });
    expect(r.measured.map((m) => m.label)).toEqual(['S(ABC)', 'S(ABD)']);
    expect(r.measured.map((m) => m.value)).toEqual(['6', '3']);
  });

  it('a length ratio reports |ab|/|cd| as the verdict', () => {
    const r = readoutForCommand({ type: 'set-ratio', a: 'A', b: 'B', c: 'C', d: 'D', k: 2 }, pos({ A: [0, 0], B: [6, 0], C: [0, 0], D: [3, 0] }))!;
    expect(r.verdict).toMatchObject({ label: '|AB|/|CD|', value: '2', ok: true });
  });

  it('returns null for a non-measurable command', () => {
    expect(readoutForCommand({ type: 'segment', a: 'A', b: 'B' }, pos({ A: [0, 0], B: [1, 0] }))).toBeNull();
  });
});

describe('readoutForGroup — through the real parse → replay path (#39)', () => {
  const commit = (facts: Fact[], u: string): Fact[] => {
    const r = parse(u, {} as never);
    if (!('ok' in r) || !r.ok) throw new Error(`parse: ${u}`);
    return [...facts, ...r.commands.map((cmd) => ({ id: nanoid(), cmd, enabled: true, utterance: u }) as Fact)];
  };

  it('a stated AB=6 on a triangle reads back |AB| = 6 ✓', () => {
    let facts: Fact[] = [];
    facts = commit(facts, 'triangle ABC');
    facts = commit(facts, 'AB = 6');
    const fig = replay(facts, 0);
    const groupCmds = facts.filter((f) => f.utterance === 'AB = 6').map((f) => f.cmd);
    const all = facts.filter((f) => f.enabled).map((f) => f.cmd);
    const r = readoutForGroup(groupCmds, all, fig.positions)!;
    expect(r).not.toBeNull();
    expect(r.verdict.label).toBe('|AB|');
    expect(r.verdict.value).toBe('6');
    expect(r.verdict.ok).toBe(true);
  });
});
