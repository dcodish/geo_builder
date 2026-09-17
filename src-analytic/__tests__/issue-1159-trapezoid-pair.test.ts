/**
 * #1159 — «טרפז ABCD»'s parallel pair is the TOOL'S ASSUMPTION, not the student's given.
 *
 * Operator, playing the analytic tool: *"I write «טרפז ABCD» and the tool assumed AB is parallel to
 * CD. I then write «AB parallel to CD» and the tool says this is already known — which it should not
 * be, because that was **assumed, not given**."*
 *
 * Three symptoms, one gap, all measured on `main` before the fix:
 *
 *  1. «טרפז ABCD» · «BC מקביל ל-AD» held BOTH pairs and drew a **parallelogram** at every seed.
 *  2. «טרפז ABCD» · «AB מקביל ל-CD» answered `already-follows` — *"it already follows from what you
 *     wrote"* — when it follows from a pair the TOOL picked.
 *  3. «AB מקביל ל-CD» and «AB מקביל ל-DC» — one statement, two different verdicts.
 *
 * This is [ADR-506](../../docs/06-decisions.md#adr-506)'s decision ported into this tree. The 2-D
 * sibling reached it from the same operator complaint; the trees share the ruling, never the code.
 *
 * Every case calls `decideSubmit` / `derive` / `canonicalConstraint` — the real path — rather than
 * re-deciding what "the same statement" means (#1102/#1118).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { canonicalConstraint } from '../engine/solve';

/** How parallel is `pq` to `rs`, as a normalised |cross| — 0 is exactly parallel. */
function crossOf(d: ReturnType<typeof derive>, p: string, q: string, r: string, s: string): number {
  const at = (id: string) => d.figure.points.find((x) => x.id === id);
  const [P, Q, R, S] = [at(p), at(q), at(r), at(s)];
  if (!P || !Q || !R || !S) return NaN;
  const ux = Q.x - P.x;
  const uy = Q.y - P.y;
  const vx = S.x - R.x;
  const vy = S.y - R.y;
  const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return n > 1e-12 ? Math.abs(ux * vy - uy * vx) / n : NaN;
}

const SEEDS = 24;

describe('#1159 symptom 1 — naming the other pair does not make a parallelogram', () => {
  it('«טרפז ABCD» · «BC מקביל ל-AD» keeps EXACTLY ONE pair parallel, at every configuration', () => {
    const lines = ['טרפז ABCD', 'BC מקביל ל-AD'];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const d = derive(lines, seed);
      expect(d.faults, `faults at seed ${seed}`).toEqual([]);
      // The student's pair holds …
      expect(crossOf(d, 'B', 'C', 'A', 'D'), `BC∥AD at seed ${seed}`).toBeCloseTo(0, 6);
      // … and the tool's assumption has YIELDED. Before the fix this was 0.0000 at every seed, which
      // is a parallelogram on a figure the student called a trapezoid.
      expect(crossOf(d, 'A', 'B', 'D', 'C'), `AB∥DC must NOT be forced at seed ${seed}`).toBeGreaterThan(1e-3);
    }
  });

  it('the assumption is DISPLACED, not added to — one parallel constraint, not two', () => {
    const d = derive(['טרפז ABCD', 'BC מקביל ל-AD'], 0);
    const parallels = d.construction.constraints.filter((k) => k.t === 'relation' && k.rel === 'parallel');
    expect(parallels).toHaveLength(1);
    // And what survives is the STUDENT'S, unmarked — not the tool's guess.
    expect(parallels[0].t === 'relation' && parallels[0].assumed).toBeFalsy();
  });

  /**
   * BOTH pairs stated is a parallelogram the student ASKED FOR, and must be left alone. The second
   * statement finds no assumption to displace — the first already pinned it — and records normally.
   */
  it('stating BOTH pairs is a parallelogram, and is allowed', () => {
    const d = derive(['טרפז ABCD', 'AB מקביל ל-CD', 'BC מקביל ל-AD'], 0);
    expect(d.faults).toEqual([]);
    expect(crossOf(d, 'A', 'B', 'D', 'C')).toBeCloseTo(0, 6);
    expect(crossOf(d, 'B', 'C', 'A', 'D')).toBeCloseTo(0, 6);
  });
});

