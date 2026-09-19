/**
 * #1246 (ADR-AG-114) — a noun gate may not claim a tail that is not an equation.
 *
 * «הקטע BC = 10» answered **`bad-equation`** — «לא הצלחתי לקרוא את המשוואה» about an equation the
 * student never wrote. They wrote a LENGTH. The message sent them to hunt for a typo in something
 * that does not exist, which is the honesty invariant on errors failing: a message names the
 * conflicting STATEMENT, never internal state.
 *
 * ADR-AG-111 did not create this. «הישר BC = 10» answered `bad-equation` before it too; widening the
 * noun registry from two members to nine took the same defect from one noun to nine. **The fix closes
 * the older member as well, and that is how it is known to be at the right altitude** rather than
 * aimed at the nouns that happened to be added.
 *
 * ## Two candidate fixes, both measured — recorded so neither is re-derived
 *
 * ❌ Gating `heLineNamed` alone: the sentence then falls through to the no-noun branch, which claims
 *    it and **mints a curve** — worse than either refusal. A fix that moves the failure one branch
 *    down is not a fix.
 *
 * ✅ Asking at `matchCurve`'s single exit, beside the #1059 Hebrew-tail guard that already lives
 *    there: it covers every branch at once, because they all funnel through it.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';

const code = (line: string): string => {
  const r = parseLine(line);
  return r.ok ? 'ok' : r.code;
};

describe('ADR-AG-114 — a length is not a broken equation (#1246)', () => {
  /**
   * Every noun in the registry, and the bare «אורך» form. None may answer `bad-equation`: the student
   * wrote no equation, so the honest answer is that the sentence was not understood.
   */
  it.each([
    ['התיכון BC = 10'],
    ['הגובה BC = 10'],
    ['השוק BC = 10'],
    ['הבסיס BC = 10'],
    ['היתר BC = 10'],
    // ⚠ «הקטע BC = 10», «הצלע BC = 10» and «אורך הקטע BC = 10» were rows of THIS table and have
    // MOVED to issue-1128-distance-spellings.test.ts, with the opposite expectation.
    //
    // They are not deleted, and the distinction matters: this issue's ruling was «never
    // bad-equation», and `not-handled` was the best answer AVAILABLE at the time, not the goal —
    // this file's own header says so («They wrote a LENGTH»). #1128 (ADR-AG-119) gave those three
    // a real answer, so they are now accepted, and asserting they are refused would pin a gap the
    // product has closed. A lock that simply disappeared would look like coverage nobody wrote.
    //
    // The five that STAY are the ones a length reading would damage: «תיכון», «גובה», «שוק»,
    // «בסיס» and «יתר» each assert something BESIDES a length — that BC is a median, a height, a
    // leg, a base, a hypotenuse — and reducing them to |BC| = 10 would drop that claim silently,
    // which is the invariant this tree treats as cardinal. #1128's noun list is deliberately only
    // the nouns that add nothing to the pair they precede.
  ])('«%s» is not-handled, never bad-equation', (line) => {
    expect(code(line)).toBe('not-handled');
  });

  /**
   * THE OLDER MEMBER. «הישר» carried this defect before ADR-AG-111 widened the list, and a fix aimed
   * only at the new nouns would leave it — which is what would make this a per-noun patch.
   */
  it('«הישר BC = 10» — the PRE-EXISTING case — is closed too', () => {
    expect(code('הישר BC = 10')).toBe('not-handled');
  });

  /**
   * THE ROW THAT DEFINES THE DISCRIMINATOR. A TRUNCATED equation has no `=` and parses as nothing —
   * but it names the plane's variables, so the student plainly meant an equation and must be told it
   * is unreadable (#1059). This is why the gate asks what was MEANT (does the tail name `x`/`y`?)
   * rather than what the text achieves (does it parse?). Requiring a clean parse was the first draft
   * and turned this honest `bad-equation` into `not-handled`.
   */
  it('a truncated equation still says bad-equation', () => {
    expect(code('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2')).toBe('bad-equation');
  });

  /** ADR-AG-111's table is untouched — every real equation still builds, with its noun's extent. */
  it.each([
    ['משוואת הישר CE היא x-3y=0'],
    ['משוואת הצלע CE היא x-3y=0'],
    ['משוואת CE היא x-3y=0'],
    ['הישר x=-4'],
    ['נתון הישר l1: 4y-3x-20=0'],
  ])('«%s» still builds', (line) => {
    expect(code(line)).toBe('ok');
  });

  /** The length the student actually wrote is still understood in the form this tool supports. */
  it('«BC = 10» is still a length', () => {
    expect(code('BC = 10')).toBe('ok');
  });

  /**
   * #1059's own guard, unchanged: a noun followed by PROSE is not this rule's sentence either. Kept
   * beside the new condition because the two now share one gate and a later edit could drop either.
   */
  it('a noun followed by prose still falls through', () => {
    expect(code('הישר DE מקביל לישר BF')).not.toBe('bad-equation');
  });
});
