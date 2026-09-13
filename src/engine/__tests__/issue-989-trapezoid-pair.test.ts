/**
 * #989 ([ADR-506](../../../docs/06-decisions.md#adr-506)) — a trapezoid's parallel pair is a property of the
 * ring AS NAMED, and a STATED pair pins it.
 *
 * Measured on `d440f01` through the real `factsOf → replay` path:
 *
 *   «טרפז ABCD»                          → AB ∥ DC                       (the assumed pair)
 *   «משולש ABC» · «טרפז ABCD»            → BC ∥ AD   ✗  (sin(AB,DC) = 0.41 — the ring was rotated so the missing
 *                                                        vertex fell on the template's derived slot, and the pair
 *                                                        was read against the rotated letters)
 *   «טרפז ABCD» · «BC מקביל ל-AD»        → AB ∥ DC AND BC ∥ AD  ✗  (a parallelogram under an amber morph flag —
 *                                                        the stated pair STACKED onto the hard-coded one)
 *   «טרפז שווה שוקיים ABCD, AD מקביל ל-BC» → the same pair asked to be both parallel and the equal legs ✗
 *
 * The class: three readers of "which pair is parallel" each read it off letter order in a template slot —
 * the standalone lowering, the composed lowering, and the isosceles macro's legs. Now ONE predicate
 * (`trapezoidRingInForce`) answers it: sides 0/2 of the ring as named, rotated by one when a stated ∥ names
 * the other pair; the lowering seats its derived vertex on whichever ring vertex is missing
 * (`trapezoidOffset`), the replay pre-scan re-seats the lowering and the macro's `trapezoidLegs` equality, and
 * the theorem spine and the ADR-502 note read the same ring. The pair is NOT cyclable (#973's ruling: an
 * assumption the tool SAYS until the student states it) — a stated pair pins, «הציגו תצורה אחרת» never flips it.
 */
import { describe, expect, it } from 'vitest';
import { replay } from '@/store/geoStore';
import { parse } from '@/parser';
import { trapezoidOffset, trapezoidDerivedSlot } from '@/engine/apply';
import { trapezoidRingInForce, trapezoidLegs, unstatedChoices } from '@/engine';
import type { Id } from '@/engine';
import { ctxOf, factsOf, replayFacts } from '../../__tests__/scenario-pipeline';

