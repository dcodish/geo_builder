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

describe('#226 — OPERAND accounting: a family token bound to the WRONG operands is a dropped given', () => {
  it('the exact P1 (prod 0yqufnuv 11:39): «AD משיק למעגל» lowered to a tangent line at endpoint A only', () => {
    const llm: AnyCommand[] = [{ type: 'tangent', id: 'tan-A', circle: 'circle-O', at: 'A', visible: true } as AnyCommand];
    expect(droppedGivenVerbs('AD משיק למעגל', llm)).toEqual(['משיק/tangent']);
    expect(droppedGivenVerbs('AD tangent to the circle', llm)).toEqual(['משיק/tangent']);
  });
  it('the class, parallel/perpendicular/bisect editions: evidence bound to OTHER labels does not account', () => {
    const wrongPar: AnyCommand[] = [{ type: 'set-parallel', a: 'X', b: 'Y', c: 'B', d: 'C' } as AnyCommand];
    expect(droppedGivenVerbs('FG מקביל ל BC', wrongPar)).toEqual(['מקביל/parallel']);
    const wrongPerp: AnyCommand[] = [{ type: 'set-perpendicular', a: 'X', b: 'Y', c: 'C', d: 'B' } as AnyCommand];
    expect(droppedGivenVerbs('DE מאונך ל CB', wrongPerp)).toEqual(['מאונך/perpendicular']);
    const wrongBis: AnyCommand[] = [{ type: 'bisector', id: 'bis-XYZ', vertex: 'Y', p: 'X', q: 'Z', visible: true } as AnyCommand];
    expect(droppedGivenVerbs('CD חוצה זוית', wrongBis)).toEqual(['חוצה/bisect']);
  });
  it('the #203 tangency lowering (foot-from-centre + membership, no tangent token) IS evidence — the false-block that pushed prod to the LLM', () => {
    const det: AnyCommand[] = [
      { type: 'segment', a: 'A', b: 'D' },
      { type: 'foot', id: '@tang-O-A-D', from: '@ctr-O', a: 'A', b: 'D' },
      { type: 'point-on-circle', id: '@tang-O-A-D', circle: 'circle-O' },
      { type: 'set-line', points: ['A', '@tang-O-A-D', 'D'] },
    ] as AnyCommand[];
    expect(droppedGivenVerbs('AD משיק למעגל', det)).toEqual([]);
    // an altitude foot that happens to ride a circle is NOT tangency evidence (foot.from ≠ the centre)
    const altFoot: AnyCommand[] = [
      { type: 'foot', id: 'H', from: 'C', a: 'A', b: 'D' },
      { type: 'point-on-circle', id: 'H', circle: 'circle-O' },
    ] as AnyCommand[];
    expect(droppedGivenVerbs('AD משיק למעגל', altFoot)).toEqual(['משיק/tangent']);
  });
  it('«AD משיק למעגל בנקודה E» lowers to a tangency constraint ON segment AD with the NAMED touch (the deterministic-rule member, prod 0yqufnuv 11:36)', () => {
    const ctx = ctxOf('מעגל', 'B ו C על המעגל', 'ABCD מלבן');
    for (const u of ['AD משיק למעגל בנקודה E', 'AD tangent to the circle at E']) {
      const r = parse(u, ctx);
      if (!r.ok) throw new Error(`parse failed: ${u}`);
      const foot = r.commands.find((c: AnyCommand) => c.type === 'foot') as { id?: string; a?: string; b?: string } | undefined;
      expect(foot, `${u}: the touch is the ⟂ foot from the centre on AD`).toBeTruthy();
      expect(foot!.id, `${u}: the touch carries the student's label`).toBe('E');
      expect([foot!.a, foot!.b].sort()).toEqual(['A', 'D']);
      expect(r.commands.some((c: AnyCommand) => c.type === 'point-on-circle' && (c as { id?: string }).id === 'E'), `${u}: E on the circle`).toBe(true);
      expect(r.commands.some((c: AnyCommand) => c.type === 'set-line'), `${u}: the touch lands WITHIN the bare segment (ADR-077)`).toBe(true);
      expect(droppedGivenVerbs(u, r.commands)).toEqual([]);
    }
  });
});

describe('#82 — NO THEFT: legitimate lowerings pass', () => {
  const cases: [string, string[]][] = [
    ['ישר משיק למעגל O בנקודה C', ['מעגל שמרכזו O', 'C על המעגל']],
    ['מנקודה A יוצא משיק למעגל בנקודה B', ['מעגל שמרכזו O']], // issue #138: the SINGULAR external tangent (tangentFromExternal) — a Thales `tanaux-` construction, no literal `tangent` object; ADR-292 regressed it
    ['מנקודה B יוצאים שני משיקים למעגל', ['מעגל שמרכזו O']], // the PLURAL two-tangents (tangentsFromExternal) — same Thales `tanaux-` construction
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