describe('#1159 symptom 2 — an assumption is never quoted back as the student’s own given', () => {
  it('«טרפז ABCD» · «AB מקביל ל-CD» RECORDS — it pins what was only assumed', () => {
    expect(decideSubmit('AB מקביל ל-CD', ['טרפז ABCD'], 0).kind).toBe('record');
  });

  it('…in every spelling and both languages', () => {
    for (const line of ['AB מקביל ל-CD', 'AB מקביל ל-DC', 'AB is parallel to CD', 'CD מקביל ל-AB']) {
      expect(decideSubmit(line, ['טרפז ABCD'], 0).kind, line).toBe('record');
    }
  });

  it('the other two trapezoid nouns inherit it — the row is the mechanism, not the noun', () => {
    for (const noun of ['טרפז שווה שוקיים', 'טרפז ישר זווית']) {
      expect(decideSubmit('AB מקביל ל-CD', [`${noun} ABCD`], 0).kind, noun).toBe('record');
    }
  });

  /**
   * THE COUNTER-DIRECTION, and the reason this is about assumptions rather than about parallels.
   *
   * «מקבילית ABCD» genuinely GIVES both pairs — the noun says so — so restating one is a true
   * restatement and «כבר ידוע» is the honest answer. A fix that made every parallel record would
   * have swapped one dishonest message for another.
   */
  it('a parallelogram’s pair is a real given, and restating it is still absorbed', () => {
    for (const line of ['AB מקביל ל-CD', 'AB מקביל ל-DC']) {
      expect(decideSubmit(line, ['מקבילית ABCD'], 0).kind, line).toBe('already-known');
    }
  });

  /** Pinning happens ONCE: having pinned it, saying it again is an ordinary restatement. */
  it('pinning is not repeatable — the second restatement is absorbed', () => {
    expect(decideSubmit('AB מקביל ל-CD', ['טרפז ABCD', 'AB מקביל ל-CD'], 0).kind).toBe('already-known');
  });
});

describe('#1159 symptom 3 — one statement gets ONE answer, whatever the letter order', () => {
  /**
   * The undirected key, asserted on the decision function itself so it cannot drift from what the
   * comparison sites use. `canonicalConstraint` is what every site now calls.
   */
  it('a relation’s canonical key ignores operand order and point order', () => {
    const rel = (a: string, b: string, c: string, d: string) =>
      canonicalConstraint({
        t: 'relation',
        rel: 'parallel',
        u: { k: 'points', a, b },
        v: { k: 'points', a: c, b: d },
      });
    const base = rel('A', 'B', 'C', 'D');
    expect(rel('B', 'A', 'C', 'D')).toBe(base); // the first segment reversed
    expect(rel('A', 'B', 'D', 'C')).toBe(base); // the second segment reversed — the reported split
    expect(rel('C', 'D', 'A', 'B')).toBe(base); // the operands swapped
    // A DIFFERENT statement must still differ.
    expect(rel('A', 'C', 'B', 'D')).not.toBe(base);
  });

  it('the `assumed` mark is NOT part of the identity — that is what lets a statement pin it', () => {
    const stated = canonicalConstraint({
      t: 'relation',
      rel: 'parallel',
      u: { k: 'points', a: 'A', b: 'B' },
      v: { k: 'points', a: 'D', b: 'C' },
    });
    const assumed = canonicalConstraint({
      t: 'relation',
      rel: 'parallel',
      u: { k: 'points', a: 'A', b: 'B' },
      v: { k: 'points', a: 'D', b: 'C' },
      assumed: true,
    });
    expect(assumed).toBe(stated);
  });

  it('the two spellings reach the same verdict, on every shape that was split', () => {
    for (const setup of [['טרפז ABCD'], ['מקבילית ABCD'], ['מלבן ABCD'], ['ריבוע ABCD']]) {
      const a = decideSubmit('AB מקביל ל-CD', setup, 0).kind;
      const b = decideSubmit('AB מקביל ל-DC', setup, 0).kind;
      expect(b, `${setup[0]}: CD said ${a}, DC said ${b}`).toBe(a);
    }
  });

  /** Perpendicularity is symmetric too, and went through the same comparison. */
  it('…and the same holds for ⊥', () => {
    const a = decideSubmit('AB מאונך ל-BC', ['מלבן ABCD'], 0).kind;
    const b = decideSubmit('BC מאונך ל-AB', ['מלבן ABCD'], 0).kind;
    expect(b).toBe(a);
  });
});
