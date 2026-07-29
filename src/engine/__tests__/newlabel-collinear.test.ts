/**
 * #402 (ADR-408): a NEW label in a collinearity statement is DEFINED by it — created as an
 * on-segment rider on the line through the statement's existing anchors, its default side
 * following the STATED ORDER (set-line) or free (set-collinear). Operator report (dev session
 * `2je0eg0n`): «ישר GFH» with H undefined refused `references an unknown point`; the workaround
 * was defining H first. The M1-dual class (ADR-236's named-line free slider, engine edition).
 */
import { describe, expect, it } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';

const F = (id: string, cmd: AnyCommand, enabled = true): Fact => ({ id, cmd, enabled, group: id });
const AB = (): Fact[] => [
  F('p1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
  F('p2', { type: 'free-point', id: 'B', x: 8, y: 0, free: true } as AnyCommand),
];
const collinear = (P: Vec, Q: Vec, R: Vec) =>
  Math.abs((Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x)) / Math.max(Math.hypot(Q.x - P.x, Q.y - P.y), 1e-9);

describe('a NEW label in set-line is created as a rider (#402, ADR-408)', () => {
  it('trailing letter: «line A,B,E» creates E BEYOND B (the ADR-050 order reading)', () => {
    const d = replay([...AB(), F('l', { type: 'set-line', points: ['A', 'B', 'E'] } as AnyCommand)], 0);
    expect(d.lastError).toBeNull();
    const [A, B, E] = ['A', 'B', 'E'].map((id) => d.positions.get(id)!);
    expect(E, 'E exists').toBeTruthy();
    expect(collinear(A, B, E), 'E is on line AB').toBeLessThan(1e-6);
    const t = ((E.x - A.x) * (B.x - A.x) + (E.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
    expect(t, 'E lies beyond B (A→B→E)').toBeGreaterThan(1);
  });

  it('leading letter: «line H,A,B» creates H beyond A on the OTHER side', () => {
    const d = replay([...AB(), F('l', { type: 'set-line', points: ['H', 'A', 'B'] } as AnyCommand)], 0);
    expect(d.lastError).toBeNull();
    const [A, B, H] = ['A', 'B', 'H'].map((id) => d.positions.get(id)!);
    const t = ((H.x - A.x) * (B.x - A.x) + (H.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
    expect(collinear(A, B, H)).toBeLessThan(1e-6);
    expect(t, 'H lies before A (H→A→B)').toBeLessThan(0);
  });

  it('interior letter: «line A,M,B» creates M BETWEEN as a free slider (sampled by the seed)', () => {
    const facts = [...AB(), F('l', { type: 'set-line', points: ['A', 'M', 'B'] } as AnyCommand)];
    const d = replay(facts, 0);
    expect(d.lastError).toBeNull();
    const ts: number[] = [];
    for (const seed of [0, 1, 2]) {
      const r = replay(facts, seed);
      const [A, B, M] = ['A', 'B', 'M'].map((id) => r.positions.get(id)!);
      expect(collinear(A, B, M), `seed ${seed}: M on line AB`).toBeLessThan(1e-6);
      const t = ((M.x - A.x) * (B.x - A.x) + (M.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      expect(t, `seed ${seed}: M between A and B`).toBeGreaterThan(0);
      expect(t, `seed ${seed}: M between A and B`).toBeLessThan(1);
      ts.push(t);
    }
    expect(new Set(ts.map((t) => t.toFixed(3))).size, 'the unstated position is a sampled DOF (ADR-052)').toBeGreaterThan(1);
  });

  it('set-collinear (unordered): the new label rides the line, side unpinned', () => {
    const d = replay([...AB(), F('l', { type: 'set-collinear', a: 'E', b: 'A', c: 'B' } as AnyCommand)], 0);
    expect(d.lastError).toBeNull();
    const [A, B, E] = ['A', 'B', 'E'].map((id) => d.positions.get(id)!);
    expect(collinear(A, B, E)).toBeLessThan(1e-6);
  });

  it('fewer than 2 anchors: the honest refusal stands (instantly, per ADR-407)', () => {
    const d = replay([F('p1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand), F('l', { type: 'set-line', points: ['A', 'X', 'Y'] } as AnyCommand)], 0);
    expect(d.lastError).toMatch(/unknown point/);
  });

  it('no theft: all-existing set-line is byte-identical (a pure constraint, no rider)', () => {
    const three = [...AB(), F('p3', { type: 'free-point', id: 'C', x: 4, y: 3, free: true } as AnyCommand)];
    const d = replay([...three, F('l', { type: 'set-line', points: ['A', 'B', 'C'] } as AnyCommand)], 0);
    // C stays the FREE point it was (driven onto the line by the constraint), never re-created as a rider
    const obj = d.construction.objects.find((o) => o.id === 'C')!;
    expect(obj.kind).not.toBe('on-segment');
  });

  it('a later constraint can DRIVE the created rider («GH ∥ AD» slides H along line GF)', () => {
    const facts = [
      F('q1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
      F('q2', { type: 'free-point', id: 'D', x: 2, y: 6, free: true } as AnyCommand),
      F('q3', { type: 'free-point', id: 'G', x: 10, y: 0, free: true } as AnyCommand),
      F('q4', { type: 'free-point', id: 'F', x: 9, y: 4, free: true } as AnyCommand),
      F('q5', { type: 'set-line', points: ['G', 'F', 'H'] } as AnyCommand),
      F('q6', { type: 'set-parallel', a: 'G', b: 'H', c: 'A', d: 'D' } as AnyCommand),
    ];
    const d = replay(facts, 0);
    expect(d.lastError).toBeNull();
    const [A, D, G, H, Fp] = ['A', 'D', 'G', 'H', 'F'].map((id) => d.positions.get(id)!);
    expect(collinear(G, Fp, H), 'H stays on line GF').toBeLessThan(1e-5);
    const cross = (H.x - G.x) * (D.y - A.y) - (H.y - G.y) * (D.x - A.x);
    expect(Math.abs(cross) / (Math.hypot(H.x - G.x, H.y - G.y) * Math.hypot(D.x - A.x, D.y - A.y)), 'GH ∥ AD holds').toBeLessThan(1e-5);
  });
});
