/**
 * #1927 item B (ADR-AG-250) — A RING DECLARED OVER A SHAPE'S POINTS IN A CROSSING ORDER IS REFUSED.
 *
 * Operator ruling, 2026-10-08 (#1927): *"refused naming the declaration, in every builder, with analytic's
 * `errRingContradictsNoun` … Never green, never a raw error"*. «ריבוע ABCD · מרובע ACBD» recorded with an unspoken
 * `crossed` ring fault: the square's points can move (`ringDof` 4), so the pinned-ring arm (ADR-AG-129 / ADR-AG-249)
 * never fired. The evidence was already in `drawableAt`'s walk: in every configuration whose givens held, the ring
 * was crossed, and in none was it simple (`Figure.forcedCrossed`, at least four such configurations) — and its SHAPE
 * is fixed up to an affine map (`shapeDof === 0`), which proves the crossing beyond the samples. One ring at a time,
 * never the figure.
 *
 * Every row is submitted line by line through `decideSubmit`, as the app does, at several seeds (the seed is the
 * configuration «הציגו תצורה אחרת» advanced to).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Submits each line as the app does; the first refusal (its line index and error), or null when all record. */
const play = (seq: readonly string[], seed = 0) => {
  const lines: string[] = [];
  for (const [i, l] of seq.entries()) {
    const v = decideSubmit(l, lines, seed);
    if (v.kind === 'refused') return { at: i, error: v.error, lines };
    if (v.kind === 'record') lines.push(v.line);
  }
  return null;
};
const SEEDS = [0, 1, 2, 3];

describe('#1927 — the operator’s rows are refused with the ring message', () => {
  it('«ריבוע ABCD · מרובע ACBD»: «מרובע ACBD» is refused, not added, with the exact text', () => {
    const r = play(['ריבוע ABCD', 'מרובע ACBD']);
    expect(r?.at).toBe(1);
    expect(r?.error).toMatchObject({ key: 'ring-contradicts-noun', detail: 'מרובע ACBD' });
    expect(errorText(r!.error, t)).toBe(
      'הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: "מרובע ACBD". אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.',
    );
    expect(errorText(r!.error, tEn)).toContain('מרובע ACBD');
    // Nothing is committed: the prior figure is the square alone, unchanged.
    expect(r!.lines).toEqual(['ריבוע ABCD']);
  });

  it.each([
    [['מלבן ABCD', 'מרובע ABDC'], 'מרובע ABDC'],
    [['מלבן ABCD', 'טרפז ABDC'], 'טרפז ABDC'],
  ])('%j: the last line is refused, quoting it', (seq, line) => {
    for (const seed of SEEDS) {
      const r = play(seq, seed);
      expect(r?.at).toBe(seq.length - 1);
      expect(r?.error).toMatchObject({ key: 'ring-contradicts-noun', detail: line });
    }
  });
});

