/**
 * V0 parser tests — every rule in BOTH languages (the 2-D parity doctrine),
 * prime normalisation, and the honesty refusals (oblique prism, unmatched ratio).
 */

import { describe, expect, it } from 'vitest';
import { labelTokens, normalize3, parse3 } from '../parse3';

const CUBE_IDS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];

function expectSolid(input: string, kind: string, ids: string[]) {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  if (r.ok) expect(r.commands).toEqual([{ type: 'solid', kind, ids }]);
}

describe('tokens & normalisation', () => {
  it('splits glued label runs, keeps primes, ignores latin words', () => {
    expect(labelTokens("ABCDA'B'C'D'")).toEqual(CUBE_IDS);
    expect(labelTokens('Cube ABCD')).toEqual(['A', 'B', 'C', 'D']);
    expect(labelTokens("K on AA' such that AK = 2KA'")).toEqual(['K', 'A', "A'", 'A', 'K', 'K', "A'"]);
  });

  it('normalises the typographic prime U+2032 (and ’) to ASCII \' — ADR-3D-001', () => {
    expect(normalize3('קובייה ABCDA′B′C′D′')).toBe("קובייה ABCDA'B'C'D'");
  });
});

describe('solids', () => {
  it('cube — Hebrew and English, 4 base letters auto-primed', () => {
    expectSolid('קובייה ABCD', 'cube', CUBE_IDS);
    expectSolid('cube ABCD', 'cube', CUBE_IDS);
  });

  it('cube — explicit 8 letters, either spelling, typographic primes', () => {
    expectSolid("קוביה ABCDA'B'C'D'", 'cube', CUBE_IDS);
    expectSolid('Cube ABCDA′B′C′D′', 'cube', CUBE_IDS);
  });

  it('box — Hebrew תיבה and English', () => {
    expectSolid("תיבה ABCDA'B'C'D'", 'box', CUBE_IDS);
    expectSolid('box ABCD', 'box', CUBE_IDS);
  });

  it('right triangular prism — 3 letters auto-primed or 6 explicit', () => {
    const ids = ['A', 'B', 'C', "A'", "B'", "C'"];
    expectSolid('מנסרה ישרה משולשת ABC', 'prism3', ids);
    expectSolid("מנסרה ישרה ABCA'B'C'", 'prism3', ids);
    expectSolid('right triangular prism ABC', 'prism3', ids);
  });

  it('an OBLIQUE prism (no ישרה/right) is refused, not silently assumed right (ADR-052)', () => {
    expect(parse3('מנסרה משולשת ABC')).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse3('prism ABC')).toEqual({ ok: false, reason: 'not-handled' });
  });

  it('a wrong label count is refused', () => {
    expect(parse3('קובייה ABC').ok).toBe(false);
    expect(parse3("קובייה ABCDE'").ok).toBe(false);
  });
});

describe('points on segments', () => {
  it('midpoint — Hebrew and English', () => {
    expect(parse3("M אמצע BB'")).toEqual({
      ok: true,
      commands: [{ type: 'point-on-segment3', id: 'M', a: 'B', b: "B'", t: 0.5 }],
    });
    expect(parse3('M is the midpoint of BC')).toEqual({
      ok: true,
      commands: [{ type: 'point-on-segment3', id: 'M', a: 'B', b: 'C', t: 0.5 }],
    });
  });

  it('stated ratio: AK = 2KA′ ⇒ t = ⅔ from A', () => {
    const he = parse3("K על AA' כך ש-AK = 2KA'");
    expect(he).toEqual({ ok: true, commands: [{ type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 2 / 3 }] });
    const en = parse3("K on AA' such that AK = 2KA'");
    expect(en).toEqual(he);
  });

  it('ratio measured from the far end: A′K = 2KA ⇒ t = ⅓ from A', () => {
    const r = parse3("K על AA' כך ש-A'K = 2KA");
    expect(r).toEqual({ ok: true, commands: [{ type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 1 / 3 }] });
  });

  it('no ratio stated ⇒ a FREE on-segment point (t undefined)', () => {
    expect(parse3("K על AA'")).toEqual({
      ok: true,
      commands: [{ type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: undefined }],
    });
    expect(parse3('P on AB')).toEqual({
      ok: true,
      commands: [{ type: 'point-on-segment3', id: 'P', a: 'A', b: 'B', t: undefined }],
    });
  });

  it('a stated ratio that does not fit the segment is REFUSED, never silently dropped (§6 honesty)', () => {
    expect(parse3("K על AA' כך ש-AB = 2KA'")).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('refusals', () => {
  it('free text and unsupported constructs → not-handled', () => {
    expect(parse3('שלום עולם')).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse3('')).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse3('פירמידה משושה ABCDEFG')).toEqual({ ok: false, reason: 'not-handled' }); // hex pyramid — out of scope
  });
});
