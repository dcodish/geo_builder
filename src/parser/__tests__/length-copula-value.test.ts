/**
 * #1157 (ADR-524) — a LENGTH's value is located the same way whatever the copula.
 *
 * The length twin of #969/ADR-498, one construct over. The verbose frame «אורך/הצלע/הקטע <seg> …»
 * located its value by a list of copulas — «הוא», «היא», «שווה», «שווה ל» — so «אורך הקטע BC = 10»
 * emitted a bare segment and DROPPED the 10, and so did «אורך הקטע BC 10» and the same line with a
 * trailing «יחידות». The honesty gates caught every one of them, which is why this was P2 and not
 * P1 — but each occurrence still cost a paid LLM call on a sentence the grammar had all but read.
 *
 * ADR-498's own words apply verbatim: *any enumeration is a list that is already incomplete against
 * its sibling.* Adding `=` to the alternation is the seventh spelling, so the value is located by
 * POSITION instead — whatever stands between the segment and its value is connective, defined as a
 * run carrying no operand of its own.
 *
 * THE LOCK IS A PARITY ASSERTION, deliberately. Each spelling is asserted to produce the SAME
 * commands as the canonical «BC=10» rather than a hand-written expectation, so the test cannot go
 * green by re-implementing the grammar it guards ([ADR-W-053](../../../docs/06w-decisions-workspace.md)).
 * A new spelling added to the table below must pass without touching `parse.ts`; if it ever does
 * not, the value read has grown a vocabulary again.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../index';

const cmds = (u: string): unknown[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands as unknown[];
};

/** The parse of the canonical spelling — the thing every other spelling must equal. */
const canonical = (u: string): unknown[] => cmds(u);

describe('ADR-524 — the copula is not part of the LENGTH value reader’s vocabulary (#1157)', () => {
  // Every row states one thing: the length of BC is 10. The commands must be identical.
  it.each([
    ['הקטע BC = 10'],
    ['אורך הקטע BC = 10'],
    ['אורך הקטע BC 10'],
    ['אורך הקטע BC 10 יחידות'],
    ['אורך הקטע BC הוא 10'],
    ['אורך הקטע BC הוא 10 יחידות'],
    ['אורך הקטע BC שווה 10'],
    ['אורך הקטע BC שווה ל-10'],
    ['אורך BC 10'],
    ['אורך BC = 10'],
    ['הצלע BC = 10'],
    ['אורך הצלע BC = 10'],
  ])('«%s» states the same thing as «BC=10»', (u) => {
    expect(cmds(u)).toEqual(canonical('BC=10'));
  });

  // The value KIND is not enumerated either — whatever the canonical spelling makes of a radical,
  // the verbose one makes of it too.
  it('a radical value keeps parity with the canonical spelling', () => {
    expect(cmds('אורך הקטע BC = √8')).toEqual(canonical('BC = √8'));
  });

  it('a decimal value keeps parity with the canonical spelling', () => {
    expect(cmds('אורך הקטע BC הוא 2.5')).toEqual(canonical('BC = 2.5'));
  });

  /**
   * ADR-498's load-bearing guard, ported: a connective that carries a RELATION is not a connective.
   * The number after it is a BOUND or a RATIO, and rewriting it into an equality would turn an
   * honest non-equality into a silently wrong given — the exact failure ADR-498 calls "a symbolic
   * bound would have been stolen".
   *
   * These rows are the reason the guard is applied to the CONNECTIVE rather than to the whole line:
   * a whole-line `COMPARES_WITH_NUMBER` test does not fire on «גדולה פי 2» (the comparative and the
   * number are not adjacent), and the ratio would have been stolen.
   */
  it.each([
    ['a bound stays a bound', 'אורך הקטע BC גדול מ-10'],
    ['a ratio stays a ratio', 'הצלע BC גדולה פי 2 מ-AB'],
    ['a ratio on the verbose noun stays a ratio', 'אורך הקטע BC גדול פי 2 מ-AB'],
    ['the feminine comparative is caught too', 'הצלע BC קטנה פי 3 מ-AB'],
  ])('%s', (_name, u) => {
    const r = parse(u);
    const types = r.ok ? (r.commands as { type: string }[]).map((c) => c.type) : [];
    expect(types).not.toContain('set-distance');
  });

  // The whole-line guard would ALSO have over-refused this one: a compound whose OTHER statement
  // carries a comparison. The relation that matters is the one between THIS segment and THIS value.
  it('a compound line rewrites its own statement and leaves the other alone', () => {
    const types = (cmds('אורך הקטע BC = 10, AB > 5') as { type: string }[]).map((c) => c.type);
    expect(types).toContain('set-distance');
    expect(types).toContain('set-length-bound');
  });
});

/**
 * The second arm of #1157: a trailing UNIT word is not part of the value.
 *
 * «זווית ABC = 40 מעלות» and «רדיוס המעגל O הוא 5 ס"מ» both worked, while «BC = 10 יחידות» was
 * `not-handled` — the angle lane and the radius lane had each grown their own unit tolerance and the
 * LENGTH lane had none. Stripped at the utterance boundary, so the tolerance is the tool's rather
 * than any one lane's.
 */
