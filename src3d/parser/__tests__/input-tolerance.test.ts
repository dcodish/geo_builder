/**
 * The INPUT-TOLERANCE cluster — #494 (a detached clitic) and #380 (a 3–4-label plane run).
 *
 * One class, twice: **a rule spells ONE form of something the student writes in several**, and the
 * failure is silent-cost rather than visible — the utterance escalates to the LLM, which usually
 * answers, so prod looks fine while every occurrence burns a paid call for a non-deterministic result.
 *
 * #494 — `ל ב מ ה ש כ` are clitic PREFIXES, and every gate in this tree spells them glued (`ל?מישור`,
 * `ב-?`). «מקביל ל π1» was not-handled while «מקביל לπ1» parsed. The spaced form is not a typo: a
 * Hebrew writer separates the prefix exactly when the operand is a SYMBOL rather than a word, because
 * «לπ1» looks wrong — so the failing spelling is the natural keystroke in precisely the figures that
 * need it. Fixed by re-binding the clitic at `normalize3`, the one boundary every rule reads, so a rule
 * added later inherits the tolerance instead of re-learning it one report at a time.
 *
 * #380 — a plane named by a point RUN is three OR four labels (`RUN_3_4`, the shape this product uses
 * everywhere). The ∥ rule spelled three inline and REJECTED a box face; the ⟂ rule matched an optional
 * fourth label and then DISCARDED it, committing the triangle ABC for a stated ABCD under a green ✓ —
 * and `apply` had its own `plane.length === 3` gate, so the honest 4-point form would have refused
 * `no-solution`. The truncation was covering for the refusal. The filed diagnosis blamed PRIMED labels;
 * measurement says primes were always fine (`A'B' ⟂ ABC` parses) and the arity was the cause — recorded
 * because the wrong hypothesis is the interesting part of the bug.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG_3D } from '../catalog3';
import { normalize3, parse3 } from '../parse3';

const cmds = (u: string) => {
  const r = parse3(u);
  return r.ok ? r.commands : null;
};

describe('#494 — a DETACHED clitic re-binds to its operand', () => {
  it('the reported pair now agree, and so does every frame around them', () => {
    for (const [spaced, glued] of [
      ['l מקביל ל π1', 'l מקביל לπ1'],
      ['הישר l מקביל ל מישור π1', 'הישר l מקביל למישור π1'],
      ['B על ה מישור π2', 'B על המישור π2'],
    ] as const) {
      expect(cmds(spaced), spaced).not.toBeNull();
      expect(cmds(spaced), `${spaced} ≡ ${glued}`).toEqual(cmds(glued));
    }
  });

  it('the fold is at normalize3 — one boundary, every rule', () => {
    expect(normalize3('l מקביל ל π1')).toBe('l מקביל לπ1');
    expect(normalize3('B על ה מישור π2')).toBe('B על המישור π2');
    // idempotent: folding an already-glued form changes nothing
    expect(normalize3(normalize3('l מקביל ל π1'))).toBe(normalize3('l מקביל ל π1'));
  });

  it('«ו» is NOT folded — it is the conjunction between labels, not a prefix', () => {
    // Gluing it would corrupt every label list in the grammar («A ו B» → «A וB»).
    expect(normalize3('הנקודות A ו B')).toBe('הנקודות A ו B');
  });

  it('a clitic letter INSIDE a word is untouched (the fold needs a standalone token)', () => {
    for (const u of ['מקביל למישור π1', 'משולש ABC', 'הישר ℓ', 'מנסרה ישרה']) {
      expect(normalize3(u), u).toBe(u);
    }
  });

  // The CONFORMANCE property #494 asked for, derived from the catalog rather than enumerated: a frame
  // added later inherits it without anyone editing a table here.
  it('CATALOG-WIDE: detaching a clitic never changes the parse', () => {
    // The split points are DERIVED from the corpus, not listed: a Hebrew word whose leading clitic can
    // be removed to leave a word the catalog itself uses standalone («למישור» → «ל» + «מישור», and
    // «מישור» is attested) is a prefix+noun; anything else is one word that happens to start with that
    // letter («מקביל»). So the generator needs no vocabulary of its own and grows with the catalog.
    const words = new Set<string>();
    for (const e of COMMAND_CATALOG_3D) for (const m of e.he.match(/[א-ת]+/g) ?? []) words.add(m);
    const detach = (ex: string): string =>
      ex.replace(/(?<![א-ת])([לבמהשכ])([א-ת]{2,})/g, (whole, cl: string, rest: string) => (words.has(rest) ? `${cl} ${rest}` : whole));

    const mismatches: string[] = [];
    let checked = 0;
    for (const e of COMMAND_CATALOG_3D) {
      const spaced = detach(e.he);
      if (spaced === e.he) continue;
      checked++;
      if (JSON.stringify(cmds(spaced)) !== JSON.stringify(cmds(e.he))) mismatches.push(`«${e.he}» ≠ «${spaced}»`);
    }
    expect(mismatches, `a detached clitic changes the parse:\n  ${mismatches.join('\n  ')}`).toEqual([]);
    expect(checked, 'the generator produced no variants — the catalog or the pattern changed').toBeGreaterThan(10);
  });
});

describe('#380 — a point-run plane is THREE OR FOUR labels, in both relation frames', () => {
  it('∥ accepts the box FACE it used to reject outright', () => {
    // #821 (ADR-3D-177 Am. 1): ∥ now draws the ring too, so the relation is the LAST command (as for ⟂)
    expect(cmds('AB מקביל למישור ABCD')?.at(-1)).toMatchObject({ type: 'seg-plane-rel', rel: 'parallel', plane: ['A', 'B', 'C', 'D'] });
    expect(cmds("AB מקביל למישור DCC'D'")?.at(-1)).toMatchObject({ type: 'seg-plane-rel', plane: ['D', 'C', "C'", "D'"] });
    expect(cmds("A'B' מקביל למישור ABCD")?.at(-1)).toMatchObject({ type: 'seg-plane-rel', a: "A'", b: "B'", plane: ['A', 'B', 'C', 'D'] });
    expect(cmds('AB מקביל למישור ABCD')?.filter((c) => c.type === 'segment3')).toHaveLength(4);
  });

  it('⟂ CARRIES the fourth label instead of silently dropping it', () => {
    expect(cmds("A'B' מאונך למישור ABCD")?.at(-1)).toMatchObject({ type: 'seg-plane-rel', rel: 'perp', plane: ['A', 'B', 'C', 'D'] });
    // …and draws the ring the student named, at whatever arity they named it
    expect(cmds("A'B' מאונך למישור ABCD")?.filter((c) => c.type === 'segment3')).toHaveLength(4);
    expect(cmds('AB מאונך למישור ACD')?.filter((c) => c.type === 'segment3')).toHaveLength(3);
  });

  it('the 3-label forms are unchanged (primes were never the problem)', () => {
    expect(cmds("A'B' מקביל למישור ABC")?.at(-1)).toMatchObject({ type: 'seg-plane-rel', plane: ['A', 'B', 'C'] });
    expect(cmds('AB מקביל למישור ABC')?.at(-1)).toMatchObject({ type: 'seg-plane-rel', plane: ['A', 'B', 'C'] });
  });

  it('English mirrors both arities', () => {
    expect(cmds('AB is parallel to plane ABCD')?.at(-1)).toMatchObject({ type: 'seg-plane-rel', plane: ['A', 'B', 'C', 'D'] });
    expect(cmds('AB is parallel to plane ABC')?.at(-1)).toMatchObject({ type: 'seg-plane-rel', plane: ['A', 'B', 'C'] });
  });
});

/**
 * #513 (ADR-3D-135) — the third member of the cluster, and the third instance of PAREN-BLINDNESS in a
 * scalar reader (#299, #300). `√48` parsed; `√(48)` did not, though parenthesising a radicand is the
 * ordinary way to write it. Same silent-cost shape as #494: the operator needed FOUR attempts and burnt
 * two paid LLM escalations to state one magnitude, and nothing in the UI signals which spelling is
 * required. Fixed at the shared `RADICAND` fragment + `evalRadical` — the one atom and the one reader
 * #510 deliberately paired — so every slot that composes from them gains it at once.
 */