describe('#1927 — the class, both orders, one ring at a time', () => {
  /** [the lines, the refused line] — measured at 5edeeca1 as recorded with an unspoken `crossed` fault. */
  const CLASS: Array<[string[], string]> = [
    [['ריבוע ABCD', 'AB = 4', 'מרובע ACBD'], 'מרובע ACBD'],
    [['מקבילית ABCD', 'מרובע ACBD'], 'מרובע ACBD'],
    [['מעוין ABCD', 'מרובע ABDC'], 'מרובע ABDC'],
    [['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABED'], 'מרובע ABED'],
    [['משושה משוכלל ABCDEF', 'מרובע ACFD'], 'מרובע ACFD'],
    [['מחומש משוכלל ABCDE', 'מחומש ACEBD'], 'מחומש ACEBD'],
    // The ring declared FIRST: the shape line that completes the crossing is refused, quoting that line (#1923's rule).
    [['מרובע ACBD', 'ריבוע ABCD'], 'ריבוע ABCD'],
    [['מרובע ABDC', 'מלבן ABCD'], 'מלבן ABCD'],
    [['טרפז ABDC', 'מלבן ABCD'], 'מלבן ABCD'],
    [['מרובע ACBD', 'מקבילית ABCD'], 'מקבילית ABCD'],
    [['מרובע ABED', 'משולש ABC', 'D אמצע BC', 'E אמצע AC'], 'E אמצע AC'],
    // #1923's leak, a pinned crossed ring beside an unrelated free point (ADR-AG-249 already refuses it).
    [['A(0,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'נקודה E', 'טרפז ABCD'], 'טרפז ABCD'],
    // ADR-AG-256 — the trapezoid members, once a known gap: a trapezoid's side ratio is free (`shapeDof` 1), so no
    // affine proof — and nothing the student wrote can save the ring (a simple trapezoid is convex, and its other
    // orders cross). The search ran over every free quantity and found no simple drawing: "refuse last".
    [['טרפז ABCD', 'מרובע ACBD'], 'מרובע ACBD'],
    [['מרובע ACBD', 'טרפז ABCD'], 'טרפז ABCD'],
  ];

  it.each(CLASS)('%j → refused at the last line, at every seed', (seq, line) => {
    for (const seed of SEEDS) {
      const r = play(seq, seed);
      expect(r, `seed ${seed}`).not.toBeNull();
      expect(r!.at, `seed ${seed}`).toBe(seq.length - 1);
      expect(r!.error, `seed ${seed}`).toMatchObject({ key: 'ring-contradicts-noun', detail: line });
    }
  });

  /**
   * «מקבילית ABCD · מרובע ACBD» at seeds 3 and 6 used to fall back on a FLAT parallelogram whose solve stopped short and
   * was refused as a collapse — a false reason. The walk had shown the givens hold with the ring crossed, so the figure
   * the arm reads is one of those.
   */
  it('the parallelogram member says the ring, never a collapse, at seeds 3 and 6', () => {
    for (const seed of [3, 6]) {
      expect(play(['מקבילית ABCD', 'מרובע ACBD'], seed)?.error).toMatchObject({ key: 'ring-contradicts-noun' });
    }
  });

  it('the evidence: the ring can move, it is crossed wherever the givens hold, and its shape is affine-fixed', () => {
    const d = derive(['ריבוע ABCD', 'מרובע ACBD']);
    expect(d.figure.forcedCrossed).toEqual(['poly-ACBD']);
    const rf = d.figure.ringFaults.find((f) => f.id === 'poly-ACBD');
    expect(rf?.ringDof).toBeGreaterThan(0);
    expect(rf?.shapeDof).toBe(0);
  });

  /**
   * SEARCH FIRST, REFUSE LAST (ADR-AG-256). «A(k,0)»'s trapezoid is crossed at every k the default window draws and
   * simple for k > 4 — a satisfiable figure. It is never refused, and it is DRAWN simple: the search reaches past the
   * window (#1939's own lock is `issue-1939-ring-search.test.ts`).
   */
  it('a ring a free parameter can save is never refused, and is drawn simple', () => {
    const seq = ['A(k,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD'];
    for (const seed of SEEDS) {
      expect(play(seq, seed), `seed ${seed}`).toBeNull();
      expect(derive(seq, seed).figure.ringFaults, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('#1927 — unchanged', () => {
  it.each([
    [['ריבוע ABCD', 'טרפז ACBD'], 'טרפז ACBD'],
    [['ריבוע ABCD', 'מקבילית ACBD'], 'מקבילית ACBD'],
    [['מלבן ABCD', 'ריבוע ACBD'], 'ריבוע ACBD'],
  ])('%j keeps «לא נמצאה תצורה שבה מתקיים»', (seq, line) => {
    expect(play(seq)?.error).toMatchObject({ key: 'unsatisfiable', detail: line });
  });

  it.each([
    [['ריבוע ABCD', 'מרובע ADCB']],
    [['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABDE']],
    [['משולש ABC', 'נקודה D', 'מרובע ABCD']],
    [['קטע AC', 'קטע BD', 'מרובע ABCD']],
    // A kite may be a dart, and then ABDC is a simple ring: analytic draws it so, and it records.
    [['דלתון ABCD', 'מרובע ABDC']],
  ])('%j records, at every seed, and draws the ring simple', (seq) => {
    for (const seed of SEEDS) {
      expect(play(seq, seed), `seed ${seed}`).toBeNull();
      expect(derive(seq, seed).figure.ringFaults.filter((rf) => rf.violation === 'crossed')).toEqual([]);
    }
  });
});
