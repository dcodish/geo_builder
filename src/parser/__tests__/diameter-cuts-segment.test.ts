/**
 * "the diameter from F cuts side AC at E" / "קוטר המעגל היוצא מנקודה F חותך את הצלע AC בנקודה E"
 * (ADR-077). The diameter through an on-circle point F is the line F–O (O the centre); it meets the
 * SIDE (segment) AC at E. Because the target is the side, E is constrained BETWEEN A and C (set-line
 * [A,E,C]) so the figure flexes to keep E on the segment rather than its extension. Previously this
 * escalated to the LLM (lineLineIntersection `stop`s on "קוטר") and the manual line∩line workaround
 * put E on the continuation of AC.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const ctx = { circles: ['O'], points: ['A', 'B', 'C', 'F', 'O'] };

describe('parse — diameter from a point cuts a side at a new point', () => {
  it('emits the diameter-line ∩ side intersection + the segment-order constraint + the chord', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את הצלע AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([
      { type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true },
      { type: 'set-line', points: ['A', 'E', 'C'] }, // E between A and C ⇒ on the side
      { type: 'segment', a: 'F', b: 'E' },
    ]);
  });

  it('English phrasing', () => {
    const r = parse('the diameter of the circle from F cuts side AC at E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([
      { type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true },
      { type: 'set-line', points: ['A', 'E', 'C'] },
      { type: 'segment', a: 'F', b: 'E' },
    ]);
  });

  it('targeting the LINE (not the side) omits the segment-order constraint', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את הישר AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
    expect(r.commands[0]).toEqual({ type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true });
  });

  it('a bare "diameter AB" (no cut) is still the plain diameter rule', () => {
    const r = parse('diameter AB', { circles: ['O'], points: ['A', 'B', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'diameter', id1: 'A', id2: 'B', circle: 'circle-O' }]);
  });
});