type Pos = Map<Id, { x: number; y: number }>;
const sinBetween = (pos: Pos, p: Id, q: Id, r: Id, s: Id): number => {
  const [P, Q, R, S] = [p, q, r, s].map((id) => pos.get(id)!);
  const ux = Q.x - P.x, uy = Q.y - P.y, vx = S.x - R.x, vy = S.y - R.y;
  return Math.abs(ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
};
const len = (pos: Pos, p: Id, q: Id): number => Math.hypot(pos.get(q)!.x - pos.get(p)!.x, pos.get(q)!.y - pos.get(p)!.y);
const green = (fig: ReturnType<typeof replay>, label: string) => {
  expect(fig.lastError, label).toBeNull();
  expect(fig.violations, label).toEqual([]);
  for (const [id, st] of Object.entries(fig.status)) expect(st, `${label}: ${id}`).toBe('ok');
};

describe('#989 — «טרפז ABCD» makes AB ∥ DC whichever vertex is built last (the ring as named)', () => {
  it.each([
    ['alone', ['טרפז ABCD']],
    ['after «משולש ABC» (D is built)', ['משולש ABC', 'טרפז ABCD']],
    ['after «משולש BCD» (A is built)', ['משולש BCD', 'טרפז ABCD']],
    ['after «משולש ACD» (B is built)', ['משולש ACD', 'טרפז ABCD']],
    ['after «משולש ABD» (C is built)', ['משולש ABD', 'טרפז ABCD']],
  ])('%s → AB ∥ DC and NOT BC ∥ AD, at seeds 0–3', (_label, seq) => {
    const facts = factsOf(seq);
    for (const seed of [0, 1, 2, 3]) {
      const fig = replay(facts, seed);
      green(fig, `${seq.join(' · ')} @${seed}`);
      expect(sinBetween(fig.positions, 'A', 'B', 'D', 'C'), `AB ∥ DC @${seed}`).toBeLessThan(1e-9);
      expect(sinBetween(fig.positions, 'B', 'C', 'A', 'D'), `BC ∦ AD @${seed}`).toBeGreaterThan(0.1);
    }
  });

  it('stability: the triangle’s points do not move when the trapezoid is added', () => {
    for (const seed of [0, 1, 2]) {
      const before = replay(factsOf(['משולש ABC']), seed).positions;
      const after = replay(factsOf(['משולש ABC', 'טרפז ABCD']), seed).positions;
      for (const id of ['A', 'B', 'C']) {
        expect(after.get(id)!.x, `${id}.x @${seed}`).toBeCloseTo(before.get(id)!.x, 9);
        expect(after.get(id)!.y, `${id}.y @${seed}`).toBeCloseTo(before.get(id)!.y, 9);
      }
    }
  });

  it('the standalone figure is byte-identical to before (slot 2 derived, same template)', () => {
    const fig = replay(factsOf(['טרפז ABCD']), 0);
    expect(fig.positions.get('C')).toEqual({ x: 4.6, y: 4 });
    expect(fig.construction.objects.find((o) => o.id === 'C')).toMatchObject({ kind: 'scaled-offset', anchor: 'D', from: 'A', to: 'B', k: 0.6 });
  });
});

describe('#989 — a STATED pair pins the trapezoid instead of stacking a second one', () => {
  it.each([
    ['טרפז ABCD', 'BC מקביל ל-AD'],
    ['טרפז ABCD', 'AD מקביל ל-BC'],
    ['משולש ABC', 'טרפז ABCD', 'BC מקביל ל-AD'],
  ])('%s · %s → BC ∥ AD only, no morph flag, every fact ok', (...seq) => {
    const facts = factsOf(seq);
    for (const seed of [0, 1, 2]) {
      const fig = replay(facts, seed);
      green(fig, `${seq.join(' · ')} @${seed}`);
      expect(sinBetween(fig.positions, 'B', 'C', 'A', 'D'), `BC ∥ AD @${seed}`).toBeLessThan(1e-9);
      expect(sinBetween(fig.positions, 'A', 'B', 'D', 'C'), `AB ∦ DC @${seed}`).toBeGreaterThan(0.1);
    }
  });

  it('restating the assumed pair «AB מקביל ל-DC» changes nothing', () => {
    const fig = replay(factsOf(['טרפז ABCD', 'AB מקביל ל-DC']), 0);
    green(fig, 'restated');
    expect(sinBetween(fig.positions, 'A', 'B', 'D', 'C')).toBeLessThan(1e-9);
    expect(sinBetween(fig.positions, 'B', 'C', 'A', 'D')).toBeGreaterThan(0.1);
  });

  it('BOTH pairs stated is the parallelogram the student asked for — flagged honestly, never re-seated', () => {
    const fig = replay(factsOf(['טרפז ABCD', 'AB מקביל ל-DC', 'BC מקביל ל-AD']), 0);
    expect(fig.lastError).toBeNull();
    expect(sinBetween(fig.positions, 'A', 'B', 'D', 'C')).toBeLessThan(1e-6);
    expect(sinBetween(fig.positions, 'B', 'C', 'A', 'D')).toBeLessThan(1e-6);
    expect(fig.violations.map((v) => v.messageKey)).toContain('figure.v.trapezoidMorph');
  });

  it('a length order on the pinned bases is read on the ring in force: «BC ∥ AD» then «AD > BC» builds green', () => {
    const facts = factsOf(['טרפז ABCD', 'BC מקביל ל-AD', 'AD > BC']);
    const fig = replayFacts(facts);
    green(fig, 'order on the pinned bases');
    expect(len(fig.positions, 'A', 'D')).toBeGreaterThan(len(fig.positions, 'B', 'C'));
    expect(sinBetween(fig.positions, 'B', 'C', 'A', 'D')).toBeLessThan(1e-9);
  });

  it('the ADR-502 note: gone once the pair is stated; while unstated it names the pair the figure DRAWS', () => {
    expect(unstatedChoices(factsOf(['טרפז ABCD', 'BC מקביל ל-AD']))).toEqual([]);
    const after = unstatedChoices(factsOf(['משולש ABC', 'טרפז ABCD']));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: 'parallel-pair', parallel: [['A', 'B'], ['D', 'C']] });
  });
});

