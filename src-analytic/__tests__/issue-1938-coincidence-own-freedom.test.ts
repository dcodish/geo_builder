/**
 * #1938 — A FORCED COINCIDENCE GETS ONE VERDICT WHATEVER ELSE IN THE FIGURE IS FREE (ADR-AG-254). Since #1595
 * (ADR-AG-372, operator ruling 2026-11-02) that verdict is "recorded, with the notice"; it was "refused".
 *
 * The operator's T18 ruling (2026-09-20, #1254) is about a PAIR: *"if P and B must be on the same
 * location … it should be refused. The only case where P and B can fall [together] is if one of them has
 * a degree of freedom."* `derive` asked the WHOLE FIGURE's freedom instead (`reportedDof === 0`), which
 * is only an approximation of that question — and it leaked exactly where #1929's ring arm leaked: one
 * unrelated free point typed first, never referred to again, left the figure at 2 DOF, the check never
 * fired, and «P נקודת החיתוך של הישר AD עם הישר EF» minted P on top of E. Two labels on one dot, green.
 *
 * [#1595](https://github.com/dcodish/geo_builder/issues/1595)'s coincidence ruling (2026-09-30) carves
 * this case out by name: *"The 'naming a crossing that is already a point' refusals (#1175, #1274,
 * `crossing-already-named`) are a **different** case … They stay refusals (they name the holder)."*
 *
 * The predicate is now `Figure.separationDof(crossing, holder) === 0` — the freedom of the SEPARATION of
 * those two points along the constraints (`freedomOf`, #1929's mechanism, with the pair's own `read`), so a
 * freedom elsewhere cancels out. The half that matters more than the refusal is the false-refusal net at the
 * bottom: a crossing whose carriers really can move off the holder must still record.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { coincidencesOf } from '../app/coincidences';
import { decideSubmit } from '../app/submit';

/** The operator's figure: `AD` is the y-axis and `EF` is y = 2, so their crossing is (0,2) — which is E. */
const FIG = ['A(0,0)', 'B(4,0)', 'D(0,4)', 'E(0,2)', 'F(4,2)'];
const CROSS = 'P נקודת החיתוך של הישר AD עם הישר EF';
/**
 * ⚠ FLIPPED by #1595 (ADR-AG-372, ADR-W-177; operator ruling 2026-11-02, "accept with message"), which reverses the
 * T18 ruling's first branch: a crossing its givens FORCE onto a named point is RECORDED, and the drawn figure says
 * «E ו-P נפלו על אותה נקודה.». What #1938 fixed still holds, as the same verdict whatever else is free: an unrelated
 * free thing typed first or last never changes it. The pair's freedom (`separationDof`) is still measured.
 */
const onE = (lines: string[]) => {
  const d = derive(lines);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  expect(coincidencesOf(d), lines.join(' · ')).toEqual([['E', 'P']]);
};

describe('#1938 — the same sentence, the same verdict in both orders', () => {
  it('the five lines alone: recorded, P on E, with the notice', () => {
    onE([...FIG, CROSS]);
  });

  it('«נקודה Q» typed first: the SAME verdict', () => {
    onE(['נקודה Q', ...FIG, CROSS]);
  });

  /**
   * THE PAIR IS THE FIX, STATED AS A TEST (standing rule 4): one verdict for one sentence, whatever
   * unrelated line came first — asserted at the SUBMIT decision, which is what the student meets.
   */
  it('and the submit decision is the same in both orders — the line is recorded', () => {
    const alone = decideSubmit(CROSS, FIG, 0);
    const afterQ = decideSubmit(CROSS, ['נקודה Q', ...FIG], 0);
    expect(alone.kind).toBe('record');
    expect(afterQ.kind).toBe('record');
  });

  /** The evidence: the figure still has freedom, and the PAIR has none — the coincidence is forced. */
  it('the figure really does still have freedom, and the PAIR really has none', () => {
    const d = derive(['נקודה Q', ...FIG, CROSS]);
    expect(d.figure.carrierDof).toBe(2);
    expect(d.figure.separationDof?.('P', 'E')).toBe(0);
  });
});

/**
 * THE CLASS, not the one input (standing rule 1): any unrelated freedom — a free point, a point on an
 * axis, a free circle, a whole free triangle, a coordinate written as a parameter, and the same lines with
 * the free thing typed LAST before the crossing — leaves the verdict alone.
 */
