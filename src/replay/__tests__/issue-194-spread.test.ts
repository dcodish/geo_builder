/**
 * #194 (ADR-474) — the general-position SPREAD preference.
 *
 * Operator, 2026-07-17 (the Q9 session, right after #193): *"we need to add some preference — if the
 * diagram draws angles that are small (i.e. fits the constraints but the segments are very close), we
 * should look for a seed that allows a better spread."* Every stated requirement was met and the drawing
 * was still unreadable — ∠ACE at 1.3°.
 *
 * Two things are locked here, and they pull in opposite directions on purpose:
 *   1. the preference WORKS — the reported figure now draws legibly;
 *   2. the preference is a PREFERENCE — a figure whose givens force a tight wedge is untouched, because
 *      a valid configuration must stay drawable (ADR-052). A gate here would refuse real geometry.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { findValidConfig, replay } from '@/store/geoStore';
import { SPREAD_MIN_DEG, tightestWedge, wellSpread } from '@/engine/spread';
import type { Id } from '@/engine/types';

const deg = (r: number) => (r * 180) / Math.PI;
const tightestDeg = (fig: ReturnType<typeof replay>) => deg(tightestWedge(fig.construction, fig.positions));

/** The drawn angle ∠avb, in degrees — read off the same positions the student sees. */
function angleAt(fig: ReturnType<typeof replay>, v: Id, a: Id, b: Id): number {
  const P = (id: Id) => fig.positions.get(id)!;
  const p = P(v);
  const u = { x: P(a).x - p.x, y: P(a).y - p.y };
  const w = { x: P(b).x - p.x, y: P(b).y - p.y };
  return deg(Math.acos((u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))));
}

/** #193's repro — two circles meeting at A,B; the secant C,D,E,F; the triangle ACF and its circumcircle. */
const Q9 = [
  'שני מעגלים נחתכים בנקודות A ו-B',
  'מיתר CE במעגל השמאלי',
  'מיתר DF במעגל הימני',
  'ישר CDEF',
  'משולש ACF',
  'AB',
  'BC',
  'BD',
  'BE',
  'BF',
  'מעגל חוסם את המשולש ACF',
];

describe('#194 — the predicate reads what the student sees', () => {
  it('an ordinary figure is well spread; its wedges are the ones you would name', () => {
    for (const [steps, atLeast] of [
      [['ריבוע ABCD'], 89],
      [['משולש ABC'], 20],
      [['טרפז ABCD'], 20],
      [['מקבילית ABCD', 'אלכסון AC'], 20],
    ] as const) {
      const fig = replay(factsOf([...steps]), 0);
      expect(fig.lastError, steps.join(' | ')).toBeNull();
      expect(tightestDeg(fig), steps.join(' | ')).toBeGreaterThan(atLeast);
      expect(wellSpread(fig.construction, fig.positions), steps.join(' | ')).toBe(true);
    }
  });

  it('a STRUCTURAL rider contributes no wedge — it is on its carrier, not at an angle to it', () => {
    // The discrimination the whole predicate rests on: a `set-line`/on-segment rider is collinear to
    // solver precision (~1e-6 rad), so its two half-edges merge into one straight pair; an ACCIDENTALLY
    // near-collinear point (Q9's A, 0.8° off the secant) is 4 orders of magnitude away from that and
    // does not merge. The epsilon GAP is what separates them — no statedness analysis, no second sample.
    const onSeg = replay(factsOf(['קטע AB', 'C על AB']), 0);
    expect(onSeg.lastError).toBeNull();
    expect(tightestDeg(onSeg), 'the rider splits the segment into one straight 180° pair').toBeCloseTo(180, 6);
    expect(wellSpread(onSeg.construction, onSeg.positions)).toBe(true);

    const median = replay(factsOf(['משולש ABC', 'D על BC', 'AD']), 0);
    expect(median.lastError).toBeNull();
    expect(tightestDeg(median), 'the median makes real wedges, and they are readable').toBeGreaterThan(SPREAD_MIN_DEG);
  });

  it('a figure with no wedge at all is trivially spread', () => {
    const fig = replay(factsOf(['מעגל O']), 0);
    expect(tightestWedge(fig.construction, fig.positions)).toBe(Infinity);
    expect(wellSpread(fig.construction, fig.positions)).toBe(true);
  });
});

