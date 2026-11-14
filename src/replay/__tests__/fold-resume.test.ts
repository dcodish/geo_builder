/**
 * A RESUMED FOLD IS THE COLD FOLD — the memo lock of #2370 and #2444
 * ([ADR-828](../../../docs/06-decisions.md#adr-828)).
 *
 * The fold memo ([ADR-280](../../../docs/06-decisions.md#adr-280)) hands a later fold the construction of the lines it
 * shares with an earlier one ([ADR-406](../../../docs/06-decisions.md#adr-406), prefix resume). That is right only if
 * no step writes into the construction it starts from. The right-triangle seat on a placed vertex did: it set `solve`
 * on the vertex object of «משולש ABC» itself, so every later fold that resumed from «משולש ABC» inherited a C already
 * solved onto the circle over AB. With the seat moved to A or B there was no free vertex left to drive, other seeds
 * sampled nothing, and «הציגו תצורה אחרת» could not move the right angle ([ADR-481](../../../docs/06-decisions.md#adr-481)).
 *
 * The engine's own class lock (a deep-frozen construction, every fixture and catalog example) is
 * `src/engine/__tests__/apply-purity.test.ts`. This file locks what the memo then owes: the same facts show the same
 * figure whatever was folded before in the session.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearReplayCaches, foldStats, replay, type Derived, type Fact } from '@/replay/core';
import type { AnyCommand, Vec } from '@/engine';

const TRIANGLE = { type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand;
/** «המשולש ישר זווית» on a drawn triangle; `rot` is the seat «הציגו תצורה אחרת» cycles (none = C, 1 = A, 2 = B). */
const right = (rot: 0 | 1 | 2 = 0): AnyCommand => ({ type: 'right-triangle', ids: ['A', 'B', 'C'], ...(rot ? { rot } : {}) }) as AnyCommand;
/** The circle «משולש ישר זווית ABC חסום במעגל» draws through the drawn triangle, as the parser emits it (the row #2444
 *  measured the leak on). */
const CIRCUMCIRCLE = { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C', autoCenter: true } as AnyCommand;

let serial = 0;
/** A NEW facts array (new fact ids) of the content, as each typed line and each search candidate builds one. */
const arrayOf = (cmds: AnyCommand[]): Fact[] => {
  serial++;
  return cmds.map((cmd, i) => ({ id: `r${serial}.${i}`, cmd, enabled: true }));
};

/** Everything a student can see of the figure, by fact INDEX (two arrays of one content have different ids). */
const seen = (d: Derived, facts: Fact[]): string =>
  JSON.stringify({
    positions: [...d.positions].sort(([a], [b]) => (a < b ? -1 : 1)),
    circles: [...d.circles].sort(([a], [b]) => (a < b ? -1 : 1)),
    status: facts.map((f) => d.status[f.id]),
    lastError: d.lastError,
    pending: d.pending,
    violations: d.violations,
  });

const angleAt = (d: Derived, v: string, p: string, q: string): number => {
  const V = d.positions.get(v) as Vec, P = d.positions.get(p) as Vec, Q = d.positions.get(q) as Vec;
  const u = { x: P.x - V.x, y: P.y - V.y }, w = { x: Q.x - V.x, y: Q.y - V.y };
  return (Math.acos((u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))) * 180) / Math.PI;
};
const rightAngleAt = (d: Derived): string =>
  (['A', 'B', 'C'] as const).filter((v) => {
    const [p, q] = (['A', 'B', 'C'] as const).filter((x) => x !== v);
    return Math.abs(angleAt(d, v, p, q) - 90) < 1e-4;
  }).join('');

const SEEDS = [0, 1, 2, 3];
const ROTS = [0, 1, 2] as const;
const SEAT = ['C', 'A', 'B'];

/** The figure at every seat and seed, each one folded from nothing. */
function coldTable(cmds: (rot: 0 | 1 | 2) => AnyCommand[]): string[][] {
  return ROTS.map((rot) =>
    SEEDS.map((seed) => {
      clearReplayCaches();
      const facts = arrayOf(cmds(rot));
      return seen(replay(facts, seed), facts);
    }),
  );
}

