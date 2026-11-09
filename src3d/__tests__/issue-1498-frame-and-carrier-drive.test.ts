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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFigure3 } from '../store/figureFile3';
import { figureLanes3, gaugeFramePoint3 } from '../engine/carriers';
import { GAUGE_KINDS, ringCircle3 } from '../engine/types';

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

/**
 * #2798 (ADR-3D-456) — THE FRAME RULE ASKS WHAT A POINT IS BUILT FROM. `gaugeFramePoint3` answered from a list of kinds,
 * so a point read from both the figure and a fixed object was in the wrong frame after the pivot's similarity: carried
 * with the figure (a midpoint, a centroid) or left behind (a foot on an equation plane). Each point now has a LANE, the
 * join of what its definition reads (`figureLanes3`), and a mixed point is re-derived in every candidate's frame.
 */
describe('#2798 — the figure lanes', () => {
  const lanesOf = (lines: readonly string[]) => {
    submitAll(lines);
    return figureLanes3(derive3(st().facts, 0).construction);
  };
  it('one representative per lane', () => {
    const lanes = lanesOf(["קובייה ABCDA'B'C'D'", 'P(1,2,3)', 'Q נמצא על ציר ה-x', 'M אמצע AP', 'N אמצע PQ', 'K אמצע MB', 'L אמצע AB']);
    expect(lanes.get('A')).toBe('figure');
    expect(lanes.get('L'), 'a midpoint of two vertices').toBe('figure');
    expect(lanes.get('P'), 'a stated coordinate').toBe('fixed');
    expect(lanes.get('Q'), 'an axis point').toBe('fixed');
    expect(lanes.get('N'), 'a midpoint of two fixed points').toBe('fixed');
    expect(lanes.get('M'), 'a midpoint of a vertex and a fixed point').toBe('mixed');
    expect(lanes.get('K'), 'a midpoint of a mixed point and a vertex').toBe('mixed');
    expect(gaugeFramePoint3(derive3(st().facts, 0).construction, 'M')).toBe(false);
  });
  it('a foot from a vertex to an equation plane is mixed (the plane is a fixed input)', () => {
    const lanes = lanesOf(["קובייה ABCDA'B'C'D'", 'המישור π1: x + y + z - 1 = 0', 'מ-A מורידים אנך למישור π1 החותך אותו בנקודה F']);
    expect(lanes.get('F')).toBe('mixed');
  });
  it('identity: over every fixtures3 figure a non-mixed point keeps the old kind rule, except a derived point of fixed points only', () => {
    const dir = join(__dirname, '..', '..', 'fixtures3');
    const changed: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.geo3.json'))) {
      const r = deserializeFigure3(readFileSync(join(dir, file), 'utf8')) as { facts?: Parameters<typeof derive3>[0]; seed?: number };
      if (!r.facts) continue;
      const c = derive3(r.facts, r.seed ?? 0).construction;
      const lanes = figureLanes3(c);
      for (const [id, def] of c.points) {
        const old = GAUGE_KINDS.has(def.kind) || (def.kind === 'on-plane' && c.pointPlanes.has(def.plane)) || (def.kind === 'on-circle3' && ringCircle3(c, def.circle));
        if (lanes.get(id) !== 'mixed' && (lanes.get(id) === 'figure') !== old) changed.push(`${file}:${id}:${lanes.get(id)}`);
      }
    }
    expect(changed.sort()).toEqual([
      'free-vector-joint-letter-owned-2684.geo3.json:E:fixed',
      'free-vector-ratio-2603.geo3.json:E:fixed',
      'rider-length-coords-1816.geo3.json:D:fixed',
      'rider-length-coords-split-1816.geo3.json:D:fixed',
    ]);
  }, 120_000); // derives every fixtures3 figure once
});

describe('#2798 — the pivot draws a mixed point at its definition and a pin on it in the right frame', () => {
  type P3 = { x: number; y: number; z: number };
  const gap = (a: P3, b: P3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const half = (a: P3, b: P3): P3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  const BOX = "תיבה ABCDA'B'C'D'";
  const PI1 = 'המישור π1: x + y + z - 1 = 0';
  const holds = (lines: readonly string[], off: (p: (id: string) => P3) => number): void => {
    const r = submitAll(lines);
    expect(r.err, lines.join(' · ')).toBeNull();
    for (let seed = 0; seed < 8; seed++) {
      expect(allOk(seed), `seed ${seed}`).toBe(true);
      expect(off((id) => at(seed, id)), `seed ${seed}`).toBeLessThan(1e-9);
    }
  };
  it('a pinned vertex and a midpoint that reads a stated point', () => {
    holds([BOX, 'A(1,2,3)', 'Q(4,0,1)', 'M אמצע AQ'], (p) => gap(p('M'), half(p('A'), p('Q'))) + gap(p('A'), { x: 1, y: 2, z: 3 }));
  });
  it.each([
    ['a pinned vertex, the midpoint of another', ["קובייה ABCDA'B'C'D'", 'A(1,2,3)', 'Q(4,0,1)', 'M אמצע BQ']],
    ['a stated vector', [BOX, 'AB = (2,0,0)', 'Q(4,0,1)', 'M אמצע BQ']],
  ])('%s', (_n, lines) => holds(lines, (p) => gap(p('M'), half(p('B'), p('Q')))));
  it('a foot from a vertex to an equation plane under a pin', () => {
    holds([BOX, 'A(1,2,3)', PI1, 'מ-B מורידים אנך למישור π1 החותך אותו בנקודה F'], (p) => {
      const B = p('B');
      const t = (B.x + B.y + B.z - 1) / 3;
      return gap(p('F'), { x: B.x - t, y: B.y - t, z: B.z - t });
    });
  });
  it('a centroid with a stated point under a pin', () => {
    holds([BOX, 'A(1,2,3)', 'Q(4,0,1)', 'E מפגש התיכונים של משולש BCQ'], (p) => {
      const [B, C, Q] = [p('B'), p('C'), p('Q')];
      return gap(p('E'), { x: (B.x + C.x + Q.x) / 3, y: (B.y + C.y + Q.y) / 3, z: (B.z + C.z + Q.z) / 3 });
    });
  });
  it('a pin on a mixed point places the cube so it is both pinned and the midpoint: A = (3,2,1)', () => {
    holds(["קובייה ABCDA'B'C'D'", 'P(1,2,3)', 'M אמצע AP', 'M(2,2,2)'], (p) =>
      gap(p('M'), half(p('A'), p('P'))) + gap(p('M'), { x: 2, y: 2, z: 2 }) + gap(p('A'), { x: 3, y: 2, z: 1 }));
  });
  it('a pinned vertex and a pin on a mixed midpoint', () => {
    holds([BOX, 'A(1,2,3)', 'Q(4,0,1)', 'M אמצע BQ', 'M(4,2,2)'], (p) => gap(p('M'), half(p('B'), p('Q'))) + gap(p('M'), { x: 4, y: 2, z: 2 }));
  });
});
