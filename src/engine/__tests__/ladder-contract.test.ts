/**
 * Ladder-contract integrity test (docs/LADDER.md, slice S0.2 of docs/24).
 *
 * Locks WHICH stage of the cross-layer solve ladder accepts/refuses canonical figures, via the
 * `StepResult.ladder` trace. This is the observable contract S1.1 (ladder unification) is verified
 * against: a refactor that preserves behavior must keep these traces; a mechanism inserted at the
 * wrong stage shows up here as a changed accept token, not as distant scenario flakiness.
 */
import { describe, expect, it } from 'vitest';
import { applyStep, emptyConstruction } from '../step';
import type { Command, Construction } from '../types';

const run = (cmds: Command[], from: Construction = emptyConstruction()) => {
  let cur = from;
  let last: ReturnType<typeof applyStep> | null = null;
  for (const cmd of cmds) {
    last = applyStep(cur, cmd);
    cur = last.construction;
  }
  return last!;
};

describe('ladder contract (docs/LADDER.md)', () => {
  it('a plain shape from empty accepts at main:primary', () => {
    const r = run([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    expect(r.ok).toBe(true);
    expect(r.ladder).toEqual(['main:primary']);
  });

  it('a structurally degenerate constraint refuses at the pre-gate', () => {
    const r = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'set-parallel', a: 'B', b: 'B', c: 'A', d: 'C' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.ladder).toEqual(['pre:degenerate']);
  });

  it('an M1 restatement of an existing on-segment point accepts on the m1 branch', () => {
    const r = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'point-on-segment', id: 'D', a: 'B', b: 'C', t: 0.3 },
      { type: 'midpoint', id: 'D', a: 'B', b: 'C' }, // D exists → constraint, not redefinition
    ]);
    expect(r.ok).toBe(true);
    expect(r.ladder?.[0]).toBe('m1:constraint');
    expect(r.ladder?.[r.ladder.length - 1]).toMatch(/^m1:(primary|settle|recruit)$/);
  });

  it('a constraint the eager carrier pick cannot satisfy accepts via the recruiter (ADR-103 figure; the S3.2 component tier sits BEHIND the rungs — stability measurement 2026-07-25)', () => {
    const r = run([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
      { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
      { type: 'set-distance', a: 'C', b: 'D', value: 36 }, // radii alone cap |CD| ≈ 8 → must recruit the centres
    ] as Command[]);
    expect(r.ok).toBe(true);
    expect(r.ladder?.[r.ladder.length - 1]).toBe('main:recruit');
    expect(r.ladder?.some((t) => t.startsWith('recruit:'))).toBe(true);
  });

  it('a genuine redefinition refuses at m1:conflict-refuse', () => {
    const r = run([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'free-point', id: 'C', x: 1, y: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already defined/i);
    expect(r.ladder).toEqual(['m1:conflict-refuse']);
  });

  it('a restatement that FORCES a coincidence is allowed (ADR-123) and traces the m1 ladder', () => {
    const r = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'M', a: 'A', b: 'C' }, // mid(AB)=mid(AC) ⇔ B≡C — a forced coincidence, allowed with a notice
    ]);
    expect(r.ok).toBe(true);
    expect(r.ladder?.[0]).toBe('m1:constraint');
    expect(r.ladder?.[r.ladder.length - 1]).toMatch(/^m1:(primary|settle|recruit)$/);
  });

  it('a contradicted absolute given walks the main failure ladder and refuses with blame', () => {
    const r = run([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'set-distance', a: 'A', b: 'B', value: 5 },
      { type: 'set-distance', a: 'A', b: 'B', value: 7 }, // contradicts the stated 5
    ]);
    expect(r.ok).toBe(false);
    expect(r.ladder?.[r.ladder.length - 1]).toBe('main:refuse');
  });

  it('every applyStep result carries a ladder trace', () => {
    const ok = run([{ type: 'triangle', ids: ['A', 'B', 'C'] }]);
    expect(ok.ladder).toBeDefined();
    expect(ok.ladder!.length).toBeGreaterThan(0);
  });
});
