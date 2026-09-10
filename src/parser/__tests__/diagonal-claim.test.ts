/**
 * #966 (ADR-499) — the parser RECORDS the «אלכסון» role claim instead of eating the noun.
 *
 * The word used to be stripped as filler alongside «קטע»/`segment`/«חבר`, so by the time the command
 * reached the engine there was nothing left to say the student had claimed anything. Recording it is
 * what makes the claim checkable; the segment drawn is byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../index';

const cmds = (u: string, ctx: object = {}) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands;
};
/** The segment command a spelling lowers to. Typed locally so the claim flag is readable in assertions. */
type SegCmd = { type: 'segment'; a: string; b: string; diagonal?: true };
const seg = (u: string, ctx: object = {}) => cmds(u, ctx).find((c) => c.type === 'segment') as unknown as SegCmd;
const segs = (u: string, ctx: object = {}) => cmds(u, ctx).filter((c) => c.type === 'segment') as unknown as SegCmd[];

describe('#966 — a diagonal claim is recorded, a plain segment is not', () => {
  it.each([
    ['Hebrew', 'אלכסון AC'],
    ['Hebrew, definite', 'האלכסון AC'],
    ['English', 'diagonal AC'],
    ['English, definite', 'the diagonal AC'],
  ])('%s carries diagonal: true', (_l, u) => {
    expect(seg(u)).toMatchObject({ type: 'segment', a: 'A', b: 'C', diagonal: true });
  });

  it.each([
    ['Hebrew segment', 'קטע AC'],
    ['English segment', 'segment AC'],
    ['connect', 'חבר A C'],
    ['bare pair', 'AC'],
  ])('%s does NOT — the noun is the claim', (_l, u) => {
    expect(seg(u).diagonal).toBeUndefined();
  });

  it('the two-named-diagonals form makes the claim twice', () => {
    // «AC ו-BD אלכסוני הריבוע» names both explicitly, so both are claims. Form (B) — «אלכסונים», which
    // DERIVES the pairs from the ring — is correct by construction and carries no claim to check.
    const out = segs('AC ו-BD אלכסוני הריבוע', { polygons: [['A', 'B', 'C', 'D']] });
    expect(out).toHaveLength(2);
    for (const c of out) expect(c).toMatchObject({ diagonal: true });
  });

  it('the DERIVED plural form carries no claim', () => {
    const out = segs('אלכסונים', { polygons: [['A', 'B', 'C', 'D']] });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(c.diagonal).toBeUndefined();
  });

  it('the segment itself is unchanged — the flag adds a claim, it does not alter the drawing', () => {
    const withNoun = seg('אלכסון AC');
    const plain = seg('קטע AC');
    expect({ ...withNoun, diagonal: undefined }).toEqual({ ...plain, diagonal: undefined });
  });
});
