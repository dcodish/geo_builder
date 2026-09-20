/**
 * #1247 (ADR-527) — a cevian's foot MAY be an endpoint of its side, when the role is an altitude.
 *
 * Operator, 2026-09-19, playing round #1244: *"AB גובה לצלע BC - not accepted and it should. in this
 * case its a right angle triangle"*. He is right, and the refusal was introduced by ADR-525 the same
 * day: it shipped `cevianWellFormed` with the clause `foot ∉ side` applied to BOTH roles.
 *
 * **The two roles share a shape and not a rule.**
 *
 *   «AB תיכון לצלע BC»  the MIDPOINT of BC is B ⇒ BC has zero length. Impossible. Refuse.
 *   «AB גובה לצלע BC»   the perpendicular from A meets BC at B ⇒ the angle at B is 90°. Ordinary.
 *
 * THE LOCK IS A PARITY ASSERTION, which this case makes available and which is stronger than any
 * hand-written command list: «AB גובה לצלע BC» must produce **the same commands** as the student's own
 * «AB ⟂ BC». It cannot go green by re-implementing the perpendicular rule.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../index';
import { factsOf, replayFacts } from '@/__tests__/scenario-pipeline';

const commands = (u: string): unknown[] => {
  const r = parse(u);
  return r.ok ? (r.commands as unknown[]) : [];
};

/** The interior angle at `b`, in degrees, in the figure the steps build. */
const angleAt = (steps: string[], a: string, b: string, c: string): number => {
  const fig = replayFacts(factsOf(steps));
  const P = (id: string) => fig.positions.get(id)!;
  const [pa, pb, pc] = [P(a), P(b), P(c)];
  const v1 = { x: pa.x - pb.x, y: pa.y - pb.y };
  const v2 = { x: pc.x - pb.x, y: pc.y - pb.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

describe('ADR-527 — an altitude whose foot is an endpoint IS a right angle there (#1247)', () => {
  /** THE OPERATOR'S CASE. Parity with the spelling he could already use. */
  it('«AB גובה לצלע BC» produces exactly what «AB ⟂ BC» produces', () => {
    expect(commands('AB גובה לצלע BC')).toEqual(commands('AB ⟂ BC'));
  });

  it('the other endpoint behaves the same way', () => {
    expect(commands('AC גובה לצלע BC')).toEqual(commands('AC ⟂ CB'));
  });

  /** The same reading in the `foot` spelling — one family, one answer. */
  it('«B רגל האנך מ-A ל-BC» names an existing vertex, not a new point', () => {
    expect(commands('B רגל האנך מ-A ל-BC')).toEqual(commands('AB ⟂ BC'));
  });

  /** NO point is minted — emitting a `foot` for a vertex that exists is what produced the hidden `~B`. */
  it('mints no point and leaves no hidden duplicate', () => {
    const fig = replayFacts(factsOf(['משולש ABC', 'AB גובה לצלע BC']));
    expect([...fig.positions.keys()].sort()).toEqual(['A', 'B', 'C']);
    expect([...fig.positions.keys()].filter((k) => k.startsWith('~'))).toEqual([]);
  });

  /** And it means what it says: the angle at the foot is right. */
  it('drives the angle at the foot to 90°', () => {
    const deg = angleAt(['משולש ABC', 'AB גובה לצלע BC'], 'A', 'B', 'C');
    expect(Math.abs(deg - 90)).toBeLessThan(0.01);
  });

  /**
   * ADR-525's refusals all stand. These are the cells the operator played as T7/T8/T9 and confirmed,
   * and relaxing the predicate by role must not have widened any of them.
   */
  it.each([
    ['altitude, apex on the side', 'BD גובה לצלע AB'],
    ['altitude, apex on the side (other end)', 'AD גובה לצלע AB'],
    ['altitude, apex is its own foot', 'AA גובה לצלע BC'],
    ['median, apex on the side', 'BD תיכון לצלע AB'],
    ['MEDIAN, foot on the side — still impossible', 'AB תיכון לצלע BC'],
    ['median, foot on the side (other end)', 'AC תיכון לצלע BC'],
    ['foot rule, apex on the side', 'F רגל האנך מ-B ל-AB'],
  ])('%s is still refused', (_name, u) => {
    expect(commands(u as string)).toEqual([]);
  });

  /**
   * THE CELL THAT PROVES THE SPLIT IS BY ROLE. Same letters, same side, opposite verdicts — a blanket
   * relaxation would make the median row build, and a blanket refusal would make the altitude row fail.
   */
  it('the median and the altitude disagree on the SAME letters', () => {
    expect(commands('AB תיכון לצלע BC')).toEqual([]);
    expect(commands('AB גובה לצלע BC').length).toBeGreaterThan(0);
  });

  /** The ordinary cevians are untouched — the gate has not eaten the feature. */
  it.each([
    ['altitude', 'AD גובה לצלע BC', 'foot'],
    ['median', 'AD תיכון לצלע BC', 'midpoint'],
    ['foot rule', 'F רגל האנך מ-A ל-BC', 'foot'],
  ])('%s to a side it does not touch still builds', (_n, u, kind) => {
    expect((commands(u as string) as { type: string }[]).map((c) => c.type)).toContain(kind);
  });

  /**
   * On a triangle whose right angle is ALREADY placed elsewhere, the statement asserts a second right
   * angle and is honestly refused — the row says so and names the given it conflicts with. Locked
   * because the fix must not turn an impossible figure into a silent one.
   */
  it('a second right angle is refused, naming the conflict', () => {
    const fig = replayFacts(factsOf(['ABC משולש ישר זווית', 'AB גובה לצלע BC']));
    const statuses = Object.values(fig.status);
    expect(statuses.some((s) => typeof s === 'string' && s.includes('over-constrained'))).toBe(true);
  });
});
