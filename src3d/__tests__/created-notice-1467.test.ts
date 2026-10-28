/**
 * #1467 ([ADR-3D-382](../../docs/06b-decisions-3d.md#adr-3d-382), ADR-W-162; operator ruling 2026-09-27 "Create
 * everywhere + notice"; verdicts T41/T49 of 2026-10-24) — 3-D creates every point a line refers to, as a free point,
 * LAST (after the deferral fixpoint), and says so.
 *
 * Measured at d9494206 through `useGeo3.submit`: «M אמצע AB», «M אמצע BB'», «AB = 3», «∠BAC = 90», «המרחק בין D
 * למישור ABC הוא 6», «קטע QZ», cube · «M אמצע AQ'», cube · «E אמצע XC» → `unknown-point`; «קובייה ABCD» · «PQ = 2AB»
 * → `two-unknowns`; «A(0,2,-1)» · «B(-3,2,2)» · «נסמן: AB = u, AC = v» → `unknown-point C`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import i18n3d from '../i18n';
import { createdNoticeFaults } from '../../shell/__tests__/fixtures/created-notice-rows';
import type { CreatedPointsAdapter } from '../../shell/session/createdPoints';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const run = (...lines: string[]) => {
  reset();
  for (const l of lines) st().submit(l);
};
const d = (seed = st().seed) => derive3(st().facts, seed);
const shown = () => {
  const n = st().lastCreated;
  return n && st().facts[st().facts.length - 1]?.id === n.factId ? [...n.ids] : null;
};
const P = (id: string, seed?: number) => d(seed).positions.get(id)!;
const dist = (a: string, b: string, seed?: number) => {
  const p = P(a, seed);
  const q = P(b, seed);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
};

beforeEach(reset);

const adapter: CreatedPointsAdapter = {
  reset,
  submit: (l) => st().submit(l),
  lastCreated: () => (shown() ? { names: shown()! } : null),
  undoLastLine: () => {
    const n = st().lastCreated;
    if (n) st().remove(n.factId);
  },
  pointNames: () => [...d().construction.points.keys()],
  lineCount: () => st().facts.length,
};

describe('#1467 — 3-D honours the shared created-notice contract', () => {
  it('every shared row', async () => {
    expect(await createdNoticeFaults(adapter, {
      referenceLine: 'M אמצע AB',
      referenceNames: ['A', 'B'],
      typoSetup: ["קובייה ABCDA'B'C'D'"],
      typoLine: "M אמצע AQ'",
      typoName: "Q'",
      declarationLine: 'משולש ABC',
    })).toEqual([]);
  });
});

describe('#1467 — a line naming a point the figure lacks creates it', () => {
  const BLANK: [string, string[]][] = [
    ['M אמצע AB', ['A', 'B']],
    ["M אמצע BB'", ['B', "B'"]],
    ["K על AA' כך ש-AK = 2KA'", ['A', "A'"]],
    ['AB = 3', ['A', 'B']],
    ['∠BAC = 90', ['A', 'B', 'C']],
    ['המרחק בין D למישור ABC הוא 6', ['D', 'A', 'B', 'C']],
    ['נסמן: AB = u', ['A', 'B']],
  ];
  it.each(BLANK)('blank «%s» records green, and the notice names %j', (line, names) => {
    run(line);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(1);
    expect(Object.values(d().status)).toEqual(['ok']);
    expect(shown()).toEqual(names);
  });

  it("the operator's T41: cube · «E אמצע XC» creates X free (3 DOF) and names only X", () => {
    run("קובייה ABCDA'B'C'D'", 'E אמצע XC');
    expect(st().lastError).toBeNull();
    expect(shown()).toEqual(['X']);
    const xs = new Set([0, 1, 2, 3].map((s) => P('X', s).z.toFixed(3)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it("the operator's T49: «קובייה ABCD» · «PQ = 2AB» builds, creating P and Q", () => {
    run('קובייה ABCD', 'PQ = 2AB');
    expect(st().lastError).toBeNull();
    expect(d().construction.points.has('P') && d().construction.points.has('Q')).toBe(true);
    for (const s of [0, 1, 2]) expect(dist('P', 'Q', s)).toBeCloseTo(2 * dist('A', 'B', s), 6);
  });

  it('«AB = 3» holds at five seeds, and the points move (ADR-052)', () => {
    run('AB = 3');
    const seen = new Set<string>();
    for (const s of [0, 1, 2, 3, 4]) {
      expect(dist('A', 'B', s)).toBeCloseTo(3, 5);
      seen.add(P('A', s).x.toFixed(3));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('points inside a vector line are created too (#2048 ruling A, S2(a))', () => {
    run('A(0,2,-1)', 'B(-3,2,2)', 'נסמן: AB = u, AC = v');
    expect(st().lastError).toBeNull();
    expect(shown()).toEqual(['C']);
  });

  it('a declaration announces nothing: «קטע QZ» on a blank page draws Q and Z', () => {
    run('קטע QZ');
    expect(st().lastError).toBeNull();
    expect([...d().construction.points.keys()]).toEqual(['Q', 'Z']);
    expect(shown()).toBeNull();
  });

  it('mint is the LAST resort: a point a later line declares binds (no mint, no notice after the replay)', () => {
    run('M אמצע SA', 'פירמידה SABCD');
    expect(Object.values(d().status)).toEqual(['ok', 'ok']);
    expect(d().created).toEqual({});
    const mid = { x: (P('S').x + P('A').x) / 2, y: (P('S').y + P('A').y) / 2, z: (P('S').z + P('A').z) / 2 };
    expect(Math.hypot(P('M').x - mid.x, P('M').y - mid.y, P('M').z - mid.z)).toBeLessThan(1e-7);
    run('M אמצע AB', 'A(1,2,3)');
    expect(P('A')).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(d().created[st().facts[0].id]).toEqual(['B']);
  });

  it('a line that still fails after minting keeps nothing it minted, and reports the real reason', () => {
    run('A(0,0,0)', 'B(1,0,0)', 'C(2,0,0)', 'המרחק בין D למישור ABC הוא 6');
    expect(st().facts).toHaveLength(3);
    expect(st().lastError?.code).not.toBe('unknown-point');
    expect(d().construction.points.has('D')).toBe(false);
  });

  it('«אלכסון AB» with no solid stays refused (#978): a diagonal is of a solid, never of free points', () => {
    run('אלכסון AB');
    expect(st().facts).toHaveLength(0);
    expect(st().lastError).not.toBeNull();
  });

  it('the ✕ removes the line and the created points with it', () => {
    run("קובייה ABCDA'B'C'D'", "M אמצע AQ'");
    expect(shown()).toEqual(["Q'"]);
    adapter.undoLastLine();
    expect(st().facts).toHaveLength(1);
    expect(d().construction.points.has("Q'")).toBe(false);
  });

  it('the notice text is the suite sentence', () => {
    const t = (k: string, o: Record<string, string>) => (i18n3d.getFixedT('he')(k, o) as string).replace(/[⁦-⁩]/g, '');
    expect(t('suite.notice.createdPoint', { names: "Q'" })).toBe("נוצרה נקודה חדשה Q' — אם זו טעות הקלדה, לחצו ✕ לביטול השורה");
  });
});
