/**
 * #1991 ([ADR-3D-327](../../docs/06b-decisions-3d.md#adr-3d-327)) — A SPECIFIC NOUN DECLARED OVER A CONVEX RING'S
 * LETTERS IN A CROSSING ORDER IS REFUSED FOR ITS ORDER, NOT FOR ITS ARITHMETIC.
 *
 * Measured on `main` @ 06fc51dd through `decideSubmit3`:
 *
 * | lines | 3-D at 06fc51dd |
 * | --- | --- |
 * | «ריבוע ABCD» · «מקבילית ACBD» | `claim-refuted` — «הטענה לא מתקיימת בציור — בדקו את החישוב» |
 * | «ריבוע ABCD» · «טרפז ACBD» | `claim-refuted` |
 * | «מלבן ABCD» · «מקבילית ACBD» | `claim-refuted` |
 * | «ריבוע ABCD» · «מלבן ACBD» | `givens-contradict` |
 * | «ריבוע ABCD» · «מרובע ACBD» | `ring-crossed` (ADR-3D-322 — the generic noun) |
 *
 * Operator ruling 2026-10-10 (option A): 2-D's crossed-shape message everywhere.
 *
 * Why #1927's pass could not say it: it proves the crossing over the CLAIM SAMPLES, and a specific noun's own
 * relations are claims that cannot hold, so the pivot finds no placement — every one of these sequences had
 * `pivot.solutions === 0` and ZERO placed samples, where that pass rightly fails open. The evidence is now
 * structural: four points in convex position admit one simple cyclic order, so a ring declared with a noun that is
 * convex whenever simple proves every other order of its letters crosses.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';
import { convexWhenSimple, QUAD_IMPLIES, type QuadBase } from '../engine/baseShapes';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('en')(k, o) as string);

type St = { facts: Fact3[]; seed: number };
function play(lines: readonly string[]) {
  let n = 0;
  let st: St = { facts: [], seed: 0 };
  const kinds: string[] = [];
  let error: Parameters<typeof errorText3>[1] | null = null;
  for (const line of lines) {
    const v = decideSubmit3(st, line, () => `f${++n}`);
    kinds.push(v.kind);
    if (v.kind === 'refused') error = v.error as never;
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, kinds, error };
}

describe('#1991 — the reported rows are refused for their ORDER, in the shared words', () => {
  it.each([
    [['ריבוע ABCD', 'מקבילית ACBD']], // the round #1983 play-sheet T10 line
    [['ריבוע ABCD', 'טרפז ACBD']],
    [['ריבוע ABCD', 'מלבן ACBD']],
    [['מלבן ABCD', 'מקבילית ACBD']],
    [['מעוין ABCD', 'מקבילית ACBD']],
    [['טרפז ABCD', 'מקבילית ACBD']],
    [['ריבוע ABCD', 'מרובע ACBD']], // ADR-3D-322's own case, unchanged
  ])('%j', (lines) => {
    const last = lines[lines.length - 1];
    const r = play(lines);
    expect(r.kinds).toEqual([...lines.slice(0, -1).map(() => 'record'), 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: last });
    expect(errorText3(he, r.error!)).toBe(
      `הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: «${last}». אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.`,
    );
    expect(errorText3(en, r.error!)).toBe(
      `The points you gave do not form that shape in this order: «${last}». Reorder the letters so the sides do not cross, or move the points — as written the vertices fall on one line or the shape folds over itself.`,
    );
    expect(errorText3(he, r.error!), 'never «בדקו את החישוב»').not.toMatch(/החישוב/);
    expect(r.st.facts.length, 'keep-prior: nothing is committed').toBe(lines.length - 1);
  });

  it('the ring FIRST: the shape line that completed the crossing is the one refused', () => {
    const r = play(['מקבילית ACBD', 'ריבוע ABCD']);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: 'ריבוע ABCD' });
  });
});

describe('#1991 — search first, refuse last: what is NOT refused', () => {
  it('a reordered ring with nothing to contradict it is drawn', () => {
    expect(play(['מקבילית ACBD']).kinds).toEqual(['record']);
    expect(play(['מרובע ACBD']).kinds).toEqual(['record']);
  });

  it('a KITE partner may be a DART, so the other order is never refused on this ground', () => {
    // the operator's own 2026-10-09 example («דלתון ABCD · מרובע ABDC»), kept by `convexWhenSimple`
    expect(convexWhenSimple('kite')).toBe(false);
    expect(convexWhenSimple('quad')).toBe(false);
  });

  it('the simple order of the same letters still builds', () => {
    expect(play(['ריבוע ABCD', 'מרובע ADCB']).kinds).toEqual(['record', 'already-stated']);
  });

  it('a ring declared ONCE is never its own crossed partner', () => {
    for (const lines of [['ריבוע ABCD'], ['טרפז ABCD'], ['מקבילית ABCD'], ['דלתון ABCD']])
      expect(play(lines).kinds, lines.join(' ')).toEqual(['record']);
  });
});

describe('#1991 — the mechanism: convex whenever simple, read off the family table', () => {
  it('every base but the kite and the bare quadrilateral is convex whenever simple', () => {
    const KINDS = Object.keys(QUAD_IMPLIES) as QuadBase[];
    for (const b of KINDS) expect(convexWhenSimple(b), b).toBe(b !== 'kite' && b !== 'quad');
  });

  it('the structural refusal needs no figure: it holds at every seed', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const first = decideSubmit3({ facts: [], seed }, 'ריבוע ABCD', () => 'f1');
      expect(first.kind).toBe('record');
      if (first.kind !== 'record') return;
      const v = decideSubmit3({ facts: first.facts, seed: first.seed }, 'מקבילית ACBD', () => 'f2');
      expect(v.kind, `seed ${seed}`).toBe('refused');
      if (v.kind === 'refused') expect(v.error).toEqual({ code: 'ring-crossed', stated: 'מקבילית ACBD' });
    }
  });

  it('the refusal lands on the line, and the prior figure is untouched', () => {
    const first = decideSubmit3({ facts: [], seed: 0 }, 'ריבוע ABCD', () => 'f1');
    expect(first.kind).toBe('record');
    if (first.kind !== 'record') return;
    const d = derive3(first.facts, first.seed);
    expect(d.status.f1).toBe('ok');
  });
});
