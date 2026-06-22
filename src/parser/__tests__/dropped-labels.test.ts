import { describe, it, expect } from 'vitest';
import { parse, droppedNewLabels } from '@/parser';
import type { AnyCommand } from '@/engine';

/**
 * ADR-089 — typo escalation gate. A typo in a keyword can make a rule match PARTIALLY and silently drop a
 * NEW label it introduced; the App then escalates to the LLM instead of committing the partial figure.
 * `droppedNewLabels` is that signal: a NEW input label (not already in the figure) the commands don't use.
 */
const ctx = { circles: ['O'], points: ['A', 'B', 'C', 'O'], circleMembers: [{ center: 'O', points: ['A', 'B', 'C'] }] };
const dropped = (u: string) => {
  const r = parse(u, ctx);
  return r.ok ? droppedNewLabels(u, r.commands as AnyCommand[], ctx.points) : null;
};

describe('droppedNewLabels (typo escalation gate)', () => {
  it('flags the dropped apex on the typo "מנוקדה D …" (ק/ו swapped)', () => {
    // the typo keeps "tangent at B" but drops the "from D" apex → D is a NEW label the commands never use
    expect(dropped('מנוקדה D יוצא משיק למעגל בנקודה B')).toEqual(['D']);
  });

  it('flags nothing for the correctly-spelled "מנקודה D …" (D is created as the apex marker)', () => {
    expect(dropped('מנקודה D יוצא משיק למעגל בנקודה B')).toEqual([]);
  });

  it('does NOT flag an EXISTING label a command merely does not re-name (it is context)', () => {
    // "AB tangent at B" — A,B already exist; the command references B but not A → A is existing, not dropped
    expect(droppedNewLabels('הצלע AB משיקה למעגל בנקודה B', [{ type: 'set-perpendicular', a: 'O', b: 'B', c: 'A', d: 'B' } as AnyCommand], ['A', 'B', 'O'])).toEqual([]);
  });

  it('a label used only INSIDE an id (circle-P / tan-B) counts as consumed', () => {
    expect(droppedNewLabels('x', [{ type: 'set-radius', circle: 'circle-P', value: 4 } as AnyCommand], [])).toEqual([]);
    expect(droppedNewLabels('tangent at B', [{ type: 'tangent', id: 'tan-B', circle: 'circle-O', at: 'B', visible: true } as AnyCommand], [])).toEqual([]);
  });
});