describe('#513 — a PARENTHESISED radicand reads as the bare one, in every slot', () => {
  const value = (u: string) => {
    const cs = cmds(u);
    const claim = cs?.find((c) => c.type === 'claim');
    return claim && 'claim' in claim && 'value' in claim.claim ? claim.claim.value : null;
  };

  it('the operator’s exact utterance parses, and agrees with the spelling that already worked', () => {
    expect(value("|BD'|=√(48)")).toBeCloseTo(Math.sqrt(48), 9);
    expect(value("|BD'|=√(48)")).toBe(value("|BD'|=√48"));
  });

  it('the whole family agrees across spellings — coefficient, divisor, fraction radicand', () => {
    expect(value("|BD'|=2√(3)")).toBe(value("|BD'|=2√3"));
    expect(value("|BD'|=√(48)/4")).toBeCloseTo(Math.sqrt(48) / 4, 9);
    expect(value("|BD'|=√(12/4)")).toBeCloseTo(Math.sqrt(3), 9);
  });

  it('the same atom serves a COORDINATE component — one reader, not one per slot (#510)', () => {
    expect(cmds('C(√(2),1,0)')).toEqual(cmds('C(√2,1,0)'));
    expect(cmds('C(√(2),1,0)')).toMatchObject([{ type: 'point3', id: 'C', x: Math.SQRT2 }]);
  });

  it('a radicand needing ARITHMETIC still refuses honestly — that is #509’s reader, not a fourth branch', () => {
    expect(cmds("|BD'|=√(4*3)")).toBeNull();
  });

  it('the forms that already worked are byte-identical (no widening of what a scalar means)', () => {
    expect(value("|BD'|=√48")).toBeCloseTo(Math.sqrt(48), 9);
    expect(value("|BD'|=2√3")).toBeCloseTo(2 * Math.sqrt(3), 9);
    expect(value("|BD'|=√6/4")).toBeCloseTo(Math.sqrt(6) / 4, 9);
    expect(value("|BD'|=5")).toBe(5);
    expect(value("|BD'|=2.5")).toBe(2.5);
  });
});
