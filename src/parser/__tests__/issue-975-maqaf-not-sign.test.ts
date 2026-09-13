/**
 * #975 ([ADR-505](../../../docs/06-decisions.md#adr-505)) — a Hebrew particle's maqaf is NOT a sign.
 *
 * Measured on `d440f01` through the real `parse` with a triangle in context:
 *
 *   «זווית ABC שווה ל-90»   → set-angle value −90   ✗   (the natural spelling)
 *   «רדיוס המעגל שווה ל-5»  → set-radius −5         ✗   (every value rule, not only angles)
 *   «זווית ABC שווה ל- 90»  → +90                   ✓   (the spaced form — the accident)
 *
 * The one number atom `NUM` (`src/parser/lexicon.ts`) read ANY leading hyphen as a sign, and the
 * `(?<![A-Za-z])` guard some consumers add blocks a Latin label, never a Hebrew particle («ל-»,
 * «מ-», «ב-», «כ-»). A stated 90° committed as −90° is the ADR-498 honesty class (a stated magnitude
 * silently replaced) reached by a different mechanism. The fix is one lookbehind on the atom's sign
 * arm — total over its 64 consumers, never a rule-local check for «ל-».
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { NUM } from '../lexicon';
import { ctxOf, factsOf } from '../../__tests__/scenario-pipeline';

const tri = () => ctxOf(factsOf(['משולש ABC']));
const circ = () => ctxOf(factsOf(['מעגל שמרכזו O']));

const cmds = (u: string, ctx = tri()) => {
  const r = parse(u, ctx);
  expect(r.ok, `${u} → ${r.ok ? 'ok' : r.reason}`).toBe(true);
  return r.ok ? r.commands : [];
};
const valueOf = (u: string, type: string, ctx = tri()): number | undefined => {
  const c = cmds(u, ctx).find((x) => x.type === type) as { value?: number } | undefined;
  expect(c, `${u} has no ${type}`).toBeDefined();
  return c?.value;
};

describe('#975 — the maqaf of «ל-» before a number is a particle, not a minus sign', () => {
  it('«זווית ABC שווה ל-90» commits +90 (the measured defect)', () => {
    expect(valueOf('זווית ABC שווה ל-90', 'set-angle')).toBe(90);
  });
  it('«רדיוס המעגל שווה ל-5» commits +5 — the class is every value rule, not angles', () => {
    expect(valueOf('רדיוס המעגל שווה ל-5', 'set-radius', circ())).toBe(5);
  });
  it('the spaced form «שווה ל- 90» is unchanged', () => {
    expect(valueOf('זווית ABC שווה ל- 90', 'set-angle')).toBe(90);
  });
  it('a decimal after the particle reads whole: «ל-7.5»', () => {
    expect(valueOf('זווית ABC שווה ל-7.5', 'set-angle')).toBe(7.5);
  });
  it('«שווה ל-2α» still routes to the ADR-498 symbolic lane, not a numeric one', () => {
    const c = cmds('זווית ABC שווה ל-2α');
    expect(c.map((x) => x.type)).toContain('measure-angle');
    expect(c.some((x) => x.type === 'set-angle')).toBe(false);
  });
});

describe('#975 — a GENUINE negative number stays negative', () => {
  it.each([
    ['AB = -4', -4],
    ['AB=-4', -4],
    ['AB=-4.5', -4.5],
    ['AB = -4', -4],
  ])('%s → %d (after a space or «=», the hyphen is a sign)', (u, v) => {
    expect(valueOf(u, 'set-distance')).toBe(v);
  });
  it('«זווית ABC = -90» is still a negative value (the guard is Hebrew-letter-only)', () => {
    expect(valueOf('זווית ABC = -90', 'set-angle')).toBe(-90);
  });
});

describe('#975 — the atom itself', () => {
  const re = new RegExp(`(${NUM})`);
  it('refuses the hyphen as a sign only when a Hebrew letter precedes it', () => {
    expect('ל-90'.match(re)?.[1]).toBe('90');
    expect('מ-5'.match(re)?.[1]).toBe('5');
    expect(' -90'.match(re)?.[1]).toBe('-90');
    expect('=-4'.match(re)?.[1]).toBe('-4');
    expect('(-3'.match(re)?.[1]).toBe('-3');
    expect(',-2'.match(re)?.[1]).toBe('-2');
    expect('-7'.match(re)?.[1]).toBe('-7');
    expect('A-3'.match(re)?.[1]).toBe('-3'); // a Latin letter is NOT a particle — consumers add their own label guard
  });
  it('stays a NO-capture fragment (the lookbehind is zero-width)', () => {
    expect(new RegExp(NUM).exec('x 12')?.length).toBe(1);
  });
});
