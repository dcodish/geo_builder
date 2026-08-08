/**
 * #436 (ADR-436): a NEGATED statement must never build its own OPPOSITE.
 *
 * Prod evidence (log-triage 2026-08-08, session `syw8vcx4`): a student building two intersecting
 * circles with an inscribed angle tried to exclude a degenerate case — `שזוות A לא תהיה ישרה`, then
 * `לא תהיה ישרה`. Their input escaped only by a TYPO (`זוות` misses the yod, so the `זוו?ית` keyword
 * gate did not match). Spelled correctly it would have committed the opposite of what they asked.
 *
 * Measured pre-fix, with a 4-point figure context:
 *
 *   זווית A ישרה       → set-angle A = 90     (the positive control)
 *   זווית A לא ישרה    → set-angle A = 90     ← byte-identical
 *   זווית A אינה ישרה  → set-angle A = 90
 *   משולש ABC לא שווה שוקיים → shape-variant isosceles ABC   (a DIFFERENT rule, same inversion)
 *
 * Root cause: negation had no representation anywhere in the parser — no rule guard, no `FILLER`
 * entry, no honesty gate — so every rule simply stepped over the word. `angle` even folded `ישרה` into
 * `value = 90` while `לא` sat unmatched in the stripped remainder.
 *
 * The fix refuses PRE-parse (the `looksLikeLatex` placement and its reason verbatim: the negated form
 * partial-parses to a WRONG figure, so the post-failure register would never see it). The capability —
 * a negation is an EXCLUSION that keeps the DOF, so it belongs in the requirement lane — is filed
 * separately; this locks that the tool can never again assert the opposite of a given.
 */
import { describe, expect, it } from 'vitest';
import { statedNegation } from '../scope';
import { COMMAND_CATALOG } from '../catalog';

describe('#436 — negation is recognised', () => {
  it.each([
    ['the reported utterance', 'שזוות A לא תהיה ישרה'],
    ['the reported fragment', 'לא תהיה ישרה'],
    ['spelled correctly — the form that would have inverted', 'זווית A לא ישרה'],
    ['אינה', 'זווית A אינה ישרה'],
    ['אינו', 'AB אינו מקביל ל-CD'],
    ['אין', 'אין זווית ישרה'],
    ['ש-prefixed', 'שזווית A לא תהיה ישרה'],
    ['a different rule entirely', 'משולש ABC לא שווה שוקיים'],
    ['the ≠ symbol', 'AB ≠ CD'],
    ['English not', 'angle A is not right'],
    ["English isn't", "the triangle isn't isosceles"],
  ])('%s', (_label, utterance) => {
    expect(statedNegation(utterance)).not.toBeNull();
  });
});

describe('#436 — the vocabulary swallows no working construction', () => {
  // A false positive here REFUSES a real construction, so this side matters more than coverage.
  it.each([
    'משולש ABC', 'ריבוע ABCD', 'זווית A = 40', 'זווית ABC = 90', 'דלתון קמור',
    'נקודה E על AB', 'AB מאונך ל-CD', 'AB מקביל ל CD', 'מעגל O', 'AB = 5',
    'משולש שווה שוקיים', 'טרפז ישר זווית ABCD', 'AD חוצה את זווית A',
    'שני מעגלים נחתכים', 'המשך AC חותך את מעגל P ב D', 'משולש ABC חסום במעגל',
    'E נקודה על ab', 'De מאונך ל-ab', 'AB קוטר במעגל', 'שטח ABC = 13',
  ])('%s is untouched', (utterance) => {
    expect(statedNegation(utterance)).toBeNull();
  });

  it('a word merely CONTAINING the letters is not a negation', () => {
    // the separator requirement is what makes this true — `לא` must stand alone
    for (const u of ['מלא', 'כלא', 'notation of the angle']) expect(statedNegation(u)).toBeNull();
  });

  it('no catalog example is swallowed (the #140 gate-false-positive guard)', () => {
    const swallowed: string[] = [];
    for (const e of COMMAND_CATALOG) {
      for (const ex of [e.he, e.en]) if (ex && statedNegation(ex)) swallowed.push(ex);
    }
    expect(swallowed).toEqual([]);
  });
});
