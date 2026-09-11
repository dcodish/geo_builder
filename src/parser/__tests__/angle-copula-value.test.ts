/**
 * #969 (ADR-498) — an angle's VALUE is located the same way whatever the copula.
 *
 * P1, an honesty breach: «זווית ABC היא 2α» silently committed **2°** and discarded the student's α.
 * `measureAngle` (the symbolic lane) required a literal `=`; every other copula fell through to `angle`
 * (the numeric lane), whose value read is a bare number scan, and it took the COEFFICIENT of `2α` for the
 * whole value. Committed, green, verifier-clean, and drawn — the figure asserted a given nobody gave.
 *
 * Measured on `78440ea`, the hole was every copula but `=` — «היא», «שווה», «שווה ל-», «הוא», "is",
 * "equals" — across every naming mode and for BOTH symbol alphabets (`2α` and `2x`). That is why the fix
 * is not a longer copula list: the numeric lane never had a list to copy (it needs no copula at all), so
 * the seventh spelling would have reopened the hole exactly as the sixth did. Both kinds are located by
 * ONE reader now — `angleValueOf`, positional for both — which is what #831/ADR-468 did for this same
 * rule pair's NAMING half.
 *
 * The matrix below is the lock, and it is exhaustive on purpose: naming × copula × value kind. A seventh
 * copula added to the list here must pass without touching `parse.ts` — if it ever does not, the value
 * read has grown a vocabulary again.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../index';
import { COMPARES_WITH_SYMBOL } from '../parse';

/** A triangle ABC in scope, so the single-vertex naming lane can resolve «זוית A» from the figure. */
const TRI = { neighbors: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] } };

const cmds = (u: string, ctx: object = TRI) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands;
};
/** The one angle command a spelling lowers to, whatever its value kind. */
const angleCmd = (u: string, ctx: object = TRI) => cmds(u, ctx).find((c) => c.type.includes('angle')) as never;
const parses = (u: string, ctx: object = TRI) => parse(u, ctx).ok;

/** Every way a student names the angle. All four resolve to ∠ABC-at-B or ∠BAC-at-A; the naming axis
 *  measured clean before the fix and must stay clean after it. */
const NAMINGS: [label: string, text: string, vertex: string, ray1: string, ray2: string][] = [
  ['triple', 'זווית ABC', 'B', 'A', 'C'],
  ['triple, definite', 'הזווית ABC', 'B', 'A', 'C'],
  ['single vertex', 'זוית A', 'A', 'B', 'C'],
  ['single vertex, definite', 'הזווית A', 'A', 'B', 'C'],
  ['English triple', 'angle ABC', 'B', 'A', 'C'],
];

/** Every copula a student writes. `=` worked before; the other six are the defect. */
const COPULAS = ['=', 'היא', 'הוא', 'שווה', 'שווה ל-', 'is', 'equals'];

describe('#969 — the copula is not part of the value reader’s vocabulary', () => {
  describe('a SYMBOLIC value binds the symbol behind every copula', () => {
    for (const [nameLabel, naming, vertex, ray1, ray2] of NAMINGS) {
      for (const copula of COPULAS) {
        // Both alphabets: Greek is the bagrut convention for angles, but a student writes `2x` just as
        // often, and #969 broke both identically.
        it.each([
          ['Greek', '2α', 2, 'α'],
          ['Latin', '2x', 2, 'x'],
          ['bare Greek', 'α', 1, 'α'],
          ['bare Latin', 'x', 1, 'x'],
        ])(`${nameLabel} «${copula}» %s`, (_kind, value, coef, sym) => {
          expect(angleCmd(`${naming} ${copula} ${value}`)).toMatchObject({
            type: 'measure-angle',
            vertex,
            ray1,
            ray2,
            expr: { coef, var: sym },
          });
        });
      }
    }
  });

  describe('a NUMERIC value is unchanged behind every copula', () => {
    for (const [nameLabel, naming, vertex, ray1, ray2] of NAMINGS) {
      it.each(COPULAS)(`${nameLabel} «%s» 40`, (copula) => {
        expect(angleCmd(`${naming} ${copula} 40`)).toMatchObject({ type: 'set-angle', vertex, ray1, ray2, value: 40 });
      });
    }
  });

  // The reported utterance, verbatim, in the shape the operator played it.
  it('the reported case «זווית ABC היא 2α» binds α — never 2°', () => {
    expect(angleCmd('זווית ABC היא 2α')).toMatchObject({ type: 'measure-angle', vertex: 'B', expr: { coef: 2, var: 'α' } });
  });

  // The operator's own scope case, stated when they widened this issue.
  it('the operator’s case «זוית A שווה 2α» binds α', () => {
    expect(angleCmd('זוית A שווה 2α')).toMatchObject({ type: 'measure-angle', vertex: 'A', ray1: 'B', ray2: 'C', expr: { coef: 2, var: 'α' } });
  });

  it('#967’s segment-pair naming inherits the symbolic lane for free', () => {
    // The naming reader is shared (#831), so a mode added there serves every value kind at once. This is
    // the property both halves of the rule pair exist to have; it is asserted, not assumed.
    expect(angleCmd('הזווית בין BD ל-BA היא 2α', {})).toMatchObject({ type: 'measure-angle', vertex: 'B', ray1: 'D', ray2: 'A', expr: { coef: 2, var: 'α' } });
    expect(angleCmd('הזווית בין BD ל-BA היא 30', {})).toMatchObject({ type: 'set-angle', vertex: 'B', ray1: 'D', ray2: 'A', value: 30 });
  });

  it('the ° glyph rides along with a symbolic value', () => {
    expect(angleCmd('זווית ABC = 2α°')).toMatchObject({ type: 'measure-angle', expr: { coef: 2, var: 'α' } });
    expect(angleCmd('זווית ABC היא 2α°')).toMatchObject({ type: 'measure-angle', expr: { coef: 2, var: 'α' } });
  });

  it('a LOWERCASE vertex still resolves, with either value kind (#45 / ADR-299)', () => {
    const ctx = { neighbors: { d: ['A', 'B'], D: ['A', 'B'] } };
    expect(angleCmd('זווית d = 90', ctx)).toMatchObject({ type: 'set-angle', vertex: 'D', value: 90 });
    expect(angleCmd('זווית d היא α', ctx)).toMatchObject({ type: 'measure-angle', vertex: 'D', expr: { coef: 1, var: 'α' } });
  });
});

