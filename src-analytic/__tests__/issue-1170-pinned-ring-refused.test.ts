/**
 * #1170 — A SHAPE NOUN PROMISES A RING, AND PINNED POINTS THAT ARE NOT THAT RING ARE REFUSED.
 *
 * **Operator ruling, 2026-09-17: refuse the line.** He hit this by accident playing round #1169 T5 —
 * typed `D(1,0)` instead of the sheet's `D(0,4)`, which put `D` on segment `AB` — and reported *"a quad
 * should have been rejected for this case"*, not knowing he was looking at a known gap. Offered
 * draw-with-a-notice as the session's recommendation, he chose the refusal and overruled it.
 *
 * ## Why this was not a one-line gate
 *
 * `ringViolation` has SEEN these figures since #1158/#1166; `drawableAt` uses it to CHOOSE a
 * configuration, which is what fixed both of those reports. What was missing is the case with nothing
 * to choose: every figure this fires on has `reportedDof = 0`, because with the preference inside the
 * search a figure that still has freedom never arrives carrying a ring fault. The student pinned the
 * coordinates, and those coordinates are what make the ring collapsed or crossed.
 *
 * That is also why the message is about the RING and not about a failed search — «לא נמצאה תצורה שבה
 * מתקיים» would be false on a determined figure, where only one configuration was ever possible.
 *
 * ## The reconciliation, which is the part that had no uncontested answer
 *
 * «P מפגש האנכים האמצעיים במשולש ABC» on three collinear points declares the triangle AND asks for its
 * circumcentre, so one line carries a ring fault and ADR-AG-008's `does-not-exist` at once.
 * `does-not-exist` names what the student actually asked for and is the truer message; a second,
 * differently-worded refusal on the same line is noise. Asserted below as ONE message, by code.
 *
 * ## #1849 (ADR-AG-247) — the flat member has its own message
 *
 * The operator's 2026-10-07 ruling (ADR-W-115) made a declared polygon the givens flatten a refusal in every builder,
 * naming the polygon and the statements. A pinned DEGENERATE ring is that collapse: it is refused as
 * `polygon-collapsed`, on the line that COMPLETED it (the last of the declaration and the lines placing its
 * vertices). A pinned CROSSED ring is not flat and keeps this file's `ring-contradicts-noun`, on the declaring line.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

const codesOf = (lines: readonly string[]) => derive(lines).faults.map((f) => f.code);

describe('#1170 — the operator’s own figure', () => {
  /** His exact five lines, with the `D(1,0)` he actually typed. A, D and B are collinear. */
  const HIS = ['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(1,0)', 'מרובע ABCD'];

  it('is refused on the line that named the shape — the line that completed the collapse (#1849)', () => {
    expect(derive(HIS).faults).toEqual([
      { index: 4, code: 'polygon-collapsed', detail: 'מרובע ABCD', polygon: 'ABCD', shape: 'מרובע', declared: 'מרובע ABCD' },
    ]);
  });

  it('is refused at the SUBMIT gate too — the line is never recorded', () => {
    const verdict = decideSubmit('מרובע ABCD', HIS.slice(0, 4), 0);
    expect(verdict).toMatchObject({ kind: 'refused', error: { key: 'polygon-collapsed', polygon: 'ABCD', declared: 'מרובע ABCD' } });
  });

  /**
   * The counter-direction, and the lock that keeps this from becoming "the tool refuses quadrilaterals".
   * The sheet's INTENDED `D(0,4)` is a genuine concave quad — a legitimate «מרובע» that the exam draws.
   * It already has a lock in `issue-1158-1166-polygon-noun-validity.test.ts`; it is asserted here too,
   * because this is the fix that could break it.
   */
  it('but the sheet’s intended D(0,4) still builds — concave is not crossed', () => {
    const intended = ['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(0,4)', 'מרובע ABCD'];
    expect(derive(intended).faults).toEqual([]);
    expect(decideSubmit('מרובע ABCD', intended.slice(0, 4), 0).kind).toBe('record');
  });
});

/**
 * BOTH MEMBERS, on the ruling's stated reach. He ruled on a DEGENERATE pinned ring; a CROSSED one is
 * the same sentence — *a shape noun promises a ring, and these points are not that ring* — and
 * splitting them would leave that half silent for no reason either of us gave.
 */
