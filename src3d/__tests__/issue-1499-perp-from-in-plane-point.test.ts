/**
 * #1499 — «SM⊥ABC»: "it places S on the exact place of M" (prod, 2026-09-28, the #1498 session).
 *
 * ADR-3D-146's funnel («SO גובה הפירמידה», one new letter ⇒ the foot) assumed the known endpoint
 * sits OFF the plane. When it lies IN the plane — M, the rectangle's diagonal crossing — the foot
 * of the perpendicular from it is itself, so S was minted ON M: a zero segment drawn green for a ⟂
 * it cannot carry, and «|SM| = 4» then refused `givens-contradict`. Such a statement determines the
 * new point's DIRECTION only: S lies on the normal through M, height and side unstated — so S is
 * minted `free3` and the ⟂ lands as the DRIVING pin the #820/#1311 rider lane satisfies (ADR-052:
 * the height varies with the seed until a later given drives it). Membership is decided
 * STRUCTURALLY (`structurallyOnRun3`), never off a sampled coordinate.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { verifyClaim } from '../engine/claims';

const st = () => useGeo3.getState();
beforeEach(() => {
  st().clear();
});

const submitAll = (lines: readonly string[]) => {
  for (const l of lines) st().submit(l);
  return { err: st().lastError as { code?: string } | null, facts: st().facts.length };
};

const allOk = (seed: number): boolean => Object.values(derive3(st().facts, seed).status).every((s) => s === 'ok');
const at = (seed: number, id: string) => derive3(st().facts, seed).positions.get(id)!;
const smLen = (seed: number): number => {
  const m = at(seed, 'M');
  const s = at(seed, 'S');
  return Math.hypot(s.x - m.x, s.y - m.y, s.z - m.z);
};
const perpHolds = (seed: number): boolean =>
  verifyClaim({ type: 'perp-plane', seg: ['S', 'M'], plane: ['A', 'B', 'C'] }, derive3(st().facts, seed).construction, seed);

/** The operator's exact production sequence. */
const OPERATOR = [
  'ABC משולש',
  'AB=u',
  'AC=v',
  'A(0,2,-1)',
  'B(-3,2,2)',
  'D על BC',
  'D(-2,3,1)',
  'AD=(2/3)u+(1/3)v',
  'ABEC מלבן',
  'M מפגש אלכסונים במלבן ABEC',
  'SM⊥ABC',
] as const;

describe('#1499 — the operator’s exact sequence: S stands off the plane, ⟂ through M', () => {
  it('builds green with S ≠ M and SM ⊥ ABC at several configurations', () => {
    const r = submitAll(OPERATOR);
    expect(r.err).toBeNull();
    expect(r.facts).toBe(OPERATOR.length);
    for (const seed of [0, 1, 2, 3, 1013]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(smLen(seed), `|SM| at seed ${seed}`).toBeGreaterThan(0.05);
      expect(perpHolds(seed), `SM ⊥ ABC at seed ${seed}`).toBe(true);
    }
  });
});

describe('#1499 — the minimal class case, both spellings', () => {
  it.each([['SM⊥ABC'], ['MS⊥ABC']])('«ABC משולש», «M אמצע BC», «%s»', (line) => {
    const r = submitAll(['ABC משולש', 'M אמצע BC', line]);
    expect(r.err, `«${line}» was refused`).toBeNull();
    for (const seed of [0, 1, 2]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(smLen(seed), `|SM| at seed ${seed}`).toBeGreaterThan(0.05);
      expect(perpHolds(seed), `⟂ at seed ${seed}`).toBe(true);
    }
  });

  it('the unstated height varies with the seed (ADR-052 — never a default)', () => {
    submitAll(['ABC משולש', 'M אמצע BC', 'SM⊥ABC']);
    const hs = [0, 1, 2, 3].map((s) => +smLen(s).toFixed(3));
    expect(new Set(hs).size, `|SM| over seeds: ${JSON.stringify(hs)}`).toBeGreaterThan(1);
  });

  it('«|SM| = 4» DRIVES the height instead of refusing', () => {
    const r = submitAll(['ABC משולש', 'M אמצע BC', 'SM⊥ABC', '|SM| = 4']);
    expect(r.err).toBeNull();
    for (const seed of [0, 1, 2, 3]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(smLen(seed), `|SM| at seed ${seed}`).toBeCloseTo(4, 3);
      expect(perpHolds(seed), `⟂ at seed ${seed}`).toBe(true);
    }
  });

  it('…and with typed coordinates too (the frame lanes mix, #1498 cause A)', () => {
    const r = submitAll(['ABC משולש', 'A(0,2,-1)', 'B(-3,2,2)', 'C(0,5,-1)', 'M אמצע BC', 'SM⊥ABC', '|SM| = 4']);
    expect(r.err).toBeNull();
    for (const seed of [0, 1, 2]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(smLen(seed), `|SM| at seed ${seed}`).toBeCloseTo(4, 3);
    }
  });
});

describe('#1499 — what must NOT change', () => {
  it('#579: «SO גובה הפירמידה» keeps the foot ON the base (S is off-plane — the ADR-3D-146 case)', () => {
    const r = submitAll(['פירמידה משולשת ABCS', 'SO גובה הפירמידה']);
    expect(r.err).toBeNull();
    const d = derive3(st().facts, 0);
    expect(d.construction.points.get('O')?.kind).toBe('foot-face');
    const [a, b, c, s, o] = ['A', 'B', 'C', 'S', 'O'].map((id) => d.positions.get(id)!);
    // O in the base plane z-span of A,B,C; S strictly off it
    const n = {
      x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
      y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
      z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    };
    const off = (p: { x: number; y: number; z: number }) => Math.abs(n.x * (p.x - a.x) + n.y * (p.y - a.y) + n.z * (p.z - a.z));
    expect(off(o)).toBeLessThan(1e-6 * Math.max(1, off(s)));
    expect(off(s)).toBeGreaterThan(1e-3);
  });

  it('a ⟂-to-plane with BOTH endpoints unknown stays an honest refusal', () => {
    const r = submitAll(['ABC משולש', 'XY⊥ABC']);
    expect(r.err?.code).toBeTruthy();
  });
});