describe('#989 — the isosceles macro’s legs follow the pair in force', () => {
  it.each([
    [['טרפז שווה שוקיים ABCD, AD מקביל ל-BC']],
    [['טרפז שווה שוקיים ABCD', 'BC מקביל ל-AD']],
    [['AD מקביל ל-BC', 'טרפז שווה שוקיים ABCD']],
  ])('%j → green, AD ∥ BC, equal legs |AB| = |DC|, no morph flag', (seq) => {
    const fig = replayFacts(factsOf(seq));
    green(fig, seq.join(' · '));
    // 1e-6, not 1e-9: when the ∥ is typed FIRST its segments create all four points, so the shape lowers
    // to constraints (M1) and the pair is solved, not structural — the same pair, at solver tolerance.
    expect(sinBetween(fig.positions, 'B', 'C', 'A', 'D')).toBeLessThan(1e-6);
    expect(sinBetween(fig.positions, 'A', 'B', 'D', 'C')).toBeGreaterThan(0.1);
    expect(len(fig.positions, 'A', 'B')).toBeCloseTo(len(fig.positions, 'D', 'C'), 6);
  });

  it('«טרפז שווה שוקיים ABCD» alone is unchanged: AB ∥ DC, |AD| = |BC|', () => {
    const fig = replayFacts(factsOf(['טרפז שווה שוקיים ABCD']));
    green(fig, 'iso alone');
    expect(sinBetween(fig.positions, 'A', 'B', 'D', 'C')).toBeLessThan(1e-9);
    expect(len(fig.positions, 'A', 'D')).toBeCloseTo(len(fig.positions, 'B', 'C'), 6);
  });

  it('a student’s OWN «AD = BC» is never re-seated (only the macro’s tagged equality is)', () => {
    const facts = factsOf(['טרפז ABCD', 'AD = BC', 'AD מקביל ל-BC']);
    const own = facts.find((f) => f.cmd.type === 'set-equal')!.cmd as { trapezoidLegs?: boolean };
    expect(own.trapezoidLegs).toBeUndefined();
    const fig = replay(facts, 0);
    // their statement stands as typed: AD ∥ BC and |AD| = |BC| — a parallelogram, and the morph flag says so
    expect(fig.lastError).toBeNull();
    expect(len(fig.positions, 'A', 'D')).toBeCloseTo(len(fig.positions, 'B', 'C'), 6);
  });

  it('the macro tags its leg equality', () => {
    const r = parse('טרפז שווה שוקיים ABCD', ctxOf([]));
    expect(r.ok && r.commands).toEqual([
      { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] },
      { type: 'set-equal', a: 'A', b: 'D', c: 'B', d: 'C', trapezoidLegs: true },
    ]);
  });

  it('«קטע האמצעים בטרפז ABCD» on a pinned trapezoid joins the legs IN FORCE (AB and DC)', () => {
    const facts = factsOf(['טרפז ABCD', 'BC מקביל ל-AD', 'קטע האמצעים בטרפז ABCD']);
    const mids = facts.filter((f) => f.cmd.type === 'midpoint').map((f) => f.cmd as { a: Id; b: Id });
    expect(mids.map((m) => [m.a, m.b].sort().join(''))).toEqual(['AB', 'CD']);
    green(replayFacts(facts), 'midsegment on the pinned ring');
  });
  it('«קטע האמצעים בטרפז ABCD» on the plain trapezoid still joins BC and DA', () => {
    const facts = factsOf(['טרפז ABCD', 'קטע האמצעים בטרפז ABCD']);
    const mids = facts.filter((f) => f.cmd.type === 'midpoint').map((f) => f.cmd as { a: Id; b: Id });
    expect(mids.map((m) => [m.a, m.b].sort().join(''))).toEqual(['BC', 'AD']);
  });
});