describe('#194 — the reported figure draws legibly', () => {
  it('Q9: the chosen configuration opens ∠ACE and ∠AFD, where seed 0 squashed them', () => {
    const facts = factsOf(Q9);
    const before = replay(facts, 0);
    expect(before.lastError, 'the figure builds at seed 0 — it was always VALID, just unreadable').toBeNull();
    // the report: every requirement met, ∠ACE drawn at ~1.3°
    expect(angleAt(before, 'C', 'A', 'E')).toBeLessThan(3);
    expect(angleAt(before, 'F', 'A', 'D')).toBeLessThan(3);

    const chosen = findValidConfig(facts, 0);
    expect(chosen, 'the auto-resolver finds a configuration').not.toBeNull();
    const after = replay(chosen!.facts, chosen!.seed);
    expect(after.lastError).toBeNull();
    expect(angleAt(after, 'C', 'A', 'E'), 'the book relation is visible').toBeGreaterThan(SPREAD_MIN_DEG);
    expect(angleAt(after, 'F', 'A', 'D'), 'and its sibling too').toBeGreaterThan(SPREAD_MIN_DEG);
    // …and the WHOLE drawing is legible, not just those two angles
    expect(tightestDeg(after)).toBeGreaterThanOrEqual(SPREAD_MIN_DEG);
    expect(tightestDeg(after)).toBeGreaterThan(tightestDeg(before) * 5);
  });
});

describe('#194 — it is a PREFERENCE, never a requirement (ADR-052)', () => {
  it('a STATED small angle still builds and draws — no refusal, no endless search', () => {
    const facts = factsOf(['משולש ABC', 'זווית ABC = 5']);
    const fig = replay(facts, 0);
    expect(fig.lastError).toBeNull();
    expect(tightestDeg(fig), 'the figure is exactly as tight as it was told to be').toBeCloseTo(5, 1);
    expect(wellSpread(fig.construction, fig.positions), 'so it can never clear the bar').toBe(false);

    // the ladder falls through to today's answer rather than hunting forever or refusing
    const chosen = findValidConfig(facts, 0);
    expect(chosen).not.toBeNull();
    const after = replay(chosen!.facts, chosen!.seed);
    expect(after.lastError).toBeNull();
    expect(angleAt(after, 'B', 'A', 'C'), 'the stated 5° is still 5°').toBeCloseTo(5, 1);
  });

  it('the everyday figures are untouched — same seed, same drawing', () => {
    // The preference may only ADD a tier above today's; a figure that already draws legibly must not
    // move, or every scenario in the corpus would be re-seeded for nothing.
    for (const steps of [['ריבוע ABCD'], ['משולש ABC'], ['טרפז ABCD'], ['ריבוע ABCD', 'G על AD', 'זווית GBA = 37']]) {
      const facts = factsOf(steps);
      const chosen = findValidConfig(facts, 0);
      expect(chosen?.seed, steps.join(' | ')).toBe(0);
    }
  });
});

describe('#194 — the detection pool is NOT filtered (the #193 boundary)', () => {
  it('a squashed-but-valid configuration is still a legitimate sample', () => {
    // Ground truth is what holds in every VALID configuration (ADR-256/295). If the sample pool were
    // spread-filtered, detection would OVER-claim — reporting relations that break only in the squashed
    // configs. This asserts the boundary from the pool's side: seed 0 of Q9 is squashed AND valid, and
    // nothing in this change makes it invalid.
    const fig = replay(factsOf(Q9), 0);
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    expect(wellSpread(fig.construction, fig.positions), 'squashed…').toBe(false);
  });
});
