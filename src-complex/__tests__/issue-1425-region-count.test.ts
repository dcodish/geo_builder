/**
 * #1425 (ADR-CX-053) — «ABC: 0 בפנים · 3 על המצולע · 0 בחוץ» under a lone triangle: the region count
 * included the polygon's own corners, which lie on it by definition. Only the OTHER numbers are counted.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { buildScene } from '../scene/scene';
import fx from './fixtures/2b-capstone.complex.json';

const regions = (...lines: string[]) => buildScene(deriveLines(lines, 0, 0)).regions;

describe('#1425 — the count is of the other numbers', () => {
  it('«משולש ABC» alone: the region shades, but nothing is counted (so no strip)', () => {
    const [r] = regions('משולש ABC');
    expect(r.members).toHaveLength(0);
    expect(r.counts).toEqual({ in: 0, on: 0, out: 0 });
  });

  it('«משולש ABC · z1 = 0» counts only z1', () => {
    const [r] = regions('משולש ABC', 'z1 = 0');
    expect(r.members.map((m) => m.name)).toEqual(['z1']);
  });

  it('the roots of an equation are counted against a polygon over other numbers', () => {
    const [r] = regions('w^5 = 32', 'המרובע Oz1z2z3', 'z1 = 1', 'z2 = 2+i', 'z3 = 2i');
    expect(r.members.map((m) => m.name).sort()).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
  });

  it('a corner that IS a solution still counts, as on (the plan\'s identity rule)', () => {
    const [r] = regions('z^3 = 8', 'המשולש z1z2z3');
    expect(r.counts.on).toBe(3);
  });

  it('the §2b capstone: each quadrilateral counts only the number that is not its corner', () => {
    const rs = regions(...(fx as { lines: string[] }).lines);
    const by = new Map(rs.map((r) => [r.label, r.members.map((m) => `${m.name}:${m.where}`)]));
    expect(by.get('Oz1z2z3')).toEqual(['z4:out']);
    expect(by.get('Oz2z3z4')).toEqual(['z1:out']);
  });
});
