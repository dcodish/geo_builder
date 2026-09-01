/**
 * #836 — «אלכסון ראשי» ASKS which one.
 *
 * Prod session `u1y60bg6`, the user's entire session, one line:
 *
 *   קובייה ABCD עם אלכסון ראשי   ✗ not-handled → escalated → the LLM built it
 *
 * A cube or box has FOUR space diagonals (AC', BD', CA', DB'), so the role phrase names none of them.
 * The LLM answered by PICKING one — precisely the invented given [ADR-052](../../docs/06-decisions.md#adr-052)
 * forbids. Operator ruling 2026-08-31: *"there is more than one אלכסון ראשי so we should ask user to
 * indicate the letters."*
 *
 * The boundary this file also locks: the DECLARATION form «תיבה מלבנית עם אלכסון תיבה» (#438, two prod
 * users) keeps building. There the student declares a figure and asks for *a* space diagonal
 * indefinitely — #438's lock is deliberately geometric (any of the four satisfies the box identity)
 * because none is meant in particular. This issue is about a DEFINITE reference to *the* main diagonal,
 * which cannot be answered without asking.
 */
import { describe, it, expect } from 'vitest';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3 } from '../engine/types';
import { spaceDiagonals } from '../engine/baseShapes';
import type { Construction3 } from '../engine/types';

function build(lines: string[]): Construction3 {
  let c = emptyConstruction3();
  for (const l of lines) {
    const r = parse3(l);
    if (!r.ok) throw new Error(`did not parse: ${l} (${r.reason})`);
    for (const cmd of r.commands) {
      const a = applyCommand3(c, cmd);
      if (!a.ok) throw new Error(`did not apply: ${l} — ${JSON.stringify(a.error)}`);
      c = a.next;
    }
  }
  return c;
}

describe('#836 — the role phrase asks, and never reaches the LLM', () => {
  it.each(['אלכסון ראשי', 'האלכסון הראשי', 'אלכסון המרחב', 'main diagonal'])(
    '%s returns ambiguous-main-diagonal, NOT not-handled',
    (utterance) => {
      const r = parse3(utterance);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      // `not-handled` is the lane that escalates to the paid LLM, whose job is to guess — which is how
      // this reached prod as a silently-picked diagonal. A refusal implemented as a decline is not a
      // refusal (the #516 lesson, applied here).
      expect(r.reason).toBe('ambiguous-main-diagonal');
    },
  );
});

describe('#836 — the candidates are DERIVED from the solid, never hard-coded', () => {
  it('a box yields its four space diagonals, in ring order', () => {
    expect(spaceDiagonals([['A', 'B', 'C', 'D'], ["A'", "B'", "C'", "D'"], ['A', 'B', "B'", "A'"]])).toEqual([
      ['A', "C'"],
      ['B', "D'"],
      ['C', "A'"],
      ['D', "B'"],
    ]);
  });

  it('a PYRAMID has none — its apex is adjacent to every base vertex', () => {
    expect(spaceDiagonals([['A', 'B', 'C', 'D'], ['A', 'B', 'S'], ['B', 'C', 'S']])).toEqual([]);
  });

  it('an ODD prism has no vertex directly across — none, rather than a near-miss called "the main one"', () => {
    expect(spaceDiagonals([['A', 'B', 'C'], ['D', 'E', 'F']])).toEqual([]);
  });

  it('it reads the real solid built by the parser, not a fixture', () => {
    const c = build(['קובייה']);
    const pairs = spaceDiagonals(c.solids[0].faces).map(([a, b]) => `${a}${b}`);
    expect(pairs).toHaveLength(4);
    expect(pairs).toContain("AC'");
    // and none of them is a face diagonal or an edge
    for (const [a, b] of spaceDiagonals(c.solids[0].faces)) {
      expect(c.solids[0].faces.some((f) => f.includes(a) && f.includes(b)), `${a}${b} is not on a face`).toBe(false);
    }
  });
});

describe('#836 — WITH letters it simply builds, through the EXISTING family rule', () => {
  it("«אלכסון ראשי AC'» lowers to EXACTLY what «אלכסון AC'» lowers to — the role word is redundant", () => {
    // The issue's requirement, literally: "«אלכסון ראשי AC'» must lower exactly as «אלכסון AC'» does —
    // the role word is then redundant, not an error." So the ROLE qualifier joined `bareSegment`'s own
    // alternation (the #449 family: «אלכסון תיבה AC'», "space diagonal AC'") rather than getting a
    // parallel path. One rule, one lowering.
    const role = parse3("אלכסון ראשי AC'");
    const plain = parse3("אלכסון AC'");
    expect(role.ok && plain.ok).toBe(true);
    if (!role.ok || !plain.ok) return;
    expect(role.commands).toEqual(plain.commands);
    expect(role.commands).toEqual([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
  });

  it("«אלכסון המרחב AC'» joins the same family", () => {
    const r = parse3("אלכסון המרחב AC'");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands).toEqual([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
  });

  it('and it draws on a real cube', () => {
    const c = build(['קובייה', "אלכסון ראשי AC'"]);
    expect(c.segments).toEqual([['A', "C'"]]);
  });

  it("the #449 siblings are byte-identical to before — the family rule was EXTENDED, not rewritten", () => {
    for (const u of ["space diagonal AC'", "main diagonal AC'", "the space diagonal of the box AC'", "diagonal AC'"]) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands, u).toEqual([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
    }
  });
});

describe('#836 — the #438 declaration form is NOT touched', () => {
  it.each([
    'תיבה מלבנית עם אלכסון תיבה',
    'קובייה עם אלכסון קובייה',
    'a box with a space diagonal',
  ])('%s still builds solid + segment (an INDEFINITE request: any space diagonal materialises it)', (line) => {
    const r = parse3(line);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toEqual(['solid', 'segment3']);
  });

  it("«אלכסון AC'» without the role word is unchanged", () => {
    const r = parse3("אלכסון AC'");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toEqual(['segment3']);
  });
});
