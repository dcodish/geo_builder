/**
 * "the diameter from F cuts AC at E" / "קוטר המעגל מנקודה F חותך את AC בנקודה E" (ADR-077). The
 * diameter through an on-circle point F is the line F–O (O the centre); it meets a side AC at E.
 * A bare "AC" (or "side AC") is the SEGMENT/edge, so by DEFAULT E is constrained BETWEEN A and C
 * (set-line [A,E,C]) and the figure flexes to keep E on the segment rather than its extension; only
 * an explicit "the LINE AC" opts out. Previously this escalated to the LLM (lineLineIntersection
 * `stop`s on "קוטר") and the line∩line crossing put E on the continuation of AC.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const ctx = { circles: ['O'], points: ['A', 'B', 'C', 'F', 'O'] };
const CUT = [
  { type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true },
  { type: 'set-line', points: ['A', 'E', 'C'] }, // E between A and C ⇒ on the side
  { type: 'segment', a: 'F', b: 'E' },
];

describe('parse — diameter from a point cuts a side at a new point', () => {
  it('a BARE "AC" defaults to the segment (the operator wording): intersection + order + chord', () => {
    const r = parse('קוטר המעגל מנקודה F חותך את AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual(CUT);
  });

  it('explicit "הצלע AC" (side) also constrains E to the segment', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את הצלע AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual(CUT);
  });

  it('English phrasing', () => {
    const r = parse('the diameter of the circle from F cuts AC at E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual(CUT);
  });

  it('only an explicit "the LINE AC" omits the segment-order constraint (E free on the infinite line)', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את הישר AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
    expect(r.commands[0]).toEqual({ type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true });
  });

  it('"המשך AC" (the extension of the side) puts E BEYOND the segment — dir2, no segment-order', () => {
    const r = parse('קוטר המעגל מנקודה F חותך את המשך AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-line')).toBe(false); // not kept on the segment
    expect(r.commands[0]).toEqual({ type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true, dir2: true });
  });

  it('a bare "diameter AB" (no cut) is still the plain diameter rule', () => {
    const r = parse('diameter AB', { circles: ['O'], points: ['A', 'B', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'diameter', id1: 'A', id2: 'B', circle: 'circle-O' }]);
  });
});
