/**
 * #966 (ADR-499) — «אלכסון» is a CLAIM about the pair, not a way of pointing at one.
 *
 * The 2-D half of the operator's #859 ruling, which was explicit that it spans the workspace:
 * *"the term אלכסון should be sure to be a diagonal and this is true for all tools. if the word is used."*
 * 3-D got it; 2-D never checked the pair at all, and produced two distinct silent wrongs:
 *
 *  - «מלבן ABCD» → «אלכסון AB» answered **"already drawn"**. That is worse than staying silent: it
 *    AFFIRMS the student's false claim, telling someone who wrote "the diagonal AB" of a *triangle*
 *    that that diagonal is already on the canvas.
 *  - «משולש ABC» · «משולש DEF» → «אלכסון AD» drew **fresh ink** and called it a diagonal of nothing.
 *
 * Neither can ever appear in the prod logs as a failure — the student is told it worked — which is an
 * argument for fixing it, not for deferring it (the operator's own framing on #859).
 *
 * The fix is TWO layers over ONE predicate (`isRingDiagonal`), and the split is forced by measurement,
 * not taste: `applyStep` refuses what the figure can ALREADY contradict, and the givens verifier settles
 * what only the finished figure can answer. «אלכסון AC» typed BEFORE «מלבן ABCD» is a legitimate order
 * that ends up perfectly true, so an apply-time refusal of every unsupported pair would reject it —
 * ADR-104's principle that a claim which is not yet checkable is not yet false.
 */
import { describe, it, expect } from 'vitest';
import { isRingDiagonal } from '../geometry';
import { diagonalClaimRefusal } from '../step';
import { applyCommand } from '../apply';
import { checkGivens } from '../verify';
import { evaluate } from '../evaluate';
import type { Command, Construction } from '../types';

const empty: Construction = { objects: [], constraints: [] };
const build = (cmds: Command[]) => cmds.reduce((c, cmd) => applyCommand(c, cmd), empty);

describe('#966 — isRingDiagonal is the one answer to "is this pair a diagonal"', () => {
  const quad = ['A', 'B', 'C', 'D'];

  it('a quad has exactly its two diagonals', () => {
    expect(isRingDiagonal(quad, 'A', 'C')).toBe(true);
    expect(isRingDiagonal(quad, 'B', 'D')).toBe(true);
    expect(isRingDiagonal(quad, 'C', 'A')).toBe(true); // order-independent
  });

  it('every side is not a diagonal — including the WRAP side', () => {
    // D–A closes the ring: the wrap pair is the one an index-distance test forgets, and forgetting it
    // would refuse a real side as "not adjacent".
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']]) {
      expect(isRingDiagonal(quad, a, b), `${a}${b} is a side`).toBe(false);
    }
  });

  it('a TRIANGLE has no diagonals at all, and that falls out rather than being special-cased', () => {
    const tri = ['A', 'B', 'C'];
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['A', 'C']]) {
      expect(isRingDiagonal(tri, a, b)).toBe(false);
    }
  });

  it('a pair that is not on the ring is not its diagonal, and a pair with itself never is', () => {
    expect(isRingDiagonal(quad, 'A', 'Z')).toBe(false);
    expect(isRingDiagonal(quad, 'A', 'A')).toBe(false);
  });

  it('a pentagon has the five diagonals and the five sides', () => {
    const pent = ['A', 'B', 'C', 'D', 'E'];
    expect(isRingDiagonal(pent, 'A', 'C')).toBe(true);
    expect(isRingDiagonal(pent, 'A', 'D')).toBe(true);
    expect(isRingDiagonal(pent, 'E', 'A')).toBe(false); // the wrap side
    expect(isRingDiagonal(pent, 'B', 'E')).toBe(true);
  });
});

describe('#966 — the apply-time refusal fires only on EVIDENCE', () => {
  const rect = build([{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }]);

  it('refuses a SIDE named as a diagonal, naming the pair and the shape', () => {
    const msg = diagonalClaimRefusal(rect, { type: 'segment', a: 'A', b: 'B', diagonal: true });
    expect(msg).toBe('AB is not a diagonal of ABCD — it is a side');
  });

  it('refuses a diagonal of a shape that HAS none, and says so differently', () => {
    // Two different mistakes deserve two different sentences: "that is a side" teaches nothing to a
    // student who drew it on a triangle.
    const tri = build([{ type: 'triangle', ids: ['A', 'B', 'C'] }]);
    expect(diagonalClaimRefusal(tri, { type: 'segment', a: 'A', b: 'B', diagonal: true }))
      .toBe('AB is not a diagonal — ABC has no diagonals');
  });

  it('accepts a real diagonal', () => {
    expect(diagonalClaimRefusal(rect, { type: 'segment', a: 'A', b: 'C', diagonal: true })).toBeNull();
  });

  it('says nothing about a plain segment — the noun is what makes it a claim', () => {
    expect(diagonalClaimRefusal(rect, { type: 'segment', a: 'A', b: 'B' })).toBeNull();
  });

  it('DEFERS when no polygon carries both labels — it does not refuse what it cannot yet judge', () => {
    // The forward declaration («אלכסון AC» before the quad) and the cross-figure pair both land here.
    // Refusing them at apply time would reject a legitimate order; the verifier has the last word.
    expect(diagonalClaimRefusal(empty, { type: 'segment', a: 'A', b: 'C', diagonal: true })).toBeNull();
    const two = build([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'triangle', ids: ['D', 'E', 'F'] }]);
    expect(diagonalClaimRefusal(two, { type: 'segment', a: 'A', b: 'D', diagonal: true })).toBeNull();
  });
});

describe('#966 — the verifier settles the deferred claims against the FINAL figure', () => {
  const violations = (cmds: Command[]) => {
    const c = build(cmds);
    const r = evaluate(c);
    return checkGivens(cmds, r.ok ? r.positions : new Map(), new Map(), c).filter((v) => v.relation === 'not-a-diagonal');
  };

  it('flags fresh ink called a diagonal of nothing (the #859 symptom, 2-D edition)', () => {
    const v = violations([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'triangle', ids: ['D', 'E', 'F'] },
      { type: 'segment', a: 'A', b: 'D', diagonal: true },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].params.pair).toBe('AD');
    expect(v[0].messageKey).toBe('figure.v.notADiagonal');
  });

  it('flags a diagonal claimed with no polygon in the figure at all', () => {
    expect(violations([{ type: 'segment', a: 'A', b: 'C', diagonal: true }])).toHaveLength(1);
  });

  it('a FORWARD-declared diagonal that becomes true is clean — the deferral is the point', () => {
    // «אלכסון AC» then «מלבן ABCD». Measured green before the fix and it must stay green: this is the
    // case that rules out "refuse whenever no polygon supports the pair".
    expect(violations([
      { type: 'segment', a: 'A', b: 'C', diagonal: true },
      { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] },
    ])).toEqual([]);
  });

  it('a real diagonal on a declared quad is clean', () => {
    expect(violations([
      { type: 'rectangle', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'C', diagonal: true },
    ])).toEqual([]);
  });

  it('a plain segment is never audited — only the noun makes the claim', () => {
    expect(violations([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'segment', a: 'A', b: 'B' },
    ])).toEqual([]);
  });

  it('one pair claimed twice is reported once', () => {
    expect(violations([
      { type: 'segment', a: 'A', b: 'C', diagonal: true },
      { type: 'segment', a: 'A', b: 'C', diagonal: true },
    ])).toHaveLength(1);
  });
});