describe('#989 — the one predicate and the one derivation', () => {
  const ids: [Id, Id, Id, Id] = ['A', 'B', 'C', 'D'];
  it('trapezoidRingInForce: unpinned as named; the other pair rotates by one; both pairs stay as named', () => {
    expect(trapezoidRingInForce(ids, [])).toEqual({ ring: ['A', 'B', 'C', 'D'], pinned: false });
    expect(trapezoidRingInForce(ids, [{ a: 'B', b: 'C', c: 'A', d: 'D' }])).toEqual({ ring: ['B', 'C', 'D', 'A'], pinned: true });
    expect(trapezoidRingInForce(ids, [{ a: 'D', b: 'A', c: 'C', d: 'B' }])).toEqual({ ring: ['B', 'C', 'D', 'A'], pinned: true });
    expect(trapezoidRingInForce(ids, [{ a: 'A', b: 'B', c: 'D', d: 'C' }])).toEqual({ ring: ['A', 'B', 'C', 'D'], pinned: true });
    expect(trapezoidRingInForce(ids, [{ a: 'A', b: 'B', c: 'D', d: 'C' }, { a: 'B', b: 'C', c: 'A', d: 'D' }]).ring).toEqual(['A', 'B', 'C', 'D']);
    // a parallel that is not two opposite ring sides (a diagonal, an outside segment) pins nothing
    expect(trapezoidRingInForce(ids, [{ a: 'A', b: 'C', c: 'B', d: 'D' }]).pinned).toBe(false);
    expect(trapezoidRingInForce(ids, [{ a: 'A', b: 'B', c: 'E', d: 'F' }]).pinned).toBe(false);
  });
  it('trapezoidLegs are sides 3 and 1 of the ring in force', () => {
    expect(trapezoidLegs(ids)).toEqual([['A', 'D'], ['B', 'C']]);
    expect(trapezoidLegs(['B', 'C', 'D', 'A'])).toEqual([['B', 'A'], ['C', 'D']]);
  });
  it('trapezoidOffset makes sides 0 and 2 parallel from every seat', () => {
    expect(trapezoidOffset(ids, 2, 0.6)).toEqual({ kind: 'scaled-offset', id: 'C', anchor: 'D', from: 'A', to: 'B', k: 0.6 });
    expect(trapezoidOffset(ids, 3, 0.6)).toEqual({ kind: 'scaled-offset', id: 'D', anchor: 'C', from: 'B', to: 'A', k: 0.6 });
    expect(trapezoidOffset(ids, 0, 0.6)).toEqual({ kind: 'scaled-offset', id: 'A', anchor: 'B', from: 'C', to: 'D', k: 0.6 });
    expect(trapezoidOffset(ids, 1, 0.6)).toEqual({ kind: 'scaled-offset', id: 'B', anchor: 'A', from: 'D', to: 'C', k: 0.6 });
  });
  it('trapezoidDerivedSlot prefers the template top, else the first missing vertex', () => {
    const pts = (...ps: Id[]) => ps.map((id) => ({ kind: 'free-point' as const, id, x: 0, y: 0 }));
    expect(trapezoidDerivedSlot([], ids)).toBe(2);
    expect(trapezoidDerivedSlot(pts('A', 'B'), ids)).toBe(2);
    expect(trapezoidDerivedSlot(pts('A', 'B', 'C'), ids)).toBe(3);
    expect(trapezoidDerivedSlot(pts('B', 'C', 'D'), ids)).toBe(0);
    expect(trapezoidDerivedSlot(pts('A', 'C', 'D'), ids)).toBe(1);
    expect(trapezoidDerivedSlot(pts('A', 'B', 'C', 'D'), ids)).toBe(2);
  });
});