describe('#1170 — degenerate and crossed are one ruling', () => {
  it('a pinned crossed quadrilateral is refused', () => {
    expect(codesOf(['A(0,0)', 'B(1,0)', 'C(0,1)', 'D(1,1)', 'מרובע ABCD'])).toEqual([
      'ring-contradicts-noun',
    ]);
  });

  // #1849 (ADR-AG-247): a pinned FLAT ring is the givens flattening the polygon — `polygon-collapsed`, on the line that completed it.
  it('a pinned collinear triangle is refused', () => {
    expect(codesOf(['A(0,0)', 'B(1,0)', 'C(2,0)', 'משולש ABC'])).toEqual(['polygon-collapsed']);
  });
});

describe('#1170 — one message per line, and the truer one wins', () => {
  /**
   * The three `derived.test.ts` rows that stopped this arm being built. ADR-AG-008 already answers
   * «P מפגש האנכים האמצעיים במשולש ABC» on collinear points with `does-not-exist` — the circumcentre is
   * what the student asked for and it is what does not exist.
   */
  it('a collinear circumcentre keeps does-not-exist and gains NO second refusal', () => {
    expect(
      codesOf(['A(0,0)', 'B(1,1)', 'C(2,2)', 'P מפגש האנכים האמצעיים במשולש ABC']),
    ).toEqual(['does-not-exist']);
  });
});

/**
 * THE GATE CONDITION, asserted as a property rather than trusted from the docblock. A figure that still
 * has FREEDOM must be untouched: with freedom left, 24 exhausted seeds are evidence and not proof
 * (#1071), and refusing there could reject a satisfiable figure — the opposite defect.
 */
describe('#1170 — a figure with freedom is not touched', () => {
  it('a free quadrilateral builds and is recorded', () => {
    expect(derive(['מרובע ABCD']).faults).toEqual([]);
    expect(decideSubmit('מרובע ABCD', [], 0).kind).toBe('record');
  });

  it('a partly-pinned quadrilateral with freedom left builds', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'מרובע ABCD'];
    expect(derive(lines).faults).toEqual([]);
    expect(derive(lines).figure.carrierDof).toBeGreaterThan(0);
  });

  /**
   * And the precondition that keeps the row above meaningful: the freedom is what spares it, not the
   * points happening to be fine. The same shape with every point pinned into a bow-tie IS refused.
   */
  it('…and the same ring, fully pinned into a bow-tie, is refused', () => {
    expect(codesOf(['A(0,0)', 'B(4,0)', 'C(0,4)', 'D(4,4)', 'מרובע ABCD'])).toEqual([
      'ring-contradicts-noun',
    ]);
  });
});

/**
 * #1929 (ADR-AG-249) — THE RING'S OWN FREEDOM DECIDES, NEVER THE FIGURE'S.
 *
 * The arm above used to wait for the WHOLE figure to reach 0 DOF, so «נקודה Q» typed first — or any freedom elsewhere —
 * let the same pinned bow-tie (or flat ring) record green. Operator ruling 2026-10-08 (#1929): *"refused with
 * `ring-contradicts-noun` whatever else is on the canvas"*. Every row is driven line by line through `decideSubmit`,
 * as the app submits, and is refused on the same line, with the same key, as without the unrelated freedom.
 */
