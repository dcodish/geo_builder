/**
 * #1111 — "your figure has no C" is not "I did not understand you".
 *
 * Operator, playing T15: *"i asked for AB in different ways and got some wierd answers"*. The weird one:
 * «מרחק של C מ-AB» on a figure with no `C` answered **«לא הבנתי את השאלה»** — *I did not understand the
 * question*. The Hebrew was understood perfectly; the tool simply had no `C`.
 *
 * **And it KNEW.** `ask.ts` found which id was missing and the very next line threw it away:
 *
 * ```ts
 * const missing = measure.terms…find((id) => !objectById(d.construction, id));
 * if (missing !== undefined) return { question, value: null, unreadable: true };
 * ```
 *
 * A student told their sentence was not understood will rewrite the sentence for ever, because the
 * sentence was never the problem. CLAUDE.md's standing rule is that an error names the conflicting
 * STATEMENT, never internal state — and here the statement was in hand.
 *
 * **The sweep is the fix, not the one reported branch.** The plan named three `unreadable` returns;
 * there are six, and FOUR of them are this shape — a point by name, a line in a slope question, a curve
 * in an equation question, and a point inside a measure expression. Fixing only the reported one would
 * be patching the input that errored. The two that remain `unreadable` really are unreadable: empty
 * input, and a sentence the measure grammar cannot parse at all.
 *
 * Each branch is asserted separately so a future merge of the copy cannot silently re-collapse them.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';

const fmt = (v: number) => String(Math.round(v * 100) / 100);
const describeCurve = () => '';
const answer = (lines: string[], question: string) => ask(derive(lines, 0), question, fmt, describeCurve);

/** A determined triangle — A, B, C all exist; D, E and `l9` never do. */
const FIG = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'];

describe('#1111 — a missing object is named, not called incomprehensible', () => {
  it('a point inside a measure expression — the operator’s case, in a spelling that parses', () => {
    const a = answer(FIG, 'המרחק מ-D לישר AB');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing).toEqual({ name: 'D', kind: 'point' });
  });

  it('KNOWN GAP — his exact wording «מרחק של D מ-AB» does not parse at all (#1134)', () => {
    /**
     * Measured, and recorded rather than hidden. The operator reported «מרחק של C מ-AB», and this fix
     * does NOT make that sentence work: the «של» word order — *distance OF D FROM AB* — is not in the
     * measure grammar, so it never reaches the missing-object check this issue is about.
     *
     * That is a missing CAPABILITY, which CLAUDE.md says is relabelled a feature and never built under
     * a bug's banner, so it is filed as #1134 instead of widened in here. This case exists so the gap
     * is visible from the lock: when #1134 lands it flips to a missing-object answer, and whoever
     * lands it will see exactly what to change.
     */
    const a = answer(FIG, 'מרחק של D מ-AB');
    expect(a.unreadable).toBe(true);
    expect(a.missing).toBeUndefined();
  });

  it('a point asked for by name alone', () => {
    const a = answer(FIG, 'D');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing).toEqual({ name: 'D', kind: 'point' });
  });

  it('a curve in an EQUATION question', () => {
    const a = answer(FIG, 'משוואת הישר l9');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing?.kind).toBe('curve');
    expect(a.missing?.name).toContain('l9');
  });

  it('a line in a SLOPE question', () => {
    const a = answer(FIG, 'שיפוע הישר l9');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing?.kind).toBe('curve');
    expect(a.missing?.name).toContain('l9');
  });
});

describe('#1111 — what is still genuinely unreadable stays unreadable', () => {
  it('a sentence the measure grammar cannot parse at all', () => {
    const a = answer(FIG, 'מה שלומך היום');
    expect(a.unreadable).toBe(true);
    expect(a.missing).toBeUndefined();
  });

  it('an empty question', () => {
    const a = answer(FIG, '   ');
    expect(a.unreadable).toBe(true);
    expect(a.missing).toBeUndefined();
  });
});

describe('#1111 — an object that DOES exist is unaffected', () => {
  it('answers the question it was always able to answer', () => {
    const a = answer(FIG, 'AB');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing).toBeUndefined();
    expect(a.value).toBe('6');
  });

  it('a point that exists but is not pinned is OPEN, not missing — a different answer again', () => {
    /**
     * The distinction this issue is about, from the other side. «עדיין לא נקבע מהנתונים» says the
     * figure has the object and has not fixed it; «אין בשרטוט נקודה בשם D» says it has no such object.
     * Collapsing these would repeat the defect in the opposite direction.
     */
    const a = answer(['משולש ABC'], 'AB');
    expect(a.missing).toBeUndefined();
    expect(a.unreadable).toBeFalsy();
    expect(a.value).toBeNull();
  });
});