describe('ADR-524 — a trailing unit word is not part of the value (#1157)', () => {
  it.each([
    ['BC = 10 יחידות'],
    ['BC = 10 ס"מ'],
    ['BC = 10 cm'],
    ['AB = 5 units'],
  ])('«%s» reads its number', (u) => {
    const c = cmds(u) as { type: string; value?: number }[];
    expect(c.find((x) => x.type === 'set-distance')?.value).toBe(u.includes('5') ? 5 : 10);
  });

  it('the lanes that already stripped their own unit are unchanged', () => {
    const ang = cmds('זווית ABC = 40 מעלות') as { type: string; value?: number }[];
    expect(ang.find((x) => x.type === 'set-angle')?.value).toBe(40);
    const rad = cmds('רדיוס המעגל O הוא 5 ס"מ') as { type: string; value?: number }[];
    expect(rad.find((x) => x.type === 'set-radius')?.value).toBe(5);
  });

  // The strip requires a digit before it and a word boundary after, so it can never be taken out of
  // a label run or the middle of a Hebrew word.
  it('a unit word that is not a unit is left alone', () => {
    expect(parse('יחידות').ok).toBe(false);
    expect(cmds('BC = 10')).toEqual(canonical('BC=10'));
  });
});

/**
 * #1248 (ADR-524 Am. 1) — A NON-COPULA CONNECTIVE NEVER BECOMES AN EQUALITY.
 *
 * ADR-524 shipped its guard as a DENYLIST of relation words, and it was incomplete in the way every
 * denylist is: what it missed, it read as an equality. «אורך הקטע BC > 10» — the student saying BC is
 * GREATER THAN 10 — committed `set-distance: 10`. A stated REGION became an EQUALITY at its own bound,
 * and no honesty gate could catch it, because the `10` was now accounted for. It committed green.
 *
 * The guard is inverted to an ALLOWLIST of copulas, and this suite is written the same way round: the
 * table below is the CLASS — every way a student can relate a length to a number that is not "is" —
 * and each row asserts the absence of `set-distance`, never a particular outcome. What the sentence
 * DOES become (a bound, a ratio, an escalation) is another rule's business and is deliberately not
 * asserted here, so this lock cannot go green by re-implementing that rule.
 */
describe('ADR-524 Am. 1 — only a copula produces an equality (#1248)', () => {
  const commands = (u: string): { type: string }[] => {
    const r = parse(u);
    return r.ok ? (r.commands as { type: string }[]) : [];
  };

  // Every connective here is a RELATION, not a copula. None may yield an equality.
  it.each([
    ['greater-than glyph', '>'],
    ['less-than glyph', '<'],
    ['at-least glyph', '≥'],
    ['at-most glyph', '≤'],
    ['ascii at-least', '>='],
    ['ascii at-most', '<='],
    ['Hebrew greater', 'גדול מ-'],
    ['Hebrew smaller', 'קטן מ-'],
    ['Hebrew feminine greater', 'גדולה מ-'],
    ['Hebrew at least', 'לפחות'],
    ['Hebrew at most', 'לכל היותר'],
    ['English at least', 'at least'],
    ['English greater than', 'greater than'],
    ['English no more than', 'no more than'],
    ['a ratio', 'גדול פי'],
  ])('«אורך הקטע BC %s 10» is not an equality', (_name, conn) => {
    const types = commands(`אורך הקטע BC ${conn} 10`).map((c) => c.type);
    expect(types, `«${conn}» must not lower to a stated length`).not.toContain('set-distance');
  });

  // The same, on the other two nouns the registry admits — the defect was never about «אורך».
  it.each([['הקטע'], ['הצלע']])('«%s BC > 10» is not an equality either', (noun) => {
    expect(commands(`${noun} BC > 10`).map((c) => c.type)).not.toContain('set-distance');
  });

  /**
   * FAILING CLOSED is the point. A connective the tool has never seen must not be guessed at: it is
   * left alone, the value goes unaccounted, and the honesty battery escalates — which is exactly what
   * this construct did before ADR-524, and honest. Inventing «= 10» from an unknown word is not.
   */
  it.each([['בערך'], ['כמעט'], ['לכל הפחות'], ['roughly'], ['about']])(
    'an unfamiliar connective «%s» is left alone, never read as "="',
    (conn) => {
      expect(commands(`אורך הקטע BC ${conn} 10`).map((c) => c.type)).not.toContain('set-distance');
    },
  );

  /**
   * The other half of the same claim, and the one that keeps the allowlist honest: every copula DOES
   * produce the equality, and produces the SAME one as the canonical spelling. If a future edit
   * narrows the allowlist to make some new row pass, these go red.
   */
  // Hebrew only: a connective cannot contain Latin letters by construction, so an English copula never
  // reaches this guard. «BC = 10» is English’s way in and is locked above.
  it.each([['', 'juxtaposed'], ['=', 'equals sign'], ['הוא', 'masculine copula'], ['היא', 'feminine copula'],
    ['שווה', 'the verb'], ['שווה ל-', 'the verb with its preposition']])(
    'a copula (%s — %s) still states the length',
    (conn) => {
      expect(commands(`אורך הקטע BC ${conn} 10`)).toEqual(commands('BC=10'));
    },
  );
});