describe('#1929 — the ring’s own freedom decides', () => {
  type T = (k: string, o?: Record<string, unknown>) => string;
  const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
  const t = plain(analyticI18n.getFixedT('he') as unknown as T);

  /** Submits each line as the app does; returns the first refusal (its line index and error), or null. */
  const play = (seq: readonly string[]) => {
    const lines: string[] = [];
    for (const [i, l] of seq.entries()) {
      const v = decideSubmit(l, lines, 0);
      if (v.kind === 'refused') return { at: i, error: v.error };
      if (v.kind === 'record') lines.push(v.line);
    }
    return null;
  };
  const T4 = ['A(0,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)'];

  it('the operator’s six lines: «טרפז ABCD» is refused with the ring message', () => {
    const r = play(['נקודה Q', ...T4, 'טרפז ABCD']);
    expect(r?.at).toBe(5);
    expect(r?.error).toMatchObject({ key: 'ring-contradicts-noun', detail: 'טרפז ABCD' });
    expect(errorText(r!.error, t)).toBe(
      'הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: "טרפז ABCD". אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את השיעורים — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.',
    );
  });

  it('the flat member: «משולש ABC» on collinear points is refused as a collapse beside a free Q', () => {
    const r = play(['נקודה Q', 'A(0,0)', 'B(1,1)', 'C(2,2)', 'משולש ABC']);
    expect(r?.at).toBe(4);
    expect(r?.error).toMatchObject({ key: 'polygon-collapsed', declared: 'משולש ABC' });
    expect(errorText(r!.error, t)).toBe(
      '"משולש ABC" משטיח את ABC: יחד עם הנתונים הקודמים הוא מחייב שהקודקודים ייפלו על ישר אחד, וצורה שטוחה אינה משולש — כפי שקובע "משולש ABC". "משולש ABC" לא נוסף.',
    );
  });

  /** [the freedom elsewhere, the ring's lines, the refused line's text, the key] — the class, measured at 5edeeca1. */
  const CLASS: Array<[string, string[], string[], string, string]> = [
    ['Q after the points', [], [...T4, 'נקודה Q', 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['a point on an axis', ['Q נמצאת על ציר ה-x'], [...T4, 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['a circle with a free radius', ['נתון מעגל שמשוואתו x^2+y^2=r^2'], [...T4, 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['a point with a parameter', ['E(k,1)'], [...T4, 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['a line with a free slope', ['הישר y=mx'], [...T4, 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['an unrelated triangle', ['משולש EFG'], [...T4, 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['«מרובע» on the same points', ['נקודה Q'], [...T4, 'מרובע ABCD'], 'מרובע ABCD', 'ring-contradicts-noun'],
    ['the shape first', ['נקודה Q'], ['טרפז ABCD', ...T4], 'D(3,3)', 'ring-contradicts-noun'],
    ['a crossed pentagon', ['נקודה Q'], ['A(0,0)', 'B(4,0)', 'C(4,3)', 'D(2,5)', 'E(0,3)', 'מחומש ACEBD'], 'מחומש ACEBD', 'ring-contradicts-noun'],
    ['a derived vertex', ['נקודה Q'], ['A(0,0)', 'B(4,0)', 'C(0,4)', 'E(8,2)', 'M אמצע AE', 'מרובע ACBM'], 'מרובע ACBM', 'ring-contradicts-noun'],
    ['a vertex pinned by two lines', ['נקודה Q'], ['A(0,0)', 'B(4,0)', 'C נמצאת על הישר x=1', 'C נמצאת על הישר y=3', 'D(3,3)', 'טרפז ABCD'], 'טרפז ABCD', 'ring-contradicts-noun'],
    ['a flat triangle, shape first', ['נקודה Q'], ['משולש ABC', 'A(0,0)', 'B(1,1)', 'C(2,2)'], 'C(2,2)', 'polygon-collapsed'],
    ['a flat quadrilateral', ['נקודה Q'], ['A(0,0)', 'B(4,0)', 'C(8,0)', 'D(3,3)', 'מרובע ABCD'], 'מרובע ABCD', 'polygon-collapsed'],
  ];

  it.each(CLASS)('%s: refused on the same line, with the same key, as without the freedom', (_name, free, ring, line, key) => {
    const bare = play(ring.filter((l) => l !== 'נקודה Q'));
    const withFree = play([...free, ...ring]);
    expect(bare?.error).toMatchObject({ key, detail: line });
    expect(withFree?.error).toMatchObject({ key, detail: line });
    expect([...free, ...ring][withFree!.at]).toBe(line); // the refused line is that line, not a later one
  });

  /** The precondition: the freedom spared those rows only because it was the FIGURE'S. */
  it('the figure is free while the ring is pinned — the gate cannot pass vacuously', () => {
    const fig = derive(['נקודה Q', ...T4]).figure;
    expect(fig.carrierDof).toBeGreaterThan(0);
    // The ring itself, judged in the record that precedes the refusal: pinned.
    const d = derive(['נקודה Q', ...T4, 'טרפז ABCD']);
    expect(d.faults.map((f) => f.code)).toEqual(['ring-contradicts-noun']);
    expect(d.figure.ringFaults.every((rf) => rf.ringDof === 0)).toBe(true);
  });

  it('controls: the simple order and a ring with a free vertex still record', () => {
    expect(play(['נקודה Q', ...T4, 'טרפז ABDC'])).toBeNull();
    expect(play(['נקודה Q', 'A(0,0)', 'B(4,0)', 'C(1,3)', 'מרובע ABCD'])).toBeNull();
  });

  it('a crossed ring whose own points can move is not this arm’s (ringDof > 0)', () => {
    const d = derive(['A(k,0)', 'B(4,0)', 'C(1,3)', 'D(3,3)', 'טרפז ABCD']);
    expect(d.faults.map((f) => f.code)).not.toContain('ring-contradicts-noun');
    expect(d.figure.ringFaults.filter((rf) => rf.violation === 'crossed').every((rf) => (rf.ringDof ?? 0) > 0)).toBe(true);
  });
});
