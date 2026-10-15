/**
 * #2028 ([ADR-W-130](../../../docs/06w-decisions-workspace.md#adr-w-130)) — THE MESSAGE FLOOR.
 *
 * The operator's ruling of 2026-10-13 (on #1995, card 5): any engine text that matches no humanised pattern
 * reaches the student as «משהו השתבש בבניית השורה הזאת. נסו לנסח אותה אחרת, או לפרק אותה לשני צעדים.» — never
 * raw in English, never spliced into a mixed-language line.
 *
 * Measured on b0ef3240 through `humanizeError` with the Hebrew locale (the issue's table): every unmatched string
 * below came back as its own English («solver did not converge…»), one with Hebrew spliced into it
 * («cannot place point על הקטע: residual 0.42 exceeds tolerance»), and the matched over-constrained frame
 * interpolated an anonymous touch point («|OD| = |O@f-AB|», #2001).
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { stripFormatControls } from '../../../shell/bidi';
import { explainError, humanizeError, humanizeErrorOutcome, type Translate } from '@/i18n/humanizeError';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const en: Translate = (k, o) => i18n.getFixedT('en')(k, o) as string;
const FLOOR_HE = 'משהו השתבש בבניית השורה הזאת. נסו לנסח אותה אחרת, או לפרק אותה לשני צעדים.';
const FLOOR_EN = 'Something went wrong building this line. Try wording it differently, or split it into two steps.';

/** The issue's measured table: engine text no pattern describes. */
const UNMATCHED = [
  'solver did not converge within the iteration budget',
  'NaN in jacobian row 3',
  'unsupported command kind: set-angle-bound',
  'internal invariant violated: carrier for circle-O has no owner',
  'cannot place point on segment: residual 0.42 exceeds tolerance',
  'conflict: something new about @t-O0 here',
];

describe('#2028 — unmatched engine text renders the floor sentence', () => {
  it('the ruled sentences are the locale strings (both locales)', () => {
    expect(he('errors.floor')).toBe(FLOOR_HE);
    expect(en('errors.floor')).toBe(FLOOR_EN);
  });

  for (const raw of UNMATCHED) {
    it(`«${raw}» → the floor, in Hebrew and in English`, () => {
      expect(humanizeError(raw, he)).toBe(FLOOR_HE);
      expect(humanizeError(raw, en)).toBe(FLOOR_EN);
      expect(humanizeErrorOutcome(raw, he).floor).toBe(true);
      // with the student's sentence too — the floor names nothing, so `said` cannot change it
      expect(humanizeError(raw, he, 'AB משיק למעגל בנקודה D')).toBe(FLOOR_HE);
      // no Latin run of two or more letters in the Hebrew render
      expect(humanizeError(raw, he)).not.toMatch(/[A-Za-z]{2,}/);
    });
  }

  it('the floor never carries the retry hint; a ruled message still does', () => {
    const hint = he('errors.retryHint');
    for (const raw of UNMATCHED) expect(explainError(raw, he)).toBe(FLOOR_HE);
    const ruled = explainError('over-constrained: |AC| = 9 cannot hold', he);
    expect(ruled.endsWith(hint)).toBe(true);
    expect(humanizeErrorOutcome('over-constrained: |AC| = 9 cannot hold', he).floor).toBe(false);
  });

  it('empty input stays empty (no floor for no error)', () => {
    expect(explainError('', he)).toBe('');
    expect(explainError(null, he)).toBe('');
  });
});

describe('#2028 — a matched frame whose engine value carries an engine token renders the floor', () => {
  const LEAK = 'over-constrained: |@ctr-OD| = |@ctr-O@f-AB| cannot hold';

  it('without the student’s sentence', () => {
    expect(humanizeError(LEAK, he)).toBe(FLOOR_HE);
  });

  it('with the sentence and the earlier one (the `_said_vs` frame)', () => {
    expect(humanizeError(`${LEAK} [vs #1]`, he, 'AB משיק למעגל בנקודה D', 'מעגל חסום במשולש ABC')).toBe(FLOOR_HE);
    expect(humanizeError(`${LEAK} [vs #1]`, he, 'AB משיק למעגל בנקודה D')).toBe(FLOOR_HE);
  });

  it('every id shape — not a prefix list', () => {
    for (const tok of ['@f-AB', '@t-O0', '@tang-OE', '#sz5_N', 'incircle-ABC']) {
      expect(humanizeError(`over-constrained: |OD| = ${tok} cannot hold`, he), tok).toBe(FLOOR_HE);
    }
  });

  it('a fragment of student letters only still renders the ruled over-constrained frame, unchanged', () => {
    const out = humanizeError('over-constrained: |OF| = |OD| cannot hold', he);
    expect(out).toBe(he('errors.overConstrained', { what: '|OF| = |OD|' }));
    expect(humanizeError('over-constrained: |OF| = |OD| cannot hold [vs #1]', he, 'AB משיק למעגל בנקודה D', 'מעגל חסום במשולש ABC')).toBe(
      he('errors.overConstrained_said_vs', { what: '|OF| = |OD|', said: 'AB משיק למעגל בנקודה D', other: 'מעגל חסום במשולש ABC' }),
    );
  });

  it('the student’s own sentence is never judged: a `said` that looks id-shaped does not send the message to the floor', () => {
    const out = humanizeError('over-constrained: |AC| = 9 cannot hold', he, 'P על line-AB');
    expect(out).not.toBe(FLOOR_HE);
    expect(stripFormatControls(out)).toContain('P על line-AB');
  });
});

describe('#2028 — sentences that landed 2026-10-14 are not swallowed by the floor', () => {
  it('#2099 collinear circle, #2064 straight corner (`_said`) render their own keys', () => {
    for (const [raw, said] of [
      ['over-constrained: a circle through A, D, B on one line cannot hold [vs #1]', 'מעגל דרך A, D, B'],
      ['cannot construct O: A, D, B are collinear (no circumscribed circle)', undefined],
      ['collapsed: polygon A, B, C, D, E would be flat at B, C, D — ∠BCD = 180° cannot hold', '∠BCD = 180°'],
    ] as const) {
      const o = humanizeErrorOutcome(raw, he, said);
      expect(o.floor, raw).toBe(false);
      expect(o.text).not.toBe(FLOOR_HE);
    }
    expect(humanizeError('collapsed: polygon A, B, C, D, E would be flat at B, C, D — ∠BCD = 180° cannot hold', he, '∠BCD = 180°')).toBe(
      he('errors.polygonCornerStraight_said', {
        said: '∠BCD = 180°',
        points: 'B, C, D',
        poly: 'ABCDE',
        what: '∠BCD = 180°',
        polyNoun: he('errors.ngonDefinite.5'),
        lessNoun: he('errors.ngonIndefinite.4'),
      }),
    );
  });
});