/**
 * The negative half. Dropping the `=` requirement means a lone trailing letter is now a candidate VALUE,
 * so every neighbour that ends in one has to be proved un-stolen. Each row below was MEASURED on
 * `78440ea` before the change and must keep the verdict it had.
 */
describe('#969 — what the widened value read must NOT claim', () => {
  it('a symbolic BOUND stays a bound, never an equality', () => {
    // Measured before the fix: these are `not-handled` (an honest escalation — `measureBound` is numeric).
    // Without COMPARES_WITH_SYMBOL the trailing read would have claimed «גדולה מ-α» as ∠ABC = α: a REGION
    // silently committed as an exact value, which is ADR-390's defect in the symbolic alphabet.
    for (const u of ['זווית ABC גדולה מ-α', 'זווית ABC גדולה מ-2α', 'angle ABC is greater than α', 'זווית ABC קטנה מ-x']) {
      const r = parse(u, TRI);
      expect(r.ok && r.commands.some((c) => c.type === 'measure-angle')).toBe(false);
    }
    expect(COMPARES_WITH_SYMBOL.test('זווית ABC גדולה מ-α')).toBe(true);
    expect(COMPARES_WITH_SYMBOL.test('זווית ABC היא 2α')).toBe(false); // the fixed form must not trip it
  });

  it('ACUTENESS is untouched — the words end in a letter the value read must not take', () => {
    for (const u of ['זווית ABC חדה', 'angle ABC is acute', 'angle ABC is obtuse']) {
      expect(cmds(u).map((c) => c.type)).toContain('set-angle-acuteness');
    }
  });

  it('the right-angle WORD form is 90°, not the symbol «a» of "is a right angle"', () => {
    // `angle` strips "right", so "…is a right angle" ends in a stray English article. Answering rightWord
    // BEFORE the symbolic refusal is what keeps this form at 90.
    for (const u of ['angle ABC is a right angle', 'angle B is a right angle', 'זווית ABC ישרה', 'זוית B ישרה', 'זווית ABC היא ישרה']) {
      expect(angleCmd(u)).toMatchObject({ type: 'set-angle', value: 90 });
    }
  });

  it('a bare angle reference and a lowercase label run stay unclaimed', () => {
    // «זוית abc» must not read its last letter as a value: the label guard is a lookbehind on letters.
    expect(parses('זווית ABC')).toBe(false);
    expect(parses('זוית abc')).toBe(false);
    expect(parses('זוית a')).toBe(false);
  });

  it('an angle ALIAS is not a value (#267)', () => {
    expect(cmds('נסמן זוית BAC כ-A1').map((c) => c.type)).toContain('angle-alias');
  });

  it('a multi-angle givens LIST resolves BOTH clauses symbolically', () => {
    // Before the fix the second clause committed 2°. The splitter owns the comma; the shared bail keeps an
    // UNSPLIT two-reference line from being half-claimed.
    const list = cmds('זווית ABC היא 40, זווית DEF היא 2α', { neighbors: { ...TRI.neighbors, D: ['E', 'F'], E: ['D', 'F'], F: ['D', 'E'] } });
    expect(list.filter((c) => c.type === 'set-angle')).toHaveLength(1);
    expect(list.find((c) => c.type === 'measure-angle')).toMatchObject({ vertex: 'E', expr: { coef: 2, var: 'α' } });
  });

  it('an angle the reader cannot NAME escalates — it never falls back to the coefficient', () => {
    // `measureAngle` declines when `angleArms` cannot name the angle; `angle` then sees the symbol and
    // refuses rather than committing its coefficient as degrees. That refusal IS the fix's core: the
    // student's magnitude escalates honestly instead of vanishing into a number.
    const r = parse('זווית A היא 2α', { neighbors: { A: ['B', 'C', 'D'] } }); // three arms — ambiguous
    expect(r.ok && r.commands.some((c) => c.type === 'set-angle')).toBe(false);
  });
});
