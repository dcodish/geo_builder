/**
 * #957 ([ADR-494](../../../docs/06-decisions.md#adr-494)) — «מלבן ABCD שהצלע שלו 6» ASKS which side.
 *
 * The operator, playing round #949 T13 (2026-09-09): *"the refusal should be meaningful such as
 * יש לציין איזו צלע."* Measured before the fix: there was **no refusal at all** — all five forms
 * returned `not-handled`, which is the ESCALATION seam, so a phrasing the tool has *deliberately
 * decided to refuse* was handed to a paid LLM whose only way to answer is to invent the very thing
 * that is missing (ADR-052).
 *
 * The scoping decision itself is correct and is NOT revisited: on a square or rhombus every side is
 * equal by definition, so «its side» names one length; on a rectangle it is an unstated pick of WHICH
 * side. This issue is only about giving that decision a voice.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { ctxOf } from '../../__tests__/scenario-pipeline';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const ctx = () => ctxOf([]);
const ask = (u: string) => {
  const r = parse(u, ctx());
  return r.ok ? null : r;
};

describe('#957 — a side clause on a shape whose sides are not equal by definition ASKS', () => {
  // the five rows measured on the issue, all of which reached the paid LLM before
  it.each([
    ['מלבן ABCD שהצלע שלו 6', 'מלבן', '6'],
    ['מלבן ABCD שצלעו 6', 'מלבן', '6'],
    ['מלבן ABCD שכל צלע שלו 6', 'מלבן', '6'],
    ['טרפז ABCD שהצלע שלו 6', 'טרפז', '6'],
    ['מקבילית ABCD שהצלע שלו 6', 'מקבילית', '6'],
  ])('%s → the ask, never not-handled', (u, noun, value) => {
    const r = ask(u)!;
    // THE assertion: `not-handled` is what routes to the paid call, so this is the whole fix.
    expect(r.reason, 'never the escalation seam').not.toBe('not-handled');
    expect(r.reason).toBe('side-unspecified');
    expect((r as { noun: string }).noun, "the student's own word").toBe(noun);
    expect((r as { value: string }).value, 'the magnitude they typed, to offer back').toBe(value);
  });

  it('English takes the same route', () => {
    const r = ask('rectangle ABCD whose side is 6')!;
    expect(r.reason).toBe('side-unspecified');
    expect((r as { noun: string }).noun).toBe('rectangle');
  });

  it('the ask names the shape and offers the concrete form, in both locales', () => {
    for (const [name, bundle] of [['he', he], ['en', en]] as const) {
      const msg = (bundle.input as unknown as Record<string, string>).sideUnspecified;
      expect(msg, `${name} has the string`).toBeTruthy();
      for (const slot of ['{{noun}}', '{{value}}', '{{a}}']) {
        expect(msg, `${name} interpolates ${slot}`).toContain(slot);
      }
    }
  });
});

describe('#957 — what must NOT change', () => {
  it('a shape whose sides ARE equal by definition still BUILDS (the #891 rows)', () => {
    for (const u of ['ריבוע ABCD שהצלע שלו 6', 'מעוין ABCD שהצלע שלו 6', 'ריבוע שצלעו 4', 'square ABCD whose side is 6']) {
      const r = parse(u, ctx());
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.commands.map((c) => c.type), u).toContain('set-distance');
    }
  });

  it('the boundary is NOT widened — a rectangle still never gets a side length', () => {
    const r = parse('מלבן ABCD שהצלע שלו 6', ctx());
    expect(r.ok).toBe(false);
    // the refusal is correct; only its voice changed. Building here would be the ADR-052 sin.
  });

  it('a bare shape with no clause is untouched', () => {
    for (const u of ['מלבן ABCD', 'משולש ABC', 'טרפז ABCD']) {
      expect(parse(u, ctx()).ok, u).toBe(true);
    }
  });

  it('a genuinely unreadable sentence still reaches not-handled — the ask does not swallow the seam', () => {
    const r = ask('מלבן ABCD שהמשולש שלו כחול ומרובע')!;
    expect(r.reason).toBe('not-handled');
  });
});

/**
 * The second half of the fix (ADR-494). `parseResolved` will not second-guess a clarification — a
 * clarification names no commands, so the dropped-noun gate would otherwise convert the question into
 * `not-handled`, the escalation seam — but it recognises one from an explicit WHITELIST. With the member
 * written and routed correctly, these five rows still escalated until `side-unspecified` was listed.
 *
 * The whitelist is deliberate, not stale: `ambiguous-angle` is excluded because that question can itself
 * be the symptom of a dropped shape noun («משולש שווה שוקיים שבו זווית B=40»), which the ADR-264 Am. 1
 * split rescues — deriving the predicate from the `Clarify` union was tried in this round and refuted by
 * `clause-split.test.ts`. A member belongs when the asking rule has CONSUMED the shape noun.
 */
describe('#957 — a clarification is never second-guessed into an escalation', () => {
  it.each([
    // one row per clarification family that is reachable from a bare context, asserting only the
    // property that matters: whatever the rule ASKED, the answer is not `not-handled`.
    ['מלבן ABCD שהצלע שלו 6', 'side-unspecified'],
  ])('%s survives the dropped-noun gate as a question', (u, reason) => {
    expect(ask(u)!.reason).toBe(reason);
  });
});
