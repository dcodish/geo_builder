/**
 * #1991 ([ADR-AG-261](../../docs/06c-decisions-analytic.md#adr-ag-261)) — A SPECIFIC NOUN DECLARED OVER A CONVEX
 * RING'S LETTERS IN A CROSSING ORDER IS REFUSED FOR ITS ORDER, NOT WITH «לא נמצאה תצורה».
 *
 * Measured on `main` @ 06fc51dd through `decideSubmit`: «ריבוע ABCD» · «מקבילית ACBD» (and «טרפז ACBD», «מלבן ACBD»,
 * and «מקבילית ACBD» after «מלבן ABCD») were refused `unsatisfiable` — «לא נמצאה תצורה שבה מתקיים: "מקבילית ACBD"»,
 * which tells the student the search missed when the mistake is the order of four letters. The generic
 * «מרובע ACBD» already got `ring-contradicts-noun` (ADR-AG-250/256).
 *
 * Why ADR-AG-250's pass could not say it: its evidence is the walk's, and `noteRings` records only candidates where
 * every GIVEN holds — so when the second noun's own relations are what cannot hold, there is no such candidate.
 * Measured at 06fc51dd: `forcedCrossed` empty, `hardRingFaults` reporting the ring crossed with `ringDof = 4`, which
 * the `pinnedRingFaults` filter rightly drops. The evidence is now structural (`convexWhenSimple`).
 *
 * Operator ruling 2026-10-10 (option A): 2-D's crossed-shape message everywhere.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';
import { SHAPES, convexWhenSimple } from '../engine/shapes';
import type { InputError } from '../store/useAnalyticStore';

const SEEDS = [0, 1, 2, 3, 4, 5];
const he = analyticI18n.getFixedT('he') as unknown as Parameters<typeof errorText>[1];
const en = analyticI18n.getFixedT('en') as unknown as Parameters<typeof errorText>[1];
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** Submit every line but the last through the real gate; return the gate's verdict on the last. */
function last(lines: readonly string[], seed: number) {
  const recorded: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, recorded, seed);
    expect(v.kind, `context line «${line}» at seed ${seed}`).toBe('record');
    recorded.push(line);
  }
  return decideSubmit(lines[lines.length - 1], recorded, seed);
}

describe('#1991 — the reported rows carry the shared ring message', () => {
  it.each([
    [['ריבוע ABCD', 'מקבילית ACBD']], // the round #1983 play-sheet T10 line
    [['ריבוע ABCD', 'טרפז ACBD']],
    [['ריבוע ABCD', 'מלבן ACBD']],
    [['מלבן ABCD', 'מקבילית ACBD']],
    [['מעוין ABCD', 'מקבילית ACBD']],
    [['ריבוע ABCD', 'מרובע ACBD']], // ADR-AG-250's own case, unchanged
  ])('%j', (lines) => {
    const line = lines[lines.length - 1];
    const v = last(lines, 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toMatchObject({ key: 'ring-contradicts-noun', detail: line });
    expect(plain(errorText(v.error as InputError, he))).toBe(
      `הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: «${line}». אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.`,
    );
    expect(plain(errorText(v.error as InputError, he)), 'never «לא נמצאה תצורה»').not.toMatch(/לא נמצאה תצורה/);
    expect(plain(errorText(v.error as InputError, en))).toContain('do not form that shape in this order');
  });

  it('the refusal is structural, so it holds at every seed, and the earlier line stays green', () => {
    for (const seed of SEEDS) {
      const v = last(['ריבוע ABCD', 'מקבילית ACBD'], seed);
      expect(v.kind, `seed ${seed}`).toBe('refused');
      const d = derive(['ריבוע ABCD'], seed);
      expect(d.faults, `the square alone is fine at seed ${seed}`).toEqual([]);
    }
  });

  it('only the declaring line is faulted — the square is not blamed for the order of the other ring', () => {
    const d = derive(['ריבוע ABCD', 'מקבילית ACBD'], 0);
    expect(d.faults).toEqual([{ index: 1, code: 'ring-contradicts-noun', detail: 'מקבילית ACBD' }]);
  });

  it('the ring FIRST: the line that completed the crossing is the one refused', () => {
    const v = last(['מקבילית ACBD', 'ריבוע ABCD'], 0);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error).toMatchObject({ key: 'ring-contradicts-noun', detail: 'ריבוע ABCD' });
  });
});

describe('#1991 — search first, refuse last: what is NOT refused', () => {
  it('a reordered ring with nothing to contradict it is drawn', () => {
    for (const line of ['מקבילית ACBD', 'מרובע ACBD', 'טרפז ACBD'])
      expect(decideSubmit(line, [], 0).kind, line).toBe('record');
  });

  it('a KITE or a bare quadrilateral partner may be a dart or concave — never this refusal', () => {
    expect(convexWhenSimple('דלתון')).toBe(false);
    expect(convexWhenSimple('מרובע')).toBe(false);
    expect(last(['דלתון ABCD', 'מרובע ABDC'], 0).kind, 'the operator’s 2026-10-09 example').toBe('record');
  });

  it('the simple order of the same letters is still the restatement it was', () => {
    expect(last(['ריבוע ABCD', 'מרובע ADCB'], 0).kind).not.toBe('refused');
  });
});

describe('#1991 — the mechanism: convex whenever simple, derived from the SHAPES rows', () => {
  it('every quad noun but «מרובע» and «דלתון» is convex whenever simple', () => {
    const quads = Object.entries(SHAPES).filter(([, row]) => row.arity === 4);
    expect(quads.length, 'the table has quad rows to classify').toBeGreaterThan(5);
    for (const [noun] of quads)
      expect(convexWhenSimple(noun), noun).toBe(noun !== 'מרובע' && noun !== 'דלתון');
  });

  it('a triangle noun is not a quadrilateral answer', () => {
    for (const noun of ['משולש', 'משולש ישר זווית']) expect(convexWhenSimple(noun), noun).toBe(false);
    expect(convexWhenSimple(undefined)).toBe(false);
  });
});
