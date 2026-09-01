/**
 * #837 — a declarative NOUN PREFIX on a statement that builds bare.
 *
 * Prod sessions `fwynr5ws` + `8p8o74z2` (log-triage 2026-08-30, one user, six refusals across two
 * sessions working the same prism exercise):
 *
 * ```
 * AA'=(k-1, k-7, k+1)                            ✓ inject-pair
 * ישר AA'=(k-1,k-7, k+1)                         ✗ not-handled
 * משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)    ✓ line3, on-line, on-line
 * AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)            ✗ not-handled
 * ישר AC x=(8,-1,-1)+t(k+1,0,k-3)                ✓ line3, on-line, on-line   (#815)
 * ```
 *
 * Session `8p8o74z2` shows the cost directly: five consecutive refusals on the «ישר» / «על הישר»
 * spellings, then the student **solved for `k` by hand** and typed `t(3,0,-1)` to get past the tool.
 * The figure they ended with no longer carries the symbolic parameter their exercise is about — which is
 * why this file asserts the SYMBOL survives, not merely that the line parses.
 *
 * The asymmetry is the defect's signature: `ישר AC x=…` parses (a rule-level tolerance added by #815)
 * while `ישר AA'=…` does not, because the tolerance lives at a RULE and therefore covers whichever lane
 * happened to be fixed. So the fix is a SEAM — a rewrite table over the whole utterance, applied only
 * after every rule has declined, which cannot cover one lane and miss another.
 */
import { describe, it, expect } from 'vitest';
import { parse3 } from '../parse3';

const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`expected ${u} to parse, got ${r.reason}`);
  return r.commands;
};

describe("#837 — the prefixed form is IDENTICAL to the canonical one", () => {
  it.each([
    ["ישר AA'=(k-1,k-7, k+1)", "AA'=(k-1,k-7, k+1)"],
    ["הישר AA'=(k-1,k-7, k+1)", "AA'=(k-1,k-7, k+1)"],
    ['הקטע AB=(1,2,3)', 'AB=(1,2,3)'],
    ['קטע AB=(1,2,3)', 'AB=(1,2,3)'],
    [
      'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)',
      'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)',
    ],
    ['AC על ישר x=(8,-1,-1)+t(k+1,0,k-3)', 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)'],
  ])('%s ≡ %s', (prefixed, canonical) => {
    expect(cmds(prefixed)).toEqual(cmds(canonical));
  });

  it('BOTH lanes are covered — the #815 asymmetry cannot come back', () => {
    // the injection lane and the equation lane, the exact pair that diverged
    expect(cmds("ישר AA'=(k-1,k-7, k+1)").map((c) => c.type)).toEqual(['inject-pair']);
    expect(cmds('AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)').map((c) => c.type)).toEqual([
      'line3',
      'on-line',
      'on-line',
    ]);
    // and the lane #815 already fixed is untouched
    expect(cmds('ישר AC x=(8,-1,-1)+t(k+1,0,k-3)').map((c) => c.type)).toEqual([
      'line3',
      'on-line',
      'on-line',
    ]);
  });
});

describe('#837 — the SYMBOLIC parameter survives (what the student lost)', () => {
  it("«ישר AA'=(k-1,k-7,k+1)» keeps k — it does not need solving by hand first", () => {
    const [c] = cmds("ישר AA'=(k-1,k-7, k+1)") as [{ type: string; symExprs?: { sym: string }[] }];
    expect(c.type).toBe('inject-pair');
    expect(c.symExprs, 'the components are symbolic in k').toBeDefined();
    expect(c.symExprs!.every((e) => e.sym === 'k')).toBe(true);
  });

  it('«AC על הישר x=…+t(k+1,0,k-3)» keeps k in the direction vector', () => {
    const [line] = cmds('AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)') as [
      { type: string; dir: { k: number; p: number }[] },
    ];
    expect(line.type).toBe('line3');
    // p !== 0 marks a component that depends on the parameter — two of the three do
    expect(line.dir.filter((d) => d.p !== 0)).toHaveLength(2);
  });
});

describe('#837 — the seam is NARROW: it must not swallow its neighbours', () => {
  it('«וקטור» is NOT a decorative prefix — it distinguishes a vector from a length', () => {
    // «וקטור AB = …» and «|AB| = …» are different statements; the ambiguous-vector-length guard exists
    // to keep them apart, so `וקטור` is deliberately absent from the strip list.
    expect(cmds('וקטור AB = (1,2,3)').map((c) => c.type)).toEqual(['inject-pair']);
    const bare = parse3('AB = CD');
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.reason).toBe('ambiguous-vector-length');
  });

  it('a noun that is the SUBJECT, not a prefix, is untouched', () => {
    expect(cmds('ישר ℓ1').map((c) => c.type)).toEqual(['free-line']);
    expect(cmds('קטע AB').map((c) => c.type)).toEqual(['segment3']);
  });

  it('the rewrite only fires where a rule DECLINED — a parsing line is never re-read', () => {
    // every canonical form below parses on the first pass; asserting them here pins that the seam,
    // which runs last, cannot have altered any of them.
    for (const u of ["AA'=(k-1,k-7, k+1)", 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)', 'קטע AB']) {
      expect(parse3(u).ok, u).toBe(true);
    }
  });

  it('an unrelated «על» statement is not rewritten into a line equation', () => {
    // «AC על המישור ABC» is a plane containment, not a line equation — the rewrite requires «ישר».
    const r = parse3('AC על המישור ABC');
    if (r.ok) expect(r.commands.map((c) => c.type)).not.toContain('line3');
  });
});
