/**
 * #1975 (ADR-AG-275) — BOTH VOICES OF BOTH INSCRIPTION RELATIONS in analytic (operator 2026-10-14: *"we need to
 * have both forms supported … for all shapes … in all tools"*).
 *
 * Measured at 939b160a through `decideSubmit`: the English active voice — "a circle circumscribes the square
 * ABCD", "the circle O circumscribes triangle ABC", "triangle ABC circumscribes the circle O", "ABC circumscribes
 * a circle" — and the Hebrew relative clauses «מעגל שחוסם את המשולש ABC» (the circle the subject) and «מעגל
 * ש-ABC חוסם» (the ring the subject) were all `not-handled`, while their other voice built.
 *
 * Each row: the two voices lower to the SAME facts (the source line aside), and the figure draws the right circle.
 * n ≥ 5 is #1969's (analytic reads no inscribed n-gon yet), so the rows stop at four.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';
import type { Fact } from '../engine/types';

const stripSrc = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stripSrc)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'src').map(([k, x]) => [k, stripSrc(x)]))
      : v;
const factsOf = (line: string): unknown[] => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return r.facts.map((x: Fact) => stripSrc(x));
};
const records = (lines: string[]) => {
  const kept: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v.kind;
  });
};
type P = { x: number; y: number };
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const lineDist = (c: P, a: P, b: P) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / dist(a, b);

/** The figure's one circle and the ring's vertices at `seed`. */
function figure(lines: string[], ring: string[], seed: number) {
  const d = derive(lines, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  const c = d.figure.curves.find((q) => q.curve.kind === 'circle')?.curve;
  if (!c || c.kind !== 'circle') throw new Error('no circle');
  const pts = Object.fromEntries(d.figure.points.map((p) => [p.id, p as P]));
  return { c: { x: c.cx, y: c.cy, r: c.r }, v: ring.map((id) => pts[id]) };
}

describe('#1975 — the circle AROUND the shape: the active voice lowers as the passive does', () => {
  it.each([
    ['a circle circumscribes the square ABCD', 'square ABCD is inscribed in a circle', ['A', 'B', 'C', 'D']],
    ['a circle circumscribes triangle ABC', 'triangle ABC is inscribed in a circle', ['A', 'B', 'C']],
    ['the circle O circumscribes triangle ABC', 'מעגל O חוסם את המשולש ABC', ['A', 'B', 'C']],
    ['מעגל שחוסם את המשולש ABC', 'מעגל חוסם את המשולש ABC', ['A', 'B', 'C']],
  ])('«%s» = «%s», every vertex on the circle', (active, other, ring) => {
    expect(factsOf(active)).toEqual(factsOf(other));
    expect(records([active])).toEqual(['record']);
    for (const seed of [0, 1, 2, 3]) {
      const { c, v } = figure([active], ring as string[], seed);
      for (const p of v) expect(dist(p, c)).toBeCloseTo(c.r, 5);
    }
  });
});

describe('#1975 — the circle INSIDE the shape: the shape-as-subject voice lowers as «מעגל חסום ב-X» does', () => {
  it.each([
    ['triangle ABC circumscribes the circle O', 'מעגל O חסום במשולש ABC', ['A', 'B', 'C']],
    ['ABC circumscribes a circle', 'ABC חוסם מעגל', ['A', 'B', 'C']],
    ['square ABCD circumscribes a circle', 'ריבוע ABCD חוסם מעגל', ['A', 'B', 'C', 'D']],
    ['מעגל ש-ABC חוסם', 'ABC חוסם מעגל', ['A', 'B', 'C']],
    ['מעגל שהמשולש ABC חוסם', 'משולש ABC חוסם מעגל', ['A', 'B', 'C']],
  ])('«%s» = «%s», tangent to every side', (active, other, ring) => {
    expect(factsOf(active)).toEqual(factsOf(other));
    expect(records([active])).toEqual(['record']);
    for (const seed of [0, 1, 2, 3]) {
      const { c, v } = figure([active], ring as string[], seed);
      for (let i = 0; i < v.length; i++) expect(lineDist(c, v[i], v[(i + 1) % v.length])).toBeCloseTo(c.r, 5);
    }
  });
});
