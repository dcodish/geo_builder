/**
 * #1201 (P1) — A STATED DISTANCE TO A LINE IS DRIVEN, AND A BROKEN ONE IS SAID OUT LOUD.
 *
 * ```
 * נתון הישר l1: y=0
 * A על הישר x=0
 * המרחק מ-A לישר l1 = 5
 * ```
 *
 * `A` rides `x = 0`, so it is `(0, t)` and its distance to `l1` is `|t|`. The statement asks for
 * `|t| = 5` and is satisfiable twice over. Measured before the fix:
 *
 * ```
 * faults              []                      -- nothing refused
 * figure.unsatisfied  []                      -- the engine reported it satisfied
 * A                   (0, -2.130393)          -- distance 2.13, not 5
 * ```
 *
 * ## One cause, both symptoms
 *
 * `residual()` computed a `length-eq` with `evalLengthExpr(k.left, at, env)` — **three arguments**. The
 * fourth, `lineAt`, is what resolves the `point-line` term's line, so the term evaluated to `null` and
 * the whole residual came back `null`. And `null` is read two different ways:
 *
 * - the SOLVE does `residual(...) ?? [0]` — a null becomes **zero, i.e. satisfied**, so the constraint
 *   was never driven;
 * - the REPORT does `if (r === null) continue` — "cannot be judged", so it never reached `unsatisfied`.
 *
 * Both readings are individually correct, and together they make a wiring gap indistinguishable from a
 * point that vanished at this parameter value. That is why it was silent rather than merely wrong.
 *
 * The locks below therefore assert BOTH halves — the given is honoured when it can be, and it is
 * REFUSED when it cannot — plus the class-level property that is the real deliverable.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { residual } from '../engine/solve';
import { curveAtOf, lineAtOf } from '../engine/evaluate';
import { decideSubmit } from '../app/submit';

const at = (d: ReturnType<typeof derive>) => (id: string) =>
  d.figure.points.find((q) => q.id === id) ?? null;
const pt = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((q) => q.id === id);

/** The operator-facing case: A rides x = 0, so its distance to y = 0 is |A.y|. */
const CARRIER = ['נתון הישר l1: y=0', 'A על הישר x=0', 'המרחק מ-A לישר l1 = 5'];
/** The same statement about a point that is PINNED at distance 0 — genuinely impossible. */
const IMPOSSIBLE = ['נתון הישר l1: y=0', 'A(0,0)', 'המרחק מ-A לישר l1 = 5'];

describe('#1201 — the distance to a line is a constraint the solve can see', () => {
  it('the given is HONOURED: the point lands at exactly the stated distance', () => {
    for (const seed of [0, 1, 2]) {
      const d = derive(CARRIER, seed);
      const A = pt(d, 'A');
      expect(A, `seed ${seed} places A`).toBeDefined();
      // |A.y| is the distance to y = 0. It was 2.130393 — the sampler's position, untouched.
      expect(Math.abs(A!.y), `seed ${seed}`).toBeCloseTo(5, 6);
      expect(d.faults).toEqual([]);
    }
  });

  it('both sides of the line are reachable — the figure still has two configurations', () => {
    // ADR-052: nothing here may pin the sign. A fix that drove |t| = 5 by fixing t = -5 would pass
    // the test above and quietly delete a configuration the student is entitled to see.
    const ys = [0, 1, 2, 3, 4, 5].map((s) => pt(derive(CARRIER, s), 'A')?.y ?? 0);
    expect(ys.some((y) => y > 0), `every seed put A below the line: ${JSON.stringify(ys)}`).toBe(true);
    expect(ys.some((y) => y < 0)).toBe(true);
  });

  it('an IMPOSSIBLE distance is refused, naming the student’s own sentence', () => {
    const d = derive(IMPOSSIBLE, 0);
    expect(d.figure.unsatisfied.map((k) => k.t)).toContain('length-eq');
    expect(d.faults.map((f) => f.code)).toContain('unsatisfiable');
    expect(d.faults.find((f) => f.code === 'unsatisfiable')?.detail).toBe('המרחק מ-A לישר l1 = 5');
  });

  it('the submit gate refuses it, so the prior figure is kept', () => {
    // Driven through the real decision, not re-implemented (#1063's lesson, recorded in submit.ts).
    const v = decideSubmit(IMPOSSIBLE[2], IMPOSSIBLE.slice(0, 2), 0, derive(IMPOSSIBLE.slice(0, 2), 0));
    expect(v.kind).toBe('refused');
  });

  it('a line named by TWO POINTS drives the same way', () => {
    const d = derive(['A(0,0)', 'B(10,0)', 'C על הישר x=3', 'המרחק מ-C לישר AB = 4'], 0);
    const C = pt(d, 'C');
    expect(d.faults).toEqual([]);
    expect(Math.abs(C!.y)).toBeCloseTo(4, 6); // AB is the x-axis here
  });

  /**
   * THE CLASS, AND THE REAL DELIVERABLE.
   *
   * `null` from `residual` means "cannot be judged at this iterate" — a point that vanished. The solve
   * turns it into `0`, which is safe ONLY because it is transient. A term that can never be resolved
   * produces the same `null` forever, and is then a permanent false green.
   *
   * So: with the resolvers the engine supplies, a constraint whose operands all exist must produce a
   * NUMBER. Asserted across every arm of `MeasureTerm`, so the next arm added cannot reopen this by
   * being handed to `evalLengthExpr` without its resolver.
   */
  it('every measure arm produces a real residual — none reports "cannot be judged"', () => {
    const cases: Array<[string, string[]]> = [
      ['point-line (named curve)', CARRIER],
      ['point-line (two points)', ['A(0,0)', 'B(10,0)', 'C על הישר x=3', 'המרחק מ-C לישר AB = 4']],
      ['plain length', ['A(0,0)', 'B על הישר x=10', 'AB = 12']],
      ['area', ['A(0,0)', 'B(4,0)', 'C על הישר x=1', 'שטח ABC = 6']],
    ];
    let checked = 0;
    for (const [what, seq] of cases) {
      const d = derive(seq, 0);
      const lengthEqs = d.construction.constraints.filter((k) => k.t === 'length-eq');
      expect(lengthEqs.length, `${what}: the sequence builds a length-eq at all`).toBeGreaterThan(0);
      for (const k of lengthEqs) {
        // The engine's OWN resolver builders, not a copy of them: the defect was the wiring, so a
        // test that built its own resolvers would pass while the engine still forgot to.
        const point = at(d);
        const r = residual(k, point, d.figure.env, curveAtOf(d.construction, d.figure.env, point), lineAtOf(d.construction, d.figure.env, point));
        expect(r, `${what}: the residual is unjudgeable, which the solve reads as SATISFIED`).not.toBeNull();
        checked++;
      }
    }
    // An oracle with nothing to check passes by checking nothing.
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
