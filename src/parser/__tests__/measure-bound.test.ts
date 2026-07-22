/**
 * NUMERIC BOUNDS on a measure ([ADR-390](docs/06-decisions.md#adr-390), issue #277).
 *
 * The P1 this locks: "∠ABC > 40" used to lower to `set-angle = 40` and COMMIT — the strongest possible
 * reading of a bound, asserted as a given the student never gave, with a green row. Every older honesty
 * gate was blind to it (all labels land, the single number lands, no relation symbol is present); only
 * the OPERATOR was lost. So the assertions below come in three layers: the bound parses, the equality
 * is never produced, and the gate refuses a lowering that drops the comparison.
 */

import { describe, expect, it } from 'vitest';
import { parse, droppedComparison } from '../index';
import { lower } from '@/engine/lower';
import type { AnyCommand } from '@/engine';

const cmds = (u: string): AnyCommand[] => {
  const r = parse(u);
  return r.ok ? r.commands : [];
};
const kinds = (u: string) => cmds(u).map((c) => c.type);
const bound = (u: string) => cmds(u).find((c) => c.type === 'set-angle-bound' || c.type === 'set-length-bound' || c.type === 'measure-bound');

describe('ADR-390 — a numeric bound on a measure', () => {
  describe('the #277 P1: a comparison is never lowered as an equality', () => {
    for (const u of ['∠ABC > 40', '∠ABC ≥ 40', '40 < ∠ABC', '40 < ∠ABC < 60', 'זווית ABC גדולה מ-40', 'זווית ABC קטנה מ-60', 'angle ABC is less than 60']) {
      it(`"${u}" produces no set-angle`, () => {
        expect(kinds(u)).not.toContain('set-angle');
        expect(bound(u)).toBeTruthy();
      });
    }

    it('the Hebrew feminine "קטנה" is read as a bound, not a NEGATIVE angle', () => {
      // The final-vs-regular nun trap: a gate spelled קטן silently rejects קטנה, and the value rule then
      // read "מ-60" as −60 — a nonsense angle committed green.
      expect(bound('זווית ABC קטנה מ-60')).toEqual({ type: 'set-angle-bound', vertex: 'B', ray1: 'A', ray2: 'C', max: 60 });
    });
  });

  describe('angle forms', () => {
    it('one-sided, both directions', () => {
      expect(bound('∠ABC > 40')).toMatchObject({ min: 40 });
      expect(bound('∠ABC < 60')).toMatchObject({ max: 60 });
      expect(bound('40 < ∠ABC')).toMatchObject({ min: 40 }); // number on the left flips the side
      expect(bound('60 > ∠ABC')).toMatchObject({ max: 60 });
    });

    it('two-sided ranges, written either way round', () => {
      expect(bound('40 < ∠ABC < 60')).toMatchObject({ min: 40, max: 60 });
      expect(bound('60 > ∠ABC > 40')).toMatchObject({ min: 40, max: 60 });
      expect(bound('זווית ABC בין 40 ל-60')).toMatchObject({ min: 40, max: 60 });
      expect(bound('angle ABC is between 40 and 60')).toMatchObject({ min: 40, max: 60 });
    });

    it('degrees are optional', () => {
      expect(bound('∠ABC > 40°')).toMatchObject({ min: 40 });
    });

    it('draws the angle arms, like every other angle statement', () => {
      expect(kinds('∠ABC > 40')).toEqual(['segment', 'segment', 'set-angle-bound']);
    });
  });

  describe('length forms', () => {
    it('bare and barred segments', () => {
      expect(bound('|AB| > 5')).toEqual({ type: 'set-length-bound', a: 'A', b: 'B', min: 5 });
      expect(bound('AB > 5')).toEqual({ type: 'set-length-bound', a: 'A', b: 'B', min: 5 });
      expect(bound('5 < AB < 9')).toMatchObject({ min: 5, max: 9 });
      expect(bound('AB בין 5 ל-9')).toMatchObject({ min: 5, max: 9 });
    });
  });

  describe('named measures (the α the student labelled an angle with)', () => {
    it('parses to a measure-bound, resolved by the symbol table at lowering', () => {
      expect(bound('α > 40')).toEqual({ type: 'measure-bound', name: 'α', min: 40 });
      expect(bound('60 < α < 90')).toEqual({ type: 'measure-bound', name: 'α', min: 60, max: 90 });
    });

    it('lowers onto whichever measure the symbol names', () => {
      const chain = [...cmds('∠ABC = α'), ...cmds('60 < α < 90')];
      expect(lower(chain)).toContainEqual({ type: 'set-angle-bound', vertex: 'B', ray1: 'A', ray2: 'C', min: 60, max: 90 });
      const len = [...cmds('AB = x'), ...cmds('x > 5')];
      expect(lower(len)).toContainEqual({ type: 'set-length-bound', a: 'A', b: 'B', min: 5, max: undefined });
    });

    it('an unbound symbol lowers to nothing (no measure to bound yet)', () => {
      expect(lower(cmds('α > 40'))).toEqual([]);
    });
  });

  describe('what it must NOT claim', () => {
    it('an equality is still an equality', () => {
      expect(kinds('∠ABC = 40')).toContain('set-angle');
    });
    it('measure-vs-measure orders are untouched (ADR-039)', () => {
      expect(kinds('α < β')).toEqual(['measure-order']);
      expect(kinds('AB > CD')).toContain('set-length-order');
    });
    it('acuteness keeps its own command (ADR-108; saved figures carry it)', () => {
      expect(kinds('זווית ABC קהה')).toContain('set-angle-acuteness');
    });
    it('an EMPTY window is a contradiction, not a silent no-op', () => {
      // "60 < ∠ABC < 40" asks for nothing satisfiable — it must reach the student as not-understood,
      // never as an empty command list that commits successfully having done nothing.
      expect(parse('60 < ∠ABC < 40').ok).toBe(false);
      expect(parse('40 < ∠ABC > 60').ok).toBe(false);
    });
  });

  describe('acuteness IS a bound at 90 (one constraint behind both)', () => {
    it('obtuse lowers to min 90, acute to max 90', () => {
      expect(lower(cmds('זווית ABC קהה'))).toContainEqual({ type: 'set-angle-acuteness', vertex: 'B', ray1: 'A', ray2: 'C', obtuse: true });
    });
  });

  describe('the droppedComparison honesty gate', () => {
    it('fires when a comparison lowered without any bound', () => {
      // exactly the #277 shape: the utterance compares, the lowering asserts equality
      expect(droppedComparison('∠ABC > 40', [{ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 40 }])).toBe(true);
    });
    it('is quiet when the bound landed', () => {
      expect(droppedComparison('∠ABC > 40', cmds('∠ABC > 40'))).toBe(false);
      expect(droppedComparison('5 < AB < 9', cmds('5 < AB < 9'))).toBe(false);
    });
    it('is quiet when there is no numeric comparison at all', () => {
      expect(droppedComparison('∠ABC = 40', cmds('∠ABC = 40'))).toBe(false);
      expect(droppedComparison('α < β', cmds('α < β'))).toBe(false);
    });
  });
});
