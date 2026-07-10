/**
 * "קוטר מנקודה F" / "diameter from F" — the bare one-label diameter-from-an-on-circle-point form
 * (issue #21). The far endpoint (the antipode) is auto-named (the ADR-263 auto-foot precedent);
 * an existing F not yet a member gets `point-on-circle` (M1). No theft: the cut compound stays with
 * `diameterCutsSegment`, the two-label form stays with `diameter`.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import type { ParseContext } from '../parse';

const ctx: ParseContext = { circles: ['O'], points: ['A', 'B', 'C', 'F', 'O'], circleMembers: [{ id: 'circle-O', center: 'O', points: ['F'] }] };

describe('parser — diameter from a point (bare, no cut clause)', () => {
  for (const u of ['קוטר מנקודה F', 'הקוטר מנקודה F', 'קוטר מ-F', 'הקוטר היוצא מנקודה F', 'diameter from F']) {
    it(`"${u}" parses to a diameter with an auto-named far endpoint`, () => {
      const r = parse(u, ctx);
      expect(r.ok, `"${u}" should parse`).toBe(true);
      if (!r.ok) return;
      const dia = r.commands.find((c) => c.type === 'diameter');
      expect(dia).toBeDefined();
      if (dia?.type !== 'diameter') return;
      expect(dia.id1).toBe('F');
      expect(dia.circle).toBe('circle-O');
      // The far endpoint is a FRESH label — never one of the figure's existing points.
      expect(ctx.points).not.toContain(dia.id2);
      expect(dia.id2).not.toBe('F');
    });
  }

  it('an EXISTING F not yet a member gets point-on-circle (M1); a member does not', () => {
    const nonMember: ParseContext = { circles: ['O'], points: ['F', 'O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] };
    const r1 = parse('קוטר מנקודה F', nonMember);
    expect(r1.ok && r1.commands.some((c) => c.type === 'point-on-circle' && c.id === 'F')).toBe(true);
    const r2 = parse('קוטר מנקודה F', ctx); // F already a member
    expect(r2.ok && !r2.commands.some((c) => c.type === 'point-on-circle' && c.id === 'F')).toBe(true);
  });

  it('the implicit circle resolves when the figure has exactly one (ADR-029)', () => {
    const r = parse('diameter from F', { circles: ['O'], points: ['F'] });
    expect(r.ok && r.commands.some((c) => c.type === 'diameter' && c.circle === 'circle-O')).toBe(true);
  });

  it('no circle in the figure and none named → not handled (escalates honestly)', () => {
    expect(parse('קוטר מנקודה F', { circles: [], points: [] }).ok).toBe(false);
  });

  it('no theft: the cut compound "קוטר מנקודה F חותך את AC בנקודה E" stays with diameterCutsSegment', () => {
    const r = parse('הקוטר מנקודה F חותך את AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // diameterCutsSegment's shape: a line-line-intersection through the centre, not a bare `diameter`.
    expect(r.commands.some((c) => c.type === 'line-line-intersection' && c.id === 'E')).toBe(true);
    expect(r.commands.some((c) => c.type === 'diameter')).toBe(false);
  });

  it('no theft: the two-label "FD קוטר" stays the named-antipode diameter', () => {
    const r = parse('FD קוטר', { circles: ['O'], points: ['F', 'O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dia = r.commands.find((c) => c.type === 'diameter');
    expect(dia?.type === 'diameter' && dia.id1 === 'F' && dia.id2 === 'D').toBe(true);
  });
});
