/**
 * Operator report (2026-06-20): "המשך DB והאנך לישר AD נפגשים בנקודה G" silently built a DEGENERATE G.
 * The generic line∩line rule read "האנך ל-AD" (the perpendicular to AD) as just "line AD", dropping the
 * ⟂ — and since line AD and line DB share endpoint D, the crossing collapsed onto D, so G couldn't build
 * (and the next step "DG" failed). Two fixes:
 *  (1) `lineLineIntersection` DEFERS when a perpendicular/parallel modifier is present (escalate, never
 *      mangle the ⟂ into a plain line) — the perpendicular needs a through-point the phrasing must give.
 *  (2) the `perpendicular … cuts … at` form (ADR-061) now accepts a "המשך"/extension cut target, so the
 *      explicit "האנך ל-AD בנקודה A חותך את המשך DB בנקודה G" builds G = (⟂ to AD at A) ∩ line DB.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';

const ctx = { circles: ['O'], points: ['A', 'B', 'D', 'O'] };

describe('a perpendicular operand is never silently read as a plain line', () => {
  it('"המשך DB והאנך לישר AD נפגשים בנקודה G" DEFERS (no degenerate line(DB)∩line(AD))', () => {
    const r = parse('המשך DB והאנך לישר AD נפגשים בנקודה G', ctx);
    expect(r.ok, 'escalates rather than building a degenerate crossing on D').toBe(false);
  });

  it('a plain "line AB and line CD meet at E" still parses (the guard is ⟂/∥-specific)', () => {
    const r = parse('AB ו-CD נפגשים בנקודה E', { circles: [], points: ['A', 'B', 'C', 'D'] });
    expect(r.ok && r.commands.some((c) => c.type === 'line-line-intersection')).toBe(true);
  });
});

describe('perpendicular at a point cuts the EXTENSION of a segment (ADR-061 + extension target)', () => {
  it('parses to ⟂-line + the cut line + their intersection + the segment', () => {
    const r = parse('האנך ל-AD בנקודה A חותך את המשך DB בנקודה G', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const types = r.commands.map((c) => c.type);
    expect(types).toContain('perpendicular-line');
    expect(types).toContain('line-intersection');
  });

  it('builds G = (perpendicular to AD at A) ∩ line DB, on the operator figure', () => {
    // circle O, external A, tangent touch B, diameter far end D; then the perpendicular cut.
    const facts: Fact[] = [];
    let g = 0;
    const groups: AnyCommand[][] = [
      [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5 } as AnyCommand],
      [
        { type: 'free-point', id: 'A', x: 12, y: 0 },
        { type: 'midpoint', id: '~tanmid-OA', a: 'O', b: 'A' },
        { type: 'circle-through', id: 'tanaux-OA', center: '~tanmid-OA', through: 'O', hidden: true },
        { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'tanaux-OA', branch: 0 },
        { type: 'segment', a: 'A', b: 'B' },
      ] as AnyCommand[],
      [{ type: 'extend-onto-circle', id: 'D', a: 'A', b: 'O', circle: 'circle-O' } as AnyCommand],
    ];
    for (const grp of groups) {
      const key = `g${g++}`;
      for (const cmd of grp) facts.push({ id: `${key}.${facts.length}`, group: key, enabled: true, cmd });
    }
    const r = parse('האנך ל-AD בנקודה A חותך את המשך DB בנקודה G', ctx);
    if (!r.ok) throw new Error('cut phrasing did not parse');
    const key = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${key}.${facts.length}`, group: key, enabled: true, cmd });

    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    const at = (id: string): Vec => fig.positions.get(id)!;
    const A = at('A'), D = at('D'), B = at('B'), G = at('G');
    expect(G, 'G is placed').toBeDefined();
    // GA ⟂ AD
    expect((G.x - A.x) * (D.x - A.x) + (G.y - A.y) * (D.y - A.y), 'GA ⟂ AD (perp at A)').toBeCloseTo(0, 3);
    // G on line DB
    const off = Math.abs((G.x - D.x) * (B.y - D.y) - (G.y - D.y) * (B.x - D.x)) / Math.hypot(B.x - D.x, B.y - D.y);
    expect(off, 'G lies on line DB').toBeLessThan(1e-3);
  });
});
