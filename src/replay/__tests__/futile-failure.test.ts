/**
 * #403 (ADR-407): a failed fact referencing a POINT label that NO fact introduces is FUTILE — no
 * deferral retry and no HOIST permutation can ever make it succeed, so the failure machinery must
 * not run on it. Operator report (dev session `2je0eg0n`): «ישר GFH» with H undefined took ~30 s
 * (measured 29.8 s unbudgeted) to say «references an unknown point». The lock is structural first
 * (no HOIST re-fold ⇒ foldStats.computes rises by exactly 1) with a generous wall bound as the
 * belt; the NOT-futile guard proves the ADR-104 deferral still works when the point IS introducible.
 */
import { describe, expect, it } from 'vitest';
import { foldStats, replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import type { AnyCommand } from '@/engine';

const F = (id: string, cmd: AnyCommand, enabled = true): Fact => ({ id, cmd, enabled, group: id });

/** The operator's session, through the real parse path (fresh fact ids per call — no fold sharing). */
function trapezoidFigure(tag: string): Fact[] {
  const steps = ['טרפז ABCD', 'EF קטע אמצעים', 'DB', 'AC', 'G על המשך AB'];
  let facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `${tag}g${gi}.${facts.length}`, utterance: u, group: `${tag}g${gi}`, cmd, enabled: true });
  }
  return facts;
}

describe('futile failures refuse instantly (#403, ADR-407)', () => {
  it('the exact operator sequence: «ישר GFH» with H undefined — honest error, ONE fold, no HOIST grind', () => {
    const facts = [...trapezoidFigure('a'), F('a-gfh', { type: 'set-line', points: ['G', 'F', 'H'] } as AnyCommand)];
    const before = foldStats.computes;
    const t0 = performance.now();
    const d = replay(facts, 0);
    const ms = performance.now() - t0;
    expect(d.lastError, 'the honest error stands').toMatch(/unknown point/);
    expect(d.pending).toBe(false);
    expect(foldStats.computes - before, 'no HOIST re-fold ran on the futile fact').toBe(1);
    expect(ms, 'the refusal is cheap (was ~30 s; now the pre-solve check catches it)').toBeLessThan(3_000);
  });

  it('a deleted-step orphan (the defining fact disabled) is equally futile', () => {
    const facts = [
      F('b1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
      F('b2', { type: 'free-point', id: 'B', x: 8, y: 0, free: true } as AnyCommand),
      F('b3', { type: 'free-point', id: 'C', x: 4, y: 5, free: true } as AnyCommand, false), // disabled — removed
      F('b4', { type: 'set-line', points: ['A', 'B', 'C'] } as AnyCommand),
    ];
    const before = foldStats.computes;
    const d = replay(facts, 0);
    expect(d.lastError).toMatch(/unknown point|not defined|references/);
    expect(foldStats.computes - before).toBe(1);
  });

  it('NOT futile: a constraint typed before its defining fact still defers and resolves (ADR-104 intact)', () => {
    // set-distance references C before C exists — C IS introduced later, so deferral must fix it.
    const facts = [
      F('c1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
      F('c2', { type: 'set-distance', a: 'A', b: 'C', value: 5 } as AnyCommand),
      F('c3', { type: 'free-point', id: 'C', x: 3, y: 1, free: true } as AnyCommand),
    ];
    const d = replay(facts, 0);
    expect(d.lastError, 'the deferral retry landed the early constraint').toBeNull();
    const [A, C] = [d.positions.get('A')!, d.positions.get('C')!];
    expect(Math.hypot(C.x - A.x, C.y - A.y)).toBeCloseTo(5, 4);
  });
});
