/**
 * #2590 ([ADR-783](../../../docs/06-decisions.md#adr-783)) — a length stated in a radius letter whose value is known.
 *
 * «מעגל O ברדיוס r · קטע OR · OR=r · r = 5» drew at the canonical seed and left every other configuration empty. The
 * letter system puts the value on the circle, so the radius is pinned when «OR=r» applies, and the hidden witness
 * took a directive it could never act on: its angle cannot change |OR| − k·|O·witness|. The constraint read as owned,
 * ADR-399's probe never ran, and the figure held only where the default drawing satisfied it by coincidence.
 *
 * Measured at 28dac0c3 through the path below: every row of PINNED but the two without a segment was 1/24, and
 * the «r = 3» rows were green with four owners for one equation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => null }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { residualRefs } from '../solve';
import type { Constraint, Id } from '../types';

const st = () => useGeoStore.getState();
const CIRCLE = 'מעגל O ברדיוס r';
const SEEDS = Array.from({ length: 24 }, (_, s) => s);

async function run(...lines: string[]) {
  st().clear();
  for (const l of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, l, /[א-ת]/.test(l) ? 'he' : 'en');
    expect(v.kind, `«${l}»: ${JSON.stringify(v).slice(0, 200)}`).toBe('commit');
    commitVerdict(v, l);
  }
}
const distAt = (a: Id, b: Id, seed: number) => {
  const p = replay(st().facts, seed).positions;
  return Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
};
const green = (seed: number) => {
  const r = replay(st().facts, seed);
  return r.positions.size > 0 && Object.values(r.status).every((s) => s === 'ok') && r.violations.length === 0;
};
const owners = () =>
  replay(st().facts, 0).construction.objects
    .filter((o) => (o as { solve?: { constraint: Constraint } }).solve?.constraint.type === 'length-radius')
    .map((o) => o.id);

beforeEach(() => st().clear());

describe('#2590 — a pinned radius: the length is owned by an endpoint, at every seed', () => {
  const PINNED: [string[], Id, Id, number, Id][] = [
    [[CIRCLE, 'קטע OR', 'OR=r', 'r = 5'], 'O', 'R', 5, 'R'],
    [[CIRCLE, 'קטע OR', 'OR=2r', 'r = 2.5'], 'O', 'R', 5, 'R'],
    [[CIRCLE, 'קטע OR', 'r = 5', 'OR=r'], 'O', 'R', 5, 'R'],
    [[CIRCLE, 'קטע OR', 'OR=r', 'r = 3'], 'O', 'R', 3, 'R'],
    [[CIRCLE, 'OR=r', 'r = 5'], 'O', 'R', 5, 'R'],
    [[CIRCLE, 'קטע AB', 'AB=r', 'r = 5'], 'A', 'B', 5, 'B'],
    [[CIRCLE, 'קטע AB', 'AB=2r', 'r = 2.5'], 'A', 'B', 5, 'B'],
    [[CIRCLE, 'קטע AB', 'r = 5', 'AB=r'], 'A', 'B', 5, 'B'],
    [[CIRCLE, 'קטע AB', 'AB=r', 'r = 3'], 'A', 'B', 3, 'B'],
    [[CIRCLE, 'קטע AB', 'AB=r+1', 'r = 4'], 'A', 'B', 5, 'B'],
    [[CIRCLE, 'AB=r', 'r = 5'], 'A', 'B', 5, 'B'],
    [['משולש ABC', CIRCLE, 'AB=r', 'r = 5'], 'A', 'B', 5, 'B'],
    [['ריבוע ABCD', CIRCLE, 'AB=r', 'r = 5'], 'A', 'B', 5, 'B'],
    [[CIRCLE, 'נקודה P על המעגל', 'קטע AB', 'AB=r', 'r = 5'], 'A', 'B', 5, 'B'],
    [[CIRCLE, 'נקודה P על המעגל', 'קטע PQ', 'PQ=r', 'r = 5'], 'P', 'Q', 5, 'P'],
    [['circle O with radius r', 'segment OR', 'OR=r', 'r = 5'], 'O', 'R', 5, 'R'],
    [['circle O with radius r', 'segment AB', 'AB=r', 'r = 5'], 'A', 'B', 5, 'B'],
  ];
  it.each(PINNED)('%j', async (lines, a, b, len, owner) => {
    await run(...lines);
    for (const s of SEEDS) {
      expect(green(s), `seed ${s}`).toBe(true);
      expect(distAt(a, b, s), `seed ${s}`).toBeCloseTo(len, 6);
    }
    expect(owners()).toEqual([owner]);
  });

  it('two lengths against one stated radius get one endpoint each', async () => {
    await run(CIRCLE, 'קטע AB', 'קטע CD', 'AB=r', 'CD=2r', 'r = 5');
    for (const s of SEEDS) {
      expect(green(s), `seed ${s}`).toBe(true);
      expect(distAt('A', 'B', s)).toBeCloseTo(5, 4);
      expect(distAt('C', 'D', s)).toBeCloseTo(10, 4);
    }
    expect(owners()).toEqual(['B', 'D']);
  });

  it('the numeric twin has the same owner', async () => {
    await run('מעגל O ברדיוס 5', 'קטע AB', 'AB=5');
    const driven = replay(st().facts, 0).construction.objects.filter((o) => (o as { solve?: unknown }).solve).map((o) => o.id);
    expect(driven).toEqual(['B']);
  });

  it('the length-symbol sibling goes by `distance`, not this path, and stays green', async () => {
    await run('קטע AB', 'AB = k', 'k = 5');
    for (const s of SEEDS) expect(green(s), `seed ${s}`).toBe(true);
    expect(owners()).toEqual([]);
  });
});

describe('#2590 — a free radius still couples', () => {
  it.each([
    [[CIRCLE, 'קטע AB', 'AB=r'], 'A', 'B'],
    [[CIRCLE, 'קטע OR', 'OR=r'], 'O', 'R'],
  ])('%j: the radius owns the length and moves', async (lines, a, b) => {
    await run(...lines);
    for (const s of SEEDS) expect(green(s), `seed ${s}`).toBe(true);
    expect(owners()).toContain('circle-O');
    expect(new Set(SEEDS.map((s) => distAt(a, b, s).toFixed(3))).size).toBeGreaterThan(1);
  });
});

describe('#2590 — stability: the pin does not move the figure', () => {
  it.each([
    [[CIRCLE, 'קטע OR', 'OR=r'], 'r = 5'],
    [[CIRCLE, 'קטע AB', 'AB=r'], 'r = 5'],
  ])('%j + «%s» keeps seed 0', async (lines, pin) => {
    await run(...lines);
    const before = replay(st().facts, 0).positions;
    await run(...lines, pin);
    const after = replay(st().facts, 0).positions;
    for (const [id, p] of before) {
      if (id.startsWith('~')) continue;
      expect(after.get(id)?.x, id).toBeCloseTo(p.x, 6);
      expect(after.get(id)?.y, id).toBeCloseTo(p.y, 6);
    }
  });
});

describe('#2590 — residualRefs: what can move the residual, not what it reads', () => {
  const con: Constraint = { type: 'length-radius', a: 'A', b: 'B', circle: 'c', center: 'O', witness: 'W', k: 1 };
  const circle = (via: string) => [{ id: 'c', kind: 'circle', radius: { via } }];

  it('a stated radius is a constant: only the endpoints', () => {
    expect(residualRefs(con, circle('length'))).toEqual(['A', 'B']);
  });
  it('a free radius moves it through its witness', () => {
    expect(residualRefs(con, circle('free'))).toEqual(['A', 'B', 'O', 'W']);
  });
  it('a witness that IS an endpoint stays, because it is one', () => {
    expect(residualRefs({ ...con, b: 'W' }, circle('length'))).toEqual(['A', 'W']);
  });
  it('every other kind answers constraintRefs', () => {
    expect(residualRefs({ type: 'distance', a: 'A', b: 'B', value: 3 }, [])).toEqual(['A', 'B']);
  });
});
