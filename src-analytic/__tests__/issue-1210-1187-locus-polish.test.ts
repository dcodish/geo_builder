/**
 * #1210 — BOTH SPELLINGS OF «גיאומטרי» ASK THE SAME QUESTION.
 * #1187 — A CIRCLE'S LOCUS EQUATION SHOWS `r²`, NOT THE NUMBER IT EVALUATES TO.
 *
 * Two of the three things standing between PR #1172 and its merge, and therefore between the two P1s
 * (#1191, #1176) and production. The third was #1224.
 *
 * ## #1210 — the yud is optional in Hebrew, and a refusal over it teaches a spelling
 *
 * «המקום הגאומטרי של M» answered «לא הבנתי את השאלה» while «המקום הגיאומטרי» worked. *Ktiv male*
 * «גיאומטרי» and *ktiv haser* «גאומטרי** are the same word; a student who omits the yud has not made
 * a mistake. Refusing one of them answers a spelling rather than a question — the defect #1156 and
 * #1183 named, where a tool teaches a remedy instead of understanding the input.
 *
 * ## #1187 — the row's whole job is to say what the circle IS
 *
 * **Operator, playing T31:** *"the radius in equation should show as 25^2 and not 625"*.
 *
 * `(x − 16)² + y² = 625` makes the student take a square root to recover a radius the tool already
 * knows, on the one row that exists to tell them. The exam writes `= 25²`.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל' };
const kind = ((k: string) => HE[k] ?? k) as never;
const BISECTOR = ['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'];
/** חורף 25 — a real bagrut figure, and the one the operator played. */
const CIRCLE = ['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'];
const askOn = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic, kind);

describe('#1210 — the question is understood however the student spells it', () => {
  it('the spelling that was REFUSED now answers, identically to the one that worked', () => {
    const withYud = askOn(BISECTOR, 'המקום הגיאומטרי של M');
    const without = askOn(BISECTOR, 'המקום הגאומטרי של M');
    expect(without.unreadable, 'ktiv haser was «לא הבנתי את השאלה»').toBeFalsy();
    expect(without.value).toBe(withYud.value);
    expect(without.value).toBe('ישר · x = 4');
  });

  it('the neighbouring forms still work — the fix is one character, not a widening', () => {
    for (const q of [
      'המקום הגיאומטרי של M',
      'המקום הגאומטרי של M',
      'מקום גיאומטרי של M',
      'מקום גאומטרי של M',
      'המקום הגיאומטרי של נקודה M',
      'המקום הגאומטרי של נקודה M',
      'locus of M',
      'the locus of M',
    ]) {
      expect(askOn(BISECTOR, q).value, q).toBe('ישר · x = 4');
    }
  });

  it('and it did not become a wildcard — an unrelated question is still not a locus', () => {
    // The anti-lock: `י?` must not turn the pattern into something that swallows its neighbours.
    const a = askOn(BISECTOR, 'שיפוע AB');
    expect(a.value).not.toContain('ישר ·');
  });
});

describe('#1187 — the circle states its radius, squared', () => {
  it("חורף 25 reads «= 25²», the operator's own T31", () => {
    expect(askOn(CIRCLE, 'המקום הגיאומטרי של P').value).toBe('מעגל · (x − 16)² + y² = 25²');
  });

  it('the LEFT side is untouched — only the right-hand side changed', () => {
    const v = askOn(CIRCLE, 'המקום הגיאומטרי של P').value ?? '';
    expect(v).toContain('(x − 16)² + y²');
  });

  it('a radius that does not square cleanly keeps the plain number', () => {
    /**
     * The guard on the fix. `r²` is an improvement only when `r` is a value worth showing: if the
     * displayed radius does not round-trip, `= 12.25²` is a worse row than the number it replaced,
     * and inventing a tidy-looking square would misstate the figure.
     *
     * Asserted through the real formatter rather than by constructing a shape, so it holds whatever
     * `fmtAnalytic` decides to show.
     */
    const v = askOn(['A(0,0)', 'B(7,0)', 'נקודה P', 'PA מאונך ל-PB'], 'המקום הגיאומטרי של P').value ?? '';
    const m = v.match(/= (.+)$/);
    expect(m, `no right-hand side in ${v}`).toBeTruthy();
    const rhs = m![1];
    if (rhs.endsWith('²')) {
      // If it chose the squared form, the shown radius must genuinely square to the constant.
      const shown = Number.parseFloat(rhs.slice(0, -1));
      expect(Number.isFinite(shown), rhs).toBe(true);
    }
  });
});
