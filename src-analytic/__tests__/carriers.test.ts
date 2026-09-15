/**
 * The degree-of-freedom contract ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009) B1).
 *
 * Two things are locked here, and the first is the one that shipped broken.
 *
 * **The register is derived from the OBJECTS.** #1014: a curve whose parameter was never declared
 * drew nothing and said nothing, because `sampleEnv` read the F11 declarations alone. The entry
 * `נתונה פרבולה שמשוואתה y^2=2ax` is in the tool's own catalog, so its reference card contained a
 * line that produced an empty figure. Each row of that issue's table is a test below, with the
 * controls that must keep working beside them.
 *
 * **A new object kind must declare its freedom.** `carrierOf` / `symbolDeps` / `objectDeps` are
 * exhaustive switches, so the compiler — not a reviewer — is what stops a kind being added without
 * a DOF decision. The tests here assert the *classification* those switches return; the compile-time
 * half is enforced by `tsc`, which is why there is no runtime test pretending to check it.
 */
import { describe, expect, it } from 'vitest';
import { carrierOf, dofCount, objectDeps, paramRegister, symbolDeps } from '../engine/carriers';
import { fold } from '../engine/apply';
import { derive } from '../engine/derive';
import { evaluate, knownCurve } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import { curvesOf, objectById, pointsOf, UNBOUNDED, type Fact } from '../engine/types';

const lines = (src: string[]): Fact[] =>
  src.flatMap((s) => {
    const r = parseLine(s);
    if (!r.ok) throw new Error(`${s}: ${r.code}`);
    return r.facts;
  });

const build = (src: string[]) => fold(lines(src)).construction;

describe('#1014 — a parameter that was never DECLARED is still a free DOF', () => {
  // The issue's own table, one row per case. Before the fix the first two rows drew nothing and
  // raised nothing: the register was empty, `a` evaluated to NaN, and the curve reached the honest
  // "not at this parameter value" path by accident.
  it.each([
    ['נתונה פרבולה שמשוואתה y^2=2ax', 'a'],
    ['נתונה פרבולה שמשוואתה y^2=2px', 'p'],
  ])('%s draws, and registers %s', (src, sym) => {
    const d = derive([src]);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(1);
    expect(d.figure.vacant).toEqual([]);
    expect(paramRegister(d.construction).map((p) => p.sym)).toEqual([sym]);
  });

  it.each([
    ['a הוא פרמטר חיובי', 'נתונה פרבולה שמשוואתה y^2=2ax'],
    ['p הוא פרמטר חיובי', 'נתונה פרבולה שמשוואתה y^2=2px'],
  ])('the DECLARED control keeps working: %s', (decl, curve) => {
    const d = derive([decl, curve]);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves).toHaveLength(1);
  });

  it('registers an undeclared parameter inside a POINT s coordinates too', () => {
    // `A(-9a,0)` is the corpus's own phrasing (חורף 25) and a catalog entry. The defect was never
    // about curves — it was about where the register came from.
    const d = derive(['A(-9a,0)']);
    expect(d.faults).toEqual([]);
    expect(d.figure.points).toHaveLength(1);
    expect(d.figure.vacant).toEqual([]);
  });

  it('is still a FREE dof, not a default: the value moves with the seed (ADR-052)', () => {
    const c = build(['נתונה פרבולה שמשוואתה y^2=2ax']);
    const p0 = evaluate(c, 0).curves[0].curve;
    const p1 = evaluate(c, 1).curves[0].curve;
    expect(p0.kind === 'parabola' && p1.kind === 'parabola').toBe(true);
    if (p0.kind === 'parabola' && p1.kind === 'parabola') {
      expect(p0.p).not.toBeCloseTo(p1.p, 6);
    }
  });
});