describe('#1938 — every kind of unrelated freedom, same verdict', () => {
  const ROWS: Array<[string, string[]]> = [
    ['a free point', ['נקודה Q']],
    ['a point on an axis', ['Q על ציר x']],
    ['a free circle', ['מעגל O']],
    ['a whole free triangle', ['משולש QRS']],
    ['a coordinate written as a parameter', ['G(t,1)']],
    ['two unrelated free points', ['נקודה Q', 'נקודה R']],
  ];

  it.each(ROWS)('%s typed FIRST: the crossing line records on E', (_what, extra) => {
    const lines = [...extra, ...FIG];
    // The row must really leave freedom behind, or it would pass for the wrong reason.
    expect(derive([...lines, CROSS]).figure.carrierDof).toBeGreaterThan(0);
    onE([...lines, CROSS]);
    expect(decideSubmit(CROSS, lines, 0).kind).toBe('record');
  });

  it.each(ROWS)('%s typed LAST: the same', (_what, extra) => {
    const lines = [...FIG, ...extra];
    expect(derive([...lines, CROSS]).figure.carrierDof).toBeGreaterThan(0);
    onE([...lines, CROSS]);
    expect(decideSubmit(CROSS, lines, 0).kind).toBe('record');
  });

  /**
   * THE SAME CLASS IN ANOTHER ORDER: a LATER line completes the coincidence while the figure still moves.
   * `AD` is the y-axis and `EF` passes through E, so «E על ציר ה-y» forces the crossing onto E — and E may
   * still slide along the axis (1 DOF left).
   */
  it('a later line that FORCES the coincidence records too, with the figure still free', () => {
    const base = ['A(0,0)', 'D(0,4)', 'F(4,2)', 'נקודה E', 'P נקודת החיתוך של הישר AD עם הישר EF'];
    expect(derive(base).faults).toEqual([]); // E is free of the axis here: nothing to report
    expect(coincidencesOf(derive(base))).toEqual([]);
    expect(decideSubmit('P נקודת החיתוך של הישר AD עם הישר EF', base.slice(0, 4), 0).kind).toBe('record');
    const d = derive([...base, 'E על ציר ה-y']);
    expect(d.figure.carrierDof).toBe(1);
    expect(d.faults).toEqual([]);
    expect(coincidencesOf(d)).toEqual([['E', 'P']]);
    expect(decideSubmit('E על ציר ה-y', base, 0).kind).toBe('record');
  });

  /** The operator's own T18 figure (#1254), with and without a free point first. */
  it('#1254’s T18 figure with a free point first: P on B, the same verdict', () => {
    const t18 = ['A(0,0)', 'B(6,2)', 'C(1,7)', 'D(7,1)'];
    const cross = 'P נקודת החיתוך של הישר AB עם הישר CD';
    for (const lines of [[...t18, cross], ['נקודה Q', ...t18, cross]]) {
      const d = derive(lines);
      expect(d.faults).toEqual([]);
      expect(coincidencesOf(d)).toEqual([['B', 'P']]);
    }
  });

  /** And #1254's equation member, whose holder is the ORIGIN. */
  it('two equation lines crossing where A already sits, with a free point first', () => {
    const eq = ['A(0,0)', 'משוואת הישר l1 היא y=x', 'משוואת הישר l2 היא y=-x'];
    const cross = 'P נקודת החיתוך של הישר l1 עם הישר l2';
    for (const lines of [[...eq, cross], ['נקודה Q', ...eq, cross]]) {
      const d = derive(lines);
      expect(d.faults).toEqual([]);
      expect(coincidencesOf(d)).toEqual([['A', 'P']]);
    }
  });
});

/**
 * THE FALSE-REFUSAL NET — the half that matters more than the refusal.
 *
 * A crossing whose carriers really are free to move off the holder must still record: refusing it would be
 * worse than the bug, because «הציגו תצורה אחרת» can separate them and #1273 is what will prefer it. The
 * predicate reads the PAIR, and `undefined` (a point this configuration cannot place) is read as free.
 */
