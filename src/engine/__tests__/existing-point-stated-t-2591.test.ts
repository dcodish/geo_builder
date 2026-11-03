/**
 * #2591 (ADR-773) — a STATED position on a segment, given to a point that already exists, survives the M1 lowering.
 *
 * `reinterpretAsCollinear` used to re-home a free point at the projection of where it stood (free, sliding) and lower
 * a derived one to a bare collinear: «נקודה D» · «D מחלקת את AB ביחס 1:2» drew AD/DB ≈ 0.14, and «D אמצע AB» ·
 * «D מחלקת …» committed green with D at the midpoint. The verifier checked membership only, so both read clean.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { replay } from '@/store/geoStore';
import { checkGivens } from '../verify';
import type { Command, Vec } from '../types';

const ratioAt = (steps: string[], a: string, m: string, b: string, seed: number): { r: number; ok: boolean; clean: boolean } => {
  const fig = replay(factsOf(steps), seed);
  const P = (id: string) => fig.positions.get(id) as Vec;
  const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
  return { r: d(P(a), P(m)) / d(P(m), P(b)), ok: Object.values(fig.status).every((s) => s === 'ok'), clean: fig.violations.length === 0 };
};

describe('#2591 — a stated ratio on an existing point is kept', () => {
  const cases: [string, string[], [string, string, string], number][] = [
    ['the report: a free point, then the divider', ['נקודה D', 'D מחלקת את AB ביחס 1:2'], ['A', 'D', 'B'], 0.5],
    ['every point placed first', ['נקודה A', 'נקודה B', 'נקודה D', 'D מחלקת את AB ביחס 1:2'], ['A', 'D', 'B'], 0.5],
    ['the prose form', ['קטע AB', 'נקודה D', 'היחס בין AD ל-DB הוא 1:2'], ['A', 'D', 'B'], 0.5],
    ['a point already on the segment', ['משולש ABC', 'D על AB', 'D מחלקת את AB ביחס 1:2'], ['A', 'D', 'B'], 0.5],
    ['a rider on a rectangle side', ['מלבן ABCD', 'E על AB', 'E מחלקת את AB ביחס 1:3'], ['A', 'E', 'B'], 1 / 3],
    ['a derived point: the bisector foot drives the triangle', ['משולש ABC', 'AD חוצה זווית A', 'D מחלקת את BC ביחס 1:2'], ['B', 'D', 'C'], 0.5],
  ];
  for (const [name, steps, [a, m, b], want] of cases) {
    it(name, () => {
      for (const seed of [0, 1, 2, 3]) {
        const got = ratioAt(steps, a, m, b, seed);
        expect(got.ok, `seed ${seed}`).toBe(true);
        expect(got.clean, `seed ${seed}`).toBe(true);
        expect(got.r, `seed ${seed}`).toBeCloseTo(want, 3);
      }
    });
  }

  it('a midpoint stated to divide 1:2 is refused, naming the ratio as the colon form does', () => {
    const { refused } = driveThroughGate(['משולש ABC', 'D אמצע AB', 'D מחלקת את AB ביחס 1:2']);
    expect(refused.map((r) => r.index)).toEqual([2]);
    const v = refused[0].verdict;
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.detail).toMatch(/\|AD\| = 0\.5·\|DB\| cannot hold/);
    const colon = replay(factsOf(['משולש ABC', 'D אמצע AB', 'AD:DB = 1:2']), 0);
    expect(Object.values(colon.status).some((s) => /\|AD\| = 0\.5·\|DB\| cannot hold/.test(s))).toBe(true);
  });

  it('the verifier flags a rider whose t is not the t its command states (the class guard)', () => {
    const cmds: Command[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 1 / 3 },
    ];
    const at = (x: number) => new Map<string, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 6, y: 0 }], ['D', { x, y: 0 }]]);
    expect(checkGivens(cmds, at(2), new Map())).toEqual([]);
    const off = checkGivens(cmds, at(3), new Map());
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ relation: 'ratio', messageKey: 'figure.v.constraint' });
    expect(off[0].message).toMatch(/\|AD\| = 0\.5·\|DB\|/);
    // an extension's t is an unstated default, never checked as a ratio
    const ext: Command[] = [cmds[0], cmds[1], { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 1.3, extension: true }];
    expect(checkGivens(ext, at(9), new Map())).toEqual([]);
  });

  it('controls: the blank page, the colon form, and an unstated «D על AB» are unchanged', () => {
    for (const seed of [0, 1, 2, 3]) {
      expect(ratioAt(['D מחלקת את AB ביחס 1:2'], 'A', 'D', 'B', seed).r).toBeCloseTo(0.5, 3);
      expect(ratioAt(['קטע AB', 'נקודה D', 'D על AB כך ש-AD:DB = 1:2'], 'A', 'D', 'B', seed).r).toBeCloseTo(0.5, 3);
    }
    // unstated: still a free rider, so the configurations slide it
    const rs = [0, 1, 2, 3].map((seed) => ratioAt(['קטע AB', 'נקודה D', 'D על AB'], 'A', 'D', 'B', seed).r);
    expect(new Set(rs.map((r) => r.toFixed(2))).size).toBeGreaterThan(1);
    const fig = replay(factsOf(['קטע AB', 'נקודה D', 'D על AB']), 0);
    expect(fig.construction.objects.find((o) => o.id === 'D')).toMatchObject({ kind: 'on-segment', free: true });
  });
});
