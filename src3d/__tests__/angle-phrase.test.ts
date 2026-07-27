/**
 * Issue #337 (ADR-3D-088) — an angle EQUALITY was reachable through only one phrasing.
 *
 * The engine has supported the relation since V8-f / ADR-3D-052 (`angle-pair-eq`, M1-routed: it drives a
 * free-dim solid or verifies a determined figure). But `angleEquality3`'s operand grammar was the glued
 * VERTEX TRIPLE alone (`∠SAB`), so the textbook's between-form —
 *
 *   «נתון שהזווית שבין הוקטור BE לבין הוקטור BC' שווה לזווית שבין הוקטור BE לבין הוקטור BA'»
 *
 * — reached no rule and fell to the LLM. docs/17 §2.2: one relation, one phrasing.
 *
 * Fix (parser only): a shared angle-phrase atom that reads BOTH surface forms into the same pair of arm
 * vectors, used on both sides of the equality; plus the given-framing prefix, which the shared statement
 * stripper now handles alongside the proof framing it already did.
 */

import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import type { Command3 } from '../engine/types';

const cmds = (u: string): Command3[] => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${JSON.stringify(r)}`);
  return r.commands;
};
const pairEq = (u: string) => cmds(u).find((c) => c.type === 'angle-pair-eq') as
  | Extract<Command3, { type: 'angle-pair-eq' }>
  | undefined;

describe('#337 — the between-form angle equality', () => {
  const HE = "הזווית שבין הוקטור BE לבין הוקטור BC' שווה לזווית שבין הוקטור BE לבין הוקטור BA'";
  const EN = "the angle between vector BE and vector BC' = the angle between vector BE and vector BA'";

  for (const [lang, u] of [['He', HE], ['En', EN]] as const) {
    it(`${lang}: lowers to angle-pair-eq over the four arm vectors`, () => {
      const eq = pairEq(u);
      expect(eq).toBeDefined();
      expect(eq!.a).toEqual({ kind: 'pair', from: 'B', to: 'E' });
      expect(eq!.b).toEqual({ kind: 'pair', from: 'B', to: "C'" });
      expect(eq!.c).toEqual({ kind: 'pair', from: 'B', to: 'E' });
      expect(eq!.d).toEqual({ kind: 'pair', from: 'B', to: "A'" });
    });
  }

  it("the exact corpus wording, with its «נתון ש» given-framing, parses identically", () => {
    expect(pairEq(`נתון ש${HE}`)).toEqual(pairEq(HE));
  });

  it('the noun prefix is interchangeable — vector / line / segment / none', () => {
    const base = pairEq('הזווית שבין AB לבין AC שווה לזווית שבין AB לבין AD');
    expect(base).toBeDefined();
    for (const noun of ['הוקטור', 'הישר', 'הקטע']) {
      expect(pairEq(`הזווית שבין ${noun} AB לבין ${noun} AC שווה לזווית שבין ${noun} AB לבין ${noun} AD`)).toEqual(base);
    }
  });

  it('a DECLARED vector operand works too, and draws no segments', () => {
    const c = cmds('the angle between u and v = the angle between u and w');
    expect(c.some((x) => x.type === 'segment3')).toBe(false);
    expect(pairEq('the angle between u and v = the angle between u and w')).toMatchObject({
      a: { kind: 'named', name: 'u' },
      b: { kind: 'named', name: 'v' },
      c: { kind: 'named', name: 'u' },
      d: { kind: 'named', name: 'w' },
    });
  });

  it('a between-form draws its named segments and marks the shared wedge', () => {
    const c = cmds(HE);
    expect(c.filter((x) => x.type === 'segment3')).toHaveLength(4);
    const marks = c.filter((x) => x.type === 'angle-mark');
    expect(marks).toHaveLength(2); // both arms share tail B, so both wedges are markable
    expect(marks[0]).toMatchObject({ vertex: 'B', p: 'E', q: "C'" });
  });

  it('the two forms MIX across the equality', () => {
    const eq = pairEq('∠SAB שווה לזווית שבין הישר AS לבין הישר AD');
    expect(eq).toBeDefined();
    expect(eq!.a).toEqual({ kind: 'pair', from: 'A', to: 'S' });
    expect(eq!.d).toEqual({ kind: 'pair', from: 'A', to: 'D' });
  });
});

describe('#337 — the forms that must NOT change', () => {
  it('the vertex triple lowers exactly as before (both spellings)', () => {
    const expected = [
      { type: 'angle-mark', vertex: 'A', p: 'S', q: 'B' },
      { type: 'angle-mark', vertex: 'A', p: 'S', q: 'D' },
      {
        type: 'angle-pair-eq',
        a: { kind: 'pair', from: 'A', to: 'S' },
        b: { kind: 'pair', from: 'A', to: 'B' },
        c: { kind: 'pair', from: 'A', to: 'S' },
        d: { kind: 'pair', from: 'A', to: 'D' },
      },
    ];
    expect(cmds('∠SAB = ∠SAD')).toEqual(expected);
    // the word form regressed once during this fix (a template literal ate its \s) — locked explicitly
    expect(cmds('זווית SAB שווה לזווית SAD')).toEqual(expected);
    expect(cmds('angle SAB = angle SAD')).toEqual(expected);
  });

  it('the chained naming form still labels both marks and states no separate equality', () => {
    const c = cmds('∠SAB = ∠SAD = α');
    expect(c).toEqual([
      { type: 'angle-mark', vertex: 'A', p: 'S', q: 'B', label: 'α' },
      { type: 'angle-mark', vertex: 'A', p: 'S', q: 'D', label: 'α' },
    ]);
  });

  it('a NUMERIC right-hand side still routes to the claim, not the equality', () => {
    for (const u of ['הזווית שבין הישר AB לבין הישר AC היא 90', '∠SAB = 82']) {
      const c = cmds(u);
      expect(c.some((x) => x.type === 'angle-pair-eq'), u).toBe(false);
      expect(c.some((x) => x.type === 'claim'), u).toBe(true);
    }
  });

  it('an angle needs three distinct points / two distinct endpoints', () => {
    expect(parse3('∠SAA = ∠SAD').ok).toBe(false);
    expect(parse3('הזווית שבין BB לבין BC שווה לזווית שבין BE לבין BA').ok).toBe(false);
  });
});
