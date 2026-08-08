/**
 * #446 (ADR-428): every label-less shape noun builds — the right triangle was the one exception.
 *
 * From the 2026-08-08 log triage: a student typed `משולש ישר זווית` and it did not build, while every
 * other bare shape noun does. `rightTriangle` was hand-written and returned null with no labels, instead
 * of using the shared `shapeMacro` factory that gives every other shape its auto-named vertices; it then
 * fell through to `triangle`, whose leftover guard fired on the surviving `זווית`.
 *
 * The point is not the one utterance — it is the CONSISTENCY. A student who has learned "I can just name
 * the shape" must not meet an arbitrary exception ([ADR-428](docs/06-decisions.md#adr-428): the tool
 * teaches its input language, so the language must be uniform). This asserts the whole family together so
 * a member can never quietly drop out again.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';

const ctx = { points: [], neighbors: {} } as never;
const cmds = (u: string) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`expected a parse for "${u}": ${JSON.stringify(r)}`);
  return r.commands;
};
const kinds = (u: string) => cmds(u).map((c) => c.type);
const idsOf = (u: string) => (cmds(u)[0] as { ids?: string[] }).ids;

describe('#446 — the label-less shape family is complete', () => {
  it.each([
    ['משולש', 'triangle'],
    ['ריבוע', 'square'],
    ['מלבן', 'rectangle'],
    ['מעוין', 'rhombus'],
    ['טרפז', 'trapezoid'],
    ['דלתון קמור', 'shape-variant'],
    ['משולש שווה שוקיים', 'shape-variant'],
    ['משולש שווה צלעות', 'triangle'], // equilateral is HARD (triangle + two set-equal), not a variant
    ['משולש ישר זווית', 'right-triangle'], // #446 — the member that used to fail
    ['טרפז ישר זווית', 'trapezoid'],
  ])('%s builds (%s) with auto-named vertices', (utterance, kind) => {
    expect(kinds(utterance)[0]).toBe(kind);
    const ids = idsOf(utterance);
    expect(ids && ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toEqual([...'ABCDE'].slice(0, ids!.length));
  });

  it('English mirrors', () => {
    expect(kinds('right triangle')[0]).toBe('right-triangle');
    expect(idsOf('right triangle')).toEqual(['A', 'B', 'C']);
  });
});

describe('#446 — the labelled forms are unchanged', () => {
  it.each([
    ['משולש ישר זווית ABC', ['A', 'B', 'C']],
    ['right triangle ABC', ['A', 'B', 'C']],
    ['משולש ישר זווית DEF', ['D', 'E', 'F']],
  ])('%s', (utterance, ids) => {
    expect(kinds(utterance)[0]).toBe('right-triangle');
    expect(idsOf(utterance)).toEqual(ids);
  });

  it('the right TRAPEZOID still wins the overlapping phrasing (both carry ישר זווית)', () => {
    // rightTrapezoid must keep precedence, or a 4-vertex trapezoid would be mis-claimed as a triangle
    for (const u of ['טרפז ישר זווית ABCD', 'טרפז ישר זווית']) {
      expect(kinds(u)[0]).toBe('trapezoid');
      expect(idsOf(u)).toHaveLength(4);
    }
  });

  it('a compound still escalates rather than half-parsing', () => {
    // the factory's leftover discipline is inherited, not bypassed
    const r = parse('משולש ישר זווית ABC עם AB = 6', ctx);
    expect(r.ok).toBe(false);
  });
});
