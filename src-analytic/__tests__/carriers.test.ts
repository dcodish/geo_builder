/**
 * The degree-of-freedom contract ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009) B1).
 *
 * Two things are locked here, and the first is the one that shipped broken.
 *
 * **The register is derived from the OBJECTS.** #1014: a curve whose parameter was never declared
 * drew nothing and said nothing, because `sampleEnv` read the F11 declarations alone. The entry
 * `נתונה פרבולה שמשוואתה y^2=2ax` was in the tool's own catalog (it teaches `2px` since #1022, and
 * both spellings parse identically), so its reference card contained a
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
import { evaluate, knownCurve, sampleParam } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC, type CatalogEntryAnalytic } from '../parser/catalogAnalytic';
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
    /**
     * Asserts the INVARIANT rather than a list. It used to enumerate `['A', 'line-AC', 'circle-I']`,
     * and #1066 changed the population: «הישר AC» now introduces `C`, because a line named by two
     * points is a statement about those points. The enumeration failed; the invariant did not, and
     * the invariant is what the case is named after — a point id is a bare letter, every curve id is
     * namespaced by its kind, so no statement pair can make the two collide.
     */
    const ids = c.objects.map((o) => o.id);
    const points = ids.filter((id) => /^[A-Z][0-9]?$/.test(id));
    const curves = ids.filter((id) => /^(line|circle|curve|parabola|ellipse)-/.test(id));
    expect(points).toEqual(['A', 'C']);
    expect(curves).toEqual(['line-AC', 'circle-I']);
    expect(points.filter((id) => curves.includes(id))).toEqual([]);
    expect(points.length + curves.length).toBe(ids.length); // nothing in a third space
  });
});

/**
 * #1019 — an UNBOUNDED parameter varies in SIGN, not only in magnitude.
 *
 * `1 + 3 * u` asserted `a > 0` for a parameter nobody bounded: `y² = 2ax` drew a right-opening
 * parabola at every configuration and nothing had said it opens right. That is ADR-052's cardinal
 * sin — a default value masquerading as a given, which the conformance smell names exactly (a value
 * counted by `rawMovableDof` but never actually sampled across its range).
 *
 * The seed-0 case is a lock in its own right: ADR-052 permits a default as a STARTING point, so the
 * familiar draw is allowed to be first. What it forbids is a default that never moves.
 */
describe('#1019 — an unbounded parameter reaches both signs', () => {
  const over = (n: number, d: Parameters<typeof sampleParam>[0] = {}) =>
    Array.from({ length: n }, (_, s) => sampleParam(d, s, 1));

  it('is positive at seed 0 — the familiar first draw is still allowed', () => {
    expect(sampleParam({}, 0, 1)).toBeGreaterThan(0);
  });

  it('reaches NEGATIVE values across configurations', () => {
    const vals = over(40);
    expect(vals.some((v) => v < 0)).toBe(true); // ← was false at every one of 40 seeds
  });

  it('reaches both signs within the first handful of configurations', () => {
    // «הציגו תצורה אחרת» has to get there in a few presses, not in forty.
    const vals = over(6);
    expect(vals.some((v) => v > 0)).toBe(true);
    expect(vals.some((v) => v < 0)).toBe(true);
  });

  it('never lands near the degenerate 0, where y²=2px collapses to a doubled axis', () => {
    for (const v of over(60)) expect(Math.abs(v)).toBeGreaterThanOrEqual(1);
  });

  it('draws two unbounded parameters INDEPENDENTLY — they must not march in lockstep', () => {
    // A figure with two free symbols has to be able to reach all four sign combinations.
    const a = over(20);
    const b = Array.from({ length: 20 }, (_, s) => sampleParam({}, s, 2));
    const agree = a.filter((v, i) => Math.sign(v) === Math.sign(b[i])).length;
    expect(agree).toBeGreaterThan(0);
    expect(agree).toBeLessThan(20);
  });

  it('leaves every BOUNDED branch exactly as it was — they respect what was stated', () => {
    // These were never wrong, and a sign change here would invent the opposite given.
    for (const v of over(20, { min: 0, minOpen: true })) expect(v).toBeGreaterThan(0);
    for (const v of over(20, { max: 0, maxOpen: true })) expect(v).toBeLessThan(0);
    for (const v of over(20, { min: 0, max: 6 })) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('end to end: the parabola opens both ways as configurations advance', () => {
    const signs = new Set(
      [0, 1, 2, 3, 4, 5].map((s) => {
        const d = derive(['a הוא פרמטר', 'נתונה פרבולה שמשוואתה y^2=2ax'], s);
        return Math.sign(d.figure.env.a as number);
      }),
    );
    expect(signs.has(1)).toBe(true);
    expect(signs.has(-1)).toBe(true);
  });
});

describe('#1022 — the catalog teaches the parabola with the letter the student has', () => {
  /**
   * Operator, 2026-09-15: *"while its perfectly fine to have a parabola y^2=2ax, the common is
   * y^2=2px"*.
   *
   * Not cosmetic. The 5-unit formula sheet does NOT carry the parabola (docs/19 §3), so «y² = 2px,
   * focus (p/2,0), directrix x = -p/2» is recited from memory as a TRIPLE. A card offering `2ax`
   * teaches a student to rename the one letter whose meaning they already know.
   *
   * Both spellings parse and draw identically — asserted here, because that is what makes this a
   * teaching choice rather than a capability.
   */
  it('offers 2px, and both letters still build the same figure', () => {
    expect(COMMAND_CATALOG_ANALYTIC.some((e: CatalogEntryAnalytic) => e.he.includes('y^2=2px'))).toBe(true);
    expect(COMMAND_CATALOG_ANALYTIC.some((e: CatalogEntryAnalytic) => e.he.includes('y^2=2ax'))).toBe(false);

    const withP = build(['נתונה פרבולה שמשוואתה y^2=2px']);
    const withA = build(['נתונה פרבולה שמשוואתה y^2=2ax']);
    expect(dofCount(withP)).toBe(dofCount(withA));
    expect(paramRegister(withP).map((r) => r.sym)).toEqual(['p']);
  });
});
