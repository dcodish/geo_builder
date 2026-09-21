/**
 * #1242 ([ADR-AG-133](../../docs/06c-decisions-analytic.md#adr-ag-133)) — THE FOLD DEFERS, AND THE LINE IS
 * THE UNIT OF APPLICATION.
 *
 * Operator, 2026-09-19, playing T4 of the #1232 sheet in the other order: *"the idea of order is not
 * relevant since the diagram should either respect all input or refuse to build."* 2-D settled the same
 * sentence in June (ADR-104); analytic's `fold` was a single forward pass, so «AD גובה לצלע BC» typed
 * before «משולש ABC» faulted on `B` — and STILL DREW: the declares and the segment landed, the two
 * constraints were dropped, and the canvas showed a segment `AD` asserting nothing in a row that read
 * as accepted apart from a small red `B`. Neither half of the ruling held.
 *
 * Two mechanisms, in the order the plan gave them: the deferral fixpoint makes the reported sequence
 * BUILD (the constraints are retried once the triangle has declared B and C); line atomicity makes what
 * still cannot build leave NO residue. The locks are parity assertions against the working order, never
 * independent expectations, and the unrescuable case asserts absence of every fragment.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { fold } from '../engine/apply';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';
import type { Fact } from '../engine/types';

const P = (d: ReturnType<typeof derive>, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} in figure (${d.figure.points.map((q) => q.id).join(',')})`);
  return p;
};

/** Both halves of "AD is the altitude to BC", measured on the DRAWN figure — #1232's own instrument. */
function altitudeError(d: ReturnType<typeof derive>, apex: string, foot: string, u: string, v: string) {
  const A = P(d, apex);
  const D = P(d, foot);
  const B = P(d, u);
  const C = P(d, v);
  const ux = C.x - B.x;
  const uy = C.y - B.y;
  const n = Math.hypot(ux, uy);
  const ax = D.x - A.x;
  const ay = D.y - A.y;
  return {
    offLine: Math.abs((D.x - B.x) * uy - (D.y - B.y) * ux) / (n * n),
    cos: Math.abs((ax * ux + ay * uy) / (Math.hypot(ax, ay) * n)),
  };
}

const TOL = 1e-6; // #1232's measured convergence noise is ~1e-8; this is a millionth of the side

/** The construction's stated constraints, order-independently, so two orders can be compared. */
const constraintsOf = (d: ReturnType<typeof derive>) => [...d.construction.constraints].map((k) => JSON.stringify(k)).sort();

