/**
 * #1149 — A CURVE KEEPS ITS IDENTITY WHEN ITS REPRESENTATION CHANGES.
 *
 * A line first used as a CARRIER and then stated is PROMOTED — one object, now drawn (#1076,
 * ADR-AG-023's content-derived ids). The promotion rebuilt the object from the carrier and dropped
 * the stated sentence's label, and `words()` can name an anonymous curve only by its equation
 * (ADR-AG-056). So the same two lines behaved differently depending on how they had been introduced:
 *
 * ```
 * y=2x+1 · y=-x+15                                     -> one crossing offered at (4.667, 10.333)
 * «נקודה A על הישר y=-x+15» … then the same two lines  -> NO crossing offered
 * ```
 *
 * Measured before the fix, the promoted objects carried `label = {name: ''}` — no kind, no `eqSrc`.
 * The text the student had written was thrown away twice over: the carrier was minted without it
 * even though the parser was holding it, and the promotion then preserved that emptiness.
 *
 * The property locked here is the one that matters, and it is stronger than either symptom: **a
 * promoted carrier is INDISTINGUISHABLE from a curve stated outright.** Asserted by building both
 * figures and comparing them, so a future path that rebuilds objects without their labels fails here
 * rather than being reported a fourth time.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingSentence, crossingsOf, freeLetter } from '../engine/crossings';
import { parseLine } from '../parser/parseAnalytic';

/** The two lines meet at (14/3, 31/3) — the operator's own pair, from the issue. */
const L1 = 'y=2x+1';
const L2 = 'y=-x+15';
const MEET = { x: 14 / 3, y: 31 / 3 };

const curvesOf = (lines: string[]) => {
  const d = derive(lines, 0);
  return (d.construction.objects.filter((o) => o.kind === 'curve') as Array<{ id: string }>)
    .map((o) => JSON.parse(JSON.stringify(o)))
    .sort((a, b) => a.id.localeCompare(b.id));
};
const crossings = (lines: string[]) => {
  const d = derive(lines, 0);
  return crossingsOf(d.figure, d.construction);
};

/** Carrier first, then each line stated on its own — the reported sequence. */
const PROMOTED = [`נקודה A על הישר ${L2}`, `נקודה B על הישר ${L1}`, L1, L2];
/** The same two lines, never a carrier. */
const OUTRIGHT = [L1, L2];

describe('#1149 — a promoted carrier is the same object as a line stated outright', () => {
  it('offers exactly one crossing, where the two lines actually meet', () => {
    const cs = crossings(PROMOTED);
    expect(cs).toHaveLength(1);
    expect(cs[0].x).toBeCloseTo(MEET.x, 9);
    expect(cs[0].y).toBeCloseTo(MEET.y, 9);
  });

  it('the sentence the click composes ROUND-TRIPS to the same point', () => {
    /**
     * Not a string comparison: the sentence is fed back through the real parser, because what must
     * hold is that clicking the ring adds a line the tool can read — not that it reads a particular
     * way (#1102 / locks-must-call).
     */
    const d = derive(PROMOTED, 0);
    const [k] = crossingsOf(d.figure, d.construction);
    const sentence = crossingSentence(k, freeLetter(d.construction));
    expect(parseLine(sentence).ok, `«${sentence}» did not parse`).toBe(true);
    const after = derive([...PROMOTED, sentence], 0);
    expect(after.faults).toEqual([]);
    const born = after.figure.points.find((p) => !d.figure.points.some((q) => q.id === p.id));
    expect(born, 'the sentence introduced no point').toBeDefined();
    expect(born!.x).toBeCloseTo(MEET.x, 6);
    expect(born!.y).toBeCloseTo(MEET.y, 6);
  });

  it('the CURVE OBJECTS are identical to the never-a-carrier figure', () => {
    // The real content of the fix: not "a crossing appears", but "the object kept its identity".
    expect(curvesOf(PROMOTED)).toEqual(curvesOf(OUTRIGHT));
  });

  it('the offered crossings do not depend on which sentence introduced the lines', () => {
    const at = (cs: ReturnType<typeof crossings>) => cs.map((k) => [k.x.toFixed(6), k.y.toFixed(6)]).sort();
    expect(at(crossings(PROMOTED))).toEqual(at(crossings(OUTRIGHT)));
    expect(at(crossings([L2, L1]))).toEqual(at(crossings(OUTRIGHT)));
  });

  it('a carrier that was NEVER stated is still not offered — for the stated reason', () => {
    /**
     * #1076: a carrier is not drawn, so there is nothing to click and no ring belongs to it. That is
     * now the REASON rather than a side effect of a missing field — the carrier carries its `eqSrc`
     * and is excluded because it is not `stated`, which is the rule we actually mean.
     */
    const d = derive([`נקודה A על הישר ${L2}`, `נקודה B על הישר ${L1}`], 0);
    expect(crossingsOf(d.figure, d.construction)).toEqual([]);
    const carriers = d.construction.objects.filter((o) => o.kind === 'curve') as Array<{
      stated: boolean;
      label: { eqSrc?: string };
    }>;
    expect(carriers).toHaveLength(2);
    for (const o of carriers) {
      expect(o.stated, 'a carrier is not stated').toBe(false);
      expect(o.label.eqSrc, 'but it still knows what it is').toBeTruthy();
    }
  });

  it('promotion stays ONE-WAY and idempotent — the label does not churn', () => {
    /**
     * The promotion's own invariants, which the label merge must not disturb: stating the line again
     * changes nothing, and a LATER carrier mention does not demote a line the student asked to see
     * (`apply.ts` — "the student already asked to see it and nothing they said withdraws that").
     */
    const once = curvesOf([`נקודה B על הישר ${L1}`, L1]);
    expect(curvesOf([`נקודה B על הישר ${L1}`, L1, L1])).toEqual(once);
    expect(curvesOf([`נקודה B על הישר ${L1}`, L1, `נקודה C על הישר ${L1}`])).toEqual(once);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ stated: true, label: { eqSrc: L1 } });
  });
});