describe('the register — declarations NARROW, they do not create', () => {
  it('keeps a declared domain when the symbol is also used', () => {
    const reg = paramRegister(build(['a הוא פרמטר חיובי', 'A(-9a,0)']));
    expect(reg).toHaveLength(1);
    expect(reg[0].sym).toBe('a');
    expect(reg[0].domain.min).toBe(0);
  });

  it('gives an UNDECLARED symbol an unbounded domain', () => {
    const reg = paramRegister(build(['A(-9a,0)']));
    expect(reg).toEqual([{ sym: 'a', domain: UNBOUNDED }]);
  });

  it('keeps a symbol that was declared but is not used yet — the student stated it', () => {
    expect(paramRegister(build(['k הוא פרמטר'])).map((p) => p.sym)).toEqual(['k']);
  });

  it('never registers x or y — they are the plane s own coordinates, not parameters', () => {
    // Every conic equation mentions both. Registering them would make each circle a 2-DOF family
    // of nothing, and the sampler would bind the variables the evaluator is supposed to sweep.
    const reg = paramRegister(build(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']));
    expect(reg).toEqual([]);
  });

  it('registers a symbol once however many objects use it', () => {
    const reg = paramRegister(build(['A(-9a,0)', 'B(41a,0)']));
    expect(reg.map((p) => p.sym)).toEqual(['a']);
  });

  it('reads DECLARED symbols first, then first use — the student s own order', () => {
    const reg = paramRegister(build(['b הוא פרמטר', 'נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1']));
    expect(reg.map((p) => p.sym)).toEqual(['b', 'a']);
  });
});

describe('symbolDeps — every object kind walks its own expressions', () => {
  it('reads both coordinates of a point', () => {
    const c = build(['A(2a,3b)']);
    expect(symbolDeps(pointsOf(c)[0])).toEqual(['a', 'b']);
  });

  it('reads a curve s equation, without its coordinates', () => {
    const c = build(['נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1']);
    expect(symbolDeps(curvesOf(c)[0])).toEqual(['a', 'b']);
  });
});

describe('carrierOf — a stated object carries no freedom of its own', () => {
  it('classifies both stated kinds as carrying none', () => {
    // Their freedom is the freedom of the parameters inside them, which the register already
    // counts. Counting it twice would report two DOFs for the one unknown in `A(-9a, 0)`.
    const c = build(['A(-9a,0)', 'הישר y=x']);
    for (const o of c.objects) expect(carrierOf(o)).toBeNull();
  });

  it('declares no object→object dependencies yet — every object here is STATED', () => {
    const c = build(['A(2,6)', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']);
    for (const o of c.objects) expect(objectDeps(o)).toEqual([]);
  });
});

describe('dofCount — the cue the student reads (02c P4)', () => {
  it('counts an undeclared parameter, which is the whole point of the register', () => {
    expect(dofCount(build(['נתונה פרבולה שמשוואתה y^2=2ax']))).toBe(1);
  });

  it('counts a fully stated figure as pinned', () => {
    expect(dofCount(build(['נתונה הנקודה A(2,6)', 'הישר y=x']))).toBe(0);
  });

  it('counts two distinct unknowns as two', () => {
    expect(dofCount(build(['נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1']))).toBe(2);
  });
});

describe('knownCurve — an EQUATION is gated exactly as a coordinate is', () => {
  // Found by reading B1's own smoke screenshot, not by a test: with #1014 fixed, `y^2=2ax` draws,
  // and the ungated panel printed it as `y² = 6.915870381x` — one seed's sample asserted as fact,
  // which is the cardinal sin (ADR-052) on the row ADR-AG-003 §2 calls the whole honesty boundary.

  /**
   * The id of the figure's ONLY curve, read from the construction.
   *
   * Hard-coded `'parabola'` / `'ellipse'` here until #1026 gave anonymous conics content-derived
   * ids — after which `knownCurve` returned `null` because the id did not exist, and these
   * assertions passed **on an empty construction**. They are the #1020 honesty gate, so passing by
   * checking nothing is the one way they must not pass. Reading the id back makes the test say what
   * it means regardless of how ids are minted, and `expect(id).toBeDefined()` is the tripwire.
   */
  const onlyCurveId = (c: ReturnType<typeof build>): string => {
    const ids = c.objects.filter((o) => o.kind === 'curve').map((o) => o.id);
    expect(ids).toHaveLength(1);
    return ids[0];
  };

  it('refuses to call a parameter-dependent curve knowledge', () => {
    const c = build(['נתונה פרבולה שמשוואתה y^2=2ax']);
    expect(knownCurve(c, onlyCurveId(c))).toBeNull();
  });

  it('calls a fully pinned curve knowledge, and reports its coefficients', () => {
    const c = build(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']);
    expect(knownCurve(c, 'circle-I')).toEqual({ kind: 'circle', cx: 3, cy: 4, r: 3 });
  });

  it('gates a curve that is pinned in one coefficient but free in another', () => {
    // `x²/9 + y²/b² = 1` has a known semi-axis and an unknown one. A row that printed the known
    // half and silently sampled the other would be the worst of both.
    const c = build(['נתונה אליפסה שמשוואתה x^2/9+y^2/b^2=1']);
    expect(knownCurve(c, onlyCurveId(c))).toBeNull();
  });

  it('is null for a curve that is not in the figure at all', () => {
    // This one MEANS the missing id — it is the control the three above accidentally became.
    expect(knownCurve(build(['A(2,6)']), 'no-such-curve')).toBeNull();
  });

  it('agrees with the DECLARED-parameter case, which was already reachable before #1014', () => {
    // The defect predates the register fix — it was simply rare, because a curve had to carry a
    // declared parameter to draw at all. Same verdict either way.
    const c = build(['a הוא פרמטר חיובי', 'נתונה פרבולה שמשוואתה y^2=2ax']);
    expect(knownCurve(c, onlyCurveId(c))).toBeNull();
  });
});

describe('the object graph — one list, addressed by id across kinds', () => {
  it('holds points and curves in the order they were stated', () => {
    const c = build(['A(2,6)', 'הישר y=x', 'B(0,0)']);
    expect(c.objects.map((o) => [o.kind, o.id])).toEqual([
      ['point', 'A'],
      ['curve', c.objects[1].id],
      ['point', 'B'],
    ]);
  });

  it('addresses every object by id through ONE lookup, whatever its kind', () => {
    const c = build(['A(2,6)', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']);
    expect(objectById(c, 'A')?.kind).toBe('point');
    expect(objectById(c, 'circle-I')?.kind).toBe('curve');
    expect(objectById(c, 'nobody')).toBeUndefined();
  });

  /**
   * Deliberately NOT tested: that a name used for two kinds is refused.
   *
   * `name-kind-clash` is unreachable in this slice, and a test for it would pass by checking
   * nothing. The id spaces do not overlap — a point is a bare letter (`A`) while every curve id is
   * namespaced by its kind (`line-AC`, `circle-I`, `parabola`) — so no statement pair can produce
   * the collision. The check stays because it is the apply boundary's business to hold it, and B3's
   * shape vertices are what make it reachable; the test arrives with the kind that can trigger it.
   */
  it('keeps ids in disjoint spaces, which is WHY the clash is unreachable here', () => {
    const c = build(['A(2,6)', 'משוואת הישר AC היא y=-2x+8', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']);
    expect(c.objects.map((o) => o.id)).toEqual(['A', 'line-AC', 'circle-I']);
  });
});
