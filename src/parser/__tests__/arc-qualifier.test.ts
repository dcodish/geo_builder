/**
 * Issue #90 / ADR-316 — minor/major arc qualifier ("הקשת הקטנה/הגדולה", "minor/major arc").
 *
 * `D אמצע הקשת הקטנה AB` silently placed D on the CHORD midpoint: the `arcMidpoint` regex demanded the
 * labels immediately after the arc keyword, so the qualifier `הקטנה` between `הקשת` and `AB` made the rule
 * return null and the utterance fell through to the generic `midpoint` rule. Now the qualifier is tolerated
 * (Hebrew follows the noun, English precedes it) and MAJOR selects the far arc — arc-midpoint via branch 1
 * (the antipodal midpoint the engine already computes), a free point-on-arc via the new `major` flag.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function build(us: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of us) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `${g}.${facts.length}`, utterance: u, group: `g${g}`, cmd, enabled: true });
    g++;
  }
  return facts;
}
const ctx = (us: string[]) => {
  const { construction, positions } = replay(build(us));
  return buildParseCtx(construction, positions);
};
const cmd = (u: string, c: ReturnType<typeof ctx>) => {
  const r = parse(u, c);
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  return r.commands[0] as AnyCommand & { type: string; branch?: number; major?: boolean };
};

describe('#90 — minor/major arc qualifier', () => {
  const base = ['מעגל שמרכזו O', 'A על המעגל', 'B על המעגל'];
  const c = () => ctx(base);

  it('«D אמצע הקשת הקטנה AB» is an arc-midpoint (minor), NOT a chord midpoint', () => {
    const k = cmd('D אמצע הקשת הקטנה AB', c());
    expect(k.type).toBe('arc-midpoint');
    expect(k.branch).toBeUndefined(); // minor = default branch 0
  });
  it('«E אמצע הקשת הגדולה AB» is the MAJOR arc-midpoint (branch 1)', () => {
    expect(cmd('E אמצע הקשת הגדולה AB', c()).branch).toBe(1);
  });
  it('English «minor arc» / «major arc» work the same', () => {
    expect(cmd('D is the midpoint of the minor arc AB', c()).branch).toBeUndefined();
    expect(cmd('E is the midpoint of the major arc AB', c()).branch).toBe(1);
  });
  it('an UNqualified arc midpoint is unchanged', () => {
    const k = cmd('D אמצע הקשת AB', c());
    expect(k.type).toBe('arc-midpoint');
    expect(k.branch).toBeUndefined();
  });
  it('«F על הקשת הגדולה AB» is a free point on the MAJOR arc', () => {
    const k = cmd('F על הקשת הגדולה AB', c());
    expect(k.type).toBe('point-on-circle');
    expect((k as { between?: unknown }).between).toEqual(['A', 'B']);
    expect(k.major).toBe(true);
  });

  it('all placements land ON the circle, and minor/major midpoints are antipodal', () => {
    const der = replay(build([...base, 'D אמצע הקשת הקטנה AB', 'E אמצע הקשת הגדולה AB']));
    const O = der.positions.get('O')!, A = der.positions.get('A')!, D = der.positions.get('D')!, E = der.positions.get('E')!;
    const r = Math.hypot(A.x - O.x, A.y - O.y);
    expect(Math.hypot(D.x - O.x, D.y - O.y), 'D on circle').toBeCloseTo(r, 6);
    expect(Math.hypot(E.x - O.x, E.y - O.y), 'E on circle').toBeCloseTo(r, 6);
    expect(Math.hypot(D.x - E.x, D.y - E.y), 'minor & major midpoints antipodal').toBeCloseTo(2 * r, 6);
  });
});
