import { describe, it, expect } from 'vitest';
import { build, evaluate } from '@/engine';
import type { Command, Vec } from '@/engine';

/**
 * ADR-085: the default inscribed figure must be GENERIC (scalene), not a special symmetric one. Pure
 * golden-angle spacing gives 3 points two equal gaps → an isosceles triangle whose apex sits at the
 * arc-midpoint of the opposite side. That (a) asserts AB=BC, a fixed assumption the student never stated
 * (ADR-052), and (b) makes the tangent at the apex EXACTLY parallel to the opposite chord, so
 * "tangent at B meets CA" degenerates at the default view. A bounded alternating skew breaks the symmetry.
 */
const inscribed: Command[] = [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
  { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
  { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
  { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
  { type: 'triangle', ids: ['A', 'B', 'C'] },
];
const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);

describe('scalene default (ADR-085)', () => {
  it('the default inscribed triangle has three DISTINCT side lengths (no AB=BC isosceles)', () => {
    const ev = evaluate(build(inscribed).construction);
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const [A, B, C] = ['A', 'B', 'C'].map((id) => ev.positions.get(id)!);
    const [ab, bc, ca] = [d(A, B), d(B, C), d(C, A)];
    expect(Math.abs(ab - bc)).toBeGreaterThan(0.5); // not isosceles at the apex (was AB=BC exactly)
    expect(Math.abs(bc - ca)).toBeGreaterThan(0.5);
    expect(Math.abs(ab - ca)).toBeGreaterThan(0.5);
  });

  it('the tangent at B is NOT parallel to CA at the default seed (so "tangent meets CA" can build)', () => {
    const ev = evaluate(build(inscribed).construction);
    if (!ev.ok) return;
    const [A, B, C, O] = ['A', 'B', 'C', 'O'].map((id) => ev.positions.get(id)!);
    const tx = -(B.y - O.y), ty = B.x - O.x; // tangent@B ⟂ OB
    const cax = A.x - C.x, cay = A.y - C.y;
    const angDeg = (Math.acos(Math.abs(tx * cax + ty * cay) / (Math.hypot(tx, ty) * Math.hypot(cax, cay))) * 180) / Math.PI;
    expect(angDeg).toBeGreaterThan(5); // comfortably non-parallel (was 0.00°)
  });
});
