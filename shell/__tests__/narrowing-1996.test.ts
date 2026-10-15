/**
 * #1996 (ADR-W-129) — the shared forced-narrowing decision, unit by unit: the lattice, the per-sample classifier,
 * the pool verdict, the cause search, the sentence slot and the sentence. Each builder's adapter is locked by its
 * own thin lock over `fixtures/narrowing-note-rows.ts`; this file locks the parts they share.
 */
import { describe, expect, it } from 'vitest';
import {
  NARROW_IMPLIES,
  NARROW_KINDS,
  attributeCause,
  causeSlot,
  declaredKindOf,
  forcedKinds,
  forcedUnder,
  isRingRightAngle,
  leastKind,
  meetKinds,
  narrowImplies,
  narrowingOf,
  narrowingSentence,
  ringKinds,
  silentByValues,
  type NarrowKind,
} from '../narrowing';

describe('the kind lattice', () => {
  it('is reflexive and transitive', () => {
    for (const a of NARROW_KINDS) {
      expect(narrowImplies(a, a), a).toBe(true);
      for (const b of NARROW_IMPLIES[a]) for (const c of NARROW_IMPLIES[b]) expect(narrowImplies(a, c), `${a} ⇒ ${b} ⇒ ${c}`).toBe(true);
    }
  });
  it('reads the trapezoid exclusively (ADR-619): a parallelogram is not a trapezoid', () => {
    expect(narrowImplies('parallelogram', 'trapezoid')).toBe(false);
    expect(narrowImplies('rectangle', 'trapezoid')).toBe(false);
    expect(narrowImplies('isosceles-trapezoid', 'trapezoid')).toBe(true);
  });
  it('a square is every quadrilateral kind but a trapezoid; a right kite is a kite', () => {
    expect(NARROW_IMPLIES.square).toEqual(expect.arrayContaining(['rectangle', 'rhombus', 'right-kite', 'kite', 'parallelogram']));
    expect(narrowImplies('right-kite', 'kite')).toBe(true);
    expect(narrowImplies('rhombus', 'right-kite')).toBe(false);
  });
  it('meets two kinds into the most general one that is both', () => {
    expect(meetKinds('rectangle', 'rhombus')).toBe('square');
    expect(meetKinds('parallelogram', 'kite')).toBe('rhombus');
    expect(meetKinds('rectangle', 'kite')).toBe('square');
    expect(meetKinds('isosceles-triangle', 'right-triangle')).toBe('right-isosceles-triangle');
    expect(meetKinds('equilateral-triangle', 'right-triangle')).toBeNull();
    expect(meetKinds('trapezoid', 'parallelogram')).toBeNull();
  });
});

const sq = (pts: number[][]) => [...ringKinds(pts)].sort();
describe('ringKinds — one sample', () => {
  it('a rectangle, a square, a rhombus', () => {
    expect(sq([[0, 0], [4, 0], [4, 3], [0, 3]])).toEqual(['parallelogram', 'quadrilateral', 'rectangle']);
    expect(ringKinds([[0, 0], [2, 0], [2, 2], [0, 2]]).has('square')).toBe(true);
    expect(ringKinds([[0, 0], [2, 0], [2, 2], [0, 2]]).has('right-kite')).toBe(true);
    expect(sq([[0, 0], [5, 0], [8, 4], [3, 4]])).toEqual(['kite', 'parallelogram', 'quadrilateral', 'rhombus']);
  });
  it('a kite about EITHER axis, per sample (2-D’s two kite variants)', () => {
    expect(ringKinds([[0, 0], [2, -1], [5, 0], [2, 1]]).has('kite')).toBe(true); // axis 0–2
    expect(ringKinds([[2, -1], [5, 0], [2, 1], [0, 0]]).has('kite')).toBe(true); // the same kite, axis 1–3
  });
  it('the right kite: a kite with both off-axis angles right', () => {
    const k = ringKinds([[0, 0], [1, 1], [2, 0], [1, -3]]); // AB = BC, CD = DA; ∠A, ∠C not right
    expect(k.has('kite')).toBe(true);
    expect(k.has('right-kite')).toBe(false);
    // the square is the right kite with equal sides
    expect(ringKinds([[0, 0], [3, 0], [3, 3], [0, 3]]).has('right-kite')).toBe(true);
    // a non-square right kite: AB = AD = 3 at a 60° apex, C the antipode of A on the circle through A, B, D
    const B = [3, 0];
    const D = [1.5, (3 * Math.sqrt(3)) / 2];
    const C = [3, Math.sqrt(3)]; // |AC| = 2√3 = diameter of the circumcircle of A, B, D (R = √3)
    const kinds = ringKinds([[0, 0], B, C, D]);
    expect(kinds.has('right-kite')).toBe(true);
    expect(kinds.has('square')).toBe(false);
  });
  it('trapezoids, exclusive: one parallel pair', () => {
    expect(sq([[0, 0], [6, 0], [4, 2], [2, 2]])).toEqual(['isosceles-trapezoid', 'quadrilateral', 'trapezoid']);
    expect(sq([[0, 0], [6, 0], [4, 2], [0, 2]])).toEqual(['quadrilateral', 'right-trapezoid', 'trapezoid']);
  });
  it('triangles', () => {
    expect(sq([[0, 0], [4, 0], [0, 3]])).toEqual(['right-triangle', 'triangle']);
    expect(sq([[0, 0], [2, 0], [1, Math.sqrt(3)]])).toEqual(['equilateral-triangle', 'isosceles-triangle', 'triangle']);
    expect(sq([[0, 0], [2, 0], [0, 2]])).toEqual(['isosceles-triangle', 'right-isosceles-triangle', 'right-triangle', 'triangle']);
  });
  it('3-D coordinates read the same', () => {
    expect(ringKinds([[0, 0, 1], [4, 0, 1], [4, 3, 1], [0, 3, 1]]).has('rectangle')).toBe(true);
  });
  it('a collapsed ring is no kind', () => {
    expect(ringKinds([[0, 0], [0, 0], [1, 1], [0, 1]]).size).toBe(0);
  });
});