describe('#1938 — the false-refusal net', () => {
  it('a wholly free figure is not accused — #1254’s second branch, unchanged', () => {
    const free = ['נתון משולש ABC', 'נקודה D', 'P נקודת החיתוך של הישר AB עם הישר CD'];
    expect(derive(free).faults.filter((f) => f.code === 'crossing-already-named')).toEqual([]);
  });

  /**
   * The rows that MEASURE the net rather than assume it: a free circle (#1893) and a free parabola (#1909)
   * whose crossing lands exactly on a point the student named (`separationDof` read
   * 2 at seed 0 until #2383; the one rank of ADR-AG-309 reads 0, the structural truth). This arm must not accuse them, and their own refusal is a different,
   * better sentence («AC כבר חותך את המעגל ב-A וב-C …», #1834) that belongs to those issues.
   *
   * RE-BASED by #1893 (ADR-AG-271): the circle's chord now carries that sentence — `third-crossing`, the structural
   * arm — and still never this arm's `crossing-already-named`. RE-BASED again by #1909 (ADR-AG-292): the parabola's
   * chord carries the same sentence with «הפרבולה».
   */
  it('#1893 — a free circle’s chord: E lands on A and this arm stays silent (the third-crossing arm refuses it)', () => {
    const lines = ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'AC חותך את המעגל בנקודה E'];
    const d = derive(lines);
    const a = d.figure.points.find((p) => p.id === 'A')!;
    const e = d.figure.points.find((p) => p.id === 'E')!;
    expect(Math.hypot(a.x - e.x, a.y - e.y)).toBeLessThan(1e-3); // the coincidence is really there
    // RE-BASED by #2383 (ADR-AG-309): the separation rows lie in the equations' row space (σ falls 1.0 → 3.4e-8), so the
    // one rank reads the pair forced — the structural truth the seed-3 row below already recorded. The fault is unchanged.
    expect(d.figure.separationDof?.('E', 'A')).toBe(0);
    expect(d.faults).toMatchObject([{ index: 3, code: 'third-crossing', line: 'AC', a: 'A', b: 'C' }]);
  });

  it('#1909 — a free parabola’s chord does the same', () => {
    const lines = ['y^2=4x', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'];
    const d = derive(lines);
    expect(d.figure.separationDof?.('E', 'C')).toBe(0); // RE-BASED by #2383 (ADR-AG-309), as the circle row above
    expect(d.faults).toMatchObject([{ index: 3, code: 'third-crossing', line: 'AC', a: 'A', b: 'C', curve: 'parabola' }]);
  });

  /**
   * …AND THE MEASURED CONSEQUENCE, locked so it cannot drift unnoticed (#1909).
   *
   * On that same parabola row at SEED 3 the rank reads the separation as forced (`separationDof` 0 — which is
   * the structural truth: E is the chord's root AT C, and seed 0's `2` is the rank erring toward free, the safe
   * direction). So the arm now refuses there, where the whole-figure gate was silent. The refusal is honest and
   * is #1595's carve-out («they stay refusals — they name the holder»); the BETTER sentence for that family
   * («AC כבר חותך … אין נקודת חיתוך שלישית», #1834) is #1893/#1909's own work, and when it lands in analytic
   * this row changes key — deliberately loud.
   *
   * LANDED (#1909, ADR-AG-292): the structural arm now owns the row at every seed, so seed 3 carries the third-crossing
   * sentence too — one fault on the line, never `crossing-already-named` beside it. The rank reading is unchanged.
   */
  it('#1909 at seed 3: the rank still reads the pair forced, and the row now carries the third-crossing sentence', () => {
    const lines = ['y^2=4x', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'];
    const d = derive(lines, 3);
    expect(d.figure.carrierDof).toBeGreaterThan(0);
    expect(d.figure.separationDof?.('E', 'C')).toBe(0);
    expect(d.faults).toEqual([{ index: 3, code: 'third-crossing', detail: lines[3], line: 'AC', a: 'A', b: 'C', curve: 'parabola' }]);
  });

  /** #1254's own CONTROL: one letter different, the crossing is clear of every point — and a free point
   *  typed first must not make that figure say anything either. */
  it('a crossing clear of every named point still builds, with and without a free point first', () => {
    const clear = ['A(0,0)', 'B(6,2)', 'C(1,7)', 'D(7,0)'];
    const cross = 'P נקודת החיתוך של הישר AB עם הישר CD';
    expect(derive([...clear, cross]).faults).toEqual([]);
    expect(derive(['נקודה Q', ...clear, cross]).faults).toEqual([]);
    expect(decideSubmit(cross, ['נקודה Q', ...clear], 0).kind).toBe('record');
  });

  /**
   * The #1938 figure WITHOUT the coincidence: E moved OFF the y-axis, so `EF` (still y = 2) crosses `AD`
   * at (0,2) where nothing sits. E on the y-axis is what made the crossing forced onto it — `EF` passes
   * through E by construction, and `AD` IS the y-axis.
   */
  it('the operator’s own figure records once the crossing is clear of E', () => {
    const moved = ['נקודה Q', 'A(0,0)', 'B(4,0)', 'D(0,4)', 'E(1,2)', 'F(4,2)'];
    const cross = 'P נקודת החיתוך של הישר AD עם הישר EF';
    expect(derive([...moved, cross]).faults).toEqual([]);
    expect(decideSubmit(cross, moved, 0).kind).toBe('record');
  });
});
