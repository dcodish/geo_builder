/**
 * Keyboard `<` as the angle symbol (issue #237, ADR-381): the `normalizeUtterance` orth pass rewrites a
 * PREFIX `<` — followed by an uppercase label run (1–3 labels), not preceded by an operand — to `∠`, so
 * EVERY angle-consuming rule gains the notation at once. The infix comparison uses stay untouched:
 * `AB < CD` (length order, ADR-158), `α<β` (measure order), `R<r` (radius order, #54), `k < 0`.
 */
import { describe, expect, it } from 'vitest';
import { normalizeUtterance, parse } from '../parse';

const cmds = (u: string) => {
  const r = parse(u);
  expect(r.ok, `${u} should parse`).toBe(true);
  return r.ok ? r.commands : [];
};

describe('normalizeAngleBracket (#237)', () => {
  it('rewrites the prefix forms to ∠', () => {
    expect(normalizeUtterance('<ACB = 40')).toBe('∠ACB = 40');
    expect(normalizeUtterance('<ACB=<BED')).toBe('∠ACB=∠BED');
    expect(normalizeUtterance('< ACB = < BED')).toBe('∠ ACB = ∠ BED');
    expect(normalizeUtterance('<C=<BED')).toBe('∠C=∠BED');
    expect(normalizeUtterance('זווית ABC = <DEF')).toBe('זווית ABC = ∠DEF');
  });

  it('an angle VALUE typed with < parses exactly like the ∠ form', () => {
    expect(cmds('<ACB = 40')).toEqual(cmds('∠ACB = 40'));
  });

  it('an angle EQUALITY typed with < parses exactly like the ∠ form (ADR-100 → set-angle-ratio)', () => {
    expect(cmds('<ACB=<BED')).toEqual(cmds('∠ACB=∠BED'));
    expect(cmds('<ACB=<BED').some((c) => c.type === 'set-angle-ratio')).toBe(true);
  });

  it('a single-vertex < form tracks whatever the ∠ single-vertex form does (the #235 boundary)', () => {
    // Equivalence, not a green build: single-vertex EQUALITY semantics is issue #235's scope. This
    // locks only that the NOTATION reaches the same place the ∠ spelling reaches.
    expect(JSON.stringify(parse('<C=<BED'))).toBe(JSON.stringify(parse('∠C=∠BED')));
  });

  // ── no-theft: every infix comparison stays a comparison ──
  it('length order AB < DC is untouched (ADR-158)', () => {
    expect(normalizeUtterance('AB < DC')).toBe('AB < DC');
    expect(cmds('AB<DC').some((c) => c.type === 'set-length-order')).toBe(true);
  });

  it('measure order α<β / x<y is untouched', () => {
    expect(normalizeUtterance('α<β')).toBe('α<β');
    expect(cmds('x<y')[0]).toEqual({ type: 'measure-order', left: 'x', op: '<', right: 'y' });
  });

  it('radius order R<r and a sign given k < 0 are untouched', () => {
    expect(normalizeUtterance('R<r')).toBe('R<r');
    expect(normalizeUtterance('k < 0')).toBe('k < 0');
  });

  it('a 4-label run after < is not an angle (uppercase run must be 1–3 labels)', () => {
    expect(normalizeUtterance('<ABCD')).toBe('<ABCD');
  });
});

/**
 * The MIRROR half — operator ruling, 2026-08-09 (#460).
 *
 * Only `<` is the keyboard stand-in for `∠`; `>` is never an angle. The invariant held from the day
 * ADR-381 landed, but purely by omission — nothing asserted it, and this file's eight cases were all
 * about `<`. That matters because the input box is RTL Hebrew, where a typed angle bracket is visually
 * ambiguous about which way it points: the very argument someone could use to "helpfully" add `>` to the
 * normaliser later, silently turning every `DE > FG` length comparison into an angle. Locked here.
 */
describe('the mirror bracket is NOT an angle (#460)', () => {
  it('a prefix > is left alone by the orth pass', () => {
    for (const u of ['>BAC = 50', '>A=50', '> BAC = 50']) {
      expect(normalizeUtterance(u), u).toBe(u);
    }
  });

  it('> and < both keep their INFIX comparison meaning', () => {
    expect(cmds('x>y')[0]).toEqual({ type: 'measure-order', left: 'x', op: '>', right: 'y' });
    expect(cmds('x<y')[0]).toEqual({ type: 'measure-order', left: 'x', op: '<', right: 'y' });
  });
});
