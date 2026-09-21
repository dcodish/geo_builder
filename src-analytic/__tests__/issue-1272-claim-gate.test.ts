/**
 * #1272 ([ADR-AG-139](../../docs/06c-decisions-analytic.md#adr-ag-139)) — A RULE OWNS ONLY WHAT IT
 * PARSED, so a mis-owning rule never blocks the LLM escape.
 *
 * Operator, 2026-09-20 (#1271): *"we need to support all such forms of writing. I would expect the llm
 * escape to assist in cases of minor deviations"*. The escape fires on exactly one code, `not-handled`
 * (#1251), and a rule that matched a NOUN and then refused a tail it never read answered an OWNED code
 * instead — `bad-equation` about «I: y^2=2x», an equation the student never wrote; `out-of-scope` about
 * a hyperbola the reader built out of the student's dash. Terminal, no escape.
 *
 * The fix is at the claiming end, never at the seam: `claimable` (ADR-AG-114's discriminator, generalised
 * to every claiming site) declines a tail with Hebrew letters, a leading connective dash, or an unread
 * name + connective, and the chain falls through to `not-handled`. Every row below is asked through
 * the real `decideSubmit` path and the seam's own predicate — never by reproducing either.
 *
 * The LLM is a stub throughout (standing rule 2); the session model is the oracle for the rewrite.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, reachesFallback } from '../app/submit';
import { runFallback } from '../app/fallback';
import { parseLine } from '../parser/parseAnalytic';

const verdictOf = (line: string) => decideSubmit(line, [], 0);
const codeOf = (line: string) => {
  const v = verdictOf(line);
  return v.kind === 'refused' ? v.error.key : v.kind;
};

describe('#1272 — a rule that matched a noun and never read the tail answers not-handled, and the seam fires', () => {
  it.each([
    // the three measured losses of the escape (issue body, f8cb9c3a)
    ['פרבולה I: y^2=2x', 'bad-equation about «I: y^2=2x»'],
    ['נתון מעגל I - x^2+y^2=16', 'the dash read as a sign: a hyperbola labelled circle → out-of-scope'],
    ['נתונה פרבולה I - y^2=2x', 'the dash read as a sign → out-of-scope'],
    // the same class at the other claiming sites — a Hebrew word is not an expression
    ['שיפוע הישר AB הוא חיובי', 'the slope rule claimed a Hebrew word'],
    ['שטח המשולש ABC הוא גדול', 'the area rule claimed a Hebrew word'],
    ['שיעור ה-x של A הוא שלילי', 'the component rule claimed a Hebrew word'],
    ['האלכסון הראשי: משהו', 'the diagonal-equation rule claimed a Hebrew word'],
    // the connective spelt with an en dash, and an unread name at a line-equation tail
    ['מעגל I – x^2+y^2=9', 'an en dash is never a sign'],
    ['משוואת הישר l1 היא AB: y=2x', 'a name the rule did not consume, then a colon'],
  ])('«%s» — %s', (line) => {
    const v = verdictOf(line);
    expect(v.kind === 'refused' && v.error.key, line).toBe('not-handled');
    expect(reachesFallback(v), `${line}: the seam fires`).toBe(true);
    // the refusal is about the student's own sentence, never about a fragment the reader cut
    expect(v.kind === 'refused' && v.error.detail, line).toBe(line);
  });

  it('a genuinely owned refusal stays terminal — the seam was not widened', () => {
    const owned: Array<[string, string]> = [
      ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2', 'bad-equation'], // a truncated equation, read and found wanting (#1059)
      ['שיפוע הישר AB הוא 3/', 'bad-equation'], // a number the rule read and could not finish
      ['A(x,3)', 'reserved-coordinate'],
      ['AA תיכון במשולש ABC', 'degenerate-role'],
      ['משוואת המעגל x^2+y^2=-9', 'does-not-exist'], // the geometry's answer, about a curve the tool DID parse
    ];
    for (const [line, code] of owned) {
      expect(codeOf(line), line).toBe(code);
      expect(reachesFallback(verdictOf(line)), `${line}: stays terminal`).toBe(false);
    }
  });

  it('a leading MINUS glued to its term is a sign, and the plane’s own variables before a dash are an equation — these keep parsing', () => {
    for (const line of [
      'משוואת הישר l1 היא -x+y=1',
      'נתון מעגל I שמשוואתו -x^2-y^2=-16',
      'משוואת המעגל -x^2-y^2=-16',
      'הישר l2: -2x+y=0',
      'y=-2x+3',
      'מעגל I: x^2+y^2=9',
      'נתונה פרבולה y^2=2x',
      'משוואת הישר l1 היא y - 2x = 0',
      'משוואת הישר l1 היא x-y=1',
    ]) {
      expect(parseLine(line).ok, line).toBe(true);
      expect(codeOf(line), line).toBe('record');
    }
  });

  it('end to end: the escaped sentence comes back from the (stubbed) model in canonical spelling and is recorded through the same gate', async () => {
    // The session model as oracle: «נתון מעגל I - x^2+y^2=16» is the circle I with the connective spelt as a dash.
    const ask = async (utterance: string) => {
      expect(utterance).toBe('נתון מעגל I - x^2+y^2=16');
      return { steps: ['נתון מעגל I: x^2+y^2=16'] };
    };
    const out = await runFallback('נתון מעגל I - x^2+y^2=16', [], 0, ask);
    expect(out).toEqual({ kind: 'lines', lines: ['נתון מעגל I: x^2+y^2=16'] });
  });

  it('the seam predicate is the one question App.tsx asks — refused ∧ not-handled, nothing else', () => {
    expect(reachesFallback({ kind: 'refused', error: { key: 'not-handled', detail: 'x' } as never })).toBe(true);
    expect(reachesFallback({ kind: 'refused', error: { key: 'bad-equation', detail: 'x' } as never })).toBe(false);
    expect(reachesFallback({ kind: 'record', line: 'x' })).toBe(false);
    expect(reachesFallback({ kind: 'ignored' })).toBe(false);
  });
});