describe('the pool verdict', () => {
  const S = (...k: NarrowKind[]) => new Set(k.flatMap((x) => NARROW_IMPLIES[x]));
  it('forced = held in every sample; the least element is the narrowing', () => {
    const forced = forcedKinds([S('rectangle'), S('square')]);
    expect(leastKind(forced)).toBe('rectangle');
    expect(narrowingOf('parallelogram', forced)).toEqual({ from: 'parallelogram', to: 'rectangle' });
    expect(narrowingOf('rectangle', forced)).toBeNull(); // nothing narrowed
  });
  it('only samples that ARE the declared kind count; none = out of family (the amber trapezoid warning)', () => {
    expect(forcedUnder('trapezoid', [S('parallelogram'), S('parallelogram')])).toBeNull();
    expect(forcedUnder('trapezoid', [S('isosceles-trapezoid'), S('parallelogram'), S('isosceles-trapezoid')])).toEqual(S('isosceles-trapezoid'));
    expect(forcedUnder('trapezoid', [S('isosceles-trapezoid'), S('parallelogram'), S('parallelogram')])).toBeNull(); // one drawing proves nothing
  });
});

describe('attributeCause — the statement typed first that forces it', () => {
  /** rows forcing it: a predicate over the chosen row set */
  const run = (n: number, forces: (rows: Set<number>) => boolean) => attributeCause(n, (rows) => forces(new Set(rows)));
  it('one cause, the earliest that forces it', () => {
    expect(run(4, (r) => r.has(2)).rows).toEqual([2]);
  });
  it('a co-cause: the circle definition the membership row needs', () => {
    expect(run(4, (r) => r.has(0) && r.has(1)).rows).toEqual([0, 1]);
  });
  it('over-determined, both orders: the one typed first is named (follow-up card 7)', () => {
    expect(run(2, (r) => r.has(0) || r.has(1)).rows).toEqual([0]);
  });
  it('the declaring rows alone forcing it gives an empty cause', () => {
    expect(run(3, () => true).rows).toEqual([]);
  });
  it('past the co-cause cap the cause is unknown', () => {
    const r = attributeCause(12, (rows) => rows.includes(10) && rows.includes(0), 8);
    expect(r.rows).toBeNull();
  });
  it('k* alone forcing it costs one trial, not one per earlier row; repeated questions are asked once', () => {
    const asked: string[] = [];
    attributeCause(6, (rows) => {
      asked.push(rows.join(','));
      return rows.includes(5);
    });
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.length).toBeLessThanOrEqual(1 + 3 + 1);
  });
});