describe('a resumed fold is the cold fold (#2370, ADR-828)', () => {
  beforeEach(() => clearReplayCaches());

  it('«משולש ABC» · «המשולש ישר זווית»: every seat, seeds 0–3, the same resumed from the typed session as cold', () => {
    const cold = coldTable((rot) => [TRIANGLE, right(rot)]);
    clearReplayCaches();
    // the session: the first line is folded and held, the second resumes from it
    replay(arrayOf([TRIANGLE]), 0);
    const resumes0 = foldStats.resumes;
    replay(arrayOf([TRIANGLE, right()]), 0);
    expect(foldStats.resumes - resumes0, 'the second line resumed from the held fold of the first (the lock is not vacuous)').toBe(1);
    for (const rot of ROTS) {
      for (const seed of SEEDS) {
        const facts = arrayOf([TRIANGLE, right(rot)]);
        const d = replay(facts, seed);
        const where = `seat ${SEAT[rot]}, seed ${seed}`;
        expect(facts.map((f) => d.status[f.id]), `${where}: both rows are met`).toEqual(['ok', 'ok']);
        expect(rightAngleAt(d), `${where}: the right angle is at the seat`).toBe(SEAT[rot]);
        expect(seen(d, facts), `${where}: the resumed figure is the cold one`).toBe(cold[rot][seed]);
      }
    }
  });

  it('the seeds differ: a seed past 0 samples the triangle, it does not redraw seed 0', () => {
    const facts = arrayOf([TRIANGLE]);
    replay(facts, 0);
    const two = arrayOf([TRIANGLE, right()]);
    const shapes = new Set(SEEDS.map((seed) => angleAt(replay(two, seed), 'A', 'B', 'C').toFixed(3)));
    expect(shapes.size, 'four seeds, four right triangles').toBe(4);
  });

  it('«משולש ABC» read again after a right triangle was folded on it is the plain triangle, at every seed', () => {
    const cold = SEEDS.map((seed) => {
      clearReplayCaches();
      const facts = arrayOf([TRIANGLE]);
      return seen(replay(facts, seed), facts);
    });
    clearReplayCaches();
    replay(arrayOf([TRIANGLE]), 0);
    for (const rot of ROTS) replay(arrayOf([TRIANGLE, right(rot)]), 0);
    for (const seed of SEEDS) {
      const facts = arrayOf([TRIANGLE]);
      const d = replay(facts, seed);
      expect(seen(d, facts), `seed ${seed}`).toBe(cold[seed]);
      expect(rightAngleAt(d), `seed ${seed}: no right angle nobody stated`).toBe('');
      expect(JSON.stringify(d.construction.objects.find((o) => o.id === 'C')), 'C is a free vertex: nothing drives it').not.toContain('solve');
    }
  });

  it('#2444: three figures in one session, and the last one shows what it shows from nothing', () => {
    // «משולש ישר זווית ABC», then «משולש ABC» · «ABC משולש ישר זווית», then «משולש ABC» and its circle: the facts #2444
    // measured ∠C = 90.00 on, where a cold replay of the same facts gives the triangle's own angle
    const last = [TRIANGLE, CIRCUMCIRCLE];
    const cold = SEEDS.map((seed) => {
      clearReplayCaches();
      const facts = arrayOf(last);
      return seen(replay(facts, seed), facts);
    });
    clearReplayCaches();
    replay(arrayOf([right()]), 0);
    replay(arrayOf([TRIANGLE]), 0);
    replay(arrayOf([TRIANGLE, right()]), 0);
    for (const seed of SEEDS) {
      const facts = arrayOf(last);
      const d = replay(facts, seed);
      expect(seen(d, facts), `seed ${seed}: warm = cold`).toBe(cold[seed]);
      expect(rightAngleAt(d), `seed ${seed}: no right angle nobody stated`).toBe('');
    }
    // and with the right triangle stated on the circle (what that line reads as today): warm = cold at every seat
    const stated = coldTable((rot) => [TRIANGLE, CIRCUMCIRCLE, right(rot)]);
    clearReplayCaches();
    replay(arrayOf([right()]), 0);
    replay(arrayOf([TRIANGLE]), 0);
    replay(arrayOf([TRIANGLE, right()]), 0);
    for (const rot of ROTS) {
      for (const seed of SEEDS) {
        const facts = arrayOf([TRIANGLE, CIRCUMCIRCLE, right(rot)]);
        expect(seen(replay(facts, seed), facts), `seat ${SEAT[rot]}, seed ${seed}: warm = cold`).toBe(stated[rot][seed]);
      }
    }
  });
});
