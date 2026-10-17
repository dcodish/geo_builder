/**
 * #2089 ([ADR-728](../../../docs/06-decisions.md#adr-728)) — «XP ⟂ CD» about a rider P of CD is the foot statement
 * «XP גובה לצלע CD», re-read through the foot placement's M1 path when the ⟂ form has no figure.
 *
 * Measured on `main` 688dfb96: «מרובע ABCD» · «E על CD» · «AE ⟂ CD» was refused «cannot place E on segment CD so that
 * AE ⟂ CD» — the ⟂ form drove only E's slide and its recruiter never offered the free vertex A — while «AE גובה לצלע CD»
 * built (the foot placement's M1 path lets A yield). The engine half is locked here; the student's path is in
 * `src/app/__tests__/issue-2089-rider-foot.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { applyStep } from '../step';
import { riderPerpendicularAsFoot } from '../apply';
import type { Command, Construction } from '../types';

/** «מרובע ABCD» (the default quad: the foot of A on line CD falls outside segment CD) with «E על CD». */
function quadWithRider(extra: Construction['objects'] = []): Construction {
  return {
    objects: [
      { kind: 'free-point', id: 'A', x: 0, y: 0 },
      { kind: 'free-point', id: 'B', x: 6, y: 0 },
      { kind: 'free-point', id: 'C', x: 5, y: 5 },
      { kind: 'free-point', id: 'D', x: 1, y: 4 },
      { kind: 'polygon', id: 'poly-ABCD', vertices: ['A', 'B', 'C', 'D'] },
      { kind: 'segment', id: 'seg-CD', a: 'C', b: 'D' },
      { kind: 'on-segment', id: 'E', a: 'C', b: 'D', t: 0.5, free: true },
      { kind: 'segment', id: 'seg-AE', a: 'A', b: 'E' },
      ...extra,
    ],
    constraints: [],
  };
}
const perp = (a: string, b: string, c: string, d: string): Command => ({ type: 'set-perpendicular', a, b, c, d });

describe('#2089 — riderPerpendicularAsFoot reads «XP ⟂ CD» about a rider of CD as the foot of X', () => {
  it.each([
    [perp('A', 'E', 'C', 'D')],
    [perp('E', 'A', 'D', 'C')],
    [perp('C', 'D', 'A', 'E')],
    [perp('D', 'C', 'E', 'A')],
  ])('%j → foot E from A onto CD (every argument order)', (cmd) => {
    const f = riderPerpendicularAsFoot(quadWithRider(), cmd);
    expect(f?.type).toBe('foot');
    const ft = f as Extract<Command, { type: 'foot' }>;
    expect([ft.id, ft.from, [ft.a, ft.b].sort().join('')]).toEqual(['E', 'A', 'CD']);
  });

  it('is not this statement: X on the line, X an endpoint, an extension rider, a rider of another segment, a re-placed P', () => {
    const base = quadWithRider([{ kind: 'on-segment', id: 'F', a: 'C', b: 'D', t: 0.3, free: true }]);
    expect(riderPerpendicularAsFoot(base, perp('F', 'E', 'C', 'D'))).toBeNull(); // X rides CD too — degenerate, refusal unchanged
    expect(riderPerpendicularAsFoot(base, perp('D', 'E', 'C', 'D'))).toBeNull(); // X is an endpoint
    expect(riderPerpendicularAsFoot(base, perp('A', 'E', 'B', 'C'))).toBeNull(); // E does not ride BC
    expect(riderPerpendicularAsFoot(base, perp('A', 'B', 'C', 'D'))).toBeNull(); // no rider in the statement
    const ext = quadWithRider();
    ext.objects = ext.objects.map((o) => (o.id === 'E' ? { kind: 'on-segment', id: 'E', a: 'C', b: 'D', t: 1.5, extension: true } : o));
    expect(riderPerpendicularAsFoot(ext, perp('A', 'E', 'C', 'D'))).toBeNull(); // an extension rider keeps its own path
    const twice = quadWithRider([{ kind: 'midpoint', id: '~E', a: 'C', b: 'D' }]);
    expect(riderPerpendicularAsFoot(twice, perp('A', 'E', 'C', 'D'))).toBeNull(); // P already re-placed once
  });

  it('applyStep: the quad builds through the foot re-reading — E on CD, AE ⟂ CD — where the ⟂ form alone was refused', () => {
    const r = applyStep(quadWithRider(), perp('A', 'E', 'C', 'D'));
    expect(r.ok).toBe(true);
    expect(r.ladder).toContain('m1:rider-foot');
    const [A, C, D, E] = ['A', 'C', 'D', 'E'].map((id) => r.positions.get(id)!);
    expect(Math.abs((A.x - E.x) * (C.x - D.x) + (A.y - E.y) * (C.y - D.y))).toBeLessThan(1e-6);
    const along = Math.hypot(C.x - E.x, C.y - E.y) + Math.hypot(E.x - D.x, E.y - D.y) - Math.hypot(C.x - D.x, C.y - D.y);
    expect(Math.abs(along)).toBeLessThan(1e-6);
    // the quadrilateral yields through A; B, C, D stay where they were (the stability rule)
    expect(r.positions.get('B')).toEqual({ x: 6, y: 0 });
    expect(r.positions.get('C')).toEqual({ x: 5, y: 5 });
    expect(r.positions.get('D')).toEqual({ x: 1, y: 4 });
  });

  it('applyStep: where the ⟂ form builds, it is kept untouched (no re-reading)', () => {
    const c = quadWithRider();
    c.objects = c.objects.map((o) => (o.id === 'A' ? { kind: 'free-point', id: 'A', x: 3, y: 0 } : o)); // the foot of A lands inside CD
    const r = applyStep(c, perp('A', 'E', 'C', 'D'));
    expect(r.ok).toBe(true);
    expect(r.ladder).not.toContain('m1:rider-foot');
    expect(r.construction.objects.some((o) => o.id === '~E')).toBe(false);
    // the ⟂ form's own lowering: the rider becomes on-segment-solved, carrying the perpendicular
    const e = r.construction.objects.find((o) => o.id === 'E') as { kind: string; constraint?: { type: string } } | undefined;
    expect([e?.kind, e?.constraint?.type]).toEqual(['on-segment-solved', 'perpendicular']);
  });
});
