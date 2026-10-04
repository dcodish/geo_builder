/**
 * #1411 ([ADR-577](../../../docs/06-decisions.md#adr-577)) — the fold's ADR-104 retry covers CREATING facts,
 * and a FAILED fact claims only the points it DEFINES. Pure `replay` over the stored fact shapes the
 * edited list reaches (a row parsed when its operands existed carries no segment that would create them).
 */
import { describe, expect, it } from 'vitest';
import { introducedDefinedPointIds, replay, type Fact } from '@/replay/core';
import type { AnyCommand, Command } from '@/engine';

let n = 0;
const fact = (cmd: AnyCommand, group?: string, enabled = true): Fact => {
  const id = `f${n++}`;
  return { id, group: group ?? id, enabled, cmd } as Fact;
};
const statuses = (facts: Fact[]) => { const d = replay(facts, 0); return facts.map((f) => d.status[f.id]); };

describe('#1411 — introducedDefinedPointIds: the points a statement DEFINES (the failed-fact claim rule)', () => {
  const cases: [Command, string[]][] = [
    [{ type: 'triangle', ids: ['A', 'B', 'C'] }, []],
    [{ type: 'segment', a: 'A', b: 'M' }, []],
    [{ type: 'midpoint', id: 'M', a: 'A', b: 'B' }, ['M']],
    [{ type: 'foot', id: 'D', from: 'A', a: 'B', b: 'C' }, ['D']],
    [{ type: 'square', ids: ['A', 'B', 'C', 'D'] }, ['C', 'D']],
  ];
  for (const [cmd, want] of cases) {
    it(`${cmd.type} → [${want.join(', ')}]`, () => {
      expect(introducedDefinedPointIds(cmd).sort()).toEqual(want);
    });
  }
});

describe('#1411 — the deferral retries a creating fact whose operands a LATER fact introduces', () => {
  it('[midpoint M(A,B), triangle ABC] — the midpoint lands after the triangle', () => {
    const facts = [fact({ type: 'midpoint', id: 'M', a: 'A', b: 'B' }), fact({ type: 'triangle', ids: ['A', 'B', 'C'] })];
    expect(statuses(facts)).toEqual(['ok', 'ok']);
    const p = replay(facts, 0).positions;
    expect(p.get('M')!.x).toBeCloseTo((p.get('A')!.x + p.get('B')!.x) / 2, 9);
  });

  it('[median group (midpoint M(B,C) + segment AM), triangle ABC] — a red segment does not claim its free endpoint A', () => {
    const facts = [
      fact({ type: 'midpoint', id: 'M', a: 'B', b: 'C' }, 'median'),
      fact({ type: 'segment', a: 'A', b: 'M' }, 'median'),
      fact({ type: 'triangle', ids: ['A', 'B', 'C'] }),
    ];
    expect(statuses(facts)).toEqual(['ok', 'ok', 'ok']);
  });

  it('a chain settles in list order: [M = mid AB, N = mid AM, triangle ABC]', () => {
    const facts = [
      fact({ type: 'midpoint', id: 'M', a: 'A', b: 'B' }),
      fact({ type: 'midpoint', id: 'N', a: 'A', b: 'M' }),
      fact({ type: 'triangle', ids: ['A', 'B', 'C'] }),
    ];
    expect(statuses(facts)).toEqual(['ok', 'ok', 'ok']);
  });

  it('the cascade guard holds: a segment on circle points whose circle is MUTED never lands by minting free endpoints', () => {
    const facts = [
      fact({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, undefined, false),
      fact({ type: 'point-on-circle', id: 'A', circle: 'circle-O' }),
      fact({ type: 'point-on-circle', id: 'B', circle: 'circle-O' }),
      fact({ type: 'segment', a: 'A', b: 'B' }),
    ];
    const st = statuses(facts);
    expect(st[3]).toMatch(/no longer available/);
    expect(replay(facts, 0).construction.objects.some((o) => o.kind === 'segment')).toBe(false);
  });

  it('a DISABLED statement still claims its free points — a later statement re-introducing them cascades (ADR-015)', () => {
    const facts = [
      fact({ type: 'triangle', ids: ['A', 'B', 'C'] }, undefined, false),
      fact({ type: 'segment', a: 'A', b: 'B' }),
    ];
    expect(statuses(facts)[1]).toMatch(/no longer available/);
  });

  it('a midpoint of letters NOTHING introduces stays red, names them, and is never retried (#403 futility)', () => {
    const facts = [fact({ type: 'midpoint', id: 'M', a: 'A', b: 'B' }), fact({ type: 'segment', a: 'P', b: 'Q' })];
    expect(statuses(facts)).toEqual(['undefined point: A, B', 'ok']);
  });
});
