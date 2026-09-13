/**
 * #976 ([ADR-507](../../../docs/06-decisions.md#adr-507)) — an angle/arc EQUALITY through a BARE copula.
 *
 * Measured on `d440f01` through the real `parse`, two triangles in context:
 *
 *   «זווית ABC = זווית DEF»          ✓ set-angle-ratio k=1
 *   «זווית ABC שווה לזווית DEF»      ✓ (the #185 word-equality seam already rewrote «שווה ל» to «=»)
 *   «זווית ABC היא זווית DEF»        ✗ not-handled       «הוא», the bare «שווה», "angle ABC is angle DEF" — same
 *   «קשת CD היא קשת DE»              ✗ not-handled       (the arc reader shares the assumption)
 *
 * The relation half of the #969 copula asymmetry (ADR-498 fixed the value half): `angleEquality`,
 * `arcEquality` and `measureSum` split on the literal `=`, so the copula WAS their structure. The seam is
 * now located by CONTENT at the ONE existing chokepoint (`normalizeWordEquality`): a copula immediately
 * followed by a LABELLED angle/arc reference becomes `=`, so every relation reader gains the bare copulas
 * at once, and a copula before a value («היא 2α», «היא 40») or before an adjective («היא זווית ישרה») is
 * never touched.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { ctxOf, factsOf } from '../../__tests__/scenario-pipeline';

const two = () => ctxOf(factsOf(['משולש ABC', 'משולש DEF']));
const one = () => ctxOf(factsOf(['משולש ABC']));
const circ = () => ctxOf(factsOf(['מעגל שמרכזו O', 'נקודות C, D, E על המעגל']));

const rel = (u: string, ctx = two()) => {
  const r = parse(u, ctx);
  expect(r.ok, `${u} → ${r.ok ? 'ok' : r.reason}`).toBe(true);
  const c = r.ok ? r.commands.find((x) => x.type === 'set-angle-ratio') : undefined;
  expect(c, `${u} has no set-angle-ratio`).toBeDefined();
  return c as { v1: string; a1: string; b1: string; v2: string; a2: string; b2: string; k: number };
};
const types = (u: string, ctx = two()) => {
  const r = parse(u, ctx);
  return r.ok ? r.commands.map((c) => c.type) : r.reason;
};

const ABC_DEF = { v1: 'B', a1: 'A', b1: 'C', v2: 'E', a2: 'D', b2: 'F', k: 1 };

describe('#976 — the six copulas × He/En on «זווית ABC ⟨copula⟩ זווית DEF»', () => {
  it.each([
    'זווית ABC = זווית DEF',
    'זווית ABC היא זווית DEF',
    'זווית ABC הוא זווית DEF',
    'זווית ABC שווה זווית DEF',
    'זווית ABC שווה לזווית DEF',
    'זווית ABC שווה ל-זווית DEF',
    'זווית ABC היא הזווית DEF',
    'angle ABC = angle DEF',
    'angle ABC is angle DEF',
    'angle ABC is the angle DEF',
    'angle ABC equals angle DEF',
    'angle ABC is equal to angle DEF',
    '∠ABC = ∠DEF',
    '∠ABC is ∠DEF',
    '∠ABC היא ∠DEF',
  ])('%s → set-angle-ratio ∠ABC = ∠DEF', (u) => {
    expect(rel(u)).toMatchObject(ABC_DEF);
  });

  it('a coefficient on the right survives the copula: «זווית ABC היא 2 זווית DEF», "∠ABC is 2∠DEF"', () => {
    expect(rel('זווית ABC היא 2 זווית DEF').k).toBe(2);
    expect(rel('∠ABC is 2∠DEF').k).toBe(2);
    expect(rel('∠ABC = 2∠DEF').k).toBe(2); // unchanged
  });

  it('the single-vertex «∠B = ∠C» form, with a copula too', () => {
    const expected = { v1: 'B', a1: 'A', b1: 'C', v2: 'C', a2: 'B', b2: 'A', k: 1 };
    expect(rel('זווית B = זווית C', one())).toMatchObject(expected);
    expect(rel('זווית B היא זווית C', one())).toMatchObject(expected);
    expect(rel('∠B = ∠C', one())).toMatchObject(expected);
    expect(rel('angle B is angle C', one())).toMatchObject(expected);
  });
});

describe('#976 — arcs share the seam', () => {
  it.each(['קשת CD = קשת DE', 'קשת CD היא קשת DE', 'קשת CD שווה לקשת DE', 'arc CD is arc DE', 'arc CD equals arc DE'])(
    '%s → the central-angle ratio at O',
    (u) => {
      expect(rel(u, circ())).toMatchObject({ v1: 'O', a1: 'C', b1: 'D', v2: 'O', a2: 'D', b2: 'E', k: 1 });
    },
  );
  it('«קשת CD היא 2 קשת DE» keeps the coefficient', () => {
    expect(rel('קשת CD היא 2 קשת DE', circ()).k).toBe(2);
  });
});

describe('#976 — the negatives: what the seam must NOT touch', () => {
  it('a copula before a VALUE still reaches the ADR-498 value lanes, never this one', () => {
    expect(types('זווית ABC היא 2α', one())).toEqual(['measure-angle']);
    expect(types('זווית ABC היא 40', one())).toContain('set-angle');
    expect(types('זווית ABC = 40', one())).toContain('set-angle');
    expect(types('angle ABC is 40', one())).toContain('set-angle');
  });
  it('a copula before an ADJECTIVE keeps its own lane (right / acute / obtuse)', () => {
    expect(types('זווית ABC היא ישרה', one())).toContain('set-angle');
    expect(types('angle ABC is a right angle', one())).toContain('set-angle');
    expect(types('זווית ABC היא זווית קהה', one())).toContain('set-angle-acuteness');
    expect(types('זווית ABC היא זווית חדה', one())).toContain('set-angle-acuteness');
    expect(types('זווית ABC היא חדה', one())).toContain('set-angle-acuteness');
  });
  it('a chain «∠1=∠2=∠3» is still chainedEquality (two ratios), byte-identical', () => {
    const r = parse('∠ABC=∠DEF=∠GHI', two());
    expect(r.ok && r.commands.filter((c) => c.type === 'set-angle-ratio')).toHaveLength(2);
  });
  it('word equality between SEGMENTS stays out (the 2026-07-17 ruling: students spell those with «=»)', () => {
    expect(types('AB היא 5', one())).toBe('not-handled');
    expect(types('AB הוא CD', one())).toBe('not-handled');
    expect(types('AB + CD הוא EF', one())).toBe('not-handled');
  });
});
