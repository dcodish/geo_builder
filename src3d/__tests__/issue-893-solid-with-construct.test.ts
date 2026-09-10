/**
 * #893 ([ADR-3D-237](../../docs/06b-decisions-3d.md)) — «<solid> ABCD עם <construct>»: the 3-D half of
 * the shape-plus-construct family.
 *
 * Prod log triage 2026-09-03, carried since 2026-08-30. This is not a new gap but an EXPIRED DEFERRAL:
 * ADR-3D-200 (#836) and ADR-3D-199 (#834) both parked this exact line by name — *"the user's full line
 * «קובייה ABCD עם אלכסון ראשי» additionally needs the shape-plus-construct family (#461) and resolves
 * through both once that lands"*. #461 landed 2026-09-02 as `feat(2d)` ONLY and closed, so the promise
 * outlived the issue carrying it and the row stayed `not-handled` → escalated → the LLM silently picked
 * one of four space diagonals.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';

const types = (u: string): string[] => {
  const r = parse3(u);
  return r.ok ? r.commands.map((c) => c.type) : [];
};
const reason = (u: string): string | null => {
  const r = parse3(u);
  return r.ok ? null : r.reason;
};
const CUBE = "קובייה ABCDA'B'C'D'";
const BOX = "תיבה ABCDA'B'C'D'";

describe('#893 — the reported line ASKS instead of escalating', () => {
  it.each(['קובייה ABCD עם אלכסון ראשי', `${CUBE} עם אלכסון ראשי`, `${BOX} עם אלכסון ראשי`])(
    '%s → the four-space-diagonal question, never the LLM',
    (u) => {
      // THE assertion: `not-handled` is what escalates, and a model can only answer by picking one of
      // four (ADR-052). #836 already had the right question; it just could not be reached through a
      // sentence that also declares the solid.
      expect(reason(u), 'never the escalation seam').not.toBe('not-handled');
      expect(reason(u)).toBe('ambiguous-main-diagonal');
    },
  );

  it('the bare reference keeps its own answer — the splitter did not take it over', () => {
    expect(reason('אלכסון ראשי')).toBe('ambiguous-main-diagonal');
  });
});

describe('#893 — the composed forms BUILD', () => {
  it('a NAMED diagonal builds the solid and the segment in one line', () => {
    expect(types(`${CUBE} עם אלכסון AC'`)).toEqual(['solid', 'segment3']);
  });

  it('base diagonals build the solid and the crossing', () => {
    expect(types(`${BOX} עם אלכסוני בסיס`)).toEqual(['solid', 'quad-diagonals']);
  });

  it('every half comes along by construction — each is the rule that already owned it', () => {
    // the splitter re-enters the real grammar rather than enumerating solid × construct, so these
    // standalone readings are exactly what the composed forms inherit
    expect(types(CUBE)).toEqual(['solid']);
    expect(types("אלכסון AC'")).toEqual(['segment3']);
    expect(types('אלכסוני בסיס')).toEqual(['quad-diagonals']);
  });
});

describe('#893 — what must NOT change', () => {
  it('#438’s «עם אלכסון תיבה» still builds ONE solid, not two', () => {
    // The regression this rule caused before its guard: the right half's own noun re-matches the box
    // lane, so splitting produced [solid, solid, segment3] — two solids for one figure. A construct
    // clause is not a solid declaration, and declining hands the line back to the cube rule, which has
    // read this phrasing itself since #438.
    expect(types('תיבה ABCD עם אלכסון תיבה')).toEqual(['solid', 'segment3']);
  });

  it('a bare solid is untouched', () => {
    expect(types('קובייה ABCD')).toEqual(['solid']);
    expect(types(CUBE)).toEqual(['solid']);
  });

  it('a construct the grammar cannot read leaves the line exactly as it was', () => {
    // «אלכסון» bare on a solid: the solid lane claims it and the honesty gate refuses downstream.
    // Unchanged — the splitter declines rather than inventing an answer.
    expect(types('קובייה ABCD עם אלכסון')).toEqual(['solid']);
  });

  it('a left half that is NOT a solid is left to its own rules', () => {
    // the splitter requires the LEFT half to parse as a solid, so these fall through untouched to
    // whatever owned them before — measured, not assumed (the first was expected to reach #836's
    // question and does not: `mainDiagonalRef` has its own conditions, and this rule does not widen them)
    expect(reason('משהו שאינו מוצק עם אלכסון ראשי')).toBe('not-handled');
    expect(types('נקודה A עם אלכסון AC')).toEqual([]);
  });
});
