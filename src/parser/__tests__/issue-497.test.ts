/**
 * #497 — a typo'd shape modifier half-parses to the BARE shape with a green ✓.
 *
 * The class: `SHAPE_LEFTOVER` (the ADR-024 leftover mechanism every shape rule shares) was a DENYLIST
 * of correctly-spelled geometry vocabulary, so it failed OPEN on any word it had never met — and a typo
 * of a significant word is by definition such a word. «טרפז ישר זוות» survived it, the right angle
 * silently dropped, and a generic trapezoid shipped under a green ✓ (operator report 2026-08-10).
 * The docs/23 G1 pattern: an enumerating honesty gate grows one token at a time and every unenumerated
 * token is a silent drop (#27, #437, #2 — and the denylist even carried a final-nun trap: «אלכסון» could
 * never see the plural «אלכסונים», which is what made #456 necessary).
 *
 * The mechanism (this fix): `shapeLeftover` — the denylist keeps its curated catches (symbols, the
 * quantifier) and a fail-CLOSED half joins it: after a rule consumed its own vocabulary and its labels,
 * every surviving token must be POSITIVELY harmless (FILLER / REQUEST_WORDS / NEUTRAL_* / a prosthetic-
 * prefix remnant). A digit is a stated magnitude; an unknown word is a statement we did not read; both
 * escalate — the LLM reads typos, a silently narrower figure lies. Growing the neutral allowlist costs
 * an unneeded escalation; the denylist's gaps cost a WRONG FIGURE.
 *
 * Also under this issue: `labelRun` prefers an UPPERCASE run (the labels-are-uppercase convention), so a
 * lowercase English word can never shadow the student's labels — "draw a square ABCD" used to build
 * square D,R,A,W, "let triangle ABC" the triangle L,E,T. And the one OBSERVED misspelling «זוות» folds
 * to «זווית» at the ADR-405 chokepoint, so the whole ישר-זווית family reads it deterministically.
 */
import { describe, expect, it } from 'vitest';
import { parse, normalizeUtterance } from '../parse';
import { shapeLeftover } from '../parse';

const types = (u: string): string[] | string => {
  const r = parse(u);
  return r.ok ? r.commands.map((c) => c.type) : r.reason;
};

describe('#497 — the operator report: «טרפז ישר זוות» builds the RIGHT trapezoid', () => {
  it('the fold: «זוות» → «זווית» at normalizeUtterance (observed misspelling, both guards)', () => {
    expect(normalizeUtterance('טרפז ישר זוות')).toBe('טרפז ישר זווית');
    // guarded like the שוה fold — never inside another word (a preceding/following Hebrew letter)
    expect(normalizeUtterance('הזוות')).toBe('הזוות');
  });

  it('the exact keystroke (labelless AND labelled) emits the perpendicular — never a bare trapezoid', () => {
    expect(types('טרפז ישר זוות')).toEqual(['trapezoid', 'set-perpendicular']);
    expect(types('טרפז ישר זוות ABCD')).toEqual(['trapezoid', 'set-perpendicular']);
    expect(types('משולש ישר זוות')).toEqual(['right-triangle']);
  });
});

describe('#497 — the class: an unknown surviving word escalates, in every shape family', () => {
  it.each([
    ['טרפז ישר זויית ABCD'], // unfolded typo of the right-angle modifier
    ['טרפז שוה שוקים ABCD'], // isosceles typo
    ['משולש שווה צלוות ABC'], // equilateral typo
    ['isoceles trapezoid ABCD'], // the En classic
    ['טרפז ABCD יפה מאוד'], // unknown adjectives are content until proven filler
    ['משולש ABC גדול'],
    ['טרפז ABCD 5'], // a bare magnitude the rule cannot express
    ['טרפז abcde'], // a 5-letter lowercase non-run used to be silently dropped
  ])('«%s» → not-handled (LLM), never a bare shape', (u) => {
    expect(types(u)).toBe('not-handled');
  });

  it('the gate is fail-closed at the predicate level', () => {
    expect(shapeLeftover('זוות')).toBe(true); // unknown word (pre-fold spelling reaching a gate raw)
    expect(shapeLeftover('שוקים')).toBe(true);
    expect(shapeLeftover('5')).toBe(true); // a magnitude
    expect(shapeLeftover('AB')).toBe(true); // an unclaimed label
    expect(shapeLeftover('')).toBe(false);
    expect(shapeLeftover('נתונה')).toBe(false); // the given-marker in ALL inflections (the nun trap)
    expect(shapeLeftover('של הוא קמור')).toBe(false); // connectives + the post-pass adjective
    expect(shapeLeftover('ה')).toBe(false); // a prosthetic-prefix remnant («הטרפז» minus the noun)
  });
});

describe('#497 — what must KEEP parsing (the neutral vocabulary)', () => {
  it.each([
    ['טרפז ישר זווית', ['trapezoid', 'set-perpendicular']],
    ['נתון משולש ABC', ['triangle']],
    ['נתונה גזרה', null], // sector — just needs ok (arc composition varies)
    ['draw a square ABCD', ['square']],
    ['דלתון קמור', null], // convexity is post-pass vocabulary — the gate lets it through
    ['ריבוע abcd', ['square']], // lowercase labels still accepted when no uppercase run exists
  ])('«%s» parses', (u, expected) => {
    const r = parse(u);
    expect(r.ok, u).toBe(true);
    if (r.ok && expected) expect(r.commands.map((c) => c.type)).toEqual(expected);
  });

  it('an uppercase run wins over a lowercase English word (labels are UPPERCASE by convention)', () => {
    const r = parse('draw a square ABCD');
    expect(r.ok && r.commands[0]).toEqual({ type: 'square', ids: ['A', 'B', 'C', 'D'] });
    const t = parse('let triangle ABC');
    expect(t.ok && t.commands[0]).toEqual({ type: 'triangle', ids: ['A', 'B', 'C'] });
  });
});
