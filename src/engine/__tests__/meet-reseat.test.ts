/**
 * ADR-255 — a stated segment-meet re-seats a GENUINELY LOOSE endpoint so the segments actually cross.
 *
 * Class: "AM חותך את CO ב-K" (onSeg) asserts the crossing exists — information about where the free M
 * belongs — but nothing used it: with M defaulted where the segments diverge, the figure built ✓ with K
 * on the continuations, the verifier's amber was easy to miss, and NO sampled config could rescue it
 * (the seed jitter explores only a small neighbourhood of the default — session gaawv4fr). The apply
 * boundary now re-seats a non-pinned, constraint-free endpoint (fewest dependents first) along the ray
 * from its fixed mate through the other segment's midpoint — keeping every circle-side it had (a stated
 * "M מחוץ למעגל" survives, ADR-254) and general position (ADR-253). Constrained endpoints (ADR-166
 * apexes) are untouched — their mechanism is the reflection DOF; a meet with no loose endpoint keeps
 * the amber-flag behaviour.
 */
import { describe, expect, it } from 'vitest';
import { build, checkGivens } from '@/engine';
import type { AnyCommand, Vec } from '@/engine';

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const paramOn = (s: Vec, e: Vec, x: Vec) => ((x.x - s.x) * (e.x - s.x) + (x.y - s.y) * (e.y - s.y)) / ((e.x - s.x) ** 2 + (e.y - s.y) ** 2);

/** The operator's figure: diameter AB in circle O, C on the circle, M placed where AM cannot cross CO. */
const base = (m: { x: number; y: number }): AnyCommand[] =>
  [
    { type: 'segment', a: 'A', b: 'B' },
    { type: 'midpoint', id: 'O', a: 'A', b: 'B' },
    { type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' },
    { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
    { type: 'free-point', id: 'M', x: m.x, y: m.y, free: true },
    { type: 'segment', a: 'A', b: 'M' },
    { type: 'segment', a: 'C', b: 'O' },
    { type: 'line-line-intersection', id: 'K', a: 'A', b: 'M', c: 'C', d: 'O', onSeg: true },
  ] as AnyCommand[];

describe('segment-meet re-seats a loose endpoint (ADR-255)', () => {
  it('M up-left (the gaawv4fr basin): the meet moves M so K lands WITHIN both segments', () => {
    const { positions } = build(base({ x: -0.63, y: 2.87 }));
    const [A, M, C, O, K] = ['A', 'M', 'C', 'O', 'K'].map((id) => positions.get(id)!);
    expect(paramOn(A, M, K)).toBeGreaterThan(0.02);
    expect(paramOn(A, M, K)).toBeLessThan(0.98);
    expect(paramOn(C, O, K)).toBeGreaterThan(-0.02);
    expect(paramOn(C, O, K)).toBeLessThan(1.02);
    // M kept its circle side: it was OUTSIDE circle O (r = 2.5) and must stay outside (ADR-254 survives).
    expect(d(M, O)).toBeGreaterThan(2.5);
  });

  it('a satisfied meet moves nothing (fires only when the crossing is off a segment)', () => {
    const { positions } = build(base({ x: 6, y: 2 })); // AM genuinely crosses CO from here
    const M = positions.get('M')!;
    expect(M.x).toBeCloseTo(6, 9);
    expect(M.y).toBeCloseTo(2, 9);
  });

  it('mirror slot: the loose endpoint may sit on the OTHER segment operand', () => {
    // Same figure, the meet stated with the segments swapped: CO × AM.
    const cmds = base({ x: -0.63, y: 2.87 });
    cmds[cmds.length - 1] = { type: 'line-line-intersection', id: 'K', a: 'C', b: 'O', c: 'A', d: 'M', onSeg: true } as AnyCommand;
    const { positions } = build(cmds);
    const [A, M, C, O, K] = ['A', 'M', 'C', 'O', 'K'].map((id) => positions.get(id)!);
    expect(paramOn(A, M, K)).toBeGreaterThan(0.02);
    expect(paramOn(A, M, K)).toBeLessThan(0.98);
    expect(paramOn(C, O, K)).toBeGreaterThan(-0.02);
    expect(paramOn(C, O, K)).toBeLessThan(1.02);
  });

  it('a CONSTRAINED endpoint is never re-seated — the amber flag (verifier) still reports the miss', () => {
    // M is claimed by an equality (|AM| = |AB|) — the re-seat must not fight the constraint's own
    // solution; with no loose endpoint the meet keeps today's honest behaviour (figure.v.meetOnSegment).
    const cmds: AnyCommand[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 5, y: 0 },
      { type: 'free-point', id: 'M', x: -2, y: 3, free: true },
      { type: 'segment', a: 'A', b: 'M' },
      { type: 'set-equal', a: 'A', b: 'M', c: 'A', d: 'B' },
      { type: 'free-point', id: 'C', x: 2.5, y: 2.5 },
      { type: 'free-point', id: 'O', x: 2.5, y: 1 },
      { type: 'segment', a: 'C', b: 'O' },
      { type: 'line-line-intersection', id: 'K', a: 'A', b: 'M', c: 'C', d: 'O', onSeg: true },
    ] as AnyCommand[];
    const r = build(cmds);
    const v = checkGivens(cmds as Parameters<typeof checkGivens>[0], r.positions, new Map());
    expect(v.some((x) => x.messageKey === 'figure.v.meetOnSegment')).toBe(true);
  });
});
