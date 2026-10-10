/**
 * #1938 — A FORCED COINCIDENCE IS REFUSED WHATEVER ELSE IN THE FIGURE IS FREE (ADR-AG-254).
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
import { decideSubmit } from '../app/submit';

/** The operator's figure: `AD` is the y-axis and `EF` is y = 2, so their crossing is (0,2) — which is E. */
const FIG = ['A(0,0)', 'B(4,0)', 'D(0,4)', 'E(0,2)', 'F(4,2)'];
const CROSS = 'P נקודת החיתוך של הישר AD עם הישר EF';
/** The refusal, to the letter: the code, the line it quotes, the holder it names and the two operands (#1416). */
const REFUSAL = { code: 'crossing-already-named', detail: CROSS, holder: 'E', operands: ['הישר AD', 'הישר EF'] };

describe('#1938 — the same sentence, the same verdict in both orders', () => {
  it('the five lines alone: refused, naming E', () => {
    expect(derive([...FIG, CROSS]).faults).toEqual([{ index: 5, ...REFUSAL }]);
  });

  it('«נקודה Q» typed first: the SAME refusal, not a silent accept', () => {
    expect(derive(['נקודה Q', ...FIG, CROSS]).faults).toEqual([{ index: 6, ...REFUSAL }]);
  });

  /**
   * THE PAIR IS THE FIX, STATED AS A TEST (standing rule 4): one verdict for one sentence, whatever
   * unrelated line came first — asserted at the SUBMIT decision, which is what the student meets.
   */
  it('and the submit decision is the same object in both orders — the line is never recorded', () => {
    const alone = decideSubmit(CROSS, FIG, 0);
    const afterQ = decideSubmit(CROSS, ['נקודה Q', ...FIG], 0);
    expect(alone).toMatchObject({ kind: 'refused', error: { key: 'crossing-already-named', detail: CROSS, holder: 'E', operands: ['הישר AD', 'הישר EF'] } });
    expect(afterQ).toEqual(alone);
  });

  /** The evidence, so a future change cannot make this pass for the wrong reason. */
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

  it.each(ROWS)('%s typed FIRST is refused on the crossing line, naming E', (_what, extra) => {
    const lines = [...extra, ...FIG];
    const d = derive([...lines, CROSS]);
    // The row must really leave freedom behind, or it would pass for the wrong reason.
    expect(d.figure.carrierDof).toBeGreaterThan(0);
    expect(d.faults).toEqual([{ index: lines.length, ...REFUSAL }]);
    expect(decideSubmit(CROSS, lines, 0)).toMatchObject({ kind: 'refused', error: { key: 'crossing-already-named', holder: 'E' } });
  });

  it.each(ROWS)('%s typed LAST is refused too', (_what, extra) => {
    const lines = [...FIG, ...extra];
    const d = derive([...lines, CROSS]);
    expect(d.figure.carrierDof).toBeGreaterThan(0);
    expect(d.faults).toEqual([{ index: lines.length, ...REFUSAL }]);
    expect(decideSubmit(CROSS, lines, 0)).toMatchObject({ kind: 'refused', error: { key: 'crossing-already-named', holder: 'E' } });
  });

  /**
   * THE SAME CLASS IN ANOTHER ORDER: a LATER line completes the coincidence while the figure still moves.
   * `AD` is the y-axis and `EF` passes through E, so «E על ציר ה-y» forces the crossing onto E — and E may
   * still slide along the axis (1 DOF left), which is exactly where the old whole-figure gate stayed silent.
   * `decideSubmit` re-attributes the fault to the submitted line (ADR-AG-250), as it already did at 0 DOF.
   */
  it('a later line that FORCES the coincidence is refused, with the figure still free', () => {
    const base = ['A(0,0)', 'D(0,4)', 'F(4,2)', 'נקודה E', 'P נקודת החיתוך של הישר AD עם הישר EF'];
    expect(derive(base).faults).toEqual([]); // E is free of the axis here: nothing to report
    expect(decideSubmit('P נקודת החיתוך של הישר AD עם הישר EF', base.slice(0, 4), 0).kind).toBe('record');
    const d = derive([...base, 'E על ציר ה-y']);
    expect(d.figure.carrierDof).toBe(1);
    expect(d.faults).toMatchObject([{ code: 'crossing-already-named', holder: 'E', operands: ['הישר AD', 'הישר EF'] }]);
    expect(decideSubmit('E על ציר ה-y', base, 0)).toMatchObject({ kind: 'refused', error: { key: 'crossing-already-named', holder: 'E' } });
  });

  /** The operator's own T18 figure (#1254) leaks the same way, and is refused the same way. */
  it('#1254’s T18 figure with a free point first still names B', () => {
    const t18 = ['A(0,0)', 'B(6,2)', 'C(1,7)', 'D(7,1)'];
    const cross = 'P נקודת החיתוך של הישר AB עם הישר CD';
    expect(derive([...t18, cross]).faults).toMatchObject([{ code: 'crossing-already-named', holder: 'B' }]);
    expect(derive(['נקודה Q', ...t18, cross]).faults).toMatchObject([{ code: 'crossing-already-named', holder: 'B' }]);
  });

  /** And #1254's equation member, whose holder is the ORIGIN — the `near` floor's own case. */
  it('two equation lines crossing where A already sits, with a free point first', () => {
    const eq = ['A(0,0)', 'משוואת הישר l1 היא y=x', 'משוואת הישר l2 היא y=-x'];
    const cross = 'P נקודת החיתוך של הישר l1 עם הישר l2';
    expect(derive([...eq, cross]).faults).toMatchObject([{ code: 'crossing-already-named', holder: 'A' }]);
    expect(derive(['נקודה Q', ...eq, cross]).faults).toMatchObject([{ code: 'crossing-already-named', holder: 'A' }]);
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
   * whose crossing lands exactly on a point the student named, with the separation still free (`separationDof`
   * 2 — the carriers can move it off). They record today, they must keep recording here, and their own
   * refusal is a different, better sentence («AC כבר חותך את המעגל ב-A וב-C …», #1834) that belongs to those
   * issues. This arm must not pre-empt it.
   */
  it('#1893 — a free circle’s chord: E lands on A, the pair is still free, and the line records', () => {
    const lines = ['מעגל O', 'A על מעגל O', 'C על מעגל O', 'AC חותך את המעגל בנקודה E'];
    const d = derive(lines);
    const a = d.figure.points.find((p) => p.id === 'A')!;
    const e = d.figure.points.find((p) => p.id === 'E')!;
    expect(Math.hypot(a.x - e.x, a.y - e.y)).toBeLessThan(1e-3); // the coincidence is really there
    expect(d.figure.separationDof?.('E', 'A')).toBeGreaterThan(0); // …and really not forced
    expect(d.faults).toEqual([]);
  });

  it('#1909 — a free parabola’s chord does the same', () => {
    const lines = ['y^2=4x', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'];
    const d = derive(lines);
    expect(d.figure.separationDof?.('E', 'C')).toBeGreaterThan(0);
    expect(d.faults).toEqual([]);
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
   */
  it('#1909 at seed 3: the same row IS refused, naming C — the predicate reaching a configuration the old gate could not', () => {
    const lines = ['y^2=4x', 'A על הפרבולה', 'C על הפרבולה', 'AC חותך את הפרבולה בנקודה E'];
    const d = derive(lines, 3);
    expect(d.figure.carrierDof).toBeGreaterThan(0);
    expect(d.figure.separationDof?.('E', 'C')).toBe(0);
    expect(d.faults).toMatchObject([{ index: 3, code: 'crossing-already-named', holder: 'C' }]);
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
