/**
 * #82 (ADR-292) — the VERB honesty gate `droppedGivenVerbs`: a statement verb (משיק/חוצה/מקביל/מאונך)
 * present in the utterance but entirely absent from the winning parse's lowering blocks the commit
 * (the P1 silent-tangent-drop class). No-theft: every legitimate lowering that CARRIES the verb's
 * meaning passes (the satisfied-sets are deliberately generous, incl. the ADR-115 tangency-as-⟂ form).
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, droppedGivenVerbs, parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

let n = 0;
function ctxOf(...utterances: string[]) {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`parse failed: ${u}`);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
}

describe('#82 — the gate BLOCKS a lowering that lost the verb', () => {
  it('the exact P1: the tangent sentence lowered to a bare circumcircle', () => {
    const bad: AnyCommand[] = [{ type: 'circumcircle', id: 'circle-K', center: 'K', a: 'A', b: 'B', c: 'C' }];
    expect(droppedGivenVerbs('הישר ℓ משיק בנקודה C למעגל החוסם את המשולש ABC', bad)).toEqual(['משיק/tangent']);
  });
  it('a dropped bisector / parallel / perpendicular each name their verb', () => {
    const bare: AnyCommand[] = [{ type: 'segment', a: 'A', b: 'B' }];
    expect(droppedGivenVerbs('CD חוצה את הזווית', bare)).toContain('חוצה/bisect');
    expect(droppedGivenVerbs('AB מקביל ל-CD', bare)).toContain('מקביל/parallel');
    expect(droppedGivenVerbs('AB מאונך ל-CD', bare)).toContain('מאונך/perpendicular');
  });
});

describe('#82 — NO THEFT: legitimate lowerings pass', () => {
  const cases: [string, string[]][] = [
    ['ישר משיק למעגל O בנקודה C', ['מעגל שמרכזו O', 'C על המעגל']],
    ['AB ו AD משיקים למעגל O', ['מעגל שמרכזו O', 'דלתון ABCD חוסם את המעגל']], // the ADR-115 tangency-as-⟂ lowering
    ['חוצה זווית ABC', ['משולש ABC']],
    ['CD חוצה זוית', ['משולש ABC', 'AB=AC']], // ADR-261 vertex bisector
    ['AB מקביל ל CD', ['מרובע ABCD']],
    ['AB מאונך ל CD', ['מרובע ABCD']],
    ['מקבילית ABCD', []], // the shape NOUN contains the מקביל stem — its own lowering satisfies it
  ];
  for (const [u, setup] of cases) {
    it(u, () => {
      const ctx = ctxOf(...setup);
      const r = parse(u, ctx);
      if (!r.ok) throw new Error(`parse failed: ${u} → ${JSON.stringify(r)}`);
      expect(droppedGivenVerbs(u, r.commands)).toEqual([]);
    });
  }
});

describe('#85 (ADR-293) — viewUsable, the never-blank predicate', () => {
  it('usable / empty / non-finite states classify correctly', async () => {
    const { viewUsable } = await import('@/store/geoStore');
    const mk = (pts: [string, { x: number; y: number }][]) =>
      ({ positions: new Map(pts) }) as Parameters<typeof viewUsable>[0];
    expect(viewUsable(mk([['A', { x: 1, y: 2 }]]))).toBe(true);
    expect(viewUsable(mk([]))).toBe(false);
    expect(viewUsable(mk([['A', { x: NaN, y: 2 }]]))).toBe(false);
    expect(viewUsable(mk([['A', { x: 1, y: Infinity }]]))).toBe(false);
  });
});
