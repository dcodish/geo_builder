/**
 * #498 — a typo'd modifier half-parses to the BARE solid (the #497 class, 3-D edition).
 *
 * The class: every leftover guard in this tree enumerates KNOWN vocabulary — the per-rule bow-outs at
 * `planarPolygon`/`rightTriangle`, the honesty gates' noun lists — so each one **fails open on a word it
 * has never met**, and a typo of a significant modifier is by definition such a word. Verified at the
 * time of filing: «משולש ישר זוות ABC» → `["solid"]`, the right angle silently dropped under a green ✓,
 * while «משולש ישר זווית ABC» → `["solid","cos-angle"]`. The products copy the ADR-024 leftover pattern
 * by design (docs/20 §12), so they copied its defect; the fix is the 2-D mechanism ported, not shared.
 *
 * The mechanism: `gated(rule)` wraps the DECLARATION family in `declLeftover` — after the rule consumed
 * its own vocabulary and its labels, every surviving token must be POSITIVELY harmless (declaration
 * vocabulary, a construct noun the honesty gates own, a neutral connective/request word, a prefix
 * remnant). A digit is a magnitude this family cannot express, an unclaimed label an object it did not
 * build, an unknown word a statement nobody read — all decline, which is the escalation path. Plus the
 * one OBSERVED misspelling «זוות» → «זווית» folded at `normalize3`, so the whole ישר-זווית family reads
 * it deterministically instead of paying for the LLM.
 */
import { describe, expect, it } from 'vitest';
import { normalize3, parse3 } from '../parse3';

const types = (u: string): string[] | string => {
  const r = parse3(u);
  return r.ok ? r.commands.map((c) => c.type) : r.reason;
};

describe('#498 — the operator report: «משולש ישר זוות ABC» keeps its right angle', () => {
  it('the fold: «זוות» → «זווית» at normalize3 (observed misspelling, guarded both sides)', () => {
    expect(normalize3('משולש ישר זוות ABC')).toBe('משולש ישר זווית ABC');
    expect(normalize3('הזוות')).toBe('הזוות'); // never fires inside another word
    expect(normalize3('זוויות')).toBe('זוויות'); // the correctly-spelled plural is untouched
  });

  it('the sibling fold: «מעויין» → «מעוין», which the rhombus RULES spelled only defectively', () => {
    expect(normalize3('מנסרה ישרה שבסיסה מעויין ABCDA\'B\'C\'D\'')).toBe("מנסרה ישרה שבסיסה מעוין ABCDA'B'C'D'");
    // the plene spelling now reaches `rhombusPrism` — it used to fall through to the TRIANGULAR
    // default, dropping the stated base (a refusal only because `droppedShapeNoun3` caught it)
    const r = parse3("מנסרה ישרה שבסיסה מעויין ABCDA'B'C'D'");
    expect(r.ok && r.commands[0]).toEqual({
      type: 'solid', kind: 'prism4r', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"],
    });
  });

  it('the exact utterance emits the right angle — never the bare solid', () => {
    expect(types('משולש ישר זוות ABC')).toEqual(['solid', 'cos-angle']);
    expect(types('משולש ישר זווית ABC')).toEqual(['solid', 'cos-angle']); // the control
  });
});

describe('#498 — the class: an unread word escalates, in every declaration family', () => {
  it.each([
    ['משולש ישר זויית ABC'], // an UNFOLDED typo of the right-angle modifier
    ['משולש שווה צלוות ABC'], // equilateral typo
    // a stated RHOMBUS base with a 6-label (triangular) run: the label count contradicts the base, so
    // the sentence escalates instead of quietly building the triangular prism it used to
    ['מנסרה ישרה שבסיסה מעויין ABCA\'B\'C\''],
    ['פירמידה ישרה ABCDS יפה מאוד'], // unknown adjectives are content until proven filler
    ['תיבה ABCDA\'B\'C\'D\' גדולה'],
    ['isoceles triangle ABC'], // the En classic
    ['משולש ABC 5'], // a bare magnitude this family cannot express
  ])('«%s» → not-handled (the LLM reads typos), never a silently narrower figure', (u) => {
    expect(types(u)).toBe('not-handled');
  });

  it('an UNCLAIMED label is content too — the solid did not build what the sentence named', () => {
    expect(types("תיבה ABCDA'B'C'D' P")).toBe('not-handled');
  });
});

describe('#498 — what must KEEP parsing (the vocabulary the family actually reads)', () => {
  it.each([
    ['משולש ABC'],
    ['משולש שווה צלעות ABC'],
    ['תיבה ABCDA\'B\'C\'D\''],
    ['שרטט תיבה ABCDA\'B\'C\'D\''], // request verbs
    ['נתונה פירמידה ישרה ABCDS'], // the given-marker in its feminine inflection (the final-nun trap)
    ['תיבה מלבנית עם אלכסון תיבה'], // #438: the adjectival form + the diagonal the rule itself emits
    ['ABCD ארבעון'], // the tetra word ends in FINAL nun — the trap this list had to learn twice
    ['מנסרה ישרה שבסיסה משולש שווה שוקיים ABCA\'B\'C\''],
    ['מקבילון ABCDA\'B\'C\'D\''],
    ['draw a box ABCDA\'B\'C\'D\''],
    ['right triangular prism ABC'],
    ['triangular prism ABCA\'B\'C\''],
  ])('«%s» parses', (u) => {
    expect(parse3(u).ok, u).toBe(true);
  });

  it('a KNOWN construct noun the rule did not build stays the honesty gates\' business, not an escalation', () => {
    // «אלכסון» on a bare box: `droppedConstructNoun3` refuses it honestly (ADR-3D's ruling) — the
    // declaration gate must not divert it to a paid LLM call by treating the noun as unknown.
    expect(parse3("תיבה ABCDA'B'C'D' ואלכסון").ok).toBe(true);
  });
});
