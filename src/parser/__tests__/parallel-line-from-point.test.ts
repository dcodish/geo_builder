/**
 * #127 — a drawn parallel/perpendicular line anchored by the "from a point" origin students actually write
 * («מנקודה A ישר מקביל ל-DO» / «from point A a line parallel to DO»), not only «through/דרך/בנקודה». The
 * construct already existed; the gap was the through-point anchor keyword. A FROM_PT anchor on the
 * parallel-line rule closes it; the perpendicular "from a point" is already the foot rule's job (a shared
 * anchor would make the ⟂ rule shadow foot phrasings). (Prod log-triage 2026-07-14.)
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const cmds = (u: string): AnyCommand[] => {
  const r = parse(u);
  expect(r.ok, u).toBe(true);
  return r.ok ? r.commands : [];
};
const parLine = (u: string) =>
  cmds(u).find((c) => c.type === 'parallel-line') as { through: string; a: string; b: string } | undefined;

describe('#127 — parallel line "from a point"', () => {
  it('the exact prod utterance «מנקודה A ישר מקביל ל-DO» builds parallel-line through A ∥ DO', () => {
    const p = parLine('מנקודה A ישר מקביל ל-DO');
    expect(p).toMatchObject({ through: 'A', a: 'D', b: 'O' });
  });

  it('English mirror «from point A a line parallel to DO»', () => {
    expect(parLine('from point A a line parallel to DO')).toMatchObject({ through: 'A', a: 'D', b: 'O' });
    expect(parLine('from A a line parallel to DO')).toMatchObject({ through: 'A', a: 'D', b: 'O' });
  });

  it('the abbreviated «מ-A» anchor and the «ל=» typo variant both parse', () => {
    expect(parLine('מ-A ישר מקביל ל-DO')).toMatchObject({ through: 'A', a: 'D', b: 'O' });
    expect(parLine('מנקודה A ישר מקביל ל=DO')).toMatchObject({ through: 'A', a: 'D', b: 'O' }); // ל= typo for ל-
  });

  it('the perpendicular "from a point" yields a perpendicular from A onto DO (foot + drawn segment)', () => {
    // A perpendicular from an EXTERNAL point drops to the segment: a foot F of ⟂ from A to DO, drawn A–F.
    // (This is handled by the foot rule, which already reads the "from A" anchor — so it worked pre-#127;
    //  the parallel case, which has no such fallback, was the real gap.) Assert the figure, not the rule.
    for (const u of ['מנקודה A ישר מאונך ל-DO', 'from point A a line perpendicular to DO']) {
      const c = cmds(u);
      const foot = c.find((x) => x.type === 'foot') as { from: string; a: string; b: string } | undefined;
      expect(foot, u).toMatchObject({ from: 'A', a: 'D', b: 'O' });
    }
  });

  it('the classic «through/דרך» anchors still work (no regression)', () => {
    expect(parLine('הישר PQ דרך P מקביל ל-AB')).toMatchObject({ through: 'P' });
    expect(parLine('line through P parallel to AB')).toMatchObject({ through: 'P' });
  });
});
