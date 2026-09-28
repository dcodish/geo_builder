/**
 * #1498 — «ABEC מלבן»: "there is no way for ABEC to be a rectangle" — a TRUE shape refused
 * `givens-contradict` after «נקודה E במישור ABC» (prod, 2026-09-28, session uhqzlqgk).
 *
 * Two root causes, one honesty class (a student's true given refused as a contradiction):
 *
 *  A — THE FRAME RULE. solve3's in-solve residual accessor applied the pivot's gauge to EVERY
 *      point, while the final placement applies it to gauge-frame points only (`gaugeFramePoint3`).
 *      Any pin relating a solid vertex to a Lane-A absolute point (a typed coordinate) compared two
 *      frames, could never reach zero, and the pivot's 0 solutions were blamed on the newest true
 *      statement.
 *
 *  B — THE CARRIER TABLE. The #820 rider lane (a sampled parameter is a pivot UNKNOWN) and
 *      `freeDofCount3` each kept their own list of carrier kinds and drifted: `on-plane` (2),
 *      `on-line` (1), `bisector-ray` (1) and `partial` (n) were counted but never enrolled, so a
 *      given reading them was verified against the sampler's guess. Both now fold ONE table
 *      (`carrierParams3`).
 *
 * Every row drives the store's real submit path (the #1184 rule) and reads what derive3 produced.
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
  return { err: st().lastError as { code?: string; stated?: string; others?: string[] } | null, facts: st().facts.length };
};

const allOk = (seed: number): boolean => Object.values(derive3(st().facts, seed).status).every((s) => s === 'ok');
const at = (seed: number, id: string) => derive3(st().facts, seed).positions.get(id)!;
const close = (p: { x: number; y: number; z: number }, q: [number, number, number], tol = 1e-3): boolean =>
  Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]) < tol;

/** The operator's exact production sequence (session uhqzlqgk, 2026-09-28). */
const OPERATOR = [
  'ABC משולש',
  'AB=u',
  'AC=v',
  'A(0,2,-1)',
  'B(-3,2,2)',
  'D על BC',
  'D(-2,3,1)',
  'AD=(2/3)u+(1/3)v',
  'נקודה E נמצאת במישור ABC',
  'ABEC מלבן',
] as const;

describe('#1498 — the operator’s exact sequence builds green', () => {
  it('every fact ok, E at the rectangle’s corner, at several configurations', () => {
    const r = submitAll(OPERATOR);
    expect(r.err, 'the sequence was refused').toBeNull();
    expect(r.facts).toBe(OPERATOR.length);
    for (const seed of [0, 1, 2, 3, 1013]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      // the givens force C = (0,5,−1) and the rectangle’s corner E = B + C − A = (−3,5,2)
      expect(close(at(seed, 'E'), [-3, 5, 2]), `E at seed ${seed}`).toBe(true);
    }
  });

  it('stability: the shape line moves no existing point', () => {
    submitAll(OPERATOR.slice(0, -1));
    const before = ['A', 'B', 'C', 'D'].map((id) => at(0, id));
    st().submit('ABEC מלבן');
    ['A', 'B', 'C', 'D'].forEach((id, i) => {
      expect(close(at(0, id), [before[i].x, before[i].y, before[i].z]), id).toBe(true);
    });
  });
});

describe('#1498 cause A — a pin relating the figure to a typed-coordinate point is honoured', () => {
  const T = ['ABC משולש', 'A(0,2,-1)', 'B(-3,2,2)', 'C(0,5,-1)', 'E(-3,5,2)'] as const;
  it.each([
    ['ABEC מלבן'],
    ['ABEC מקבילית'],
    ['AB ⊥ BE'],
    ['|BE| = 3'],
    ['BE ∥ AC'],
  ])('«%s» after four typed corners builds green', (line) => {
    const r = submitAll([...T, line]);
    expect(r.err, `«${line}» was refused`).toBeNull();
    for (const seed of [0, 1, 2]) expect(allOk(seed), `seed ${seed}`).toBe(true);
  });
});

describe('#1498 cause B — a stated plane rider is DRIVEN by a later given, not judged at its sample', () => {
  const T = ['ABC משולש', 'A(0,2,-1)', 'B(-3,2,2)', 'C(0,5,-1)', 'E נמצאת במישור ABC'] as const;

  it.each([
    ['ABEC מלבן'],
    ['ABEC מקבילית'],
    ['E(-3,5,2)'],
  ])('«%s» drives E to the rectangle’s corner', (line) => {
    const r = submitAll([...T, line]);
    expect(r.err, `«${line}» was refused`).toBeNull();
    for (const seed of [0, 1, 2]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(close(at(seed, 'E'), [-3, 5, 2]), `E at seed ${seed}`).toBe(true);
    }
  });

  it('«|AE| = 3» drives the rider and holds at every configuration', () => {
    const r = submitAll([...T, '|AE| = 3']);
    expect(r.err).toBeNull();
    for (const seed of [0, 1, 2, 3]) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(verifyClaim({ type: 'length-eq', a: 'A', b: 'E', value: 3 }, derive3(st().facts, seed).construction, seed), `|AE| at seed ${seed}`).toBe(true);
    }
  });

  it('«AE ⊥ AB» drives the rider', () => {
    const r = submitAll([...T, 'AE ⊥ AB']);
    expect(r.err).toBeNull();
    for (const seed of [0, 1, 2]) expect(allOk(seed), `seed ${seed}`).toBe(true);
  });

  it('what the given leaves free still varies with the seed (ADR-052)', () => {
    submitAll([...T, '|AE| = 3']);
    // |AE| = 3 leaves one in-plane DOF: E’s direction from A must differ between configurations
    const dirs = [0, 1, 2, 3].map((s) => {
      const a = at(s, 'A');
      const e = at(s, 'E');
      return [e.x - a.x, e.y - a.y, e.z - a.z].map((v) => +v.toFixed(2)).join(',');
    });
    expect(new Set(dirs).size, `directions ${JSON.stringify(dirs)}`).toBeGreaterThan(1);
  });
});

describe('#1498 — refusals that were CORRECT stay refused', () => {
  const T = ['ABC משולש', 'A(0,2,-1)', 'B(-3,2,2)', 'C(0,5,-1)'] as const;

  it('«ABEC ריבוע» stays refused, naming the statements (|AB| = 3√2 ≠ |AC| = 3)', () => {
    const r = submitAll([...T, 'E נמצאת במישור ABC', 'ABEC ריבוע']);
    expect(r.err?.code).toBe('givens-contradict');
    expect(r.err?.stated).toBe('ABEC ריבוע');
    expect(r.err?.others?.length).toBeGreaterThan(0);
  });

  it.each([['E אמצע BC'], ['E על BC']])('«%s» then «ABEC מקבילית» stays refused', (eLine) => {
    const r = submitAll([...T, eLine, 'ABEC מקבילית']);
    expect(r.err?.code, `«${eLine}» + מקבילית must refuse`).toBeTruthy();
  });
});
