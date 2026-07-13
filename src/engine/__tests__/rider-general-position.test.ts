/**
 * Issue #115 / ADR-311 — a point-on-object rider must default into GENERAL POSITION (ADR-253), off
 * existing points, not onto them.
 *
 * `freeSegT` spread a new free on-segment rider off OTHER on-segment riders on the same segment, but was
 * blind to any other existing point that happens to lie ON the segment (a midpoint, an intersection, a
 * foot). So `E על AB` after `M אמצע AB` defaulted straight onto M (|E−M|=0, a coincidence the student
 * never stated — an ADR-052 violation). `freeSegT` is now position-aware: it also dodges any positioned
 * point on the a→b segment. Operator prod session `qderonm3` (E fell onto K on the base).
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

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
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('#115 — rider default avoids an existing point on the segment', () => {
  it('E on AB does NOT land on the existing midpoint M of AB', () => {
    const der = replay(build(['ריבוע ABCD', 'M אמצע AB', 'E על AB']));
    const M = der.positions.get('M')!, E = der.positions.get('E')!, A = der.positions.get('A')!, B = der.positions.get('B')!;
    expect(der.lastError).toBeNull();
    expect(d(E, M), '|E−M| should be well clear of the midpoint').toBeGreaterThan(0.1 * d(A, B));
  });

  it('a foot on a side is dodged too (E on CB avoids the ⟂ foot from A)', () => {
    // CE is the altitude foot from A onto CB (an existing point on CB); a later free E-rider must avoid it.
    const der = replay(build(['משולש ABC', 'F אמצע CB', 'E על CB']));
    const F = der.positions.get('F')!, E = der.positions.get('E')!, C = der.positions.get('C')!, B = der.positions.get('B')!;
    expect(d(E, F), 'E clear of the existing midpoint F on CB').toBeGreaterThan(0.1 * d(C, B));
  });

  it('unchanged when the segment is clear: first free rider still lands at the midpoint', () => {
    const der = replay(build(['ריבוע ABCD', 'E על AB']));
    const E = der.positions.get('E')!, A = der.positions.get('A')!, B = der.positions.get('B')!;
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    expect(d(E, mid)).toBeLessThan(1e-6);
  });

  it('two riders on the same segment still spread (regression of the original freeSegT behaviour)', () => {
    const der = replay(build(['ריבוע ABCD', 'E על AB', 'F על AB']));
    const E = der.positions.get('E')!, F = der.positions.get('F')!, A = der.positions.get('A')!, B = der.positions.get('B')!;
    expect(d(E, F)).toBeGreaterThan(0.1 * d(A, B));
  });
});