describe('causeSlot and the ruled silences', () => {
  it('a circle through every vertex; tangent to every side; a right pyramid', () => {
    expect(causeSlot([0], ['circum'], 'parallelogram')).toEqual({ kind: 'circum' });
    expect(causeSlot([1], ['definition', 'incircle'], 'rectangle')).toEqual({ kind: 'incircle' });
    expect(causeSlot([0], ['rightPyramid'], 'trapezoid')).toEqual({ kind: 'rightPyramid' });
  });
  it('a definition row is never named («מעגל O» beside the points on it)', () => {
    expect(causeSlot([0, 1], ['definition', 'circum'], 'parallelogram')).toEqual({ kind: 'circum' });
  });
  it('Thales is givens, never circum (a diameter is a relation)', () => {
    expect(causeSlot([0, 1, 2], ['definition', 'relation', 'circum'], 'triangle')).toEqual({ kind: 'givens', rows: [1, 2] });
  });
  it('a circle with a given is listed as typed (card 6)', () => {
    expect(causeSlot([0, 1], ['circum', 'relation'], 'parallelogram')).toEqual({ kind: 'givens', rows: [0, 1] });
  });
  it('numbers alone on a plain shape are silent; on a named kind they are not (third ballot A)', () => {
    expect(causeSlot([0, 1, 2], ['value', 'value', 'value'], 'triangle')).toEqual({ kind: 'silent' });
    expect(causeSlot([0], ['value'], 'isosceles-triangle')).toEqual({ kind: 'given', row: 0 });
    expect(silentByValues('triangle', ['value', 'definition'])).toBe(true);
    expect(silentByValues('triangle', ['value', 'relation'])).toBe(false);
    expect(silentByValues('parallelogram', ['value'])).toBe(false);
  });
});

describe('the declared kind and the typed right angle (card 3)', () => {
  it('the narrowest noun stated; a typed right angle on a triangle declares «ישר זווית»', () => {
    expect(declaredKindOf(['parallelogram', 'quadrilateral'], false)).toBe('parallelogram');
    expect(declaredKindOf(['rectangle', 'rhombus'], false)).toBe('square');
    expect(declaredKindOf(['triangle'], true)).toBe('right-triangle');
    expect(declaredKindOf(['isosceles-triangle'], true)).toBe('right-isosceles-triangle');
    expect(declaredKindOf(['parallelogram'], true)).toBe('parallelogram'); // quadrilaterals have no carve-out
    expect(declaredKindOf([], false)).toBeNull();
  });
  it('the right angle must be the ring’s own corner', () => {
    expect(isRingRightAngle(['A', 'B', 'C'], 'C', 'A', 'B')).toBe(true);
    expect(isRingRightAngle(['A', 'B', 'C'], 'C', 'A', 'D')).toBe(false);
    expect(isRingRightAngle(['A', 'B', 'C', 'D'], 'C', 'B', 'D')).toBe(false);
  });
});

describe('narrowingSentence — assembled from the builder’s keys', () => {
  const keys: Record<string, string> = {
    'p.sentence': '{{cause}}, {{ring}} הוגבל מ{{from}} ל{{to}} — {{kindOf}}.',
    'p.cause.given': 'בגלל הנתון {{given}}',
    'p.cause.givens': 'בגלל הנתונים {{given}}',
    'p.listSep': ', ',
    'p.listLast': ' ו-',
    'p.shape.parallelogram': 'מקבילית',
    'p.shape.rhombus': 'מעוין',
    'p.shapeA.parallelogram': 'מקבילית',
    'p.shapeA.rhombus': 'מעוין',
    'p.kindOf.rhombus': 'מעוין הוא סוג של {{from}}',
  };
  const t = (k: string, o: Record<string, unknown> = {}) => (keys[k] ?? `<${k}>`).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o[v] ?? ''));
  it('one given, as typed', () => {
    expect(narrowingSentence({ ring: 'ABCD', from: 'parallelogram', to: 'rhombus', cause: { kind: 'given', row: 0 }, givens: ['AB = BC'] }, t, 'p')).toBe(
      'בגלל הנתון AB = BC, ABCD הוגבל ממקבילית למעוין — מעוין הוא סוג של מקבילית.',
    );
  });
  it('three givens joined', () => {
    expect(
      narrowingSentence({ ring: 'ABCD', from: 'parallelogram', to: 'rhombus', cause: { kind: 'givens', rows: [0, 1, 2] }, givens: ['a', 'b', 'c'] }, t, 'p'),
    ).toBe('בגלל הנתונים a, b ו-c, ABCD הוגבל ממקבילית למעוין — מעוין הוא סוג של מקבילית.');
  });
});
