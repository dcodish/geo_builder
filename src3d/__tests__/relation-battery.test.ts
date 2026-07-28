/**
 * The RELATION BATTERY — S1 of the relations program (docs/26 v2 §3.4, #378).
 *
 * The RELATION_TABLE is the disposition map; this file is its enforcement. Totality: every
 * (rel × kind × kind) combination classifies. Honesty: every `supported` cell either has a battery row
 * here exercising it end-to-end, or appears in BATTERY_PENDING — a RATCHET that may only shrink, so
 * "supported" can never silently mean "nobody ever ran it".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { REL3, OPERAND_KINDS, cellStatus, supportedCells } from '../engine/relationTable';
import { readOperand } from '../parser/operandToken';
import { derive3, useGeo3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const at = (seed: number, id: string): Vec3 => derive3(state().facts, seed).resolved.positions.get(id)!;
const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vnorm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const vcross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

describe('RELATION_TABLE — totality and honesty', () => {
  it('every combination classifies (the ADR-235 discipline)', () => {
    for (const rel of REL3) {
      for (const l of OPERAND_KINDS) {
        for (const r of OPERAND_KINDS) {
          const c = cellStatus(rel, l, r);
          expect(c, `${rel}|${l}|${r}`).toBeTruthy();
          if (c.status === 'n/a' || c.status === 'out-of-scope') {
            expect('note' in c && c.note, `${rel}|${l}|${r} needs its reason`).toBeTruthy();
          }
        }
      }
    }
  });

  it('the supported set is exactly the measured one — adding a cell is a conscious diff here', () => {
    expect(supportedCells()).toEqual([
      'angle|plane-named|plane-named',
      'angle|segment|plane-run',
      'angle|segment|segment',
      'angle|segment|vector',
      'angle|vector|vector',
      'intersecting|segment|segment',
      'on|point|plane-named',
      'on|point|plane-run',
      'on|point|segment',
      'parallel|segment|plane-run',
      'parallel|segment|segment',
      'perp|line|plane-named',
      'perp|line|plane-run',
      'perp|segment|plane-run',
      'perp|segment|segment',
      'perp|segment|vector',
      'perp|vector|vector',
      'skew|segment|segment',
    ]);
  });

  it('every supported cell is battery-covered or consciously pending (a ratchet — may only shrink)', () => {
    const BATTERY_COVERED = new Set([
      'perp|segment|segment',
      'perp|line|plane-run',
      'perp|line|plane-named',
      'parallel|segment|plane-run',
      'skew|segment|segment',
      'angle|segment|plane-run',
      'on|point|plane-run',
    ]);
    const BATTERY_PENDING = new Set([
      // S1 seeds the harness with 7 rows; these supported cells are exercised by their own
      // pre-program suites (cited) and join the battery as their families widen:
      'perp|segment|plane-run', // perp-seg / perp-plane suites (ADR-3D-035, V1)
      'perp|segment|vector', // perp-seg.test.ts (ADR-3D-035)
      'perp|vector|vector', // perp-seg.test.ts
      'parallel|segment|segment', // V7-T3 mutual-position suites
      'intersecting|segment|segment', // V7-T3 mutual-position suites
      'angle|segment|segment', // adr-3d-032 / V7
      'angle|segment|vector', // V8-f suites
      'angle|vector|vector', // V8-f suites
      'angle|plane-named|plane-named', // scenarios3 2022-Q2 gate
      'on|point|plane-named', // ADR-3D-015 suites
      'on|point|segment', // V0 suites
    ]);
    for (const cell of supportedCells()) {
      expect(
        BATTERY_COVERED.has(cell) || BATTERY_PENDING.has(cell),
        `${cell} is supported but neither battery-covered nor consciously pending`,
      ).toBe(true);
    }
    for (const cell of BATTERY_PENDING) {
      expect(BATTERY_COVERED.has(cell), `${cell} is both covered and pending`).toBe(false);
    }
  });
});

describe('the battery — supported cells exercised end-to-end', () => {
  beforeEach(() => state().clear());

  it('perp|segment|segment — drives a free solid, both locales', () => {
    for (const u of ['פירמידה משולשת ABCD', 'AB מאונך ל-CD']) submit(u);
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) {
      const u = vsub(at(seed, 'B'), at(seed, 'A'));
      const w = vsub(at(seed, 'D'), at(seed, 'C'));
      expect(Math.abs(vdot(u, w)) / (vnorm(u) * vnorm(w)), `perp holds at seed ${seed}`).toBeLessThan(1e-4);
    }
    state().clear();
    for (const u of ['tetrahedron ABCD', 'AB is perpendicular to CD']) submit(u);
    expect(state().lastError).toBeNull();
  });

  it('perp|line|plane-run — drives the gauge; the funnel keeps general position (#375/#379)', () => {
    for (const u of ['פירמידה משולשת', 'l1:x=(0,0,0)+t(m,2m,3m)', 'מישור ACD אנך לישר l1']) submit(u);
    expect(state().lastError).toBeNull();
    for (const seed of [0, 2]) {
      const d = derive3(state().facts, seed);
      const ln = d.resolved.lines.get('ℓ1')!;
      const [A, C, D] = ['A', 'C', 'D'].map((id) => d.resolved.positions.get(id)!);
      const n = vcross(vsub(C, A), vsub(D, A));
      expect(vnorm(vcross(n, ln.dir)) / (vnorm(n) * vnorm(ln.dir)), `perp at seed ${seed}`).toBeLessThan(1e-3);
      for (const id of ['A', 'B', 'C', 'D']) {
        const p = d.resolved.positions.get(id)!;
        const ap = vsub(p, ln.anchor);
        const t = vdot(ap, ln.dir) / vdot(ln.dir, ln.dir);
        const off = vsub(ap, { x: t * ln.dir.x, y: t * ln.dir.y, z: t * ln.dir.z });
        expect(vnorm(off), `${id} clears the line at seed ${seed}`).toBeGreaterThan(0.15);
      }
    }
  });

  it('perp|line|plane-named — pins the parameter (the 2024-Q2 root)', () => {
    for (const u of [
      'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
      'המישור π: 3x + my + (m+6)z + 4 = 0',
      'הישר ℓ ניצב למישור π',
    ])
      submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, 0);
    expect(d.resolved.param?.value, 'm = -5, the book answer').toBeCloseTo(-5, 6);
  });

  it('parallel|segment|plane-run — verifies where structural', () => {
    // ALL-UNPRIMED figure by necessity — the battery's first find (filed): this rule family rejects
    // PRIMED labels in both slots (`A'B' מקביל למישור ABCD` and `AB מקביל למישור DCC'D'` both fail
    // to parse while the unprimed forms work).
    submit('פירמידה SABCD שבסיסה ריבוע');
    submit('AB מקביל למישור SCD'); // AB ∥ DC ⊂ plane SCD — structurally true over a square base
    expect(state().lastError).toBeNull();
  });

  it('skew|segment|segment — accepts a true skew pair, refuses a crossing one', () => {
    submit("תיבה ABCDA'B'C'D'");
    submit("AB ו-CC' מצטלבים");
    expect(state().lastError).toBeNull();
    state().clear();
    submit("תיבה ABCDA'B'C'D'");
    submit('AC ו-BD מצטלבים'); // the base diagonals CROSS — skew must refuse
    expect(state().lastError).not.toBeNull();
  });

  it('angle|segment|plane-run — drives a free box to the stated 30 degrees', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", "הזווית בין הישר AC' לבין המישור ABCD היא 30"]) submit(u);
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1]) {
      const d = derive3(state().facts, seed);
      const pos = d.resolved.positions;
      const A = pos.get('A')!;
      const C2 = pos.get("C'")!;
      const [P, Q, R] = ['A', 'B', 'C'].map((id) => pos.get(id)!);
      const n = vcross(vsub(Q, P), vsub(R, P));
      const u2 = vsub(C2, A);
      const beta = (Math.asin(Math.min(1, Math.abs(vdot(n, u2)) / (vnorm(n) * vnorm(u2)))) * 180) / Math.PI;
      expect(beta, `30 degrees at seed ${seed}`).toBeCloseTo(30, 3);
    }
  });

  it('on|point|plane-run — a NEW id becomes a rider that stays on the plane across configurations', () => {
    submit('פירמידה משולשת ABCD');
    submit('E על מישור ACD');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 3]) {
      const d = derive3(state().facts, seed);
      const pos = d.resolved.positions;
      const [A, C, D, E] = ['A', 'C', 'D', 'E'].map((id) => pos.get(id)!);
      const n = vcross(vsub(C, A), vsub(D, A));
      expect(Math.abs(vdot(n, vsub(E, A))) / vnorm(n), `E on plane at seed ${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('the operand tokenizer — kinds decide, nouns never (ADR-3D-100 as a mechanism)', () => {
  it('classifies every kind, with and without its noun, and records a contradicting noun', () => {
    expect(readOperand('ACD')?.op).toEqual({ kind: 'plane-run', ids: ['A', 'C', 'D'] });
    expect(readOperand('מישור ACD')?.op).toEqual({ kind: 'plane-run', ids: ['A', 'C', 'D'] });
    expect(readOperand("ABCA'")?.op).toEqual({ kind: 'plane-run', ids: ['A', 'B', 'C', "A'"] });
    expect(readOperand('l1')?.op).toEqual({ kind: 'line', name: 'l1' });
    expect(readOperand('הישר ℓ2')?.op).toEqual({ kind: 'line', name: 'ℓ2' });
    expect(readOperand('π1')?.op).toEqual({ kind: 'plane-named', name: 'π1' });
    expect(readOperand('AB')?.op).toEqual({ kind: 'segment', a: 'A', b: 'B' });
    expect(readOperand('הקטע AB')?.op).toEqual({ kind: 'segment', a: 'A', b: 'B' });
    expect(readOperand('u')?.op).toEqual({ kind: 'vector', name: 'u' });
    expect(readOperand('A')?.op).toEqual({ kind: 'point', id: 'A' });
    // the operator's own slip: a PLANE noun on a line name — the kind wins, the noun is recorded
    const slip = readOperand('מישור l1');
    expect(slip?.op).toEqual({ kind: 'line', name: 'l1' });
    expect(slip?.noun).toBe('plane');
    // degenerate: AA is not a segment
    expect(readOperand('AA')).toBeNull();
  });
});
