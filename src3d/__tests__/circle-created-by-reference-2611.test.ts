/**
 * #2611 stage B ([ADR-3D-420](../../docs/06b-decisions-3d.md#adr-3d-420); #2048 ruling A, 2026-10-13: *"A referenced circle
 * that does not exist … is created as a free circle, with the same notice"*) — A LINE THAT REFERS TO A CIRCLE THE FIGURE
 * LACKS CREATES IT.
 *
 * Measured at 28dac0c3 through `useGeo3.submit`: «D על המעגל», «D is on the circle», «D על המעגל O», «רדיוס המעגל הוא 3»
 * and «המעגל במישור π1» on an empty canvas were refused `unknown-circle`. 2-D at the same commit builds the first three
 * and draws no letter for the unnamed centre (`@ctr-O`, FR-RN-8).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';
import { createdNoticeFaults } from '../../shell/__tests__/fixtures/created-notice-rows';
import { createdNoticeTextOf, type CreatedPointsAdapter } from '../../shell/session/createdPoints';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const run = (...lines: string[]) => {
  reset();
  for (const l of lines) st().submit(l);
};
const d = (seed = st().seed) => derive3(st().facts, seed);
const allOk = (seed = st().seed) => Object.values(d(seed).status).every((s) => s === 'ok');
const circle = (seed = st().seed) => d(seed).resolved.circles3[0];
const offCircle = (id: string, seed = st().seed) => {
  const k = circle(seed);
  const p = d(seed).positions.get(id)!;
  const q = { x: p.x - k.center.x, y: p.y - k.center.y, z: p.z - k.center.z };
  const along = q.x * k.normal.x + q.y * k.normal.y + q.z * k.normal.z;
  return Math.abs(Math.hypot(q.x, q.y, q.z) - k.radius) + Math.abs(along);
};
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

beforeEach(reset);

describe('#2611 — «המעגל» on a figure with no circle creates one, with no centre letter', () => {
  for (const line of ['D על המעגל', 'D נמצאת על המעגל', 'D is on the circle']) {
    it(`«${line}» records one green row, D on the circle at every seed, and no invented letter`, () => {
      run(line);
      expect(st().lastError).toBeNull();
      expect(st().facts).toHaveLength(1);
      expect([...d().construction.points.keys()]).toEqual(['D']);
      for (const s of SEEDS) {
        expect(allOk(s)).toBe(true);
        expect(offCircle('D', s)).toBeLessThan(1e-9);
      }
    });
  }

  it('everything unstated is a free DOF: the centre, the radius, the plane and D move across seeds', () => {
    run('D על המעגל');
    const seen = new Set(SEEDS.map((s) => `${circle(s).radius.toFixed(3)}|${circle(s).center.x.toFixed(3)}|${circle(s).normal.z.toFixed(3)}`));
    expect(seen.size).toBe(SEEDS.length);
    expect(freeDofCount3(d().construction, d().resolved)).toBe(7); // centre 3, radius 1, plane 2, D's angle 1
  });

  it('a second point rides the same circle, and the circle is one', () => {
    run('A על המעגל', 'B על המעגל');
    expect(st().lastError).toBeNull();
    expect(d().construction.circles3).toHaveLength(1);
    for (const s of SEEDS) for (const id of ['A', 'B']) expect(offCircle(id, s)).toBeLessThan(1e-9);
  });

  it('a circle stated LATER is the one «המעגל» names: nothing is created for the earlier row', () => {
    run('D על המעגל', 'משולש ABC חסום במעגל');
    expect(st().lastError).toBeNull();
    expect(d().construction.circles3.map((k) => k.def.kind)).toEqual(['circum']);
    for (const s of SEEDS) expect(offCircle('D', s)).toBeLessThan(1e-9);
  });

  it('later givens pin it: a radius, a plane, and the radius refused against itself in the circle\'s own words', () => {
    run('D על המעגל', 'E על המעגל', 'רדיוס המעגל הוא 3');
    expect(st().lastError).toBeNull();
    expect(circle(2).radius).toBeCloseTo(3, 9);
    st().submit('רדיוס המעגל הוא 4');
    expect(st().lastError).toEqual({ code: 'circle-given-conflict', what: 'radius' });
    run('D על המעגל', 'π1: z=0', 'המעגל במישור π1');
    expect(st().lastError).toBeNull();
    for (const s of SEEDS) {
      expect(Math.abs(circle(s).center.z)).toBeLessThan(1e-9);
      expect(Math.abs(d(s).positions.get('D')!.z)).toBeLessThan(1e-9);
    }
  });

  it('with two circles «המעגל» is not created for: #2705 owns that answer', () => {
    run('משולש ABC חסום במעגל', 'מעגל חסום במשולש ABC', 'D על המעגל');
    expect(st().lastError).toEqual({ code: 'unknown-circle', several: true });
  });
});

describe('#2611 — the same missing circle in every statement that refers to one', () => {
  it('«רדיוס המעגל הוא 3» and «המעגל במישור π1» on an empty canvas create it (the plane too)', () => {
    run('רדיוס המעגל הוא 3');
    expect(st().lastError).toBeNull();
    expect(circle().radius).toBeCloseTo(3, 9);
    run('המעגל במישור π1');
    expect(st().lastError).toBeNull();
    expect(d().construction.planes.has('π1')).toBe(true);
  });

  it('«המעגל O» creates the circle on centre O, as 2-D does, an existing O included', () => {
    run('D על המעגל O');
    expect(st().lastError).toBeNull();
    expect(d().construction.circles3).toEqual([{ id: 'circle-O', def: { kind: 'free', center: 'O' } }]);
    run('A(1,2,3)', 'O(0,0,0)', 'D על המעגל O');
    expect(st().lastError).toBeNull();
    expect(d().positions.get('O')).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('a letter over a drawn circle with no letter is not a missing circle: the refusal stands (2-D names that circle)', () => {
    run('משולש ABC חסום במעגל', 'D על המעגל O');
    expect(st().lastError).toEqual({ code: 'unknown-circle', name: 'O' });
  });
});

describe('#2611 — placed points stated on a circle are all on it', () => {
  const CASES: { name: string; lines: string[]; ids: string[] }[] = [
    { name: 'a triangle, no letter', lines: ['משולש ABC', 'A על המעגל', 'B על המעגל', 'C על המעגל'], ids: ['A', 'B', 'C'] },
    { name: 'a square, no letter', lines: ['ריבוע ABCD', 'A על המעגל', 'B על המעגל', 'C על המעגל', 'D על המעגל'], ids: ['A', 'B', 'C', 'D'] },
    { name: 'two cube vertices', lines: ["קובייה ABCDA'B'C'D'", 'A על המעגל', "C' על המעגל"], ids: ['A', "C'"] },
    { name: 'a triangle, a lettered centre the line created', lines: ['משולש ABC', 'A על המעגל O', 'B על המעגל O', 'C על המעגל O'], ids: ['A', 'B', 'C'] },
    { name: 'a triangle, a stated free circle', lines: ['משולש ABC', 'מעגל O', 'A על המעגל', 'B על המעגל'], ids: ['A', 'B'] },
  ];
  for (const c of CASES) {
    it(c.name, () => {
      run(...c.lines);
      expect(st().lastError).toBeNull();
      for (const s of SEEDS) {
        expect(allOk(s)).toBe(true);
        for (const id of c.ids) expect(offCircle(id, s)).toBeLessThan(1e-7);
      }
    });
  }

  it('a point off the circle three others fix is still refused: a claim stays a claim', () => {
    run('A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'E(5,5,0)', 'A על המעגל', 'B על המעגל', 'C על המעגל', 'E על המעגל');
    expect(st().lastError).toEqual({ code: 'not-on-circle', id: 'E' });
  });

  it('a centre with coordinates, or one a length drives, keeps its owner and the check (ADR-3D-419)', () => {
    run('O(0,0,0)', 'A(2,0,0)', 'B(0,3,0)', 'מעגל O', 'A על המעגל', 'B על המעגל');
    expect(st().lastError).toEqual({ code: 'not-on-circle', id: 'B' });
    expect(d().construction.points.get('O')?.kind).not.toBe('circle-centre3');
    run('משולש ABC', 'מעגל O', 'OC = 5', 'A על המעגל', 'B על המעגל');
    expect(d().construction.points.get('O')?.kind).not.toBe('circle-centre3');
  });
});

describe('#2611 — the created notice (ADR-W-164)', () => {
  const adapter: CreatedPointsAdapter = {
    reset,
    submit: (l) => st().submit(l),
    lastCreated: () => {
      const n = st().lastCreated;
      return n && st().facts[st().facts.length - 1]?.id === n.factId ? { names: [...n.ids], circle: n.circle } : null;
    },
    undoLastLine: () => {
      const n = st().lastCreated;
      if (n) st().remove(n.factId);
    },
    pointNames: () => [...d().construction.points.keys()],
    lineCount: () => st().facts.length,
  };

  it('every shared row, the circle row included', async () => {
    expect(await createdNoticeFaults(adapter, {
      referenceLine: 'M אמצע AB',
      referenceNames: ['A', 'B'],
      typoSetup: ["קובייה ABCDA'B'C'D'"],
      typoLine: "M אמצע AQ'",
      typoName: "Q'",
      declarationLine: 'משולש ABC',
      circle: { setup: ['D על המעגל O'], line: 'E על המעגל P', centre: 'P' },
    })).toEqual([]);
  });

  it('a circle with no letter says so in the notice\'s own shape, names no point, and its ✕ removes the line', () => {
    run('D על המעגל');
    const n = st().lastCreated!;
    expect(n.circle).toBe('');
    expect(n.ids).toEqual([]);
    void i18n3d.changeLanguage('he');
    const shown = createdNoticeTextOf({ names: n.ids, circle: n.circle });
    expect(shown.key).toBe('suite.notice.createdCircleUnnamed');
    expect(i18n3d.t(shown.key)).toBe('נוצר מעגל חדש — אם זו טעות הקלדה, לחצו ✕ לביטול השורה');
    st().remove(n.factId);
    expect(st().facts).toHaveLength(0);
    expect(d().construction.circles3).toHaveLength(0);
  });

  it('a circle the figure already has announces nothing', () => {
    run('משולש ABC חסום במעגל', 'D על המעגל');
    expect(st().lastCreated).toBeNull();
    run('D על המעגל', 'E על המעגל');
    expect(st().lastCreated).toBeNull();
  });
});
