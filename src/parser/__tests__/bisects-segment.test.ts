/**
 * SEGMENT bisection «CD חוצה את AB» / "CD bisects AB" (issue #240, ADR-382): an ADR-110 macro —
 * midpoint of the object segment + `set-line [subject, M, subject]` (collinear + between) + the
 * ADR-383 `segments-cross` requirement (bisection IS a crossing statement). The ANGLE sense of חוצה
 * (ADR-261) keeps every angle-keyword utterance; אנך אמצעי keeps the ⊥-bisector.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import type { ParseContext } from '../parse';

const cmds = (u: string, ctx?: ParseContext) => {
  const r = parse(u, ctx);
  expect(r.ok, `${u} should parse deterministically`).toBe(true);
  return r.ok ? r.commands : [];
};

describe('bisectsSegment (#240)', () => {
  it('CD חוצה את AB — midpoint of AB + CD through it, crossing required', () => {
    expect(cmds('CD חוצה את AB')).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'segment', a: 'C', b: 'D' },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'segments-cross', a: 'C', b: 'D', c: 'A', d: 'B' },
      { type: 'set-line', points: ['C', 'M', 'D'] },
    ]);
  });

  it('the mirrored order AB חוצה את CD bisects CD (subject/object by position, both log orders)', () => {
    expect(cmds('AB חוצה את CD')).toEqual([
      { type: 'segment', a: 'C', b: 'D' },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'M', a: 'C', b: 'D' },
      { type: 'segments-cross', a: 'A', b: 'B', c: 'C', d: 'D' },
      { type: 'set-line', points: ['A', 'M', 'B'] },
    ]);
  });

  it('English "CD bisects AB" and the noun forms parse identically', () => {
    expect(cmds('CD bisects AB')).toEqual(cmds('CD חוצה את AB'));
    expect(cmds('CD bisects the segment AB')).toEqual(cmds('CD חוצה את הקטע AB'));
  });

  it('an explicit «בנקודה K» / "at K" pins the midpoint label', () => {
    expect(cmds('CD חוצה את AB בנקודה K').find((c) => c.type === 'midpoint')).toEqual({ type: 'midpoint', id: 'K', a: 'A', b: 'B' });
    expect(cmds('CD bisects AB at K').find((c) => c.type === 'midpoint')).toEqual({ type: 'midpoint', id: 'K', a: 'A', b: 'B' });
  });

  it('the auto label skips taken letters (ADR-263 freeLabel)', () => {
    const ctx: ParseContext = { points: ['A', 'B', 'C', 'D', 'M'] };
    expect(cmds('CD חוצה את AB', ctx).find((c) => c.type === 'midpoint')).toEqual({ type: 'midpoint', id: 'N', a: 'A', b: 'B' });
  });

  it('an EXISTING midpoint of the object segment is reused, never re-minted (M1)', () => {
    const ctx: ParseContext = { points: ['A', 'B', 'C', 'D', 'M'], midpointOf: { M: ['A', 'B'] }, neighbors: { A: ['B'], B: ['A'] } };
    const out = cmds('CD חוצה את AB', ctx);
    expect(out.some((c) => c.type === 'midpoint')).toBe(false);
    expect(out.find((c) => c.type === 'set-line')).toEqual({ type: 'set-line', points: ['C', 'M', 'D'] });
  });

  // ── no-theft: the sibling senses keep their utterances byte-identically ──
  it('the ANGLE sense is untouched: «CD חוצה זוית ACB» still lowers to the ADR-261 bisector chain', () => {
    const out = cmds('CD חוצה זוית ACB');
    expect(out.some((c) => c.type === 'bisector')).toBe(true);
    expect(out.some((c) => c.type === 'segments-cross' || c.type === 'midpoint')).toBe(false);
  });

  it('the ⊥-bisector is untouched: «CD אנך אמצעי ל-AB» keeps its own lowering', () => {
    const out = cmds('CD אנך אמצעי ל-AB');
    expect(out.some((c) => c.type === 'perpendicular-line')).toBe(true);
    expect(out.some((c) => c.type === 'set-line')).toBe(false);
  });

  it('a non-bare subject defers: «המשך CD חוצה את AB» is not claimed (escalates honestly)', () => {
    expect(parse('המשך CD חוצה את AB').ok).toBe(false);
  });

  it('a shared endpoint is not a segment bisection («AB חוצה את AC» defers)', () => {
    const r = parse('AB חוצה את AC');
    if (r.ok) expect(r.commands.some((c) => c.type === 'segments-cross')).toBe(false);
  });
});
