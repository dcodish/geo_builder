/**
 * #2037 + #2049 ([ADR-663](../../docs/06-decisions.md#adr-663)) — an arc names its circle and its endpoints, and the
 * endpoints are put ON that circle.
 *
 * Measured on b0ef3240 through `decideDeterministic2D` + the gate + `replay`: on a fresh figure «קשת AB = 40 במעגל O»
 * (and the two other arc catalog lines) was refused «∠AOB = 40° references an unknown point» — the readers lowered to
 * a central angle and created nothing; after «מעגל» the message named «∠A@ctr-OB». With A and B already drawn
 * («מעגל O · AB = 7») the line built green with OA = 2.45, OB = 8.70: the membership the arc states was dropped.
 * Operator rulings 2026-10-13: #2037 *"the line places A and B on the circle and builds"*; #2049 *"put A and B on
 * circle O and build"* (an impossible case reuses the existing conflict refusal).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { driveThroughGate } from './submit-gate';

type Fig = ReturnType<typeof replay>;

async function decide(prefix: string[], line: string, locale: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, locale);
}

/** Drive the sequence, assert every row green and the verifier clean, and return the figure. */
function build(lines: string[]): Fig {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, lines.join(' · ')).toEqual([]);
  const fig = replay(facts, useGeoStore.getState().seed);
  expect(fig.lastError, 'builds').toBeNull();
  expect(fig.violations, 'the verifier is clean').toEqual([]);
  for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
  return fig;
}

/** Every listed point lies on the circle (its radius at this seed). */
function onCircle(fig: Fig, circle: string, ids: string[]) {
  const c = fig.circles.get(circle)!;
  expect(c, circle).toBeDefined();
  const ctr = c.center as unknown as { x: number; y: number };
  for (const id of ids) {
    const p = fig.positions.get(id)!;
    expect(p, id).toBeDefined();
    expect(Math.abs(Math.hypot(p.x - ctr.x, p.y - ctr.y) - c.r) / c.r, `${id} on ${circle}`).toBeLessThan(1e-6);
  }
}

