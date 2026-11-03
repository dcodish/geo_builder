/**
 * #2642 ([ADR-3D-411](../../docs/06b-decisions-3d.md#adr-3d-411); ADR-W-167, operator 2026-10-31; ADR-W-175 sr-12,
 * 2026-11-02) — a single lowercase letter the figure declares as a LINE is that line in every relation, with or
 * without a noun before it. The parser cannot tell `d` the vector from `d` the free line (it has no figure), so the
 * engine resolves the name against the construction, once, at `applyCommand3`; a plural noun («הישרים d ו-ℓ1»)
 * distributes to each operand in the parser.
 *
 * Measured at HEAD `2142a8d1`: every row of ROWS refused `unknown-vector` (`d`, `k`, `u`); the noun-led spellings
 * («הישר d מאונך לישר ℓ1») recorded.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const run = (...lines: string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
  for (const l of lines) st().submit(l);
};
type V = { x: number; y: number; z: number };
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const unit = (p: V) => {
  const n = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / n, y: p.y / n, z: p.z / n };
};
const dir = (name: string, seed: number) => unit(derive3(st().facts, seed).resolved.lines.get(name)!.dir);
const cosAt = (a: string, b: string, seed: number) => Math.abs(dot(dir(a, seed), dir(b, seed)));
const allOk = () => Object.values(derive3(st().facts, 0).status).every((s) => s === 'ok');

beforeEach(() => run());

describe('#2642 — a declared lowercase line name is the line, not a vector', () => {
  // [rows, the two lines, |cos| between them]
  const ROWS: [string[], string, string, number][] = [
    [['ישר ℓ1', 'ישר ℓ2', 'ישר d', 'd מאונך ל-ℓ1'], 'd', 'ℓ1', 0],
    [['ישר ℓ1', 'ישר d', 'd ⊥ ℓ1'], 'd', 'ℓ1', 0],
    [['ישר ℓ1', 'ישר d', 'd ∥ ℓ1'], 'd', 'ℓ1', 1],
    [['ישר ℓ1', 'ישר k', 'k מאונך ל-ℓ1'], 'k', 'ℓ1', 0],
    [['ישר ℓ1', 'ישר u', 'u מקביל ל-ℓ1'], 'u', 'ℓ1', 1],
    [['ישר ℓ1', 'ישר d', 'ℓ1 מאונך ל-d'], 'd', 'ℓ1', 0],
    [['ישר ℓ1', 'ישר d', 'הישרים d ו-ℓ1 מאונכים'], 'd', 'ℓ1', 0],
    [['ישר u', 'ישר v', 'u ⊥ v'], 'u', 'v', 0],
    [['ישר u', 'ישר v', 'u ∥ v'], 'u', 'v', 1],
    [['ישר u', 'ישר v', 'הזווית בין u ל-v היא 60'], 'u', 'v', 0.5],
    [['ישר ℓ1', 'ישר d', 'הזווית בין d ל-ℓ1 היא 30'], 'd', 'ℓ1', Math.cos(Math.PI / 6)],
  ];
  it.each(ROWS)('%j records, and the stated relation holds at seeds 0–3', (lines, a, b, cos) => {
    run(...lines);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(lines.length);
    expect(allOk()).toBe(true);
    for (const s of [0, 1, 2, 3]) expect(Math.abs(cosAt(a, b, s) - cos)).toBeLessThan(1e-6);
  });

  it('the report, split one given per row: d ⊥ ℓ1 and d ⊥ ℓ2', () => {
    run('ישר ℓ1', 'ישר ℓ2', 'ישר d', 'd מאונך ל-ℓ1', 'd מאונך ל-ℓ2');
    expect(st().lastError).toBeNull();
    expect(allOk()).toBe(true);
    for (const s of [0, 1, 2, 3]) {
      expect(cosAt('d', 'ℓ1', s)).toBeLessThan(1e-6);
      expect(cosAt('d', 'ℓ2', s)).toBeLessThan(1e-6);
    }
  });

  it('reads as the noun-led spelling does: the same lowering for «d …» and «הישר d …»', () => {
    const cmdsOf = (...lines: string[]) => {
      run(...lines);
      return derive3(st().facts, 0).construction;
    };
    const bare = cmdsOf('ישר ℓ1', 'ישר d', 'd מאונך ל-ℓ1');
    const noun = cmdsOf('ישר ℓ1', 'ישר d', 'הישר d מאונך לישר ℓ1');
    expect(bare.lineRels.map((r) => r.rel)).toEqual(noun.lineRels.map((r) => r.rel));
    expect(bare.lineRels).toHaveLength(1);
  });

  it('against a plane: «d מאונך למישור ABC» drives d ⊥ ABC, as «הישר d מאונך למישור ABC» does', () => {
    for (const line of ['d מאונך למישור ABC', 'הישר d מאונך למישור ABC']) {
      run("קובייה ABCDA'B'C'D'", 'ישר d', line);
      expect(st().lastError, line).toBeNull();
      expect(allOk()).toBe(true);
      const dv = derive3(st().facts, 0);
      const [A, B, C] = ['A', 'B', 'C'].map((id) => dv.positions.get(id)!);
      const k = unit(dv.resolved.lines.get('d')!.dir);
      for (const e of [{ x: B.x - A.x, y: B.y - A.y, z: B.z - A.z }, { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z }])
        expect(Math.abs(dot(k, unit(e)))).toBeLessThan(1e-6);
    }
  });

  it('found in round: «הישרים d ו-ℓ1 מצטלבים» (the plural head) records the mutual position', () => {
    run('ישר ℓ1', 'ישר d', 'הישרים d ו-ℓ1 מצטלבים');
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
  });

  describe('controls', () => {
    it('a declared VECTOR keeps the vector reading (u ⊥ ℓ1 is a vector relation)', () => {
      run('u = (1,2,3)', 'ישר ℓ1', 'u ⊥ ℓ1');
      const c = derive3(st().facts, 0).construction;
      expect(c.lineRels.every((r) => r.op.kind !== 'line' || r.op.name !== 'u')).toBe(true);
    });
    it('an UNDECLARED letter keeps today\'s refusal (unknown-vector)', () => {
      run('ישר ℓ1', 'd מאונך ל-ℓ1');
      expect(st().lastError).toMatchObject({ code: 'unknown-vector', id: 'd' });
      expect(st().facts).toHaveLength(1);
    });
    it('the noun-led spelling is unchanged', () => {
      run('ישר ℓ1', 'ישר d', 'הישר d מאונך לישר ℓ1');
      expect(st().lastError).toBeNull();
      for (const s of [0, 1, 2, 3]) expect(cosAt('d', 'ℓ1', s)).toBeLessThan(1e-6);
    });
  });
});