describe('#1242 — deferral: a constraint typed before the objects it names is honoured once they exist', () => {
  const FORWARD = ['משולש ABC', 'AD גובה לצלע BC'];
  const REVERSED = ['AD גובה לצלע BC', 'משולש ABC'];

  it("the operator's sequence BUILDS — the reversed order is the working order's figure, at every seed", () => {
    for (let seed = 0; seed < 8; seed++) {
      const fwd = derive(FORWARD, seed);
      const rev = derive(REVERSED, seed);
      expect(fwd.faults, `forward seed ${seed}`).toEqual([]);
      expect(rev.faults, `reversed seed ${seed}`).toEqual([]);
      expect(rev.figure.unsatisfied, `reversed seed ${seed}`).toEqual([]);
      const e = altitudeError(rev, 'A', 'D', 'B', 'C');
      expect(e.offLine, `seed ${seed}: the foot is ON the side`).toBeLessThan(TOL);
      expect(e.cos, `seed ${seed}: the cevian is perpendicular`).toBeLessThan(TOL);
      // parity, not an independent expectation: the same stated constraints, whichever order
      expect(constraintsOf(rev)).toEqual(constraintsOf(fwd));
      expect(rev.outcomes, 'both lines land').toEqual(['created', 'created']);
    }
  });

  it('the general case is not cevian-shaped: «AB מקביל לציר x» before «משולש ABC» builds and holds', () => {
    const d = derive(['AB מקביל לציר x', 'משולש ABC'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.unsatisfied).toEqual([]);
    expect(Math.abs(P(d, 'A').y - P(d, 'B').y), 'AB is horizontal').toBeLessThan(TOL);
    expect(constraintsOf(d)).toEqual(constraintsOf(derive(['משולש ABC', 'AB מקביל לציר x'], 0)));
  });

  it('order-independence as a PROPERTY: every permutation of a consistent given set builds the same constraints', () => {
    const lines = ['משולש ABC', 'AD גובה לצלע BC', 'AB מקביל לציר x'];
    const perms = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const reference = constraintsOf(derive(lines, 0));
    expect(reference.length).toBeGreaterThan(0);
    for (const order of perms(lines)) {
      const d = derive(order, 0);
      expect(d.faults, order.join(' · ')).toEqual([]);
      expect(constraintsOf(d), order.join(' · ')).toEqual(reference);
      const e = altitudeError(d, 'A', 'D', 'B', 'C');
      expect(e.offLine, order.join(' · ')).toBeLessThan(TOL);
      expect(e.cos, order.join(' · ')).toBeLessThan(TOL);
    }
  });

  it("#1232's guard holds in both orders — the foot is on the side and the cevian is perpendicular", () => {
    for (const order of [FORWARD, REVERSED]) {
      const d = derive(order, 3);
      const e = altitudeError(d, 'A', 'D', 'B', 'C');
      expect(e.offLine).toBeLessThan(TOL);
      expect(e.cos).toBeLessThan(TOL);
    }
  });
});

describe('#1242 — atomicity: a line that cannot be finished leaves NO residue', () => {
  it('a cevian naming points no line ever declares is faulted in full — no D, no segment AD, nothing drawn', () => {
    const d = derive(['AD גובה לצלע BC'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
    expect(d.outcomes).toEqual(['faulted']);
    expect(d.construction.objects, 'nothing of the line survives').toEqual([]);
    expect(d.construction.constraints).toEqual([]);
    expect(d.figure.points).toEqual([]);
    expect(d.figure.segments).toEqual([]);
  });

  it('a later line that leaned on the faulted line’s fragment is faulted too — the poisoning runs to a fixpoint', () => {
    // «M אמצע AD» would have been satisfied by the residue (A and D declared, never placed); with the
    // residue gone it names points that do not exist, and says so.
    const d = derive(['AD גובה לצלע BC', 'M אמצע AD'], 0);
    expect(d.outcomes).toEqual(['faulted', 'faulted']);
    expect(d.construction.objects).toEqual([]);
  });

  it('the fault is reported ONCE per line, not once per fact of the line', () => {
    const d = derive(['AD גובה לצלע BC'], 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0].index).toBe(0);
  });

  it('the fold alone: every fact of a faulted line carries the line’s error, positionally', () => {
    const r = parseLine('AD גובה לצלע BC');
    if (!r.ok) throw new Error('did not parse');
    const facts: Fact[] = r.facts;
    const out = fold(facts, facts.map(() => 0));
    expect(out.errors.every((e) => e !== null && e.code === 'unknown-reference'), 'every fact of the line').toBe(true);
    expect(out.effects.every((e) => e === null)).toBe(true);
    expect(out.construction.objects).toEqual([]);
  });
});

describe('#1242 — what stays exactly as it was', () => {
  it('a genuine contradiction still fails honestly and is not deferred into acceptance', () => {
    const d = derive(['משולש ABC', 'AB מקביל לציר x', 'AB מקביל לציר y'], 0);
    expect(d.faults.length, 'the contradiction is reported').toBeGreaterThan(0);
    expect(d.outcomes.includes('faulted')).toBe(true);
  });

  it('an all-known line still reports `known`', () => {
    const d = derive(['משולש ABC', 'משולש ABC'], 0);
    expect(d.outcomes[1]).toBe('known');
    expect(d.faults).toEqual([]);
  });

  it('the submit gate: a forward reference typed on a canvas that lacks the point is still refused (ADR-AG-015 — a reference may not invent)', () => {
    const v = decideSubmit('AD גובה לצלע BC', [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error.key).toBe('unknown-reference');
  });

  it('the submit gate: the same line on the triangle records, and the reversed list — reached by editing — derives clean', () => {
    const v = decideSubmit('AD גובה לצלע BC', ['משולש ABC'], 0);
    expect(v.kind).toBe('record');
    expect(derive(['AD גובה לצלע BC', 'משולש ABC'], 0).faults).toEqual([]);
  });
});