const memberships = (cs: readonly AnyCommand[]) => cs.filter((c) => c.type === 'point-on-circle').map((c) => (c as { id: string }).id);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2037 — a new arc endpoint is created on the circle the arc names', () => {
  it.each([
    ['קשת AB = 40 במעגל O', ['A', 'B']],
    ['arc AB = 40 in circle O', ['A', 'B']],
    ['קשת DE = 2 קשת CE במעגל O', ['D', 'E', 'C']],
    ['קשת AC + קשת BE = קשת AD + קשת BC במעגל O', ['A', 'C', 'B', 'E', 'D']],
  ])('fresh figure: «%s» builds with every endpoint on circle O', async (line, ends) => {
    const v = await decide([], line, /[א-ת]/.test(line) ? 'he' : 'en');
    expect(v.kind).toBe('commit');
    expect(v.kind === 'commit' && memberships(v.commands).sort()).toEqual([...ends].sort());
    expect(llmParseMock).not.toHaveBeenCalled();
    onCircle(build([line]), 'circle-O', ends);
  });

  it('the measure holds: ∠AOB = 40° on the fresh figure', () => {
    const fig = build(['קשת AB = 40 במעגל O']);
    const [o, a, b] = ['O', 'A', 'B'].map((id) => fig.positions.get(id)!);
    const ang = Math.abs(Math.atan2(a.y - o.y, a.x - o.x) - Math.atan2(b.y - o.y, b.x - o.x)) * (180 / Math.PI);
    expect(Math.min(ang, 360 - ang)).toBeCloseTo(40, 6);
  });

  it.each([['קשת AB = 40'], ['⌢{AB} = 40'], ['קשת AB = 40 במעגל O']])('after «מעגל O»: «%s» builds with A and B on it', (line) => {
    onCircle(build(['מעגל O', line]), 'circle-O', ['A', 'B']);
  });

  it('an unnamed circle: «מעגל» · «קשת AB = 40» builds, and nothing says «@ctr»', async () => {
    const v = await decide(['מעגל'], 'קשת AB = 40');
    expect(v.kind).toBe('commit');
    expect(JSON.stringify(v)).not.toMatch(/references an unknown point/);
    const fig = build(['מעגל', 'קשת AB = 40']);
    onCircle(fig, [...fig.circles.keys()][0], ['A', 'B']);
  });

  it('only the endpoints the circle lacks are created: «A על מעגל O» first → only B', async () => {
    const v = await decide(['מעגל O', 'A על מעגל O'], 'קשת AB = 40 במעגל O');
    expect(v.kind === 'commit' && memberships(v.commands)).toEqual(['B']);
  });

  it('a chained arc creates the shared endpoint once', async () => {
    const v = await decide(['מעגל O', 'קשת AB = 40 במעגל O'], 'קשת BC = 60 במעגל O');
    expect(v.kind === 'commit' && memberships(v.commands)).toEqual(['C']);
    onCircle(build(['מעגל O', 'קשת AB = 40 במעגל O', 'קשת BC = 60 במעגל O']), 'circle-O', ['A', 'B', 'C']);
  });

  describe('unchanged', () => {
    it('endpoints already on the circle: no membership is added', async () => {
      const v = await decide(['מעגל O', 'A על מעגל O', 'B על מעגל O'], 'קשת AB = 40 במעגל O');
      expect(v.kind === 'commit' && v.commands).toEqual([{ type: 'set-angle', vertex: 'O', ray1: 'A', ray2: 'B', value: 40, arcOf: 'circle-O' }]);
    });

    it('two circles and no name: still asks which circle', async () => {
      const v = await decide(['מעגל O', 'מעגל P'], 'קשת AB = 40');
      expect(v.kind).toBe('refuse');
      expect(JSON.stringify(v)).toMatch(/ambiguousCircleRef/);
    });

    it('«M אמצע הקשת BC במעגל O» is lowered as before', async () => {
      const v = await decide([], 'M אמצע הקשת BC במעגל O');
      expect(v.kind === 'commit' && v.commands.map((c) => c.type)).toEqual(['circle', 'arc-midpoint']);
    });
  });
});

describe('#2049 — an existing arc endpoint off the circle is put on it', () => {
  it('the ruled case: «מעגל O · AB = 7 · קשת AB = 40 במעגל O» puts A and B on circle O, as the explicit spelling does', () => {
    const fig = build(['מעגל O', 'AB = 7', 'קשת AB = 40 במעגל O']);
    onCircle(fig, 'circle-O', ['A', 'B']);
    const twin = build(['מעגל O', 'AB = 7', 'A על המעגל', 'B על המעגל', '∠AOB = 40']);
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(twin.circles.get('circle-O')!.r, 6);
  });

  it.each([
    [['משולש ABC', 'מעגל O'], 'קשת AB = 40 במעגל O', ['A', 'B']],
    [['נקודה D', 'נקודה E', 'נקודה C', 'נקודה O'], 'קשת DE = 2 קשת CE במעגל O', ['D', 'E', 'C']],
    [['נקודה A', 'נקודה C', 'נקודה B', 'נקודה E', 'נקודה D', 'נקודה O'], 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O', ['A', 'C', 'B', 'E', 'D']],
  ])('%j · «%s» → every endpoint on circle O', (prefix, line, ends) => {
    onCircle(build([...prefix, line]), 'circle-O', ends);
  });

  it('impossible: the chord cannot reach — refused with the existing contradiction message, as the explicit spelling is', async () => {
    const v = await decide(['מעגל O ברדיוס 3', 'AB = 7'], 'קשת AB = 40 במעגל O');
    const twin = await decide(['מעגל O ברדיוס 3', 'AB = 7', 'A על מעגל O'], 'B על מעגל O');
    expect(v.kind).toBe('refuse');
    expect(twin.kind).toBe('refuse');
    expect(v.kind === 'refuse' && v.note).toEqual(twin.kind === 'refuse' && twin.note);
  });
});
