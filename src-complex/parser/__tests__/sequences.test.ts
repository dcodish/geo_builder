/**
 * F9 — sequences over ℂ.
 *
 * The family's whole point in this engine is that a GEOMETRIC sequence is pure multiplication and
 * therefore exact: the relations are ℚ-linear rows in log-polar coordinates, and the integer
 * turn-unknown they carry **is** «מנת הסדרה — כל האפשרויות». So the tests assert the ratio's
 * alternatives as *branches*, not as a separate feature.
 *
 * An ARITHMETIC sequence is addition, which has no log-polar form. It is stated in the same sentence
 * shape, and the tests assert that it is DEFERRED rather than dropped or silently mis-solved — the
 * numeric tier is what will read it.
 */
import { describe, expect, it } from 'vitest';

import { parseLineV2 } from '../rules';
import { solveTier1 } from '../../solve/tier1';
import { branchDegrees } from '../../solve/tier1';
import { format as fmtMod } from '../../value/modulus';
import { deriveLines } from '../../app/deriveLines';

const ok = (line: string) => {
  const r = parseLineV2(line);
  if (!r.ok) throw new Error(`did not parse: ${line} (${r.reason}${'items' in r ? `: ${r.items}` : ''})`);
  return r.line;
};

const build = (...lines: string[]) => solveTier1(lines.flatMap((l) => ok(l).constraints));

describe('F9 — the sentence forms', () => {
  /** Both word orders, because RTL typing makes the order genuinely ambiguous (#598). */
  it.each([
    'z1, z2, z3 סדרה הנדסית',
    'סדרה הנדסית: z1, z2, z3',
    'z1, z2, z3 are a geometric sequence',
    'geometric sequence: z1, z2, z3',
  ])('the list form parses: %s', (line) => {
    const l = ok(line);
    expect(l.declares).toEqual(['z1', 'z2', 'z3']);
    expect(l.constraints).toHaveLength(1);
  });

  /** The §2b ג witness, verbatim. */
  it('the corpus sentence parses: «שני האיברים הראשונים … שבה האיבר השלישי»', () => {
    const l = ok('z1 ו-z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר השלישי הוא z4');
    expect(l.declares).toEqual(['z1', 'z2', 'z4']);
    expect(l.constraints).toHaveLength(1);
  });

  it('the English mirror parses', () => {
    const l = ok('z1 and z2 are the first two terms of a geometric sequence in which the third term is z4');
    expect(l.declares).toEqual(['z1', 'z2', 'z4']);
  });

  /**
   * TWO terms impose NOTHING, and that is the ADR-052 reading of the sentence: any two numbers are
   * the first two terms of *some* geometric sequence. The names are still declared, so the figure
   * exists — it is simply not over-determined by a relation the student never stated.
   */
  it('two listed terms declare both names and constrain neither', () => {
    const l = ok('z1, z2 סדרה הנדסית');
    expect(l.declares).toEqual(['z1', 'z2']);
    expect(l.constraints).toEqual([]);
  });
});

describe('F9 — a geometric sequence is solved EXACTLY', () => {
  it('the third term follows from the first two', () => {
    const t1 = build('z1 = 1', 'z2 = 2', 'z1, z2, z3 סדרה הנדסית');
    expect(fmtMod(t1.knownModulus.get('z3')!)).toBe('4');
    expect(branchDegrees(t1.branches[0], 'z3')).toBe(0);
  });

  /**
   * «מנת הסדרה — כל האפשרויות» IS the branch set.
   *
   * With the first and third terms pinned, the ratio satisfies `q² = 4`, so `q = ±2` — and the two
   * middle terms that follow are two CONFIGURATIONS of one figure, which is exactly what the
   * "show another configuration" button cycles. No separate enumeration feature.
   */
  it('the ratio’s alternatives are the branches, not a separate feature', () => {
    const t1 = build('z1 = 1', 'z3 = 4', 'z1, z2, z3 סדרה הנדסית');
    expect(fmtMod(t1.knownModulus.get('z2')!)).toBe('2');
    const middles = t1.branches.map((b) => branchDegrees(b, 'z2')).sort((a, b) => a! - b!);
    expect(middles).toEqual([0, 180]); // q = +2 and q = −2
  });

  /** Positions, not adjacency — «בהתאמה» is the general case, not an extra rule. */
  it('a term at position FIVE is placed by its ordinal', () => {
    const t1 = build(
      'z1 = 1',
      'z2 = 2',
      'z1 ו-z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר החמישי הוא z4',
    );
    expect(fmtMod(t1.knownModulus.get('z4')!)).toBe('16'); // 1·2⁴
  });

  /** A rotation in the ratio winds the terms — the picture the topic is actually about. */
  it('a complex ratio rotates each term by the same angle', () => {
    const t1 = build('z1 = 1', 'z2 = 2cis30', 'z1, z2, z3 סדרה הנדסית');
    expect(fmtMod(t1.knownModulus.get('z3')!)).toBe('4');
    expect(branchDegrees(t1.branches[0], 'z3')).toBe(60);
  });
});

describe('F9 — an arithmetic sequence is DEFERRED, never mis-solved', () => {
  /**
   * Addition has no closed form in log-polar coordinates, so the exact tier cannot read this. What it
   * must not do is pretend: the constraint is listed as deferred, which is what the numeric tier will
   * pick up. Dropping it would be the silent-drop class; solving it multiplicatively would be worse.
   */
  it('routes to the numeric tier and says so', () => {
    const t1 = build('z1 = 1', 'z2 = 3', 'z1, z2, z3 סדרה חשבונית');
    expect(t1.deferred).toHaveLength(1);
    expect(t1.knownModulus.has('z3')).toBe(false);
  });

  it('the deferred constraint reaches the app surface, keyed by the student’s line', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 3', 'z1, z2, z3 סדרה חשבונית']);
    expect(d.deferred).toHaveLength(1);
    expect(d.deferred[0].src).toContain('חשבונית');
  });
});

describe('F9 — refusals stay honest', () => {
  /** A real parameter is not a term of a complex sequence. */
  it('refuses a list containing a real parameter', () => {
    expect(parseLineV2('z1, r, z3 סדרה הנדסית').ok).toBe(false);
  });

  /** The accountant is what catches a sentence the rule only half understood. */
  it('refuses a sequence line with unclaimed content, in the student’s own words', () => {
    const r = parseLineV2('z1, z2, z3 סדרה הנדסית ומקבילית');
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'unaccounted') expect(r.items.join(' ')).toContain('ומקבילית');
  });

  /** «האיבר הראשון הוא z4» after naming z1 and z2 as the first two is not a sentence this means. */
  it('refuses an ordinal that collides with the first two terms', () => {
    expect(
      parseLineV2('z1 ו-z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר הראשון הוא z4').ok,
    ).toBe(false);
  });
});
