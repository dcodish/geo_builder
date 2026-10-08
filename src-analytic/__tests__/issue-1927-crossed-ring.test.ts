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
      'הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: "מרובע ACBD". אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את השיעורים — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.',
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
   * SAMPLES ARE NOT PROOF. «A(k,0)»'s trapezoid is crossed at every sampled k (the sweep is ±4) and simple for k > 4 — a
   * satisfiable figure. Its shape can change (`shapeDof` 1), so the walk's samples alone never refuse it.
   */
  it('a ring whose shape can still change is never refused on samples alone', () => {
    const seq = ['A(k,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD'];
    for (const seed of SEEDS) expect(play(seq, seed), `seed ${seed}`).toBeNull();
    const rf = derive(seq).figure.ringFaults.find((f) => f.id === 'poly-ABCD');
    expect(rf?.shapeDof).toBeGreaterThan(0);
  });
});

/**
 * NOT DELIVERED (reported on #1927): a trapezoid's shape has a free ratio (`shapeDof` 1), so its crossing in ACBD is
 * not proven by an affine argument, and refusing on the walk's samples would also refuse «A(k,0)»'s satisfiable
 * trapezoid. These still record, with the unspoken `crossed` fault, as on `main` — a known gap awaiting the operator.
 */
describe('#1927 — known gap: the trapezoid members', () => {
  it.each([[['טרפז ABCD', 'מרובע ACBD']], [['מרובע ACBD', 'טרפז ABCD']]])('%j still records (gap)', (seq) => {
    expect(play(seq)).toBeNull();
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
