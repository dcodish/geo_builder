/**
 * #1214 — THE FOLD LABEL NAMES THE KIND, IN THE STUDENT'S WORD.
 *
 * **Operator, 2026-09-19, playing T19:** *"the data panel says נתוני העקום and עקום is mathematically
 * correct but not what a highschool student would expect so we should have נתוני המעגל and then
 * נתוני הישר etc."*
 *
 * He is right, and this is **his own #1147 ruling reintroduced three commits later** — by the label
 * #1212 added. «עקום» is the internal category (`kind: 'curve'`) reaching a student, which is exactly
 * what #1147 removed from the heading directly above this row.
 *
 * ## The guard that should have made it impossible had a one-letter hole
 *
 * #1147 shipped a SWEEP over the whole locale, with the comment *"the class is closed rather than the
 * instance"*. Measured:
 *
 * ```
 * /עקומ/  vs  «עקומים»  (what #1147 removed)   ->  true
 * /עקומ/  vs  «העקום»   (what #1212 shipped)   ->  FALSE
 * ```
 *
 * The plural carries a medial mem (`מ`, U+05DE); the singular ends in a **final mem** (`ם`, U+05DD) —
 * a different codepoint. The sweep was written against the word in front of it and silently did not
 * cover the singular of that same word, so it read as class-level while being instance-level. That is
 * the worse failure of the two: it is the kind of test that makes the next session confident.
 *
 * Widening it to `/עקו[מם]/` turned #1147's own file red on both strings this issue is about, before
 * anything else changed. That red was the fix's first piece of evidence.
 *
 * **The root cause is the hole. The wording is the symptom.**
 *
 * ## A note on the operator's example
 *
 * «נתוני הישר» cannot appear today: a LINE returns no `details`, so it renders no disclosure at all
 * (#1212, and T23 checks it). The three kinds that fold are circle, parabola and ellipse.
 * [#1219](https://github.com/dcodish/geo_builder/issues/1219) would give a line a fold, and then this
 * table gains its fourth entry — which is why the test below is written against `curveParts` rather
 * than against a hardcoded list of three.
 */
import { describe, expect, it } from 'vitest';
import { curveDetailsKey, curveParts } from '../app/curveText';
import { analyticI18n } from '../i18n';
import type { NumCurve } from '../engine/types';

/** One representative of every kind the union has, so adding a kind breaks this file loudly. */
const OF_EVERY_KIND: NumCurve[] = [
  { kind: 'line', a: 1, b: 1, c: -1 },
  { kind: 'circle', cx: 3, cy: 4, r: 3 },
  { kind: 'parabola', p: 4 },
  { kind: 'ellipse', a: 4, b: 3 },
];

describe('#1214 — the fold label is the student’s noun', () => {
  it('each kind that folds is labelled with its own noun', () => {
    expect(analyticI18n.t(curveDetailsKey('circle'))).toBe('נתוני המעגל');
    expect(analyticI18n.t(curveDetailsKey('parabola'))).toBe('נתוני הפרבולה');
    expect(analyticI18n.t(curveDetailsKey('ellipse'))).toBe('נתוני האליפסה');
  });

  it('EVERY kind with details has a real label — the table and curveParts agree', () => {
    /**
     * Written against `curveParts`, not a list of three, so a fifth conic cannot ship a labelled row
     * with nothing in it or a detail row with no label. This is the assertion that makes the pair a
     * chokepoint rather than two things that happen to match today.
     */
    for (const c of OF_EVERY_KIND) {
      const parts = curveParts(c);
      if (!parts.details) continue;
      const label = analyticI18n.t(curveDetailsKey(c.kind));
      expect(label, `${c.kind} has details and must have a label`).toBeTruthy();
      expect(label, `${c.kind}'s label is not a bare key`).not.toBe(curveDetailsKey(c.kind));
    }
  });

  it('a LINE has no details, so it needs no label — the operator’s «נתוני הישר» cannot appear', () => {
    expect(curveParts({ kind: 'line', a: 1, b: 1, c: -1 }).details).toBeUndefined();
  });

  it('NO user-facing string says «עקום» in either form — the hole this closes', () => {
    /**
     * The singular is the case #1147's sweep missed. Asserting BOTH mem forms here as well as in
     * #1147's own file, because this is the issue that found the gap.
     */
    for (const lang of ['he', 'en'] as const) {
      for (const key of ['curveDetailsCircle', 'curveDetailsParabola', 'curveDetailsEllipse', 'curveDetailsToggle']) {
        const s = analyticI18n.getFixedT(lang)(key) as string;
        expect(/עקו[מם]/.test(s), `${lang}.${key} = ${s}`).toBe(false);
      }
    }
  });

  it('the medial and final mem really are different characters — why the hole existed', () => {
    // Stated rather than left implicit: this is the whole mechanism of the defect.
    expect(/עקומ/.test('עקומים')).toBe(true);
    expect(/עקומ/.test('העקום')).toBe(false);
    expect(/עקו[מם]/.test('עקומים')).toBe(true);
    expect(/עקו[מם]/.test('העקום')).toBe(true);
  });
});
